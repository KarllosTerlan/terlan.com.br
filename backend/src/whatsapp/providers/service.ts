import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { AppError } from '../../lib/errors.js';
import type { WhatsAppProvider, ProviderName } from './types.js';
import { EvolutionProvider } from './evolution.js';
import { MetaProvider } from './meta.js';

const evolution = new EvolutionProvider();
const meta = new MetaProvider();

export const providers = { evolution, meta };

/**
 * Returns the ordered provider chain for a clinic.
 * Honours the clinic's `whatsappPreferredProvider` setting; the other one is the fallback.
 */
async function getProviderChain(clinicId: string): Promise<WhatsAppProvider[]> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { whatsappPreferredProvider: true },
  });
  return clinic?.whatsappPreferredProvider === 'meta' ? [meta, evolution] : [evolution, meta];
}

async function logAttempt(opts: {
  clinicId: string;
  provider: ProviderName;
  to: string;
  text: string;
  ok: boolean;
  externalId?: string;
  error?: string;
  fallback: boolean;
}) {
  try {
    await prisma.messageLog.create({
      data: {
        clinicId: opts.clinicId,
        direction: 'out',
        provider: opts.provider,
        toPhone: opts.to,
        text: opts.text.slice(0, 1000),
        externalId: opts.externalId ?? null,
        ok: opts.ok,
        error: opts.error ?? null,
        fallback: opts.fallback,
      },
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to persist MessageLog');
  }
}

export async function logIncoming(opts: {
  clinicId: string;
  provider: ProviderName;
  fromPhone: string;
  text: string;
  externalId?: string;
}) {
  try {
    await prisma.messageLog.create({
      data: {
        clinicId: opts.clinicId,
        direction: 'in',
        provider: opts.provider,
        fromPhone: opts.fromPhone,
        text: opts.text.slice(0, 1000),
        externalId: opts.externalId ?? null,
        ok: true,
        fallback: false,
      },
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to persist inbound MessageLog');
  }
}

/**
 * Sends a text message trying the primary provider first; if it reports
 * disconnected or fails to send, transparently falls back to the secondary.
 */
export async function sendText(clinicId: string, to: string, text: string): Promise<{ provider: ProviderName; externalId?: string; fellBack: boolean }> {
  const chain = await getProviderChain(clinicId);
  let lastError = 'no_provider_available';

  for (let i = 0; i < chain.length; i++) {
    const p = chain[i];
    const fallback = i > 0;
    const connected = await p.isConnected(clinicId).catch(() => false);
    if (!connected) {
      logger.warn({ clinicId, provider: p.getName() }, 'Provider not connected, skipping');
      lastError = `${p.getName()}_not_connected`;
      continue;
    }

    const result = await p.sendMessage(clinicId, to, text).catch((err) => ({ ok: false, error: err?.message ?? 'threw' }));
    await logAttempt({
      clinicId,
      provider: p.getName(),
      to,
      text,
      ok: result.ok,
      externalId: result.externalId,
      error: result.error,
      fallback,
    });

    if (result.ok) {
      if (fallback) {
        logger.warn({ clinicId, primary: chain[0].getName(), used: p.getName() }, 'WhatsApp fallback engaged');
      }
      return { provider: p.getName(), externalId: result.externalId, fellBack: fallback };
    }
    lastError = result.error ?? 'unknown';
    logger.error({ clinicId, provider: p.getName(), error: lastError }, 'Provider sendMessage failed, will try fallback');
  }

  throw new AppError(`All WhatsApp providers failed: ${lastError}`, 502);
}

/** Returns the currently-active provider name (first one in chain that reports connected). */
export async function getActiveProvider(clinicId: string): Promise<ProviderName | null> {
  const chain = await getProviderChain(clinicId);
  for (const p of chain) {
    if (await p.isConnected(clinicId).catch(() => false)) return p.getName();
  }
  return null;
}
