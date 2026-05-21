import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { enqueueIncomingMessage } from '../../whatsapp/handler.js';

// ============================================================================
// Meta Cloud API webhook
// ============================================================================
type MetaChangeValue = {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  messages?: Array<{
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    button?: { text: string };
    interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  }>;
};

// ============================================================================
// Evolution API webhook (atendai v2)
// ============================================================================
type EvolutionWebhookBody = {
  event: string;                 // e.g. "messages.upsert", "connection.update"
  instance: string;              // instance name
  data: any;
  apikey?: string;
  date_time?: string;
};

/** Strips "@s.whatsapp.net" / "@g.us" suffix and any non-digits. */
function evJidToPhone(jid: string): string {
  return (jid ?? '').split('@')[0].replace(/\D/g, '');
}

/** Extracts a plain-text body from an Evolution message payload. */
function extractEvolutionText(message: any): string | null {
  if (!message) return null;
  return (
    message.conversation
    ?? message.extendedTextMessage?.text
    ?? message.imageMessage?.caption
    ?? message.videoMessage?.caption
    ?? message.buttonsResponseMessage?.selectedDisplayText
    ?? message.listResponseMessage?.title
    ?? null
  );
}

export async function webhookRoutes(app: FastifyInstance) {
  // --------------------------------------------------------------------------
  // META — verification handshake
  // --------------------------------------------------------------------------
  app.get('/webhook/meta', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const mode = q['hub.mode'];
    const token = q['hub.verify_token'];
    const challenge = q['hub.challenge'];

    if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
      logger.info('Meta webhook verified');
      return reply.code(200).type('text/plain').send(challenge);
    }
    logger.warn({ mode }, 'Meta webhook verification failed');
    return reply.code(403).send({ error: 'Verification failed' });
  });

  // --------------------------------------------------------------------------
  // META — incoming messages
  // --------------------------------------------------------------------------
  app.post('/webhook/meta', async (req, reply) => {
    const body = req.body as {
      object?: string;
      entry?: Array<{ id: string; changes?: Array<{ field: string; value: MetaChangeValue }> }>;
    };
    reply.code(200).send({ received: true });

    if (body?.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return;

    for (const entry of body.entry) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        const clinic = await prisma.clinic.findFirst({
          where: { whatsappPhoneNumberId: phoneNumberId, active: true },
        });
        if (!clinic) {
          logger.warn({ phoneNumberId }, 'Meta webhook: unknown phone_number_id');
          continue;
        }

        for (const msg of value.messages ?? []) {
          const text =
            msg.text?.body
            ?? msg.interactive?.button_reply?.title
            ?? msg.interactive?.list_reply?.title
            ?? msg.button?.text;
          if (!text || !text.trim()) continue;

          const pushName = value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name;
          try {
            await enqueueIncomingMessage({
              clinicId: clinic.id,
              provider: 'meta',
              fromPhone: msg.from,
              text,
              pushName,
              externalId: msg.id,
            });
          } catch (err) {
            logger.error({ err, msgId: msg.id }, 'Failed to enqueue Meta message');
          }
        }
      }
    }
  });

  // --------------------------------------------------------------------------
  // EVOLUTION — incoming events
  // --------------------------------------------------------------------------
  app.post('/webhook/evolution', async (req, reply) => {
    const body = req.body as EvolutionWebhookBody;
    reply.code(200).send({ received: true });

    // Shared-secret check — Evolution forwards the apikey from its config.
    const provided = (req.headers['apikey'] as string) || body?.apikey;
    if (provided && provided !== env.EVOLUTION_WEBHOOK_TOKEN && provided !== env.EVOLUTION_API_KEY) {
      logger.warn('Evolution webhook: invalid apikey');
      return;
    }

    const instance = body?.instance;
    if (!instance) return;

    const clinic = await prisma.clinic.findFirst({
      where: { whatsappEvolutionInstance: instance, active: true },
    });
    if (!clinic) {
      logger.warn({ instance, event: body.event }, 'Evolution webhook: unknown instance');
      return;
    }

    // ---- messages.upsert ----
    if (body.event === 'messages.upsert' || body.event === 'MESSAGES_UPSERT') {
      // payload shape: { key: {remoteJid, fromMe, id}, message: {...}, pushName, messageTimestamp }
      const messages = Array.isArray(body.data) ? body.data : [body.data];
      for (const m of messages) {
        if (!m?.key || m.key.fromMe) continue;
        const text = extractEvolutionText(m.message);
        if (!text || !text.trim()) continue;
        const fromPhone = evJidToPhone(m.key.remoteJid);
        if (!fromPhone) continue;

        try {
          await enqueueIncomingMessage({
            clinicId: clinic.id,
            provider: 'evolution',
            fromPhone,
            text,
            pushName: m.pushName,
            externalId: m.key.id ?? `${fromPhone}-${Date.now()}`,
          });
        } catch (err) {
          logger.error({ err, instance }, 'Failed to enqueue Evolution message');
        }
      }
      return;
    }

    // ---- connection.update ----
    if (body.event === 'connection.update' || body.event === 'CONNECTION_UPDATE') {
      logger.info({ instance, state: body.data?.state }, 'Evolution connection update');
      return;
    }
  });
}
