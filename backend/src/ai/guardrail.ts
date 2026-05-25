// Constrói o prompt dinâmico (guardrail) por clínica, com FAQ e variáveis injetadas.

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { prisma } from '../lib/prisma.js';
import { getAvailableSlotsText } from '../scheduler/slots.js';

export type ClinicConfig = {
  id: string;
  name: string;
  phone: string | null;
  timezone: string;
  agentSystemPrompt: string;
  agentRequiredFields: unknown;
  agentCustomFields: unknown;
  agentFaqEntries: unknown;
  agentInstructionNotes: string;
  antiHallucinationMode: boolean;
  agentModel: string;
  agentTemperature: number;
  agentMaxTokens: number;
};

export async function getClinicConfig(clinicId: string): Promise<ClinicConfig | null> {
  return prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      id: true,
      name: true,
      phone: true,
      timezone: true,
      agentSystemPrompt: true,
      agentRequiredFields: true,
      agentCustomFields: true,
      agentFaqEntries: true,
      agentInstructionNotes: true,
      antiHallucinationMode: true,
      agentModel: true,
      agentTemperature: true,
      agentMaxTokens: true,
    },
  });
}

/** Constrói o system prompt completo com todas as variáveis substituídas. */
export async function buildSystemPrompt(
  clinic: ClinicConfig,
  collectedData: Record<string, unknown>,
  patientProfile: string,
  patientAppointments: string,
  conversationHistory: string,
): Promise<string> {
  const tz = clinic.timezone || 'America/Sao_Paulo';
  const nowBR = toZonedTime(new Date(), tz);
  const todayDate = format(nowBR, "EEEE, dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR });
  const todayStr = format(nowBR, 'yyyy-MM-dd');

  // Serviços ativos
  const services = await prisma.service.findMany({
    where: { clinicId: clinic.id, active: true },
    select: { id: true, name: true, description: true, durationMinutes: true, price: true },
  });
  const servicesList =
    services.length > 0
      ? services
          .map(
            (s) =>
              `• [ID: ${s.id}] ${s.name}${s.description ? ` — ${s.description}` : ''}` +
              ` (${s.durationMinutes}min${s.price ? ` — R$${s.price.toFixed(2)}` : ''})`,
          )
          .join('\n')
      : 'Nenhum serviço cadastrado.';

  // Horários disponíveis nos próximos 7 dias
  const slotsLines: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(nowBR);
    d.setDate(d.getDate() + i);
    const ds = format(d, 'yyyy-MM-dd');
    const slots = await getAvailableSlotsText(clinic.id, ds);
    if (slots) {
      const label = format(d, "EEEE dd/MM", { locale: ptBR });
      slotsLines.push(`${label}: ${slots}`);
    }
  }
  const availableSlots = slotsLines.length > 0 ? slotsLines.join('\n') : 'Sem disponibilidade nos próximos 7 dias.';

  // Horários de funcionamento
  const wh = await prisma.workingHours.findMany({
    where: { clinicId: clinic.id, active: true },
    orderBy: { weekday: 'asc' },
  });
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const workingHoursText =
    wh.length > 0
      ? wh
          .map((h) => {
            const brk =
              h.breakStartTime && h.breakEndTime
                ? ` (intervalo ${h.breakStartTime}–${h.breakEndTime})`
                : '';
            return `${dayNames[h.weekday]}: ${h.startTime}–${h.endTime}${brk}`;
          })
          .join('\n')
      : 'Horários não configurados.';

  // Campos obrigatórios
  const requiredFields = (clinic.agentRequiredFields as string[]) ?? ['name'];
  const requiredText = requiredFields
    .map((f) => {
      const map: Record<string, string> = {
        name: 'nome completo',
        email: 'e-mail',
        cpf: 'CPF',
        birthdate: 'data de nascimento',
        address: 'endereço',
        insurance: 'convênio',
        phone: 'telefone de contato',
      };
      return map[f] ?? f;
    })
    .join(', ');

  // FAQ
  const faqEntries = (clinic.agentFaqEntries as Array<{ question: string; answer: string; whenToUse?: string }>) ?? [];
  const faqText =
    faqEntries.length > 0
      ? faqEntries
          .map((f) => `P: ${f.question}\nR: ${f.answer}${f.whenToUse ? `\nQuando usar: ${f.whenToUse}` : ''}`)
          .join('\n\n')
      : 'Nenhuma FAQ configurada.';

  // Dados coletados
  const collectedText =
    Object.entries(collectedData)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n') || 'Nenhum dado coletado ainda.';

  // Notas extras
  const extraNotes = clinic.agentInstructionNotes
    ? `\n\nINSTRUÇÕES ADICIONAIS:\n${clinic.agentInstructionNotes}`
    : '';

  // Substitui variáveis no template
  let prompt = clinic.agentSystemPrompt
    .replace(/\{\{CLINIC_NAME\}\}/g, clinic.name)
    .replace(/\{\{PROFESSIONAL_NAME\}\}/g, clinic.name)
    .replace(/\{\{TODAY_DATE\}\}/g, todayDate)
    .replace(/\{\{TIMEZONE\}\}/g, tz)
    .replace(/\{\{SERVICES_LIST\}\}/g, servicesList)
    .replace(/\{\{AVAILABLE_SLOTS\}\}/g, availableSlots)
    .replace(/\{\{WORKING_HOURS\}\}/g, workingHoursText)
    .replace(/\{\{COLLECTED_DATA\}\}/g, collectedText)
    .replace(/\{\{PATIENT_APPOINTMENTS\}\}/g, patientAppointments)
    .replace(/\{\{REQUIRED_FIELDS\}\}/g, requiredText)
    .replace(/\{\{FAQ_CONTEXT\}\}/g, faqText);

  // Appenda guardrail fixo de conversa
  prompt += buildConversationGuardrail(clinic, requiredText, todayStr, servicesList) + extraNotes;

  // Injeta histórico de conversas passadas se retorno de paciente
  if (conversationHistory && conversationHistory !== 'Primeira interação do paciente.') {
    prompt += `\n\nHISTÓRICO DE INTERAÇÕES ANTERIORES:\n${conversationHistory}`;
  }

  // Injeta perfil do paciente se retorno
  if (patientProfile && patientProfile !== 'Nenhum dado cadastrado ainda.') {
    prompt += `\n\nPERFIL DO PACIENTE (dados conhecidos — use para preencher campos automaticamente):\n${patientProfile}`;
  }

  return prompt;
}

function buildConversationGuardrail(
  clinic: ClinicConfig,
  requiredText: string,
  todayStr: string,
  _servicesList: string,
): string {
  return `

──────────────────────────────────────────────
REGRAS DE CONVERSA (OBRIGATÓRIAS — NÃO QUEBRE):
──────────────────────────────────────────────

ESTILO:
• Máx 3–4 linhas por resposta (~450 caracteres)
• NÃO liste todos os campos de uma vez
• Colete UM dado por vez de forma natural
• Português casual: "pra", "tá", "vc", "pode sim"
• Emojis com moderação (1–2 no máx, não em todo msg)
• Sempre termine com a próxima pergunta ou ação

FLUXO DE AGENDAMENTO:
1. Cumprimente com simpatia quando o paciente iniciar
2. Entenda o que precisa (tipo de consulta/serviço)
3. Chame check_availability para ver horários
4. Apresente até 3–4 opções de horário
5. Só depois colete os dados obrigatórios (${requiredText}) — UM DE CADA VEZ
6. Só chame confirm_appointment quando tiver TODOS os dados E o paciente confirmar

REAGENDAMENTO:
1. Chame list_my_appointments para ver os agendamentos
2. Pergunte qual deseja remarcar (se houver mais de um)
3. Chame check_availability para novo horário
4. Chame reschedule_appointment — NÃO crie novo agendamento

CANCELAMENTO:
1. Chame list_my_appointments se o paciente não especificou qual
2. Confirme com o paciente
3. Chame cancel_appointment

ANTI-ALUCINAÇÃO:
• NUNCA confirme agendamento sem o paciente ter dito o horário explicitamente
• NUNCA invente appointment_id — use list_my_appointments
• NUNCA ofereça horários que não estão em AVAILABLE_SLOTS
• Data de hoje: ${todayStr} — use como referência`;
}
