import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '@/services/api';

const STATUSES = ['', 'PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED'];

export default function Appointments() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [professionalId, setProfessionalId] = useState('');
  const [from, setFrom] = useState(dayjs().startOf('day').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().add(30, 'day').format('YYYY-MM-DD'));

  const params = useMemo(() => {
    const p: any = {};
    if (status) p.status = status;
    if (professionalId) p.professionalId = professionalId;
    if (from) p.from = `${from}T00:00:00`;
    if (to) p.to = `${to}T23:59:59`;
    return p;
  }, [status, professionalId, from, to]);

  const pros = useQuery({
    queryKey: ['pros'],
    queryFn: async () => (await api.get('/professionals')).data,
  });

  const list = useQuery({
    queryKey: ['appointments', params],
    queryFn: async () => (await api.get('/appointments', { params })).data,
  });

  const cancel = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/appointments/${id}/cancel`, { reason: 'Cancelado via painel' })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['appointments'] }),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Agendamentos</h1>

      <div className="card flex flex-wrap gap-3 p-4">
        <div>
          <label className="text-xs text-slate-500">De</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-500">Até</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-500">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || 'Todos'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500">Profissional</label>
          <select
            className="input"
            value={professionalId}
            onChange={(e) => setProfessionalId(e.target.value)}
          >
            <option value="">Todos</option>
            {(pros.data?.professionals ?? []).map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Data/Hora</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Profissional</th>
              <th className="px-4 py-2">Duração</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.appointments ?? []).map((a: any) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{dayjs(a.dateTime).format('DD/MM/YYYY HH:mm')}</td>
                <td className="px-4 py-2">{a.client.name ?? a.client.phone}</td>
                <td className="px-4 py-2">{a.professional.name}</td>
                <td className="px-4 py-2">{a.duration}min</td>
                <td className="px-4 py-2">
                  <span className="badge bg-slate-100">{a.status}</span>
                </td>
                <td className="px-4 py-2">
                  {a.status !== 'CANCELLED' && (
                    <button
                      className="text-red-600 hover:underline"
                      onClick={() => {
                        if (confirm('Cancelar agendamento?')) cancel.mutate(a.id);
                      }}
                    >
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(list.data?.appointments ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  Nenhum agendamento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
