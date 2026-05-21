import dayjs from 'dayjs';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { sendText } from '../whatsapp/sender.js';

export async function notifyProfessional(
  clinicId: string,
  professionalId: string,
  appointmentId: string,
  kind: 'CONFIRMED' | 'CANCELLED' = 'CONFIRMED',
) {
  const pro = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!pro?.whatsappNumber) return;

  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { client: true },
  });
  if (!appt) return;

  const when = dayjs(appt.dateTime).format('DD/MM/YYYY [às] HH:mm');
  const text =
    kind === 'CONFIRMED'
      ? `🗓️ Novo agendamento\nCliente: ${appt.client.name ?? appt.client.phone}\nQuando: ${when}\nDuração: ${appt.duration}min`
      : `❌ Agendamento cancelado\nCliente: ${appt.client.name ?? appt.client.phone}\nQuando: ${when}`;

  try {
    await sendText(clinicId, pro.whatsappNumber, text);
  } catch (err) {
    logger.error({ err, professionalId }, 'Failed to notify professional');
  }
}

export async function notifyClient(
  clinicId: string,
  clientId: string,
  appointmentId: string,
  kind: 'CONFIRMED' | 'CANCELLED' | 'REMINDER',
) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { professional: true },
  });
  if (!client || !appt) return;

  const when = dayjs(appt.dateTime).format('DD/MM/YYYY [às] HH:mm');
  let text = '';
  switch (kind) {
    case 'CONFIRMED':
      text = `✅ Seu agendamento foi confirmado para ${when} com ${appt.professional.name}.`;
      break;
    case 'CANCELLED':
      text = `❌ Seu agendamento de ${when} foi cancelado.`;
      break;
    case 'REMINDER':
      text = `🔔 Lembrete: você tem consulta hoje às ${dayjs(appt.dateTime).format('HH:mm')} com ${appt.professional.name}.`;
      break;
  }

  try {
    await sendText(clinicId, client.phone, text);
  } catch (err) {
    logger.error({ err, clientId }, 'Failed to notify client');
  }
}
