'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Globe, CheckCircle, XCircle, ExternalLink, Unlink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function GooglePage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['google-status'],
    queryFn: api.getGoogleStatus,
  });

  const status = data as { connected: boolean; email?: string } | undefined;

  const connectMut = useMutation({
    mutationFn: async () => {
      const res = await api.googleAuthUrl();
      window.location.href = (res as { url: string }).url;
    },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const disconnectMut = useMutation({
    mutationFn: api.disconnectGoogle,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['google-status'] }); toast({ title: 'Google Calendar desconectado' }); },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Globe className="h-5 w-5 text-primary" />
          Google Calendar
        </h1>
        <p className="text-sm text-muted mt-1">Sincronize agendamentos com o Google Calendar</p>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-white text-sm">Status da Integração</h2>
        </div>
        <div className="card-body space-y-4">
          {isLoading ? (
            <p className="text-muted text-sm animate-pulse">Carregando...</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                {status?.connected ? (
                  <CheckCircle className="h-8 w-8 text-success" />
                ) : (
                  <XCircle className="h-8 w-8 text-danger" />
                )}
                <div>
                  <p className="font-semibold text-white">
                    {status?.connected ? 'Conectado' : 'Não conectado'}
                  </p>
                  {status?.email && <p className="text-xs text-muted">{status.email}</p>}
                </div>
              </div>

              {status?.connected ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-success/20 bg-success/5 p-4">
                    <p className="text-sm text-success font-medium">✓ Sincronização ativa</p>
                    <p className="text-xs text-muted mt-1">
                      Agendamentos criados e cancelados pelo agente são sincronizados automaticamente
                    </p>
                  </div>
                  <button
                    onClick={() => disconnectMut.mutate()}
                    disabled={disconnectMut.isPending}
                    className="btn-danger text-sm gap-1.5"
                  >
                    <Unlink className="h-4 w-4" />
                    {disconnectMut.isPending ? 'Desconectando...' : 'Desconectar Google Calendar'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-white/3 p-4">
                    <p className="text-sm text-white font-medium">Como funciona</p>
                    <ul className="text-xs text-muted mt-2 space-y-1 list-disc list-inside">
                      <li>Agendamentos criados pelo agente aparecem no seu Google Calendar</li>
                      <li>Cancelamentos são refletidos automaticamente</li>
                      <li>Você pode ver os agendamentos diretamente no app Google Calendar</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => connectMut.mutate()}
                    disabled={connectMut.isPending}
                    className="btn-primary text-sm gap-1.5"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {connectMut.isPending ? 'Aguarde...' : 'Conectar Google Calendar'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
