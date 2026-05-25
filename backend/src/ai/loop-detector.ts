// Detecta quando o agente entra em loop pedindo o mesmo campo repetidamente
// e fornece mensagens de escape.

const LOOP_THRESHOLD = 3;

const FIELD_PATTERNS = [
  { pattern: /seu nome|como.*chama|qual.*nome/i, label: 'nome' },
  { pattern: /seu cpf|número.*cpf|informe.*cpf/i, label: 'cpf' },
  { pattern: /seu telefone|número.*celular/i, label: 'telefone' },
  { pattern: /data.*nascimento|quando.*nasceu/i, label: 'data_nascimento' },
  { pattern: /convênio|plano de saúde/i, label: 'convenio' },
  { pattern: /qual.*serviço|que.*procedimento/i, label: 'servico' },
  { pattern: /qual.*horário|que.*hora.*prefere/i, label: 'horario' },
  { pattern: /endereço|onde.*mora/i, label: 'endereco' },
];

const SHORT_AFFIRMATION_RE =
  /^(s|sim+|sii+m+|okk*|ok+|ta+|tá+|blz|beleza|claro|pode|podê|confirmo|confirmado|certo|isso|isso mesmo|é isso|perfeito|show|ótimo|otimo|combinado|fechado|👍|✅|obrigad[ao]+|obg|vlw|valeu|tmj|legal|bom|bacana)$/i;
const SHORT_NEGATION_RE =
  /^(n|não+|nao+|nop+|nunca|negativo|nem|nao mesmo|não mesmo|nop|nops)$/i;

export type AgentMessage = {
  role: string;
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

export function classifyShortReply(text: string): 'affirm' | 'deny' | null {
  const trimmed = text.trim().replace(/[.,!?;:"']/g, '').toLowerCase();
  if (!trimmed || trimmed.length > 25) return null;
  if (SHORT_AFFIRMATION_RE.test(trimmed)) return 'affirm';
  if (SHORT_NEGATION_RE.test(trimmed)) return 'deny';
  return null;
}

export function detectLoop(messages: AgentMessage[]): boolean {
  const assistantMessages = messages
    .filter((m) => m.role === 'assistant' && m.content)
    .slice(-10)
    .map((m) => String(m.content ?? ''));

  return FIELD_PATTERNS.some(
    ({ pattern }) =>
      assistantMessages.filter((msg) => pattern.test(msg)).length >= LOOP_THRESHOLD,
  );
}

export function buildLoopEscapeMessage(clinicPhone?: string | null): string {
  const contact = clinicPhone ? ` pelo telefone ${clinicPhone}` : '';
  return `Estou com dificuldades em te atender por aqui. Por favor, entre em contato diretamente${contact}. Pedimos desculpas!`;
}
