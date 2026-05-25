'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatDateTime, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import { Search, Download, XCircle, Plus, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Appointment = {
  id: string;
  dateTime: string;
  status: string;
  source: string;
  duration: number;
  notes: string | null;
  client: { name: string | null; phone: string; isVip: boolean };
  service: { name: string; color: string } | null;
  professional: { name: string };
};

type Professional = { id: string; name: string };
type Service = { id: string; name: string; durationMinutes: number; active: boolean };

const EMPTY_FORM = {
  professionalId: '',
  serviceId: '',
  clientPhone: '',
  clientName: '',
  date: '',
  time: '',
  duration: 30,
  notes: '',
};

function NewAppointmentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: prosData } = useQuery({
    queryKey: ['professionals'],
    queryFn: api.getProfessionals,
  });
  const { data: svcData } = useQuery({
    queryKey: ['services'],
    queryFn: api.getServices,
  });

  const professionals: Professional[] =
    (prosData as { professionals: Professional[] } | undefined)?.professionals ?? [];
  const services: Service[] = (
    (svcData as { services: Service[] } | undefined)?.services ?? []
  ).filter((s) => s.active);

  const createMut = useMutation({
    mutationFn: () => {
      const dateTime = `${form.date}T${form.time}:00`;
      return api.createAppointment({
        professionalId: form.professionalId,
        serviceId: form.serviceId || undefined,
        clientPhone: form.clientPhone,
        clientName: form.clientName || undefined,
        dateTime,
        duration: form.duration,
        notes: form.notes || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: 'Agendamento criado!' });
      onSaved();
      onClose();
    },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const handleServiceChange = (serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    setForm((f) => ({ ...f, serviceId, duration: svc ? svc.durationMinutes : f.duration }));
  };

  const valid =
    form.professionalId && form.clientPhone.length >= 8 && form.date && form.time;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-white">Novo Agendamento</h2>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="card-body space-y-4">
          <label className="space-y-1.5 block">
            <span className="text-xs text-muted font-medium">Profissional *</span>
            <select
              className="input"
              value={form.professionalId}
              onChange={(e) => setForm((f) => ({ ...f, professionalId: e.target.value }))}
            >
              <option value="">Selecione...</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 block">
            <span className="text-xs text-muted font-medium">Serviço</span>
            <select
              className="input"
              value={form.serviceId}
              onChange={(e) => handleServiceChange(e.target.value)}
            >
              <option value="">Sem serviço específico</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5 block">
              <span className="text-xs text-muted font-medium">Data *</span>
              <input
                type="date"
                className="input"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </label>
            <label className="space-y-1.5 block">
              <span className="text-xs text-muted font-medium">Hora *</span>
              <input
                type="time"
                className="input"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              />
            </label>
          </div>

          <label className="space-y-1.5 block">
            <span className="text-xs text-muted font-medium">Duração (minutos)</span>
            <input
              type="number"
              min={5}
              max={480}
              className="input"
              value={form.duration}
              onChange={(e) => setForm((f) => ({ ...f, duration: Number(e.target.value) }))}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1.5 block">
              <span className="text-xs text-muted font-medium">Telefone *</span>
              <input
                type="tel"
                className="input"
                placeholder="+5511999999999"
                value={form.clientPhone}
                onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
              />
            </label>
            <label className="space-y-1.5 block">
              <span className="text-xs text-muted font-medium">Nome do paciente</span>
              <input
                type="text"
                className="input"
                placeholder="Opcional"
                value={form.clientName}
                onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
              />
            </label>
          </div>

          <label className="space-y-1.5 block">
            <span className="text-xs text-muted font-medium">Observações</span>
            <textarea
              className="input h-20 resize-none"
              placeholder="Opcional..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => createMut.mutate()}
              disabled={!valid || createMut.isPending}
              className="btn-primary flex-1"
            >
              {createMut.isPending ? 'Salvando...' : 'Criar Agendamento'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AppointmentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showNew, setShowNew] = useState(false);

  const params: Record<string, string> = { page: String(page), limit: '20' };
  if (search) params.search = search;
  if (status) params.status = status;

  const { data, isLoading } = useQuery({
    queryKey: ['appointments', params],
    queryFn: () => api.getAppointments(params),
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.cancelAppointment(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments'] });
      toast({ title: 'Agendamento cancelado', variant: 'default' });
    },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const appts = (data as { appointments: Appointment[]; total: number } | undefined);
  const total = appts?.total ?? 0;
  const pageCount = Math.ceil(total / 20);

  return (
    <div className="space-y-5">
      {showNew && (
        <NewAppointmentModal
          onClose={() => setShowNew(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['appointments'] })}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Agendamentos</h1>
          <p className="text-sm text-muted mt-0.5">{total} no total</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNew(true)} className="btn-primary text-sm gap-1.5">
            <Plus className="h-4 w-4" />
            Novo Agendamento
          </button>
          <a
            href={`${api.exportAppointments()}`}
            download
            className="btn-ghost text-xs gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </a>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            className="input pl-9"
            placeholder="Buscar por paciente ou telefone..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="input w-40"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Data/Hora', 'Paciente', 'Serviço', 'Profissional', 'Status', 'Origem', 'Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
              )}
              {!isLoading && !appts?.appointments.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Nenhum agendamento encontrado.</td></tr>
              )}
              {appts?.appointments.map((appt) => (
                <tr key={appt.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3 text-white whitespace-nowrap">{formatDateTime(appt.dateTime)}</td>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">
                      {appt.client.name ?? appt.client.phone}
                      {appt.client.isVip && <span className="ml-1.5 badge-primary text-[10px]">VIP</span>}
                    </p>
                    <p className="text-xs text-muted">{appt.client.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5">
                      {appt.service?.color && (
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: appt.service.color }} />
                      )}
                      <span className="text-white">{appt.service?.name ?? 'Consulta'}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{appt.professional.name}</td>
                  <td className="px-4 py-3">
                    <span className={STATUS_COLORS[appt.status] ?? 'badge-muted'}>
                      {STATUS_LABELS[appt.status] ?? appt.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${appt.source === 'AGENT' ? 'badge-primary' : 'badge-muted'} text-[10px]`}>
                      {appt.source === 'AGENT' ? 'WhatsApp' : appt.source === 'MANUAL' ? 'Manual' : 'API'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {['PENDING', 'CONFIRMED'].includes(appt.status) && (
                      <button
                        onClick={() => cancelMut.mutate({ id: appt.id })}
                        disabled={cancelMut.isPending}
                        className="btn-danger text-xs py-1.5 px-2.5"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancelar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pageCount > 1 && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-muted">
              Página {page} de {pageCount} · {total} resultados
            </p>
            <div className="flex gap-2">
              <button className="btn-ghost text-xs py-1.5 px-3" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Anterior
              </button>
              <button className="btn-ghost text-xs py-1.5 px-3" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page === pageCount}>
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
