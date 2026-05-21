import dayjs from 'dayjs';
import type { Clinic, Professional } from '@prisma/client';
import { getCalendarFor } from './client.js';
import { retry } from '../lib/retry.js';

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

export async function cancelGoogleEvent(
  clinic: Clinic,
  professional: Professional,
  eventId: string,
): Promise<void> {
  if (!clinic.googleRefreshToken) return;
  const cal = getCalendarFor(clinic);
  const calendarId = professional.calendarId || clinic.googleCalendarId || 'primary';
  await retry(() => cal.events.delete({ calendarId, eventId }), { retries: 2, baseMs: 600 });
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
