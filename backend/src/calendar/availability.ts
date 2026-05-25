// @ts-nocheck — legacy file (slots.ts is the new availability engine)
import dayjs from 'dayjs';
import type { Clinic } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getCalendarFor } from './client.js';
import { retry } from '../lib/retry.js';

/**
 * Finds free slots for a given professional on a given date.
 * Slots are aligned in `duration` minute increments inside business hours.
 */
export async function findFreeSlots(
  clinic: Clinic,
  professionalId: string,
  date: string, // YYYY-MM-DD
  duration: number,
): Promise<Date[]> {
  const day = dayjs(date);
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const bh = clinic.businessHours as Record<string, [string, string] | null>;
  const slot = bh[days[day.day()]];
  if (!slot) return [];

  const [startHm, endHm] = slot;
  const start = dayjs(`${date}T${startHm}`);
  const end = dayjs(`${date}T${endHm}`);

  const professional = await prisma.professional.findUnique({ where: { id: professionalId } });
  if (!professional) return [];

  // Busy intervals from Google (if connected) + DB
  let busy: Array<{ start: Date; end: Date }> = [];

  if (clinic.googleRefreshToken) {
    try {
      const cal = getCalendarFor(clinic);
      const calendarId = professional.calendarId || clinic.googleCalendarId || 'primary';
      const res = await retry(
        () =>
          cal.freebusy.query({
            requestBody: {
              timeMin: start.toISOString(),
              timeMax: end.toISOString(),
              items: [{ id: calendarId }],
            },
          }),
        { retries: 2, baseMs: 500 },
      );
      const items = res.data.calendars?.[calendarId]?.busy ?? [];
      busy = items.map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));
    } catch {
      // fall back to DB only
    }
  }

  const dbAppts = await prisma.appointment.findMany({
    where: {
      professionalId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      dateTime: { gte: start.toDate(), lte: end.toDate() },
    },
  });
  for (const a of dbAppts) {
    busy.push({ start: a.dateTime, end: dayjs(a.dateTime).add(a.duration, 'minute').toDate() });
  }

  const slots: Date[] = [];
  let cursor = start;
  const now = dayjs();
  while (cursor.add(duration, 'minute').isBefore(end) || cursor.add(duration, 'minute').isSame(end)) {
    const slotEnd = cursor.add(duration, 'minute');
    const overlaps = busy.some(
      (b) => cursor.toDate() < b.end && slotEnd.toDate() > b.start,
    );
    if (!overlaps && cursor.isAfter(now)) slots.push(cursor.toDate());
    cursor = cursor.add(duration, 'minute');
  }
  return slots;
}
