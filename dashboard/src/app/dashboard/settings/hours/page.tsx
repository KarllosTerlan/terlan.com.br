'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Clock, Plus, Trash2, Save } from 'lucide-react';
import { WEEKDAY_LABELS } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type WorkingHour = {
  id?: string;
  weekday: number;
  startTime: string;
  endTime: string;
  breakStartTime: string | null;
  breakEndTime: string | null;
  slotIntervalMinutes: number;
  active: boolean;
};

type ScheduleException = {
  id: string;
  date: string;
  allDay: boolean;
  vipOnly: boolean;
  reason: string | null;
};

function defaultHour(weekday: number): WorkingHour {
  return { weekday, startTime: '08:00', endTime: '18:00', breakStartTime: '12:00', breakEndTime: '13:00', slotIntervalMinutes: 30, active: true };
}

export default function HoursPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [hours, setHours] = useState<WorkingHour[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [newExc, setNewExc] = useState({ date: '', reason: '', vipOnly: false });

  const hoursQuery = useQuery({ queryKey: ['working-hours'], queryFn: api.getWorkingHours });
  const excQuery = useQuery({ queryKey: ['schedule-exceptions'], queryFn: () => api.getScheduleExceptions() });

  if (hoursQuery.data && !initialized) {
    const loaded = (hoursQuery.data as { hours: WorkingHour[] }).hours;
    setHours(loaded.length > 0 ? loaded : [0, 1, 2, 3, 4, 5, 6].map(defaultHour));
    setInitialized(true);
  }

  const saveHoursMut = useMutation({
    mutationFn: () => api.saveWorkingHours(hours),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['working-hours'] }); toast({ title: 'Horários salvos!' }); },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const addExcMut = useMutation({
    mutationFn: () => api.createScheduleException({ date: newExc.date, allDay: true, vipOnly: newExc.vipOnly, reason: newExc.reason || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule-exceptions'] }); setNewExc({ date: '', reason: '', vipOnly: false }); toast({ title: 'Exceção adicionada!' }); },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const delExcMut = useMutation({
    mutationFn: (id: string) => api.deleteScheduleException(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedule-exceptions'] }); toast({ title: 'Exceção removida' }); },
  });

  const updateHour = (idx: number, field: keyof WorkingHour, value: unknown) => {
    setHours((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const exceptions = (excQuery.data as { exceptions: ScheduleException[] } | undefined)?.exceptions ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Horários de Funcionamento
        </h1>
        <p className="text-sm text-muted mt-1">Configure os dias e horários disponíveis para agendamento</p>
      </div>

      {/* Working Hours */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-white text-sm">Horários por Dia</h2>
        </div>
        <div className="card-body space-y-3">
          {hours.map((h, i) => (
            <div key={i} className={`rounded-xl border p-4 transition-colors ${h.active ? 'border-border' : 'border-border/40 opacity-50'}`}>
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={h.active}
                    onChange={(e) => updateHour(i, 'active', e.target.checked)}
                    className="rounded border-border accent-primary"
                  />
                  <span className="text-sm font-semibold text-white w-8">{WEEKDAY_LABELS[h.weekday]}</span>
                </div>
                {h.active && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>Intervalo (min):</span>
                    <select
                      value={h.slotIntervalMinutes}
                      onChange={(e) => updateHour(i, 'slotIntervalMinutes', Number(e.target.value))}
                      className="input w-20 text-xs py-1.5"
                    >
                      {[15, 20, 30, 45, 60, 90].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {h.active && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                  {[
                    { label: 'Início', field: 'startTime' as const },
                    { label: 'Fim', field: 'endTime' as const },
                    { label: 'Início Intervalo', field: 'breakStartTime' as const },
                    { label: 'Fim Intervalo', field: 'breakEndTime' as const },
                  ].map(({ label, field }) => (
                    <label key={field} className="space-y-1">
                      <span className="text-muted font-medium">{label}</span>
                      <input
                        type="time"
                        value={(h[field] as string) ?? ''}
                        onChange={(e) => updateHour(i, field, e.target.value || null)}
                        className="input text-sm py-1.5"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <button onClick={() => saveHoursMut.mutate()} disabled={saveHoursMut.isPending} className="btn-primary text-sm gap-1.5">
              <Save className="h-4 w-4" />
              {saveHoursMut.isPending ? 'Salvando...' : 'Salvar Horários'}
            </button>
          </div>
        </div>
      </div>

      {/* Schedule Exceptions */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-white text-sm">Exceções / Feriados</h2>
          <p className="text-xs text-muted mt-0.5">Dias sem atendimento ou com regras especiais</p>
        </div>
        <div className="card-body space-y-4">
          {/* Add new */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="date"
              value={newExc.date}
              onChange={(e) => setNewExc((p) => ({ ...p, date: e.target.value }))}
              className="input w-40"
            />
            <input
              value={newExc.reason}
              onChange={(e) => setNewExc((p) => ({ ...p, reason: e.target.value }))}
              className="input flex-1"
              placeholder="Motivo (opcional)"
            />
            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={newExc.vipOnly}
                onChange={(e) => setNewExc((p) => ({ ...p, vipOnly: e.target.checked }))}
              />
              Só VIP
            </label>
            <button
              onClick={() => addExcMut.mutate()}
              disabled={!newExc.date || addExcMut.isPending}
              className="btn-primary text-sm gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </div>

          {/* List */}
          <div className="space-y-2">
            {exceptions.length === 0 && <p className="text-xs text-muted text-center py-4">Nenhuma exceção cadastrada.</p>}
            {exceptions.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm text-white font-medium">{new Date(e.date + 'T00:00:00').toLocaleDateString('pt-BR')}</p>
                  <p className="text-xs text-muted">
                    {e.reason ?? 'Sem motivo'}
                    {e.vipOnly && ' · Apenas VIP'}
                  </p>
                </div>
                <button onClick={() => delExcMut.mutate(e.id)} className="btn-danger text-xs p-1.5">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
