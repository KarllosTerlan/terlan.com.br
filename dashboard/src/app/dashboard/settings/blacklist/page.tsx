'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Shield, Plus, Trash2, Search } from 'lucide-react';
import { formatPhone, formatDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type BlacklistEntry = {
  id: string;
  phone: string;
  reason: string | null;
  blockedAt: string;
};

export default function BlacklistPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');

  const { data } = useQuery({ queryKey: ['blacklist'], queryFn: api.getBlacklist });
  const list = (data as { blacklist: BlacklistEntry[] } | undefined)?.blacklist ?? [];
  const filtered = list.filter((e) => !search || e.phone.includes(search));

  const addMut = useMutation({
    mutationFn: () => api.addToBlacklist(phone, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['blacklist'] });
      setPhone('');
      setReason('');
      toast({ title: 'Número bloqueado!' });
    },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const removeMut = useMutation({
    mutationFn: (p: string) => api.removeFromBlacklist(p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['blacklist'] }); toast({ title: 'Número desbloqueado' }); },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Blacklist
        </h1>
        <p className="text-sm text-muted mt-1">Números bloqueados de interagir com o agente</p>
      </div>

      {/* Add Form */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-white text-sm">Bloquear Número</h2>
        </div>
        <div className="card-body flex flex-col sm:flex-row gap-3">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input"
            placeholder="+5511999999999"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input"
            placeholder="Motivo (opcional)"
          />
          <button
            onClick={() => addMut.mutate()}
            disabled={!phone || addMut.isPending}
            className="btn-primary text-sm gap-1.5 flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            Bloquear
          </button>
        </div>
      </div>

      {/* Search + List */}
      <div className="card overflow-hidden">
        <div className="card-header border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
              placeholder="Buscar número..."
            />
          </div>
        </div>
        <div className="divide-y divide-border">
          {filtered.length === 0 && (
            <p className="px-5 py-8 text-center text-muted text-sm">
              {list.length === 0 ? 'Nenhum número bloqueado.' : 'Nenhum resultado.'}
            </p>
          )}
          {filtered.map((e) => (
            <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-white font-mono text-sm">{formatPhone(e.phone)}</p>
                <p className="text-xs text-muted">
                  {e.reason ?? 'Sem motivo'} · Bloqueado em {formatDateTime(e.blockedAt)}
                </p>
              </div>
              <button
                onClick={() => removeMut.mutate(e.phone)}
                disabled={removeMut.isPending}
                className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5 text-danger hover:bg-danger/10 hover:border-danger/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remover
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
