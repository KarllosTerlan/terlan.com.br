// Notificações via WhatsApp para profissional/clínica.

import { prisma } from './prisma.js';
import { sendText } from '../whatsapp/sender.js';
import { logger } from './logger.js';

type ScheduleEventType = 'created' | 'cancelled' | 'rescheduled';

interface ScheduleEventDetails {
  patientName: string;
  serviceName: string;
  dateTime: string;
  oldDateTime?: string;
  reason?: string;
  source?: string;
}

/** Notifica a clínica sobre eventos de agendamento via WhatsApp. */
export async function notifyScheduleEvent(
  clinicId: string,
  type: ScheduleEventType,
  details: ScheduleEventDetails,
): Promise<void> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { notifyWhatsappSchedule: true, name: true },
  });

  if (!clinic?.notifyWhatsappSchedule) return;

  const sourceLabel = details.source === 'agent' ? 'via WhatsApp' : 'via painel';
  let msg = '';

  if (type === 'created') {
    msg = `📅 Novo Agendamento ${sourceLabel}\n\n👤 ${details.patientName}\n📋 ${details.serviceName}\n🕐 ${details.dateTime}`;
  } else if (type === 'cancelled') {
    msg = `❌ Agendamento Cancelado ${sourceLabel}\n\n👤 ${details.patientName}\n📋 ${details.serviceName}\n🕐 ${details.dateTime}${details.reason ? `\nMotivo: ${details.reason}` : ''}`;
  } else if (type === 'rescheduled') {
    msg = `🔄 Reagendamento ${sourceLabel}\n\n👤 ${details.patientName}\n📋 ${details.serviceName}\n📌 Antes: ${details.oldDateTime}\n✅ Novo: ${details.dateTime}`;
  }

  if (msg) {
    sendText(clinicId, clinic.notifyWhatsappSchedule, msg).catch((err) => {
      logger.warn({ err, clinicId }, 'Failed to send schedule notification');
    });
  }
}

type AlertType = 'error' | 'warning' | 'info';

/** Envia alerta de sistema para o número configurado na clínica. */
export async function notifySystemAlert(
  clinicId: string,
  type: AlertType,
  message: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { notifyWhatsappAlerts: true, name: true },
  });

  if (!clinic?.notifyWhatsappAlerts) return;

  const icons: Record<AlertType, string> = { error: '🚨', warning: '⚠️', info: 'ℹ️' };
  const icon = icons[type];
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const contextLines = Object.entries(context)
    .slice(0, 5)
    .map(([k, v]) => `• ${k}: ${v}`)
    .join('\n');

  const msg = `${icon} ClinicBot Pro — Alerta\n\n${message}${contextLines ? `\n${contextLines}` : ''}\n\n🕐 ${now}`;

  sendText(clinicId, clinic.notifyWhatsappAlerts, msg).catch((err) => {
    logger.warn({ err, clinicId }, 'Failed to send system alert');
  });
}
