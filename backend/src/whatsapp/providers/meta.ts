import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { fetchPhoneNumberInfo, sendTextMessage, normalisePhone } from '../meta.js';
import type { WhatsAppProvider, SendResult, ProviderName } from './types.js';

export class MetaProvider implements WhatsAppProvider {
  getName(): ProviderName {
    return 'meta';
  }

  /** Resolves the sender phone-number-id (per-clinic or platform default). */
  private async resolvePhoneNumberId(clinicId: string): Promise<string | null> {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { whatsappPhoneNumberId: true },
    });
    return clinic?.whatsappPhoneNumberId ?? env.WHATSAPP_PHONE_NUMBER_ID ?? null;
  }

  async isConnected(clinicId: string): Promise<boolean> {
    const phoneNumberId = await this.resolvePhoneNumberId(clinicId);
    if (!phoneNumberId || !env.WHATSAPP_TOKEN || env.WHATSAPP_TOKEN.startsWith('PUT_YOUR')) {
      return false;
    }
    const info = await fetchPhoneNumberInfo(phoneNumberId);
    return Boolean(info?.display_phone_number);
  }

  async sendMessage(clinicId: string, to: string, text: string): Promise<SendResult> {
    const phoneNumberId = await this.resolvePhoneNumberId(clinicId);
    if (!phoneNumberId) return { ok: false, error: 'meta_not_configured' };
    try {
      const r = await sendTextMessage(phoneNumberId, normalisePhone(to), text);
      return { ok: true, externalId: r.wamId };
    } catch (err: any) {
      return { ok: false, error: `meta_send_failed:${err?.message ?? 'unknown'}` };
    }
  }
}
