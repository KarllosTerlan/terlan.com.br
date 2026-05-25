'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Plus, Pencil, Trash2, Save, X, Wrench } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number | null;
  color: string;
  active: boolean;
};

type ServiceForm = Omit<Service, 'id' | 'active'> & { active: boolean };

const PRESET_COLORS = ['#00d4ff', '#9e3d22', '#4ade80', '#fbbf24', '#a78bfa', '#f472b6', '#38bdf8', '#fb923c'];

const empty: ServiceForm = { name: '', description: '', durationMinutes: 30, price: null, color: '#9e3d22', active: true };

export default function ServicesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editId, setEditId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ServiceForm>(empty);

  const { data } = useQuery({ queryKey: ['services'], queryFn: api.getServices });
  const services = (data as { services: Service[] } | undefined)?.services ?? [];

  const createMut = useMutation({
    mutationFn: (d: ServiceForm) => api.createService(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); setCreating(false); setForm(empty); toast({ title: 'Serviço criado!' }); },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ServiceForm }) => api.updateService(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); setEditId(null); toast({ title: 'Serviço atualizado!' }); },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteService(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['services'] }); toast({ title: 'Serviço desativado' }); },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const startEdit = (s: Service) => {
    setEditId(s.id);
    setForm({ name: s.name, description: s.description ?? '', durationMinutes: s.durationMinutes, price: s.price, color: s.color, active: s.active });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            Serviços
          </h1>
          <p className="text-sm text-muted mt-1">Procedimentos e consultas oferecidos pela clínica</p>
        </div>
        <button onClick={() => { setCreating(true); setForm(empty); setEditId(null); }} className="btn-primary text-sm gap-1.5">
          <Plus className="h-4 w-4" />
          Novo Serviço
        </button>
      </div>

      {/* Create Form */}
      {creating && (
        <ServiceFormCard
          form={form}
          onChange={setForm}
          onSave={() => createMut.mutate(form)}
          onCancel={() => setCreating(false)}
          saving={createMut.isPending}
          title="Novo Serviço"
        />
      )}

      {/* List */}
      <div className="space-y-3">
        {services.length === 0 && !creating && (
          <div className="card p-8 text-center">
            <Wrench className="h-10 w-10 text-primary/20 mx-auto mb-3" />
            <p className="text-muted text-sm">Nenhum serviço cadastrado ainda.</p>
            <button onClick={() => setCreating(true)} className="btn-primary mt-4 text-sm">
              Criar primeiro serviço
            </button>
          </div>
        )}
        {services.map((s) =>
          editId === s.id ? (
            <ServiceFormCard
              key={s.id}
              form={form}
              onChange={setForm}
              onSave={() => updateMut.mutate({ id: s.id, data: form })}
              onCancel={() => setEditId(null)}
              saving={updateMut.isPending}
              title="Editar Serviço"
            />
          ) : (
            <div key={s.id} className={`card p-4 flex items-center justify-between gap-4 ${!s.active ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl flex-shrink-0" style={{ background: `${s.color}20`, border: `1px solid ${s.color}40` }}>
                  <div className="h-full w-full flex items-center justify-center">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  </div>
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{s.name}</p>
                  <p className="text-xs text-muted">{s.durationMinutes} min{s.price ? ` · R$ ${s.price.toFixed(2)}` : ''}</p>
                  {s.description && <p className="text-xs text-muted mt-0.5">{s.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!s.active && <span className="badge-muted text-[10px]">Inativo</span>}
                <button onClick={() => startEdit(s)} className="btn-ghost py-1.5 px-2.5 text-xs gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                <button onClick={() => deleteMut.mutate(s.id)} className="btn-danger py-1.5 px-2.5 text-xs">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function ServiceFormCard({ form, onChange, onSave, onCancel, saving, title }: {
  form: ServiceForm;
  onChange: (f: ServiceForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
}) {
  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <h2 className="font-semibold text-white text-sm">{title}</h2>
        <button onClick={onCancel} className="text-muted hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="card-body space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-muted font-medium">Nome *</span>
            <input
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              className="input"
              placeholder="Ex: Consulta Inicial"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted font-medium">Duração (minutos)</span>
            <input
              type="number"
              value={form.durationMinutes}
              onChange={(e) => onChange({ ...form, durationMinutes: Number(e.target.value) })}
              className="input"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted font-medium">Preço (R$)</span>
            <input
              type="number"
              step="0.01"
              value={form.price ?? ''}
              onChange={(e) => onChange({ ...form, price: e.target.value ? Number(e.target.value) : null })}
              className="input"
              placeholder="Opcional"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted font-medium">Cor</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={form.color}
                onChange={(e) => onChange({ ...form, color: e.target.value })}
                className="h-10 w-10 rounded-lg border border-border cursor-pointer bg-transparent"
              />
              <div className="flex gap-1 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onChange({ ...form, color: c })}
                    className="h-6 w-6 rounded-full border-2 transition-all"
                    style={{ background: c, borderColor: form.color === c ? 'white' : 'transparent' }}
                  />
                ))}
              </div>
            </div>
          </label>
        </div>
        <label className="space-y-1">
          <span className="text-xs text-muted font-medium">Descrição</span>
          <input
            value={form.description ?? ''}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            className="input"
            placeholder="Descrição opcional para o agente usar"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel} className="btn-ghost text-sm">Cancelar</button>
          <button onClick={onSave} disabled={saving || !form.name} className="btn-primary text-sm gap-1.5">
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
