import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '@/services/api';

export default function Dashboard() {
  const summary = useQuery({
    queryKey: ['summary'],
    queryFn: async () => (await api.get('/dashboard/summary')).data,
  });
  const upcoming = useQuery({
    queryKey: ['upcoming'],
    queryFn: async () => (await api.get('/dashboard/upcoming')).data,
  });

  if (summary.isLoading) return <div>Carregando...</div>;

  const s = summary.data ?? { todayCount: 0, monthCount: 0, activeClients: 0, confirmationRate: 0, timeline: [] };
  const maxBar = Math.max(1, ...s.timeline.map((t: any) => t.count));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card title="Hoje" value={s.todayCount} hint="agendamentos" />
        <Card title="Mês" value={s.monthCount} hint="agendamentos" />
        <Card title="Clientes ativos" value={s.activeClients} hint="últimos 60 dias" />
        <Card title="Taxa confirmação" value={`${s.confirmationRate}%`} hint="mês atual" />
      </div>

      <div className="card p-4">
        <h2 className="mb-3 font-semibold">Últimos 30 dias</h2>
        <div className="flex h-32 items-end gap-1">
          {s.timeline.map((t: any) => (
            <div
              key={t.date}
              className="flex-1 rounded-t bg-brand-500"
              style={{ height: `${(t.count / maxBar) * 100}%` }}
              title={`${t.date}: ${t.count}`}
            />
          ))}
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 font-semibold">Próximos agendamentos</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2">Quando</th>
              <th>Cliente</th>
              <th>Profissional</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(upcoming.data?.appointments ?? []).map((a: any) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="py-2">{dayjs(a.dateTime).format('DD/MM HH:mm')}</td>
                <td>{a.client.name ?? a.client.phone}</td>
                <td>{a.professional.name}</td>
                <td>
                  <span className="badge bg-slate-100 text-slate-700">{a.status}</span>
                </td>
              </tr>
            ))}
            {(upcoming.data?.appointments ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-slate-500">
                  Nenhum agendamento próximo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ title, value, hint }: { title: string; value: any; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}
