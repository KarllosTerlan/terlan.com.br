'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState } from 'react';
import { formatDateTime, OUTCOME_LABELS } from '@/lib/utils';
import { MessageSquare, Search, Download, ChevronRight } from 'lucide-react';
import Link from 'next/link';

type Conversation = {
  id: string;
  clientPhone: string;
  outcome: string;
  messageCount: number;
  active: boolean;
  lastMessageAt: string;
  createdAt: string;
  client: { name: string | null } | null;
};

const OUTCOME_COLORS: Record<string, string> = {
  UNKNOWN: 'badge-warning',
  BOOKED: 'badge-primary',
  CANCELLED: 'badge-danger',
  RESCHEDULED: 'badge-primary',
  ABANDONED: 'badge-muted',
  INFO_ONLY: 'badge-muted',
  BLOCKED: 'badge-danger',
};

export default function ConversationsPage() {
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState('');
  const [page, setPage] = useState(1);

  const params: Record<string, string> = { page: String(page), limit: '25' };
  if (search) params.search = search;
  if (outcome) params.outcome = outcome;

  const { data, isLoading } = useQuery({
    queryKey: ['conversations', params],
    queryFn: () => api.getConversations(params),
  });

  const convs = data as { conversations: Conversation[]; total: number } | undefined;
  const total = convs?.total ?? 0;
  const pageCount = Math.ceil(total / 25);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Conversas</h1>
          <p className="text-sm text-muted mt-0.5">{total} registradas</p>
        </div>
        <a href={`${api.exportConversations()}`} download className="btn-ghost text-xs gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </a>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            className="input pl-9"
            placeholder="Telefone ou nome..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input w-44" value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(1); }}>
          <option value="">Todos os resultados</option>
          {Object.entries(OUTCOME_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Contato', 'Resultado', 'Mensagens', 'Última mensagem', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Carregando...</td></tr>
              )}
              {convs?.conversations.map((c) => (
                <tr key={c.id} className="hover:bg-white/3 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${c.active ? 'bg-success' : 'bg-border'}`} />
                      <div>
                        <p className="text-white font-medium">{c.client?.name ?? c.clientPhone}</p>
                        {c.client?.name && <p className="text-xs text-muted">{c.clientPhone}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={OUTCOME_COLORS[c.outcome] ?? 'badge-muted'}>
                      {OUTCOME_LABELS[c.outcome] ?? c.outcome}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.messageCount}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(c.lastMessageAt)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/conversations/${c.id}`} className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      Ver <ChevronRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
              {!isLoading && !convs?.conversations.length && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">Nenhuma conversa encontrada.</td></tr>
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
