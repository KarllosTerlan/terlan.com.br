'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Wifi, QrCode, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

export default function WhatsAppPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: api.getWhatsappStatus,
    refetchInterval: 10_000,
  });

  const status = data as { connected: boolean; qr?: string; instance?: string } | undefined;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Wifi className="h-5 w-5 text-primary" />
          WhatsApp
        </h1>
        <p className="text-sm text-muted mt-1">Status da conexão e QR Code</p>
      </div>

      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-white text-sm">Status da Instância</h2>
          <button onClick={() => refetch()} className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </div>
        <div className="card-body">
          {isLoading ? (
            <p className="text-muted text-sm animate-pulse">Verificando...</p>
          ) : (
            <div className="flex items-center gap-3">
              {status?.connected ? (
                <CheckCircle className="h-8 w-8 text-success" />
              ) : (
                <XCircle className="h-8 w-8 text-danger" />
              )}
              <div>
                <p className="font-semibold text-white">
                  {status?.connected ? 'Conectado' : 'Desconectado'}
                </p>
                {status?.instance && (
                  <p className="text-xs text-muted">Instância: {status.instance}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {!status?.connected && status?.qr && (
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" />
              QR Code
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Abra o WhatsApp → Dispositivos Conectados → Conectar dispositivo → Escaneie o código
            </p>
          </div>
          <div className="card-body flex justify-center">
            <div className="p-4 bg-white rounded-2xl">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(status.qr)}`} alt="QR Code" className="w-48 h-48" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
