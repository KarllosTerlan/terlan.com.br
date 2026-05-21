import dayjs from 'dayjs';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import { env } from '../config/env.js';
import { askClaude, type ClaudeMessage } from './claude.js';
import { buildSystemPrompt } from './prompt.js';
import { sendText } from '../whatsapp/sender.js';
import { findFreeSlots } from '../calendar/availability.js';
import { bookAppointment, cancelAppointment } from '../scheduler/booking.service.js';

const MAX_HISTORY = 20;

type AIResponse = {
  action: 'REPLY' | 'CHECK_AVAILABILITY' | 'BOOK' | 'CANCEL' | 'TRANSFER';
  message: string;
  data?: {
    professionalId?: string;
    date?: string;
    time?: string;
    duration?: number;
    appointmentId?: string;
    reason?: string;
  };
};

function safeParse(raw: string): AIResponse | null {
  try {
    let s = raw.trim();
    if (s.startsWith('```')) s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const obj = JSON.parse(s);
    if (typeof obj.action !== 'string' || typeof obj.message !== 'string') return null;
    return obj as AIResponse;
  } catch {
    return null;
  }
}

function isWithinBusinessHours(clinic: { businessHours: any; timezone: string }, when = new Date()): boolean {
  const bh = clinic.businessHours as Record<string, [string, string] | null>;
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const d = dayjs(when);
  const slot = bh[days[d.day()]];
  if (!slot) return false;
  const [start, end] = slot;
  const cur = d.format('HH:mm');
  return cur >= start && cur <= end;
}

async function rateLimit(clinicId: string, phone: string): Promise<boolean> {
  const key = `wa:rl:${clinicId}:${phone}`;
  const r = await redis.set(key, '1', 'PX', env.RATE_LIMIT_MS, 'NX');
  return r === 'OK';
}

export async function processIncomingMessage(args: {
  clinicId: string;
  phone: string;
  text: string;
  pushName?: string;
}): Promise<void> {
  const { clinicId, phone, text, pushName } = args;

  if (!(await rateLimit(clinicId, phone))) {
    logger.debug({ clinicId, phone }, 'Rate limited; dropping message');
    return;
  }

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic || !clinic.active) return;

  // Find or create client
  let client = await prisma.client.findUnique({ where: { phone } });
  if (!client) {
    client = await prisma.client.create({ data: { phone, name: pushName } });
  } else if (!client.name && pushName) {
    client = await prisma.client.update({ where: { id: client.id }, data: { name: pushName } });
  }

  // Off-hours auto reply (no AI call)
  if (!isWithinBusinessHours(clinic)) {
    try {
      await sendText(clinicId, phone, clinic.offHoursMessage);
    } catch (err) {
      logger.error({ clinicId, err }, 'Failed to send off-hours message');
    }
    return;
  }

  // Load or create conversation
  const conv = await prisma.conversation.upsert({
    where: { clinicId_clientPhone: { clinicId, clientPhone: phone } },
    create: { clinicId, clientPhone: phone, messages: [], context: {} },
    update: { lastMessageAt: new Date() },
  });

  const history = ((conv.messages as any[]) || []).slice(-MAX_HISTORY);
  history.push({ role: 'user', content: text, ts: Date.now() });

  const professionals = await prisma.professional.findMany({
    where: { clinicId, active: true },
    select: { id: true, name: true, specialty: true, defaultDuration: true },
  });

  const system = buildSystemPrompt(clinic, professionals, client.name);
  const messages: ClaudeMessage[] = history.map((m: any) => ({
    role: m.role,
    content: String(m.content),
  }));

  let raw = '';
  try {
    raw = await askClaude(system, messages);
  } catch (err) {
    logger.error({ clinicId, phone, err }, 'Claude call failed');
    await safeSend(clinicId, phone, 'Desculpe, tive um problema técnico agora. Pode tentar novamente em instantes?');
    return;
  }

  const parsed = safeParse(raw);
  const reply: AIResponse = parsed ?? {
    action: 'REPLY',
    message: raw.slice(0, 1000) || 'Desculpe, não entendi. Pode reformular?',
  };

  // Execute action
  let finalMessage = reply.message;
  try {
    switch (reply.action) {
      case 'CHECK_AVAILABILITY': {
        const profId = reply.data?.professionalId ?? professionals[0]?.id;
        const date = reply.data?.date ?? dayjs().add(1, 'day').format('YYYY-MM-DD');
        const duration = reply.data?.duration ?? professionals.find((p) => p.id === profId)?.defaultDuration ?? 30;
        if (profId) {
          const slots = await findFreeSlots(clinic, profId, date, duration);
          const slotsText = slots.length
            ? slots.slice(0, 6).map((s) => dayjs(s).format('DD/MM HH:mm')).join(', ')
            : 'nenhum horário livre nesse dia';
          finalMessage = `${reply.message}\n\nHorários disponíveis: ${slotsText}`;
        }
        break;
      }
      case 'BOOK': {
        const profId = reply.data?.professionalId;
        const date = reply.data?.date;
        const time = reply.data?.time;
        const duration = reply.data?.duration ?? 30;
        if (profId && date && time) {
          const dateTime = dayjs(`${date}T${time}`).toDate();
          const appt = await bookAppointment({
            clinicId,
            professionalId: profId,
            clientId: client.id,
            dateTime,
            duration,
            notes: reply.data?.reason,
          });
          finalMessage = `${reply.message}\n\n✅ Agendamento confirmado: ${dayjs(appt.dateTime).format('DD/MM/YYYY [às] HH:mm')}.`;
        } else {
          finalMessage = 'Preciso de profissional, data e horário para confirmar. Pode me passar?';
        }
        break;
      }
      case 'CANCEL': {
        const apptId = reply.data?.appointmentId;
        if (apptId) {
          await cancelAppointment(clinicId, apptId, reply.data?.reason);
          finalMessage = `${reply.message}\n\n✅ Cancelamento efetuado.`;
        }
        break;
      }
      case 'TRANSFER':
      case 'REPLY':
      default:
        break;
    }
  } catch (err) {
    logger.error({ clinicId, action: reply.action, err }, 'Action execution failed');
    finalMessage = 'Tive um problema ao processar sua solicitação. Pode tentar novamente?';
  }

  // Send reply
  await safeSend(clinicId, phone, finalMessage);

  // Persist conversation
  history.push({ role: 'assistant', content: finalMessage, ts: Date.now(), action: reply.action });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      messages: history.slice(-MAX_HISTORY * 2),
      lastMessageAt: new Date(),
      context: { lastAction: reply.action, lastData: reply.data ?? {} },
    },
  });
}

async function safeSend(clinicId: string, phone: string, text: string) {
  try {
    await sendText(clinicId, phone, text);
  } catch (err) {
    logger.error({ clinicId, phone, err }, 'Failed to send WhatsApp reply');
  }
}
