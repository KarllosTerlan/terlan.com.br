import { logger } from '../lib/logger.js';
import { retry } from '../lib/retry.js';
import { sendText as serviceSend } from './providers/service.js';

/**
 * Sends a text message to `phone` on behalf of `clinicId` using the provider
 * chain (Evolution primary → Meta fallback). Records every attempt in MessageLog.
 */
export async function sendText(clinicId: string, phone: string, text: string): Promise<void> {
  const result = await retry(() => serviceSend(clinicId, phone, text), {
    retries: 1,
    baseMs: 500,
    label: 'wa:send',
  });
  logger.debug(
    { clinicId, phone, provider: result.provider, fellBack: result.fellBack },
    'WhatsApp message sent',
  );
}
