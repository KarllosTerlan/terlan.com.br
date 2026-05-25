// Validadores do agente: horários, campos obrigatórios, disponibilidade.

import type { AgentMessage } from './loop-detector.js';

/** Valida e parseia um ISO timestamp garantindo que está no futuro. */
export function parseAndValidateScheduledAt(iso: string): {
  ok: boolean;
  date?: Date;
  error?: string;
} {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return { ok: false, error: 'Data inválida.' };
    if (d < new Date()) return { ok: false, error: 'O horário escolhido já passou.' };
    return { ok: true, date: d };
  } catch {
    return { ok: false, error: 'Formato de data inválido.' };
  }
}

/** Valida que todos os campos obrigatórios estão presentes nos dados coletados. */
export function validateRequiredFields(
  collectedData: Record<string, unknown>,
  requiredFields: string[],
): { ok: boolean; missing: string[] } {
  const missing = requiredFields.filter((f) => !collectedData[f]);
  return { ok: missing.length === 0, missing };
}

/**
 * Anti-alucinação: verifica se o paciente realmente mencionou o horário
 * nas últimas N mensagens antes de confirmar o agendamento.
 *
 * Aceita: "8:15", "08h15", "8h", "10 horas", "às 10", "meio-dia"
 */
export function hasTimeMentionInRecentMessages(
  messages: AgentMessage[],
  scheduledAtIso: string,
  lookback = 4,
): boolean {
  const userMsgs = messages
    .filter((m) => m.role === 'user' && typeof m.content === 'string')
    .slice(-lookback)
    .map((m) => String(m.content).toLowerCase());

  if (userMsgs.length === 0) return false;

  const TIME_RE = /\b(\d{1,2})\s*(?::|h|hs|horas?|\s*h\s*|\s*:\s*)\s*(\d{1,2})?\b/i;
  const MERIDIAN_RE = /\b(meio[-\s]?dia|meia[-\s]?noite)\b/i;

  const m = scheduledAtIso.match(/T(\d{2}):(\d{2})/);
  if (!m) return true; // sem hora para validar — deixa passar

  const targetHour = parseInt(m[1], 10);
  const targetMinute = parseInt(m[2], 10);

  for (const msg of userMsgs) {
    if (MERIDIAN_RE.test(msg)) return true;

    const match = TIME_RE.exec(msg);
    if (match) {
      const mentionedHour = parseInt(match[1], 10);
      const mentionedMin = match[2] ? parseInt(match[2], 10) : 0;

      const hourMatch =
        mentionedHour === targetHour ||
        mentionedHour + 12 === targetHour ||
        mentionedHour - 12 === targetHour;
      const minMatch = Math.abs(mentionedMin - targetMinute) <= 15;

      if (hourMatch && minMatch) return true;
    }
  }

  return false;
}
