import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/services/api';

type Tab = 'clinic' | 'professionals' | 'integrations';

const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

export default function Settings() {
  const [tab, setTab] = useState<Tab>('clinic');
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Configurações</h1>
      <div className="flex gap-2 border-b border-slate-200">
        {(['clinic', 'professionals', 'integrations'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm ${
              tab === t ? 'border-b-2 border-brand-600 text-brand-700' : 'text-slate-600'
            }`}
          >
            {t === 'clinic' ? 'Clínica' : t === 'professionals' ? 'Profissionais' : 'Integrações'}
          </button>
        ))}
      </div>
      {tab === 'clinic' && <ClinicSettings />}
      {tab === 'professionals' && <ProfessionalsSettings />}
      {tab === 'integrations' && <IntegrationsSettings />}
    </div>
  );
}

function ClinicSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['clinic'],
    queryFn: async () => (await api.get('/clinic')).data,
  });
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (data?.clinic) setForm(data.clinic);
  }, [data]);

  const save = useMutation({
    mutationFn: async (payload: any) => (await api.put('/clinic', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic'] }),
  });

  if (isLoading || !form.id) return <div>Carregando...</div>;

  const updateBh = (day: string, idx: 0 | 1, value: string) => {
    const bh = { ...(form.businessHours ?? {}) };
    const cur = bh[day] ?? ['08:00', '18:00'];
    cur[idx] = value;
    bh[day] = cur;
    setForm({ ...form, businessHours: bh });
  };
  const toggleBh = (day: string) => {
    const bh = { ...(form.businessHours ?? {}) };
    bh[day] = bh[day] ? null : ['08:00', '18:00'];
    setForm({ ...form, businessHours: bh });
  };

  return (
    <form
      className="card space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const { id, createdAt, updatedAt, whatsappStatus, googleRefreshToken, ...rest } = form;
        save.mutate(rest);
      }}
    >
      <div>
        <label className="text-xs text-slate-500">Nome</label>
        <input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-500">Telefone</label>
          <input className="input" value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-slate-500">Email</label>
          <input className="input" value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-500">Mensagem de boas-vindas</label>
        <textarea className="input" rows={2} value={form.welcomeMessage ?? ''} onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })} />
      </div>
      <div>
        <label className="text-xs text-slate-500">Mensagem fora do horário</label>
        <textarea className="input" rows={2} value={form.offHoursMessage ?? ''} onChange={(e) => setForm({ ...form, offHoursMessage: e.target.value })} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Horários de funcionamento</h3>
        <div className="space-y-2">
          {DAYS.map((d) => {
            const v = form.businessHours?.[d.key];
            return (
              <div key={d.key} className="flex items-center gap-2">
                <input type="checkbox" checked={!!v} onChange={() => toggleBh(d.key)} />
                <span className="w-24 text-sm">{d.label}</span>
                {v ? (
                  <>
                    <input type="time" className="input w-32" value={v[0]} onChange={(e) => updateBh(d.key, 0, e.target.value)} />
                    <span>às</span>
                    <input type="time" className="input w-32" value={v[1]} onChange={(e) => updateBh(d.key, 1, e.target.value)} />
                  </>
                ) : (
                  <span className="text-sm text-slate-400">fechado</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button className="btn-primary" disabled={save.isPending}>
        Salvar
      </button>
    </form>
  );
}

function ProfessionalsSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['pros'],
    queryFn: async () => (await api.get('/professionals')).data,
  });
  const [form, setForm] = useState<any>({ name: '', specialty: '', whatsappNumber: '', defaultDuration: 30 });

  const create = useMutation({
    mutationFn: async (payload: any) => (await api.post('/professionals', payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pros'] });
      setForm({ name: '', specialty: '', whatsappNumber: '', defaultDuration: 30 });
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/professionals/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pros'] }),
  });

  return (
    <div className="space-y-4">
      <form
        className="card grid grid-cols-1 gap-3 p-6 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ ...form, defaultDuration: Number(form.defaultDuration) });
        }}
      >
        <input className="input" placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="input" placeholder="Especialidade" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
        <input className="input" placeholder="WhatsApp (com DDD)" value={form.whatsappNumber} onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })} />
        <div className="flex gap-2">
          <input className="input" type="number" placeholder="min" value={form.defaultDuration} onChange={(e) => setForm({ ...form, defaultDuration: e.target.value })} />
          <button className="btn-primary">Adicionar</button>
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Especialidade</th>
              <th className="px-4 py-2">WhatsApp</th>
              <th className="px-4 py-2">Duração</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(data?.professionals ?? []).map((p: any) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{p.name}</td>
                <td className="px-4 py-2">{p.specialty}</td>
                <td className="px-4 py-2">{p.whatsappNumber}</td>
                <td className="px-4 py-2">{p.defaultDuration}min</td>
                <td className="px-4 py-2">{p.active ? 'Ativo' : 'Inativo'}</td>
                <td className="px-4 py-2">
                  {p.active && (
                    <button className="text-red-600 hover:underline" onClick={() => remove.mutate(p.id)}>
                      Remover
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IntegrationsSettings() {
  const qc = useQueryClient();
  const { data: clinic } = useQuery({
    queryKey: ['clinic'],
    queryFn: async () => (await api.get('/clinic')).data,
  });

  const connect = async () => {
    const { data } = await api.get('/google/auth-url');
    window.location.href = data.url;
  };

  const disconnect = useMutation({
    mutationFn: async () => (await api.post('/google/disconnect')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clinic'] }),
  });

  const connected = !!clinic?.clinic?.googleRefreshToken;

  return (
    <div className="card space-y-4 p-6">
      <h3 className="font-semibold">Google Calendar</h3>
      <p className="text-sm text-slate-600">
        Conecte uma conta Google para que os agendamentos sejam criados automaticamente na agenda da clínica.
      </p>
      {connected ? (
        <div className="flex items-center gap-3">
          <span className="badge bg-green-100 text-green-800">Conectado</span>
          <button className="btn-danger" onClick={() => disconnect.mutate()}>
            Desconectar
          </button>
        </div>
      ) : (
        <button className="btn-primary" onClick={connect}>
          Conectar Google
        </button>
      )}
    </div>
  );
}
