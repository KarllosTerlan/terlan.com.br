import dayjs from 'dayjs';
import type { Clinic, Professional } from '@prisma/client';
import { getCalendarFor } from './client.js';
import { retry } from '../lib/retry.js';
import prisma from '../db/prisma.js';

export async function createGoogleEvent(
  clinic: Clinic,
  professional: Professional,
  args: {
    summary: string;
    description?: string;
    dateTime: Date;
    duration: number;
    attendeeEmail?: string;
  },
): Promise<string | null> {
  if (!clinic.googleRefreshToken) return null;
  const cal = getCalendarFor(clinic);
  const calendarId = professional.calendarId || clinic.googleCalendarId || 'primary';
  const end = dayjs(args.dateTime).add(args.duration, 'minute').toDate();

  const res = await retry(
    () =>
      cal.events.insert({
        calendarId,
        requestBody: {
          summary: args.summary,
          description: args.description,
          start: { dateTime: args.dateTime.toISOString(), timeZone: clinic.timezone },
          end: { dateTime: end.toISOString(), timeZone: clinic.timezone },
          attendees: args.attendeeEmail ? [{ email: args.attendeeEmail }] : undefined,
        },
      }),
    { retries: 2, baseMs: 600 },
  );
  return res.data.id ?? null;
}

/**
 * Cancel a Google Calendar event.
 * Accepts either (clinic, professional, eventId) or (clinicId, eventId).
 */
export async function cancelGoogleEvent(
  clinicOrId: Clinic | string,
  professionalOrEventId: Professional | string,
  eventId?: string,
): Promise<void> {
  let clinic: Clinic;
  let calendarId: string;
  let resolvedEventId: string;

  if (typeof clinicOrId === 'string') {
    // New signature: (clinicId, eventId)
    clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinicOrId } });
    calendarId = clinic.googleCalendarId || 'primary';
    resolvedEventId = professionalOrEventId as string;
  } else {
    // Old signature: (clinic, professional, eventId)
    clinic = clinicOrId;
    const professional = professionalOrEventId as Professional;
    calendarId = professional.calendarId || clinic.googleCalendarId || 'primary';
    resolvedEventId = eventId!;
  }

  if (!clinic.googleRefreshToken) return;
  const cal = getCalendarFor(clinic);
  await retry(
    () => cal.events.delete({ calendarId, eventId: resolvedEventId }),
    { retries: 2, baseMs: 600 },
  );
}

/**
 * Sync an appointment to Google Calendar by appointmentId.
 * Called from agent.ts after confirming/rescheduling.
 */
export async function syncAppointmentToGoogle(
  clinicId: string,
  appointmentId: string,
): Promise<void> {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      clinic: true,
      professional: true,
      client: true,
      service: true,
    },
  });
  if (!appt || !appt.clinic.googleRefreshToken) return;

  const duration = appt.service?.durationMinutes ?? 30;
  const summary = `${appt.patientName} — ${appt.service?.name ?? 'Consulta'}`;
  const description = appt.client?.email
    ? `Paciente: ${appt.patientName}\nTelefone: ${appt.patientPhone}`
    : undefined;

  // If already has an event, delete it first
  if (appt.googleEventId && appt.professional) {
    await cancelGoogleEvent(appt.clinic, appt.professional, appt.googleEventId).catch(() => {});
  }

  if (!appt.professional) return;

  const eventId = await createGoogleEvent(appt.clinic, appt.professional, {
    summary,
    description,
    dateTime: appt.scheduledAt,
    duration,
    attendeeEmail: appt.client?.email ?? undefined,
  });

  if (eventId) {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { googleEventId: eventId },
    });
  }
}

export async function updateGoogleEvent(
  clinic: Clinic,
  professional: Professional,
  eventId: string,
  args: { dateTime: Date; duration: number; summary?: string },
): Promise<void> {
  if (!clinic.googleRefreshToken) return;
  const cal = getCalendarFor(clinic);
  const calendarId = professional.calendarId || clinic.googleCalendarId || 'primary';
  const end = dayjs(args.dateTime).add(args.duration, 'minute').toDate();
  await retry(
    () =>
      cal.events.patch({
        calendarId,
        eventId,
        requestBody: {
          summary: args.summary,
          start: { dateTime: args.dateTime.toISOString(), timeZone: clinic.timezone },
          end: { dateTime: end.toISOString(), timeZone: clinic.timezone },
        },
      }),
    { retries: 2, baseMs: 600 },
  );
}
