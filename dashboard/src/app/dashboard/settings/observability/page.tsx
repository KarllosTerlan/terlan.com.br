'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { FileText, AlertTriangle, Info, CheckCircle, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { formatDateTime } from '@/lib/utils';

type Log = {
  id: string;
  level: 'INFO' | 'WARNING' | 'ERROR';
  scope: string;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const LEVEL_ICONS = {
  INFO: { icon: Info, color: 'text-primary' },
  WARNING: { icon: AlertTriangle, color: 'text-warning' },
  ERROR: { icon: AlertTriangle, color: 'text-danger' },
};

export default function ObservabilityPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [level, setLevel] = useState('');
  const [hours, setHours] = useState('24');
  const [expanded, setExpanded] = useState<string | null>(null);

  const params: Record<string, string> = { hours, limit: '200' };
  if (level) params.level = level;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['logs', params],
    queryFn: () => api.getLogs(params),
    refetchInterval: 30_000,
  });

  const cleanMut = useMutation({
    mutationFn: () => api.getLogs({ hours: '0' }).then(() => fetch('/api/logs', { method: 'DELETE' })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['logs'] }); toast({ title: 'Logs limpos' }); },
  });

  const logs = (data as { logs: Log[] } | undefined)?.logs ?? [];

  const errorCount = logs.filter((l) => l.level === 'ERROR').length;
  const warnCount = logs.filter((l) => l.level === 'WARNING').length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Observabilidade
        </h1>
        <p className="text-sm text-muted mt-1">Logs do sistema e do agente IA</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-white">{logs.length}</p>
          <p className="text-xs text-muted mt-1">Total</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-warning">{warnCount}</p>
          <p className="text-xs text-muted mt-1">Avisos</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-danger">{errorCount}</p>
          <p className="text-xs text-muted mt-1">Erros</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select className="input w-36" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Todos níveis</option>
          <option value="INFO">INFO</option>
          <option value="WARNING">WARNING</option>
          <option value="ERROR">ERROR</option>
        </select>
        <select className="input w-32" value={hours} onChange={(e) => setHours(e.target.value)}>
          <option value="1">1 hora</option>
          <option value="6">6 horas</option>
          <option value="24">24 horas</option>
          <option value="72">3 dias</option>
          <option value="168">7 dias</option>
        </select>
        <button onClick={() => refetch()} className="btn-ghost text-sm gap-1.5">
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      {/* Log List */}
      <div className="card overflow-hidden">
        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {isLoading && <p className="px-5 py-8 text-center text-muted text-sm">Carregando...</p>}
          {!isLoading && logs.length === 0 && (
            <p className="px-5 py-8 text-center text-muted text-sm">Nenhum log encontrado.</p>
          )}
          {logs.map((log) => {
            const { icon: Icon, color } = LEVEL_ICONS[log.level];
            const isExpanded = expanded === log.id;
            const hasMetadata = Object.keys(log.metadata ?? {}).length > 0;
            return (
              <div
                key={log.id}
                className="px-4 py-3 hover:bg-white/3 transition-colors cursor-pointer"
                onClick={() => setExpanded(isExpanded ? null : log.id)}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`h-4 w-4 flex-shrink-0 mt-0.5 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-mono font-bold ${color}`}>{log.level}</span>
                      <span className="text-[10px] text-muted font-mono bg-white/5 px-1.5 py-0.5 rounded">{log.scope}</span>
                      <span className="text-[10px] text-muted ml-auto">{formatDateTime(log.createdAt)}</span>
                    </div>
                    <p className="text-sm text-white mt-0.5 break-words">{log.message}</p>
                    {isExpanded && hasMetadata && (
                      <pre className="mt-2 text-[11px] font-mono text-muted bg-background rounded-lg p-3 overflow-x-auto">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
