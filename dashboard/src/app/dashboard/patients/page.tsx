'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState } from 'react';
import { Search, Download, Star } from 'lucide-react';
import { formatPhone } from '@/lib/utils';

type Client = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  cpf: string | null;
  insurance: string | null;
  isVip: boolean;
  createdAt: string;
  _count: { appointments: number };
};

export default function PatientsPage() {
  const [search, setSearch] = useState('');
  const [vipOnly, setVipOnly] = useState(false);
  const [page, setPage] = useState(1);

  const params: Record<string, string> = { page: String(page), limit: '25' };
  if (search) params.search = search;
  if (vipOnly) params.vipOnly = '1';

  const { data, isLoading } = useQuery({
    queryKey: ['patients', params],
    queryFn: () => api.getPatients(params),
  });

  const patients = data as { clients: Client[]; total: number } | undefined;
  const total = patients?.total ?? 0;
  const pageCount = Math.ceil(total / 25);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Pacientes</h1>
          <p className="text-sm text-muted mt-0.5">{total} cadastrados</p>
        </div>
        <a href={`${api.exportPatients()}`} download className="btn-ghost text-xs gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </a>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            className="input pl-9"
            placeholder="Nome, telefone ou email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={vipOnly}
            onChange={(e) => { setVipOnly(e.target.checked); setPage(1); }}
            className="rounded border-border"
          />
          Apenas VIP
        </label>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Paciente', 'Telefone', 'Email', 'Convênio', 'Consultas', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
              )}
              {patients?.clients.map((c) => (
                <tr key={c.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {c.isVip && <Star className="h-3.5 w-3.5 text-warning fill-warning" />}
                      <div>
                        <p className="text-white font-medium">{c.name ?? '—'}</p>
                        {c.cpf && <p className="text-xs text-muted">CPF: {c.cpf}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{formatPhone(c.phone)}</td>
                  <td className="px-4 py-3 text-muted">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{c.insurance ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="badge-muted">{c._count?.appointments ?? 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    <a href={`/dashboard/patients/${c.id}`} className="text-xs text-primary hover:underline">
                      Ver
                    </a>
                  </td>
                </tr>
              ))}
              {!isLoading && !patients?.clients.length && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nenhum paciente encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <div className="border-t border-border px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-muted">Página {page} de {pageCount}</p>
            <div className="flex gap-2">
              <button className="btn-ghost text-xs py-1.5 px-3" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Anterior</button>
              <button className="btn-ghost text-xs py-1.5 px-3" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page === pageCount}>Próxima</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
