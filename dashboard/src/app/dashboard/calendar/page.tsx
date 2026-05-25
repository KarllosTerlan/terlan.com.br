'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, STATUS_COLORS, STATUS_LABELS } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Appointment = {
  id: string;
  scheduledAt: string;
  status: string;
  patientName: string;
  serviceName?: string;
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selected, setSelected] = useState<Date | null>(new Date());

  const { data: raw } = useQuery({
    queryKey: ['appointments', format(currentMonth, 'yyyy-MM')],
    queryFn: () =>
      api.getAppointments({
        date: format(startOfMonth(currentMonth), 'yyyy-MM-dd'),
        limit: 300,
      }),
  });

  const appointments: Appointment[] = (raw as { appointments?: Appointment[] })?.appointments ?? [];

  const calStart = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
  const calEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const getForDay = (day: Date) =>
    appointments.filter((a) => isSameDay(new Date(a.scheduledAt), day));

  const selectedAppts = selected ? getForDay(selected) : [];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold text-white">Calendário</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Calendar grid */}
        <div className="lg:col-span-2 card">
          <div className="card-header flex items-center justify-between">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="btn-ghost p-1.5"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="font-semibold text-white capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </h2>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="btn-ghost p-1.5"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="card-body">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-2">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-center text-[11px] font-medium text-muted py-1">
                  {d}
                </div>
              ))}
            </div>
            {/* Days */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const dayAppts = getForDay(day);
                const isSelected = selected && isSameDay(day, selected);
                const inMonth = isSameMonth(day, currentMonth);
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelected(day)}
                    className={cn(
                      'rounded-xl p-1.5 min-h-[56px] flex flex-col gap-0.5 transition-colors text-left',
                      inMonth ? 'hover:bg-white/5' : 'opacity-30',
                      isSelected && 'bg-primary/10 ring-1 ring-primary/40',
                      isToday(day) && !isSelected && 'ring-1 ring-primary/20',
                    )}
                  >
                    <span
                      className={cn(
                        'text-xs font-medium ml-0.5',
                        isToday(day) ? 'text-primary' : inMonth ? 'text-white' : 'text-muted',
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    <div className="flex flex-wrap gap-0.5">
                      {dayAppts.slice(0, 3).map((a) => (
                        <div
                          key={a.id}
                          className="h-1.5 w-1.5 rounded-full bg-primary opacity-80"
                          title={a.patientName}
                        />
                      ))}
                      {dayAppts.length > 3 && (
                        <span className="text-[9px] text-muted">+{dayAppts.length - 3}</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Day detail */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-white text-sm">
              {selected
                ? format(selected, "d 'de' MMMM", { locale: ptBR })
                : 'Selecione um dia'}
            </h2>
          </div>
          <div className="card-body">
            {selectedAppts.length === 0 ? (
              <p className="text-muted text-sm text-center py-6">Nenhum agendamento</p>
            ) : (
              <div className="space-y-2.5">
                {selectedAppts
                  .sort(
                    (a, b) =>
                      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
                  )
                  .map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-border bg-white/3 p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">
                          {format(new Date(a.scheduledAt), 'HH:mm')}
                        </span>
                        <span className={cn('badge text-[10px]', STATUS_COLORS[a.status])}>
                          {STATUS_LABELS[a.status] ?? a.status}
                        </span>
                      </div>
                      <p className="text-sm text-white">{a.patientName}</p>
                      {a.serviceName && (
                        <p className="text-xs text-muted">{a.serviceName}</p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
