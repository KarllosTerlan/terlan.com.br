/**
 * Abstract WhatsApp provider interface.
 * All providers (Evolution, Meta Cloud, future) must implement these methods.
 */

export type ProviderName = 'evolution' | 'meta';

export type SendResult = {
  ok: boolean;
  externalId?: string;
  error?: string;
};

export interface WhatsAppProvider {
  /** Identifier used in logs and the audit table. */
  getName(): ProviderName;

  /**
   * Returns true if this provider is currently able to send messages
   * on behalf of the given clinic (instance connected / phone configured).
   */
  isConnected(clinicId: string): Promise<boolean>;

  /**
   * Sends a plain text message. Returns `{ok:false}` instead of throwing
   * on recoverable errors so the service layer can decide whether to fall back.
   * MAY throw on programming errors.
   */
  sendMessage(clinicId: string, to: string, text: string): Promise<SendResult>;
}
