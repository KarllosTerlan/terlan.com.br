import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { fetchPhoneNumberInfo } from '../../whatsapp/meta.js';
import {
  ensureInstance,
  connectInstance,
  getConnectionState,
  logoutInstance,
  deleteInstance,
} from '../../whatsapp/providers/evolution.js';
import { sendText as serviceSend, getActiveProvider } from '../../whatsapp/providers/service.js';
import { AppError } from '../../lib/errors.js';

const configureMetaSchema = z.object({
  whatsappPhoneNumberId: z.string().min(3),
});

const preferSchema = z.object({
  provider: z.enum(['evolution', 'meta']),
});

const testSchema = z.object({
  to: z.string().min(8),
  text: z.string().min(1).max(1000),
});

function defaultInstanceName(clinicId: string): string {
  return `clinic-${clinicId.slice(0, 8)}`;
}

export async function whatsappRoutes(app: FastifyInstance) {
  // ==========================================================================
  // GET /whatsapp/status — full status of both providers for this clinic
  // ==========================================================================
  app.get('/whatsapp/status', { preHandler: app.auth }, async (req) => {
    const clinicId = req.auth!.clinicId;
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        whatsappEvolutionInstance: true,
        whatsappPhoneNumberId: true,
        whatsappDisplayNumber: true,
        whatsappPreferredProvider: true,
      },
    });

    // ----- Evolution -----
    let evolutionState = 'not_configured';
    if (clinic?.whatsappEvolutionInstance) {
      evolutionState = await getConnectionState(clinic.whatsappEvolutionInstance);
    }

    // ----- Meta -----
    let metaInfo: Awaited<ReturnType<typeof fetchPhoneNumberInfo>> = null;
    if (clinic?.whatsappPhoneNumberId) {
      metaInfo = await fetchPhoneNumberInfo(clinic.whatsappPhoneNumberId);
    }

    const activeProvider = await getActiveProvider(clinicId);
    const publicApi = env.PUBLIC_API_URL.replace(/\/$/, '');

    return {
      preferredProvider: clinic?.whatsappPreferredProvider ?? 'evolution',
      activeProvider, // null if neither is connected
      evolution: {
        configured: Boolean(clinic?.whatsappEvolutionInstance),
        instance: clinic?.whatsappEvolutionInstance ?? null,
        state: evolutionState, // "open" | "connecting" | "close" | "unknown" | "not_configured"
        connected: evolutionState === 'open',
        webhookUrl: `${publicApi}/webhook/evolution`,
      },
      meta: {
        configured: Boolean(clinic?.whatsappPhoneNumberId),
        phoneNumberId: clinic?.whatsappPhoneNumberId ?? null,
        displayNumber: metaInfo?.display_phone_number ?? clinic?.whatsappDisplayNumber ?? null,
        verifiedName: metaInfo?.verified_name ?? null,
        qualityRating: metaInfo?.quality_rating ?? null,
        connected: Boolean(metaInfo?.display_phone_number),
        webhookUrl: `${publicApi}/webhook/meta`,
        verifyToken: env.WHATSAPP_VERIFY_TOKEN,
        apiVersion: env.WHATSAPP_API_VERSION,
      },
    };
  });

  // ==========================================================================
  // POST /whatsapp/prefer — choose primary provider (evolution | meta)
  // ==========================================================================
  app.post('/whatsapp/prefer', { preHandler: app.auth }, async (req) => {
    const body = preferSchema.parse(req.body);
    await prisma.clinic.update({
      where: { id: req.auth!.clinicId },
      data: { whatsappPreferredProvider: body.provider },
    });
    return { ok: true, preferredProvider: body.provider };
  });

  // ==========================================================================
  // Evolution — instance management
  // ==========================================================================

  /** POST /whatsapp/evolution/connect — creates the instance (if needed) and returns the QR. */
  app.post('/whatsapp/evolution/connect', { preHandler: app.auth }, async (req) => {
    const clinicId = req.auth!.clinicId;
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { whatsappEvolutionInstance: true },
    });
    const instance = clinic?.whatsappEvolutionInstance ?? defaultInstanceName(clinicId);

    await ensureInstance(instance);
    if (!clinic?.whatsappEvolutionInstance) {
      await prisma.clinic.update({
        where: { id: clinicId },
        data: { whatsappEvolutionInstance: instance },
      });
    }

    const qr = await connectInstance(instance);
    const state = await getConnectionState(instance);
    return { instance, state, qr: qr.qr, pairingCode: qr.pairingCode };
  });

  /** GET /whatsapp/evolution/qr — current QR / state (used for polling from the panel). */
  app.get('/whatsapp/evolution/qr', { preHandler: app.auth }, async (req) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: req.auth!.clinicId },
      select: { whatsappEvolutionInstance: true },
    });
    if (!clinic?.whatsappEvolutionInstance) {
      return { instance: null, state: 'not_configured', qr: null };
    }
    const state = await getConnectionState(clinic.whatsappEvolutionInstance);
    if (state === 'open') {
      return { instance: clinic.whatsappEvolutionInstance, state, qr: null };
    }
    const qr = await connectInstance(clinic.whatsappEvolutionInstance);
    return { instance: clinic.whatsappEvolutionInstance, state, qr: qr.qr };
  });

  /** POST /whatsapp/evolution/disconnect — logs the instance out (keeps the instance record). */
  app.post('/whatsapp/evolution/disconnect', { preHandler: app.auth }, async (req) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: req.auth!.clinicId },
      select: { whatsappEvolutionInstance: true },
    });
    if (clinic?.whatsappEvolutionInstance) {
      await logoutInstance(clinic.whatsappEvolutionInstance);
    }
    return { ok: true };
  });

  /** DELETE /whatsapp/evolution — destroys the Evolution instance for this clinic. */
  app.delete('/whatsapp/evolution', { preHandler: app.auth }, async (req) => {
    const clinic = await prisma.clinic.findUnique({
      where: { id: req.auth!.clinicId },
      select: { whatsappEvolutionInstance: true },
    });
    if (clinic?.whatsappEvolutionInstance) {
      await deleteInstance(clinic.whatsappEvolutionInstance);
      await prisma.clinic.update({
        where: { id: req.auth!.clinicId },
        data: { whatsappEvolutionInstance: null },
      });
    }
    return { ok: true };
  });

  // ==========================================================================
  // Meta — phone number management
  // ==========================================================================

  /** POST /whatsapp/meta/configure — links a Meta phone_number_id to this clinic. */
  app.post('/whatsapp/meta/configure', { preHandler: app.auth }, async (req) => {
    const body = configureMetaSchema.parse(req.body);
    const existing = await prisma.clinic.findFirst({
      where: { whatsappPhoneNumberId: body.whatsappPhoneNumberId, NOT: { id: req.auth!.clinicId } },
    });
    if (existing) throw new AppError(409, 'Phone number already in use by another clinic');

    const info = await fetchPhoneNumberInfo(body.whatsappPhoneNumberId);
    const updated = await prisma.clinic.update({
      where: { id: req.auth!.clinicId },
      data: {
        whatsappPhoneNumberId: body.whatsappPhoneNumberId,
        whatsappDisplayNumber: info?.display_phone_number ?? null,
      },
    });
    return {
      whatsappPhoneNumberId: updated.whatsappPhoneNumberId,
      displayNumber: updated.whatsappDisplayNumber,
      verifiedName: info?.verified_name ?? null,
    };
  });

  /** POST /whatsapp/meta/disconnect — unlinks the Meta phone number. */
  app.post('/whatsapp/meta/disconnect', { preHandler: app.auth }, async (req) => {
    await prisma.clinic.update({
      where: { id: req.auth!.clinicId },
      data: { whatsappPhoneNumberId: null, whatsappDisplayNumber: null },
    });
    return { ok: true };
  });

  // ==========================================================================
  // POST /whatsapp/test — send via the active provider chain (Evolution → Meta).
  // ==========================================================================
  app.post('/whatsapp/test', { preHandler: app.auth }, async (req) => {
    const body = testSchema.parse(req.body);
    const r = await serviceSend(req.auth!.clinicId, body.to, body.text);
    return { ok: true, provider: r.provider, externalId: r.externalId, fellBack: r.fellBack };
  });

  // ==========================================================================
  // GET /whatsapp/logs — recent outbound MessageLog entries (audit).
  // ==========================================================================
  app.get('/whatsapp/logs', { preHandler: app.auth }, async (req) => {
    const items = await prisma.messageLog.findMany({
      where: { clinicId: req.auth!.clinicId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true, direction: true, provider: true, toPhone: true, fromPhone: true,
        text: true, ok: true, error: true, fallback: true, createdAt: true,
      },
    });
    return { items };
  });
}
