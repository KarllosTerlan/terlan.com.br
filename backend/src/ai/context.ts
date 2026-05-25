// Constrói o contexto dinâmico injetado no prompt do agente.

import { prisma } from '../lib/prisma.js';
import type { AgentMessage } from './loop-detector.js';

const MAX_RAW_MESSAGES = 30;

/** Perfil textual do paciente (dados conhecidos). */
export function buildPatientProfile(client: {
  name?: string | null;
  email?: string | null;
  cpf?: string | null;
  birthdate?: Date | null;
  address?: string | null;
  insurance?: string | null;
  notes?: string | null;
  customData?: unknown;
  isVip?: boolean;
}): string {
  const parts: string[] = [];
  if (client.name) parts.push(`Nome: ${client.name}`);
  if (client.email) parts.push(`E-mail: ${client.email}`);
  if (client.cpf) parts.push(`CPF: ${client.cpf}`);
  if (client.birthdate) parts.push(`Nascimento: ${client.birthdate.toISOString().slice(0, 10)}`);
  if (client.address) parts.push(`Endereço: ${client.address}`);
  if (client.insurance) parts.push(`Convênio: ${client.insurance}`);
  if (client.notes) parts.push(`Obs: ${client.notes}`);
  if (client.isVip) parts.push('⭐ Paciente VIP');

  const custom = client.customData as Record<string, unknown> | null;
  if (custom && typeof custom === 'object') {
    for (const [k, v] of Object.entries(custom)) {
      if (v) parts.push(`${k}: ${v}`);
    }
  }
  return parts.length ? parts.join('\n') : 'Nenhum dado cadastrado ainda.';
}

/** Histórico das últimas 3 conversas fechadas (para contexto de retorno). */
export async function buildConversationHistory(
  clientId: string,
  currentConversationId?: string,
): Promise<string> {
  const pastConvs = await prisma.conversation.findMany({
    where: {
      clientId,
      active: false,
      id: currentConversationId ? { not: currentConversationId } : undefined,
    },
    orderBy: { updatedAt: 'desc' },
    take: 3,
    select: { outcome: true, messageCount: true, updatedAt: true, messages: true },
  });

  if (!pastConvs.length) return 'Primeira interação do paciente.';

  return pastConvs
    .map((c) => {
      const date = c.updatedAt.toLocaleDateString('pt-BR');
      const outcomeMap: Record<string, string> = {
        BOOKED: 'agendou',
        CANCELLED: 'cancelou',
        ABANDONED: 'abandonou',
        INFO_ONLY: 'só consultou',
        UNKNOWN: 'encerrou',
      };
      return `• ${date} — ${outcomeMap[c.outcome] ?? c.outcome} (${c.messageCount} mensagens)`;
    })
    .join('\n');
}

/** Resumo dos próximos agendamentos do paciente (até 5). */
export async function getPatientFutureAppointmentsSummary(
  clientId: string,
  clinicId: string,
): Promise<string> {
  const appts = await prisma.appointment.findMany({
    where: {
      clientId,
      clinicId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      dateTime: { gte: new Date() },
    },
    orderBy: { dateTime: 'asc' },
    take: 5,
    include: { service: true, professional: true },
  });

  if (!appts.length) return 'Nenhum agendamento futuro.';

  return appts
    .map((a) => {
      const dt = a.dateTime.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const svc = a.service?.name ?? 'Consulta';
      const status = a.status === 'CONFIRMED' ? 'Confirmado' : 'Pendente';
      return `[ID: ${a.id}] ${svc} — ${dt} (${status}) — ${a.professional.name}`;
    })
    .join('\n');
}

/** Janela de mensagens para o LLM: colapsa histórico antigo, mantém os últimos N. */
export function buildMessageWindow(
  messages: AgentMessage[],
  collectedData: Record<string, unknown>,
): AgentMessage[] {
  if (messages.length <= MAX_RAW_MESSAGES) return messages;

  const recentMessages = messages.slice(-MAX_RAW_MESSAGES);
  const knownData = Object.entries(collectedData)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');

  const contextMsg: AgentMessage = {
    role: 'user',
    content: `[CONTEXTO ANTERIOR — dados já coletados: ${knownData || 'nenhum'}]`,
  };

  return [contextMsg, ...recentMessages];
}

/** Verifica se a conversa está stale (sem atividade por mais de 24h). */
export function isConversationStale(updatedAt: Date): boolean {
  return Date.now() - updatedAt.getTime() > 24 * 60 * 60 * 1000;
}
