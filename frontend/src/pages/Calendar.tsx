import { useQuery } from '@tanstack/react-query';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import dayjs from 'dayjs';
import api from '@/services/api';

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2'];

export default function CalendarPage() {
  const list = useQuery({
    queryKey: ['cal-appointments'],
    queryFn: async () =>
      (
        await api.get('/appointments', {
          params: {
            from: dayjs().subtract(30, 'day').toISOString(),
            to: dayjs().add(90, 'day').toISOString(),
          },
        })
      ).data,
  });

  const proColors = new Map<string, string>();
  const events = (list.data?.appointments ?? []).map((a: any) => {
    if (!proColors.has(a.professionalId)) {
      proColors.set(a.professionalId, COLORS[proColors.size % COLORS.length]);
    }
    return {
      id: a.id,
      title: `${a.professional.name} — ${a.client.name ?? a.client.phone}`,
      start: a.dateTime,
      end: dayjs(a.dateTime).add(a.duration, 'minute').toISOString(),
      backgroundColor: a.status === 'CANCELLED' ? '#94a3b8' : proColors.get(a.professionalId),
      borderColor: 'transparent',
    };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Calendário</h1>
      <div className="card p-4">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          locale="pt-br"
          buttonText={{ today: 'hoje', month: 'mês', week: 'semana', day: 'dia' }}
          height="auto"
          events={events}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
        />
      </div>
    </div>
  );
}
