import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { normalisePhone } from '../meta.js';
import type { WhatsAppProvider, SendResult, ProviderName } from './types.js';

const BASE = env.EVOLUTION_API_URL.replace(/\/$/, '');

function headers(): Record<string, string> {
  return { apikey: env.EVOLUTION_API_KEY, 'Content-Type': 'application/json' };
}

async function ev<T = any>(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const resp = await fetch(`${BASE}${path}`, {
      method,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await resp.json().catch(() => null)) as T | null;
    return { ok: resp.ok, status: resp.status, data };
  } catch (err: any) {
    logger.warn({ err: err?.message, path }, 'Evolution API request failed');
    return { ok: false, status: 0, data: null };
  }
}

/** Creates an Evolution instance if it does not already exist. Idempotent. */
export async function ensureInstance(instance: string): Promise<void> {
  const list = await ev<Array<{ instance: { instanceName: string } } | { name: string }>>('GET', '/instance/fetchInstances');
  const exists = Array.isArray(list.data)
    && list.data.some((i: any) => i?.instance?.instanceName === instance || i?.name === instance);
  if (exists) return;

  const webhookUrl = `${env.PUBLIC_API_URL.replace(/\/$/, '')}/webhook/evolution`;
  await ev('POST', '/instance/create', {
    instanceName: instance,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
    webhook: {
      url: webhookUrl,
      enabled: true,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'],
      webhook_by_events: false,
      webhook_base64: false,
    },
  });
}

/** Triggers a connection attempt and returns the current QR (base64 data URL) if any. */
export async function connectInstance(instance: string): Promise<{ qr: string | null; code: string | null; pairingCode: string | null }> {
  const r = await ev<any>('GET', `/instance/connect/${encodeURIComponent(instance)}`);
  return {
    qr: r.data?.base64 ?? null,
    code: r.data?.code ?? null,
    pairingCode: r.data?.pairingCode ?? null,
  };
}

/** "open" | "connecting" | "close" | "unknown" */
export async function getConnectionState(instance: string): Promise<string> {
  const r = await ev<any>('GET', `/instance/connectionState/${encodeURIComponent(instance)}`);
  return r.data?.instance?.state ?? r.data?.state ?? 'unknown';
}

export async function logoutInstance(instance: string): Promise<void> {
  await ev('DELETE', `/instance/logout/${encodeURIComponent(instance)}`);
}

export async function deleteInstance(instance: string): Promise<void> {
  await ev('DELETE', `/instance/delete/${encodeURIComponent(instance)}`);
}

export class EvolutionProvider implements WhatsAppProvider {
  getName(): ProviderName {
    return 'evolution';
  }

  async isConnected(clinicId: string): Promise<boolean> {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { whatsappEvolutionInstance: true },
    });
    if (!clinic?.whatsappEvolutionInstance) return false;
    try {
      const state = await getConnectionState(clinic.whatsappEvolutionInstance);
      return state === 'open';
    } catch {
      return false;
    }
  }

  async sendMessage(clinicId: string, to: string, text: string): Promise<SendResult> {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { whatsappEvolutionInstance: true },
    });
    if (!clinic?.whatsappEvolutionInstance) {
      return { ok: false, error: 'evolution_not_configured' };
    }
    const r = await ev<any>(
      'POST',
      `/message/sendText/${encodeURIComponent(clinic.whatsappEvolutionInstance)}`,
      { number: normalisePhone(to), text: text.slice(0, 4096) },
    );
    if (!r.ok) {
      return { ok: false, error: `evolution_http_${r.status}:${r.data?.message ?? r.data?.error ?? 'unknown'}` };
    }
    return { ok: true, externalId: r.data?.key?.id ?? null };
  }
}
