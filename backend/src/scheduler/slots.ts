// Motor de slots disponíveis: combina WorkingHours + ScheduleExceptions + Google Calendar.

import { addMinutes, format } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';
import { prisma } from '../lib/prisma.js';

export type Slot = { start: Date; end: Date; label: string };
type BusyInterval = { start: Date; end: Date };

/** Retorna slots disponíveis para uma clínica em uma data (string YYYY-MM-DD). */
export async function getAvailableSlots(
  clinicId: string,
  dateStr: string,
  options?: { clientId?: string; isVip?: boolean; excludeAppointmentId?: string },
): Promise<Slot[]> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { timezone: true },
  });
  const tz = clinic?.timezone ?? 'America/Sao_Paulo';

  const [year, month, day] = dateStr.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();

  // Resolve VIP status
  let isVip = options?.isVip ?? false;
  if (!isVip && options?.clientId) {
    const c = await prisma.client.findUnique({ where: { id: options.clientId }, select: { isVip: true } });
    isVip = c?.isVip ?? false;
  }

  // Working hours para este dia
  const hours = await prisma.workingHours.findMany({
    where: { clinicId, weekday, active: true },
  });
  if (!hours.length) return [];

  // Exceções para esta data
  const exceptions = await prisma.scheduleException.findMany({
    where: { clinicId, date: dateStr },
  });

  // Verifica se o dia inteiro está bloqueado
  const allDayClosed = exceptions.some((e) => e.allDay && !e.vipOnly);
  if (allDayClosed) return [];

  const vipOnlyDay = exceptions.some((e) => e.allDay && e.vipOnly);
  if (vipOnlyDay && !isVip) return [];

  // Agendamentos existentes neste dia
  const dayStart = fromZonedTime(new Date(`${dateStr}T00:00:00`), tz);
  const dayEnd = fromZonedTime(new Date(`${dateStr}T23:59:59`), tz);

  const existingAppts = await prisma.appointment.findMany({
    where: {
      clinicId,
      status: { in: ['PENDING', 'CONFIRMED'] },
      dateTime: { gte: dayStart, lte: dayEnd },
      id: options?.excludeAppointmentId ? { not: options.excludeAppointmentId } : undefined,
    },
    select: { dateTime: true, endsAt: true, duration: true },
  });

  const busyIntervals: BusyInterval[] = existingAppts.map((a) => ({
    start: a.dateTime,
    end: a.endsAt ?? addMinutes(a.dateTime, a.duration),
  }));

  // Gera todos os slots possíveis
  const slots: Slot[] = [];
  const now = new Date();

  for (const wh of hours) {
    const interval = wh.slotIntervalMinutes;

    const [startH, startM] = wh.startTime.split(':').map(Number);
    const [endH, endM] = wh.endTime.split(':').map(Number);
    const breakStart = wh.breakStartTime ? wh.breakStartTime.split(':').map(Number) : null;
    const breakEnd = wh.breakEndTime ? wh.breakEndTime.split(':').map(Number) : null;

    let current = fromZonedTime(new Date(`${dateStr}T${pad(startH)}:${pad(startM)}:00`), tz);
    const end = fromZonedTime(new Date(`${dateStr}T${pad(endH)}:${pad(endM)}:00`), tz);

    while (current < end) {
      const slotEnd = addMinutes(current, interval);

      // Já passou
      if (current <= now) {
        current = slotEnd;
        continue;
      }

      // Dentro do intervalo
      if (breakStart && breakEnd) {
        const bStart = fromZonedTime(new Date(`${dateStr}T${pad(breakStart[0])}:${pad(breakStart[1])}:00`), tz);
        const bEnd = fromZonedTime(new Date(`${dateStr}T${pad(breakEnd[0])}:${pad(breakEnd[1])}:00`), tz);
        if (current >= bStart && current < bEnd) {
          current = slotEnd;
          continue;
        }
      }

      // Conflita com agendamento existente
      const busy = busyIntervals.some((b) => current < b.end && slotEnd > b.start);
      if (!busy) {
        const localTime = toZonedTime(current, tz);
        slots.push({
          start: current,
          end: slotEnd,
          label: format(localTime, 'HH:mm', { locale: ptBR }),
        });
      }

      current = slotEnd;
    }
  }

  return slots;
}

/** Retorna os slots como texto formatado para o prompt. */
export async function getAvailableSlotsText(clinicId: string, dateStr: string): Promise<string | null> {
  const slots = await getAvailableSlots(clinicId, dateStr);
  if (!slots.length) return null;
  return slots.map((s) => s.label).join(', ');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
