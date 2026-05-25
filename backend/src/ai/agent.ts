// Agente de IA com tool calling — coração do ClinicBot Pro.
// Suporta Claude (Anthropic) e GPT-4o (OpenAI), configurável por clínica.

import Anthropic from '@anthropic-ai/sdk';
import { addMinutes, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { sendText } from '../whatsapp/sender.js';
import { getAvailableSlots } from '../scheduler/slots.js';
import { cancelGoogleEvent, syncAppointmentToGoogle } from '../calendar/booking.js';
import { writeLog } from '../lib/observability.js';
import { notifyScheduleEvent } from '../lib/notifications.js';
import { detectLoop, classifyShortReply, buildLoopEscapeMessage, type AgentMessage } from './loop-detector.js';
import { isPhoneBlocked, canCreateAppointment, trackCancellation, trackBotScore } from './abuse-guard.js';
import { buildPatientProfile, buildConversationHistory, getPatientFutureAppointmentsSummary, buildMessageWindow, isConversationStale } from './context.js';
import { parseAndValidateScheduledAt, validateRequiredFields, hasTimeMentionInRecentMessages } from './validators.js';
import { findOrCreateClient, upsertConversation, safeParseToolArgs } from './utils.js';
import { getClinicConfig, buildSystemPrompt } from './guardrail.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const AGENT_LOCK_TTL_SECONDS = 25;
const MAX_TOOL_ROUNDS = 4;

// ─────────────────────────────────────────────
// Tool definitions (shared format)
// ─────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'check_availability',
    description: 'Verifica os horários disponíveis para agendamento em uma data específica. SEMPRE chame isso antes de sugerir qualquer horário ao paciente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Data no formato YYYY-MM-DD. Exemplo: 2026-05-30' },
      },
      required: ['date'],
    },
  },
  {
    name: 'confirm_appointment',
    description: 'Confirma e cria um agendamento. Só chame quando tiver TODOS os dados obrigatórios E o paciente tiver confirmado explicitamente um horário.',
    input_schema: {
      type: 'object' as const,
      properties: {
        service_id: { type: 'string', description: 'UUID do serviço escolhido pelo paciente' },
        professional_id: { type: 'string', description: 'UUID do profissional (se houver mais de um)' },
        scheduled_at: { type: 'string', description: 'Data/hora no formato ISO 8601 com timezone. Exemplo: 2026-05-30T10:00:00-03:00' },
        patient_data: {
          type: 'object',
          description: 'Dados coletados do paciente',
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            cpf: { type: 'string' },
            birthdate: { type: 'string' },
            address: { type: 'string' },
            insurance: { type: 'string' },
          },
        },
        notes: { type: 'string', description: 'Observações opcionais' },
      },
      required: ['scheduled_at', 'patient_data'],
    },
  },
  {
    name: 'list_my_appointments',
    description: 'Lista os próximos agendamentos ativos (pendentes e confirmados) do paciente. Use antes de remarcar ou cancelar.',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'cancel_appointment',
    description: 'Cancela um agendamento do paciente. Use list_my_appointments primeiro se não tiver o ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        appointment_id: { type: 'string', description: 'UUID do agendamento a cancelar' },
        reason: { type: 'string', description: 'Motivo do cancelamento (opcional)' },
      },
      required: ['appointment_id'],
    },
  },
  {
    name: 'reschedule_appointment',
    description: 'Remarca um agendamento existente para nova data/hora. Use list_my_appointments para obter o ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        appointment_id: { type: 'string', description: 'UUID do agendamento a remarcar' },
        new_scheduled_at: { type: 'string', description: 'Nova data/hora no formato ISO 8601. Exemplo: 2026-06-05T14:00:00-03:00' },
      },
      required: ['appointment_id', 'new_scheduled_at'],
    },
  },
];

// ─────────────────────────────────────────────
// Main: runAgent
// ─────────────────────────────────────────────

export async function runAgent(args: {
  clinicId: string;
  phone: string;
  text: string;
  pushName?: string | null;
  mediaType?: 'audio' | 'image' | null;
}): Promise<void> {
  const { clinicId, phone, text, pushName } = args;

  // 1. Bot detection
  await trackBotScore(clinicId, phone);

  // 2. Blacklist check
  const blockedCheck = await isPhoneBlocked(clinicId, phone);
  if (!blockedCheck.allowed) {
    await writeLog(clinicId, 'INFO', 'agent', `Mensagem bloqueada: ${blockedCheck.code}`, { phone });
    return;
  }

  // 3. Clinic config
  const clinic = await getClinicConfig(clinicId);
  if (!clinic) {
    logger.error({ clinicId }, 'Clinic not found');
    return;
  }

  // 4. Acquire per-phone mutex (evita race conditions em mensagens rápidas)
  const lockKey = `lock:agent:${clinicId}:${phone}`;
  const lockAcquired = await redis.set(lockKey, '1', 'EX', AGENT_LOCK_TTL_SECONDS, 'NX').catch(() => null);

  if (!lockAcquired) {
    // Aguarda e tenta novamente
    await new Promise((r) => setTimeout(r, 2000));
    const retry = await redis.set(lockKey, '1', 'EX', AGENT_LOCK_TTL_SECONDS, 'NX').catch(() => null);
    if (!retry) {
      logger.debug({ clinicId, phone }, 'Agent lock busy, skipping');
      return;
    }
  }

  try {
    await _runAgentLocked({ clinicId, phone, text, pushName, clinic });
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
}

async function _runAgentLocked(args: {
  clinicId: string;
  phone: string;
  text: string;
  pushName?: string | null;
  clinic: Awaited<ReturnType<typeof getClinicConfig>> & {};
}): Promise<void> {
  const { clinicId, phone, text, pushName, clinic } = args;

  // 5. Find or create client
  const clientInfo = await findOrCreateClient(phone, pushName);

  // 6. Load conversation
  let conv = await prisma.conversation.findUnique({
    where: { clinicId_clientPhone: { clinicId, clientPhone: phone } },
  });

  let messages: AgentMessage[] = [];
  let context: Record<string, unknown> = {};

  if (conv) {
    // Conversa stale → fecha e começa nova
    if (isConversationStale(conv.updatedAt) && conv.active) {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { active: false, outcome: conv.outcome === 'UNKNOWN' ? 'ABANDONED' : conv.outcome },
      });
      messages = [];
      context = {};
      conv = null;
    } else {
      messages = normalizeMessages(conv.messages);
      context = (conv.context as Record<string, unknown>) ?? {};
    }
  }

  // 7. Loop detection + escape
  const collectedData = (context.collectedData as Record<string, unknown>) ?? {};
  const loopCount = (context.loopCount as number) ?? 0;

  if (detectLoop(messages)) {
    context.loopCount = loopCount + 1;
    if (loopCount >= 3) {
      const escapeMsg = buildLoopEscapeMessage(clinic.phone);
      await sendText(clinicId, phone, escapeMsg);
      await upsertConversation(clinicId, phone, clientInfo.id, {
        messages: [...messages, { role: 'user', content: text }, { role: 'assistant', content: escapeMsg }],
        context: { ...context, loopDetected: true },
        active: false,
        outcome: 'ABANDONED',
      });
      return;
    }
  }

  // 8. Short-reply detection: se "sim"/"não", injeta contexto no prompt
  const shortReply = classifyShortReply(text);

  // 9. Construção do contexto do paciente
  const [patientProfile, conversationHistory, patientAppointments] = await Promise.all([
    Promise.resolve(buildPatientProfile({
      name: clientInfo.name,
      isVip: clientInfo.isVip,
    })),
    clientInfo.isNew
      ? Promise.resolve('Primeira interação do paciente.')
      : buildConversationHistory(clientInfo.id, conv?.id),
    getPatientFutureAppointmentsSummary(clientInfo.id, clinicId),
  ]);

  // 10. System prompt
  const systemPrompt = await buildSystemPrompt(
    clinic!,
    collectedData,
    patientProfile,
    patientAppointments,
    conversationHistory,
  );

  // 11. Terminal state: se conversa acabou (agendamento/cancelamento), fecha no próximo "obrigado"
  const terminalStep = context.terminalStep as string | undefined;
  const terminalAt = context.terminalAt as number | undefined;
  if (terminalStep && terminalAt && Date.now() - terminalAt < 5 * 60 * 1000) {
    const lc = text.toLowerCase();
    if (/obrigad|valeu|ótimo|perfeito|show|ok|tá bom|até|tchau|flw|boa/i.test(lc)) {
      const reply = 'Fico feliz em ajudar! 😊 Até logo! Se precisar de algo mais, é só chamar.';
      await sendText(clinicId, phone, reply);
      await upsertConversation(clinicId, phone, clientInfo.id, {
        messages: [...messages, { role: 'user', content: text }, { role: 'assistant', content: reply }],
        context,
        active: false,
      });
      return;
    }
  }

  // 12. Prepara histórico de mensagens para o LLM
  const newUserMessage: AgentMessage = { role: 'user', content: text };
  const allMessages = [...messages, newUserMessage];
  const windowedMessages = buildMessageWindow(allMessages, collectedData);

  // Injeta contexto de resposta curta
  const anthropicMessages = windowedMessages.map((m) => ({
    role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: m.content ?? '',
  })) as Anthropic.MessageParam[];

  if (shortReply) {
    // Adiciona dica ao último user message para o agente não repetir a pergunta
    const hint = shortReply === 'affirm' ? ' [confirmação do paciente]' : ' [negação do paciente]';
    const last = anthropicMessages[anthropicMessages.length - 1];
    if (last?.role === 'user') {
      last.content = String(last.content) + hint;
    }
  }

  // 13. Tool calling loop (máx MAX_TOOL_ROUNDS)
  let finalReply = '';
  const allMessagesForState = [...allMessages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const model = getClaudeModel(clinic!.agentModel);
    const response = await anthropic.messages.create({
      model,
      max_tokens: clinic!.agentMaxTokens,
      temperature: clinic!.agentTemperature,
      system: systemPrompt,
      tools: TOOLS,
      messages: anthropicMessages,
    });

    // Extrai texto e tool calls
    const textBlocks = response.content.filter((b) => b.type === 'text');
    const toolBlocks = response.content.filter((b) => b.type === 'tool_use');

    if (response.stop_reason === 'end_turn' || toolBlocks.length === 0) {
      finalReply = textBlocks.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
      break;
    }

    // Adiciona resposta do assistente ao histórico
    anthropicMessages.push({ role: 'assistant', content: response.content as never });

    // Processa cada tool call
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolCall of toolBlocks) {
      if (toolCall.type !== 'tool_use') continue;

      const result = await executeTool({
        toolName: toolCall.name,
        toolInput: toolCall.input,
        clinicId,
        clientId: clientInfo.id,
        phone,
        collectedData,
        context,
        messages: allMessagesForState,
        clinic: clinic!,
      });

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolCall.id,
        content: result.output,
      });

      // Propaga atualizações de contexto
      if (result.contextUpdate) {
        Object.assign(context, result.contextUpdate);
        Object.assign(collectedData, result.contextUpdate.collectedData ?? {});
      }
    }

    anthropicMessages.push({ role: 'user', content: toolResults });
  }

  if (!finalReply) {
    finalReply = 'Desculpe, não consegui processar sua solicitação. Pode repetir?';
  }

  // 14. Enviar resposta
  await sendText(clinicId, phone, finalReply);
  await writeLog(clinicId, 'INFO', 'agent', `Resposta enviada para ${phone}`, {
    phone,
    responseLength: finalReply.length,
    round: 'end',
  });

  // 15. Salva conversa
  allMessagesForState.push({ role: 'assistant', content: finalReply });
  await upsertConversation(clinicId, phone, clientInfo.id, {
    messages: allMessagesForState,
    context,
    active: context.terminalStep ? false : true,
    outcome: (context.outcome as string) ?? 'UNKNOWN',
    messageCount: allMessagesForState.filter((m) => m.role === 'user').length,
  });
}

// ─────────────────────────────────────────────
// Tool executor
// ─────────────────────────────────────────────

type ToolExecutionContext = {
  toolName: string;
  toolInput: unknown;
  clinicId: string;
  clientId: string;
  phone: string;
  collectedData: Record<string, unknown>;
  context: Record<string, unknown>;
  messages: AgentMessage[];
  clinic: NonNullable<Awaited<ReturnType<typeof getClinicConfig>>>;
};

async function executeTool(ctx: ToolExecutionContext): Promise<{
  output: string;
  contextUpdate?: Record<string, unknown>;
}> {
  const { toolName, toolInput, clinicId, clientId, phone, collectedData, messages, clinic } = ctx;

  try {
    switch (toolName) {
      case 'check_availability': {
        const { date } = safeParseToolArgs<{ date: string }>(toolInput);
        if (!date) return { output: 'Data inválida.' };

        const slots = await getAvailableSlots(clinicId, date, { clientId });
        if (!slots.length) return { output: `Sem horários disponíveis em ${date}.` };

        const tz = clinic.timezone || 'America/Sao_Paulo';
        const formatted = slots
          .map((s) => format(toZonedTime(s.start, tz), 'HH:mm', { locale: ptBR }))
          .join(', ');
        return { output: `Horários disponíveis em ${date}: ${formatted}` };
      }

      case 'confirm_appointment': {
        const args = safeParseToolArgs<{
          service_id?: string;
          professional_id?: string;
          scheduled_at: string;
          patient_data: Record<string, string>;
          notes?: string;
        }>(toolInput);

        // Valida data
        const validation = parseAndValidateScheduledAt(args.scheduled_at);
        if (!validation.ok) return { output: `Erro: ${validation.error}` };

        // Anti-alucinação
        if (clinic.antiHallucinationMode && !hasTimeMentionInRecentMessages(messages, args.scheduled_at)) {
          return { output: 'O paciente não confirmou explicitamente esse horário. Pergunte qual horário ele prefere.' };
        }

        // Atualiza dados coletados
        const updatedData = { ...collectedData, ...args.patient_data };

        // Valida campos obrigatórios
        const requiredFields = (clinic.agentRequiredFields as string[]) ?? ['name'];
        const fieldCheck = validateRequiredFields(updatedData, requiredFields);
        if (!fieldCheck.ok) {
          return { output: `Dados incompletos. Faltam: ${fieldCheck.missing.join(', ')}.` };
        }

        // Abuse check
        const abuseCheck = await canCreateAppointment(clinicId, clientId, phone);
        if (!abuseCheck.allowed) return { output: abuseCheck.reason };

        // Determina professional (pega o primeiro ativo se não especificado)
        let professionalId = args.professional_id;
        if (!professionalId) {
          const prof = await prisma.professional.findFirst({
            where: { clinicId, active: true },
          });
          if (!prof) return { output: 'Nenhum profissional disponível.' };
          professionalId = prof.id;
        }

        // Valida service
        const service = args.service_id
          ? await prisma.service.findFirst({ where: { id: args.service_id, clinicId } })
          : await prisma.service.findFirst({ where: { clinicId, active: true } });

        const duration = service?.durationMinutes ?? 30;
        const scheduledAt = validation.date!;
        const endsAt = addMinutes(scheduledAt, duration);

        // Snapshot do paciente
        const clientRecord = await prisma.client.findUnique({ where: { id: clientId } });
        const snapshot = {
          name: updatedData.name ?? clientRecord?.name,
          email: updatedData.email ?? clientRecord?.email,
          cpf: updatedData.cpf ?? clientRecord?.cpf,
          phone,
        };

        // Atualiza cliente com dados novos
        await prisma.client.update({
          where: { id: clientId },
          data: {
            name: (updatedData.name as string) ?? clientRecord?.name ?? undefined,
            email: (updatedData.email as string) ?? clientRecord?.email ?? undefined,
            cpf: (updatedData.cpf as string) ?? clientRecord?.cpf ?? undefined,
            insurance: (updatedData.insurance as string) ?? clientRecord?.insurance ?? undefined,
          },
        });

        // Cria agendamento
        const appt = await prisma.appointment.create({
          data: {
            clinicId,
            professionalId,
            clientId,
            serviceId: service?.id ?? null,
            dateTime: scheduledAt,
            endsAt,
            duration,
            status: 'CONFIRMED',
            source: 'AGENT',
            notes: args.notes ?? null,
            patientSnapshot: snapshot,
          },
          include: { service: true, professional: true },
        });

        // Sync Google Calendar (async, não bloqueia)
        syncAppointmentToGoogle(appt.clinicId, appt.id).catch((err) =>
          writeLog(clinicId, 'WARNING', 'calendar', 'Falha ao sincronizar com Google Calendar', { err: String(err) }),
        );

        // Notifica profissional
        const dtFormatted = format(
          toZonedTime(scheduledAt, clinic.timezone || 'America/Sao_Paulo'),
          "dd/MM/yyyy 'às' HH:mm",
          { locale: ptBR },
        );
        notifyScheduleEvent(clinicId, 'created', {
          patientName: (updatedData.name as string) ?? 'Paciente',
          serviceName: service?.name ?? 'Consulta',
          dateTime: dtFormatted,
          source: 'agent',
        }).catch(() => {});

        await writeLog(clinicId, 'INFO', 'agent', `Agendamento criado: ${appt.id}`, { apptId: appt.id, phone });

        return {
          output: `Agendamento confirmado! ID: ${appt.id}. Data: ${dtFormatted}. Serviço: ${service?.name ?? 'Consulta'}.`,
          contextUpdate: {
            collectedData: updatedData,
            terminalStep: 'completed',
            terminalAt: Date.now(),
            outcome: 'BOOKED',
          },
        };
      }

      case 'list_my_appointments': {
        const appts = await prisma.appointment.findMany({
          where: {
            clientId,
            clinicId,
            status: { in: ['PENDING', 'CONFIRMED'] },
            dateTime: { gte: new Date() },
          },
          orderBy: { dateTime: 'asc' },
          take: 10,
          include: { service: true, professional: true },
        });

        if (!appts.length) return { output: 'Nenhum agendamento ativo encontrado.' };

        const tz = clinic.timezone || 'America/Sao_Paulo';
        const list = appts
          .map((a) => {
            const dt = format(toZonedTime(a.dateTime, tz), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
            const svc = a.service?.name ?? 'Consulta';
            return `[ID: ${a.id}] ${svc} — ${dt} (${a.status === 'CONFIRMED' ? 'Confirmado' : 'Pendente'}) — ${a.professional.name}`;
          })
          .join('\n');

        return { output: list };
      }

      case 'cancel_appointment': {
        const { appointment_id, reason } = safeParseToolArgs<{ appointment_id: string; reason?: string }>(toolInput);

        const appt = await prisma.appointment.findFirst({
          where: { id: appointment_id, clientId, clinicId },
          include: { service: true, professional: true, clinic: true },
        });

        if (!appt) return { output: 'Agendamento não encontrado.' };
        if (!['PENDING', 'CONFIRMED'].includes(appt.status)) {
          return { output: 'Este agendamento não pode ser cancelado (já concluído ou já cancelado).' };
        }

        // Cancela no Google Calendar
        if (appt.googleEventId) {
          cancelGoogleEvent(clinicId, appt.googleEventId).catch(() => {});
        }

        await prisma.appointment.update({
          where: { id: appt.id },
          data: { status: 'CANCELLED', cancelledReason: reason ?? null },
        });

        await trackCancellation(clinicId, phone);

        const tz = clinic.timezone || 'America/Sao_Paulo';
        const dt = format(toZonedTime(appt.dateTime, tz), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
        notifyScheduleEvent(clinicId, 'cancelled', {
          patientName: (collectedData.name as string) ?? 'Paciente',
          serviceName: appt.service?.name ?? 'Consulta',
          dateTime: dt,
          reason,
          source: 'agent',
        }).catch(() => {});

        await writeLog(clinicId, 'INFO', 'agent', `Agendamento cancelado: ${appt.id}`, { apptId: appt.id, phone });

        return {
          output: `Agendamento de ${dt} cancelado com sucesso.`,
          contextUpdate: {
            terminalStep: 'cancelled',
            terminalAt: Date.now(),
            outcome: 'CANCELLED',
          },
        };
      }

      case 'reschedule_appointment': {
        const { appointment_id, new_scheduled_at } = safeParseToolArgs<{
          appointment_id: string;
          new_scheduled_at: string;
        }>(toolInput);

        const validation = parseAndValidateScheduledAt(new_scheduled_at);
        if (!validation.ok) return { output: `Erro: ${validation.error}` };

        if (clinic.antiHallucinationMode && !hasTimeMentionInRecentMessages(messages, new_scheduled_at)) {
          return { output: 'O paciente não confirmou explicitamente esse novo horário.' };
        }

        const appt = await prisma.appointment.findFirst({
          where: { id: appointment_id, clientId, clinicId },
          include: { service: true, professional: true },
        });

        if (!appt) return { output: 'Agendamento não encontrado.' };

        const newDate = validation.date!;
        const endsAt = addMinutes(newDate, appt.duration);

        await prisma.appointment.update({
          where: { id: appt.id },
          data: { dateTime: newDate, endsAt, status: 'CONFIRMED', reminderSent: false, hourReminderSent: false },
        });

        // Atualiza Google Calendar
        syncAppointmentToGoogle(clinicId, appt.id).catch(() => {});

        const tz = clinic.timezone || 'America/Sao_Paulo';
        const dt = format(toZonedTime(newDate, tz), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
        const oldDt = format(toZonedTime(appt.dateTime, tz), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

        notifyScheduleEvent(clinicId, 'rescheduled', {
          patientName: (collectedData.name as string) ?? 'Paciente',
          serviceName: appt.service?.name ?? 'Consulta',
          dateTime: dt,
          oldDateTime: oldDt,
          source: 'agent',
        }).catch(() => {});

        await writeLog(clinicId, 'INFO', 'agent', `Reagendamento: ${appt.id}`, { apptId: appt.id, phone, newDate: dt });

        return {
          output: `Reagendado com sucesso! Novo horário: ${dt}.`,
          contextUpdate: {
            terminalStep: 'rescheduled',
            terminalAt: Date.now(),
            outcome: 'BOOKED',
          },
        };
      }

      default:
        return { output: `Tool desconhecida: ${toolName}` };
    }
  } catch (err) {
    logger.error({ err, toolName, clinicId, phone }, 'Tool execution error');
    await writeLog(clinicId, 'ERROR', 'agent', `Erro na tool ${toolName}: ${String(err)}`, { phone });
    return { output: 'Ocorreu um erro ao processar. Pode tentar novamente?' };
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getClaudeModel(agentModel: string): string {
  // Mapeamento de nomes amigáveis para IDs do Claude
  const modelMap: Record<string, string> = {
    'claude-sonnet-4-5': 'claude-sonnet-4-5',
    'claude-haiku': 'claude-haiku-4-5',
    'claude-opus': 'claude-opus-4-5-20250929',
  };
  return modelMap[agentModel] ?? env.CLAUDE_MODEL;
}

function normalizeMessages(raw: unknown): AgentMessage[] {
  if (!Array.isArray(raw)) {
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as AgentMessage[];
      } catch { /* ignore */ }
    }
    return [];
  }
  return raw.filter(
    (item): item is AgentMessage =>
      typeof item === 'object' && item !== null && typeof (item as AgentMessage).role === 'string',
  );
}
