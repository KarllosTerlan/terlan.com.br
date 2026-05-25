import { addMinutes } from 'date-fns';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { createGoogleEvent, cancelGoogleEvent } from '../calendar/booking.js';
import { notifyProfessional, notifyClient } from './notification.service.js';
import { notifyScheduleEvent } from '../lib/notifications.js';

export async function bookAppointment(args: {
  clinicId: string;
  professionalId: string;
  clientId: string;
  dateTime: Date;
  duration: number;
  notes?: string;
  serviceId?: string;
  source?: 'AGENT' | 'MANUAL' | 'API';
}) {
  const clinic = await prisma.clinic.findUnique({ where: { id: args.clinicId } });
  const professional = await prisma.professional.findUnique({ where: { id: args.professionalId } });
  const client = await prisma.client.findUnique({ where: { id: args.clientId } });
  if (!clinic || !professional || !client) throw new Error('Invalid references for booking');

  const service = args.serviceId
    ? await prisma.service.findUnique({ where: { id: args.serviceId } })
    : null;

  const patientSnapshot = {
    name: client.name,
    phone: client.phone,
    email: client.email,
    isVip: client.isVip,
  };

  const appt = await prisma.appointment.create({
    data: {
      clinicId: args.clinicId,
      professionalId: args.professionalId,
      clientId: args.clientId,
      dateTime: args.dateTime,
      endsAt: addMinutes(args.dateTime, args.duration),
      duration: args.duration,
      notes: args.notes,
      status: 'CONFIRMED',
      source: args.source ?? 'MANUAL',
      serviceId: args.serviceId,
      patientSnapshot,
    },
  });

  let googleEventId: string | null = null;
  try {
    googleEventId = await createGoogleEvent(clinic, professional, {
      summary: `${client.name ?? 'Cliente'} — ${professional.name}`,
      description: args.notes,
      dateTime: args.dateTime,
      duration: args.duration,
      attendeeEmail: client.email ?? undefined,
    });
    if (googleEventId) {
      await prisma.appointment.update({ where: { id: appt.id }, data: { googleEventId } });
    }
  } catch (err) {
    logger.error({ err, apptId: appt.id }, 'Failed to create Google event');
  }

  notifyProfessional(clinic.id, professional.id, appt.id).catch(() => {});
  notifyClient(clinic.id, client.id, appt.id, 'CONFIRMED').catch(() => {});

  notifyScheduleEvent(clinic.id, 'created', {
    patientName: client.name ?? client.phone,
    serviceName: service?.name ?? 'Consulta',
    dateTime: appt.dateTime.toLocaleString('pt-BR', { timeZone: clinic.timezone }),
    source: args.source === 'AGENT' ? 'agent' : 'manual',
  }).catch(() => {});

  return appt;
}

export async function cancelAppointment(clinicId: string, appointmentId: string, reason?: string) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId },
    include: { clinic: true, professional: true, client: true },
  });
  if (!appt) throw new Error('Appointment not found');

  if (appt.googleEventId) {
    try {
      await cancelGoogleEvent(appt.clinic, appt.professional, appt.googleEventId);
    } catch (err) {
      logger.error({ err, apptId: appt.id }, 'Failed to cancel Google event');
    }
  }

  const updated = await prisma.appointment.update({
    where: { id: appt.id },
    data: {
      status: 'CANCELLED',
      cancelledReason: reason,
      notes: reason ? `${appt.notes ?? ''}\nCancelado: ${reason}`.trim() : appt.notes,
    },
  });

  notifyClient(clinicId, appt.clientId, appt.id, 'CANCELLED').catch(() => {});
  notifyProfessional(clinicId, appt.professionalId, appt.id, 'CANCELLED').catch(() => {});

  notifyScheduleEvent(clinicId, 'cancelled', {
    patientName: appt.client.name ?? appt.client.phone,
    serviceName: 'Consulta',
    dateTime: appt.dateTime.toLocaleString('pt-BR', { timeZone: appt.clinic.timezone }),
    reason,
  }).catch(() => {});

  return updated;
}

export async function rescheduleAppointment(
  clinicId: string,
  appointmentId: string,
  newDateTime: Date,
  newDuration?: number,
) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId },
    include: { clinic: true, professional: true },
  });
  if (!appt) throw new Error('Appointment not found');

  const duration = newDuration ?? appt.duration;
  if (appt.googleEventId) {
    try {
      const { updateGoogleEvent } = await import('../calendar/booking.js');
      await updateGoogleEvent(appt.clinic, appt.professional, appt.googleEventId, {
        dateTime: newDateTime,
        duration,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to update Google event');
    }
  }

  return prisma.appointment.update({
    where: { id: appt.id },
    data: {
      dateTime: newDateTime,
      endsAt: addMinutes(newDateTime, duration),
      duration,
      status: 'CONFIRMED',
      reminderSent: false,
      hourReminderSent: false,
    },
  });
}
