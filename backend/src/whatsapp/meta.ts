import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

const GRAPH_BASE = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}`;

export type IncomingMessage = {
  clinicId: string;
  phoneNumberId: string;
  fromPhone: string;
  text: string;
  pushName?: string;
  wamId: string;
};

/** Normalises a Brazilian-style phone number to international digits-only (E.164 without `+`). */
export function normalisePhone(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * Sends a plain text message via the WhatsApp Cloud API.
 *
 * `phoneNumberId` is the **sender** number (a number registered in the WABA),
 * `toPhone` is the recipient's number in E.164 without `+` (e.g. `5511987654321`).
 */
export async function sendTextMessage(
  phoneNumberId: string,
  toPhone: string,
  text: string,
): Promise<{ wamId?: string }> {
  const url = `${GRAPH_BASE}/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalisePhone(toPhone),
    type: 'text',
    text: { preview_url: false, body: text.slice(0, 4096) },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = (await resp.json().catch(() => ({}))) as any;
  if (!resp.ok) {
    logger.error({ status: resp.status, data, toPhone }, 'WhatsApp send failed');
    throw new AppError(
      502,
      `WhatsApp send failed (${resp.status}): ${data?.error?.message ?? 'unknown'}`,
    );
  }
  return { wamId: data?.messages?.[0]?.id };
}

/** Fetches phone-number metadata (display name + verified number). */
export async function fetchPhoneNumberInfo(phoneNumberId: string): Promise<{
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
} | null> {
  try {
    const resp = await fetch(
      `${GRAPH_BASE}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` } },
    );
    if (!resp.ok) return null;
    return (await resp.json()) as any;
  } catch (err) {
    logger.warn({ err, phoneNumberId }, 'fetchPhoneNumberInfo failed');
    return null;
  }
}
