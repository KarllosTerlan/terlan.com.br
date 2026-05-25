'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Database, Play, CheckCircle, XCircle, Clock } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

type BackupRun = {
  id: string;
  status: 'RUNNING' | 'SUCCESS' | 'ERROR';
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
};

type BackupConfig = {
  enabled: boolean;
  frequencyHours: number;
  retentionDays: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

export default function BackupPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [config, setConfig] = useState<BackupConfig>({ enabled: true, frequencyHours: 24, retentionDays: 30, lastRunAt: null, nextRunAt: null });
  const [initialized, setInitialized] = useState(false);

  const configQuery = useQuery({ queryKey: ['backup-config'], queryFn: api.getBackupConfig });
  const runsQuery = useQuery({ queryKey: ['backup-runs'], queryFn: api.getBackupRuns });

  if (configQuery.data && !initialized) {
    const loaded = (configQuery.data as { config: BackupConfig | null }).config;
    if (loaded) { setConfig(loaded); setInitialized(true); }
  }

  const saveMut = useMutation({
    mutationFn: () => api.saveBackupConfig(config),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backup-config'] }); toast({ title: 'Configuração de backup salva!' }); },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const triggerMut = useMutation({
    mutationFn: api.triggerBackup,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['backup-runs'] }); toast({ title: 'Backup iniciado!' }); },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const runs = (runsQuery.data as { runs: BackupRun[] } | undefined)?.runs ?? [];

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'SUCCESS') return <CheckCircle className="h-4 w-4 text-success" />;
    if (status === 'ERROR') return <XCircle className="h-4 w-4 text-danger" />;
    return <Clock className="h-4 w-4 text-warning animate-spin" />;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Database className="h-5 w-5 text-primary" />
          Backup
        </h1>
        <p className="text-sm text-muted mt-1">Backup automático do banco de dados</p>
      </div>

      {/* Config */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-white text-sm">Configurações</h2>
        </div>
        <div className="card-body space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig((p) => ({ ...p, enabled: e.target.checked }))}
              className="rounded border-border accent-primary"
            />
            <div>
              <p className="text-sm text-white font-medium">Backup automático ativo</p>
              <p className="text-xs text-muted">Executa automaticamente conforme o intervalo configurado</p>
            </div>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs text-muted font-medium">Frequência (horas)</span>
              <select
                value={config.frequencyHours}
                onChange={(e) => setConfig((p) => ({ ...p, frequencyHours: Number(e.target.value) }))}
                className="input"
              >
                <option value={6}>A cada 6 horas</option>
                <option value={12}>A cada 12 horas</option>
                <option value={24}>Diário (24h)</option>
                <option value={48}>A cada 2 dias</option>
                <option value={168}>Semanal</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted font-medium">Retenção (dias)</span>
              <select
                value={config.retentionDays}
                onChange={(e) => setConfig((p) => ({ ...p, retentionDays: Number(e.target.value) }))}
                className="input"
              >
                <option value={7}>7 dias</option>
                <option value={14}>14 dias</option>
                <option value={30}>30 dias</option>
                <option value={60}>60 dias</option>
                <option value={90}>90 dias</option>
              </select>
            </label>
          </div>

          {config.lastRunAt && (
            <p className="text-xs text-muted">
              Último backup: {formatDateTime(config.lastRunAt)}
              {config.nextRunAt && ` · Próximo: ${formatDateTime(config.nextRunAt)}`}
            </p>
          )}

          <div className="flex gap-3">
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-primary text-sm">
              {saveMut.isPending ? 'Salvando...' : 'Salvar'}
            </button>
            <button onClick={() => triggerMut.mutate()} disabled={triggerMut.isPending} className="btn-ghost text-sm gap-1.5">
              <Play className="h-4 w-4" />
              Fazer Backup Agora
            </button>
          </div>
        </div>
      </div>

      {/* Run History */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="font-semibold text-white text-sm">Histórico</h2>
        </div>
        <div className="divide-y divide-border">
          {runs.length === 0 && <p className="px-5 py-6 text-center text-muted text-sm">Nenhum backup realizado ainda.</p>}
          {runs.map((run) => (
            <div key={run.id} className="px-5 py-3 flex items-center gap-3">
              <StatusIcon status={run.status} />
              <div className="flex-1">
                <p className="text-sm text-white capitalize">{run.trigger === 'manual' ? 'Manual' : 'Automático'}</p>
                {run.errorMessage && <p className="text-xs text-danger">{run.errorMessage}</p>}
              </div>
              <p className="text-xs text-muted">
                {formatDateTime(run.startedAt)}
                {run.finishedAt && ` (${Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s)`}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
