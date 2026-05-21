import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, CheckCircle2, AlertCircle, Send, QrCode, RefreshCw, LogOut, Star } from 'lucide-react';
import api from '@/services/api';

type Status = {
  preferredProvider: 'evolution' | 'meta';
  activeProvider: 'evolution' | 'meta' | null;
  evolution: {
    configured: boolean;
    instance: string | null;
    state: string;
    connected: boolean;
    webhookUrl: string;
  };
  meta: {
    configured: boolean;
    phoneNumberId: string | null;
    displayNumber: string | null;
    verifiedName: string | null;
    qualityRating: string | null;
    connected: boolean;
    webhookUrl: string;
    verifyToken: string;
    apiVersion: string;
  };
};

type QrResp = { instance: string | null; state: string; qr: string | null };

export default function WhatsAppSetup() {
  const qc = useQueryClient();
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [metaPhoneId, setMetaPhoneId] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testText, setTestText] = useState('Olá! Mensagem de teste do Clinic Bot.');

  const status = useQuery<Status>({
    queryKey: ['wa-status'],
    queryFn: async () => (await api.get('/whatsapp/status')).data,
    refetchInterval: 5000,
  });

  const qr = useQuery<QrResp>({
    queryKey: ['wa-evolution-qr'],
    queryFn: async () => (await api.get('/whatsapp/evolution/qr')).data,
    refetchInterval: (data) => (data?.state === 'open' ? 15000 : 4000),
    enabled: Boolean(status.data?.evolution.configured),
  });

  const connectEvolution = useMutation({
    mutationFn: async () => (await api.post('/whatsapp/evolution/connect')).data,
    onSuccess: () => {
      setFeedback({ kind: 'ok', msg: 'Instância criada. Escaneie o QR Code para conectar.' });
      qc.invalidateQueries({ queryKey: ['wa-status'] });
      qc.invalidateQueries({ queryKey: ['wa-evolution-qr'] });
    },
    onError: (e: any) => setFeedback({ kind: 'err', msg: e?.response?.data?.error ?? 'Falha ao criar instância' }),
  });

  const disconnectEvolution = useMutation({
    mutationFn: async () => (await api.post('/whatsapp/evolution/disconnect')).data,
    onSuccess: () => {
      setFeedback({ kind: 'ok', msg: 'Desconectado do WhatsApp.' });
      qc.invalidateQueries({ queryKey: ['wa-status'] });
    },
  });

  const configureMeta = useMutation({
    mutationFn: async () => (await api.post('/whatsapp/meta/configure', { whatsappPhoneNumberId: metaPhoneId.trim() })).data,
    onSuccess: () => {
      setFeedback({ kind: 'ok', msg: 'Meta Cloud API vinculada com sucesso.' });
      setMetaPhoneId('');
      qc.invalidateQueries({ queryKey: ['wa-status'] });
    },
    onError: (e: any) => setFeedback({ kind: 'err', msg: e?.response?.data?.error ?? 'Falha ao vincular' }),
  });

  const disconnectMeta = useMutation({
    mutationFn: async () => (await api.post('/whatsapp/meta/disconnect')).data,
    onSuccess: () => {
      setFeedback({ kind: 'ok', msg: 'Meta desvinculada.' });
      qc.invalidateQueries({ queryKey: ['wa-status'] });
    },
  });

  const prefer = useMutation({
    mutationFn: async (provider: 'evolution' | 'meta') => (await api.post('/whatsapp/prefer', { provider })).data,
    onSuccess: (d) => {
      setFeedback({ kind: 'ok', msg: `Provider preferencial: ${d.preferredProvider}` });
      qc.invalidateQueries({ queryKey: ['wa-status'] });
    },
  });

  const testSend = useMutation({
    mutationFn: async () => (await api.post('/whatsapp/test', { to: testTo.trim(), text: testText })).data,
    onSuccess: (d) =>
      setFeedback({
        kind: 'ok',
        msg: `Enviada via ${d.provider}${d.fellBack ? ' (fallback automático)' : ''}.`,
      }),
    onError: (e: any) => setFeedback({ kind: 'err', msg: e?.response?.data?.error ?? 'Falha ao enviar' }),
  });

  const s = status.data;
  const copy = (val: string) =>
    navigator.clipboard.writeText(val).then(() => setFeedback({ kind: 'ok', msg: 'Copiado.' }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">WhatsApp</h1>
        <ActiveProviderBadge active={s?.activeProvider ?? null} preferred={s?.preferredProvider ?? null} />
      </div>

      {feedback && (
        <div className={`rounded p-3 text-sm ${feedback.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          {feedback.msg}
        </div>
      )}

      {/* ============== EVOLUTION (PRIMARY) ============== */}
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Evolution API <span className="text-xs font-normal text-slate-500">(primary)</span></h2>
            <ProviderStatePill state={s?.evolution.state ?? 'unknown'} connected={Boolean(s?.evolution.connected)} />
          </div>
          <div className="flex gap-2">
            {s?.preferredProvider !== 'evolution' && s?.evolution.configured && (
              <button className="btn-secondary" onClick={() => prefer.mutate('evolution')}>
                <Star className="mr-1 inline h-4 w-4" /> Tornar preferencial
              </button>
            )}
            {s?.evolution.configured && (
              <button className="btn-danger" onClick={() => disconnectEvolution.mutate()} disabled={disconnectEvolution.isPending}>
                <LogOut className="mr-1 inline h-4 w-4" /> Desconectar
              </button>
            )}
          </div>
        </div>

        {!s?.evolution.configured ? (
          <div>
            <p className="mb-3 text-sm text-slate-600">
              Crie uma instância dedicada no servidor Evolution e conecte um número de WhatsApp escaneando o QR Code.
            </p>
            <button className="btn-primary" onClick={() => connectEvolution.mutate()} disabled={connectEvolution.isPending}>
              <QrCode className="mr-1 inline h-4 w-4" /> Criar instância e gerar QR
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs uppercase text-slate-500">Instância</div>
              <div className="mb-3 font-mono text-sm">{s.evolution.instance}</div>

              {s.evolution.connected ? (
                <div className="rounded bg-green-50 p-4 text-sm text-green-800">
                  <CheckCircle2 className="mr-1 inline h-4 w-4" />
                  Conectado ao WhatsApp. A IA está atendendo.
                </div>
              ) : (
                <div className="rounded bg-amber-50 p-4 text-sm text-amber-800">
                  <AlertCircle className="mr-1 inline h-4 w-4" />
                  Aguardando leitura do QR Code (estado: <code>{s.evolution.state}</code>).
                </div>
              )}

              <button className="btn-secondary mt-3" onClick={() => qc.invalidateQueries({ queryKey: ['wa-evolution-qr'] })}>
                <RefreshCw className="mr-1 inline h-4 w-4" /> Atualizar QR
              </button>
            </div>

            <div className="flex items-center justify-center">
              {qr.data?.qr && !s.evolution.connected ? (
                <img
                  src={qr.data.qr.startsWith('data:') ? qr.data.qr : `data:image/png;base64,${qr.data.qr}`}
                  alt="QR Code Evolution"
                  className="h-64 w-64 rounded border bg-white p-2"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center rounded border bg-slate-50 text-xs text-slate-400">
                  {s.evolution.connected ? '✅ Já conectado' : 'Gerando QR…'}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 border-t pt-3">
          <Field label="Webhook URL (já configurado automaticamente)" value={s?.evolution.webhookUrl ?? ''} onCopy={copy} />
        </div>
      </div>

      {/* ============== META (FALLBACK) ============== */}
      <div className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Meta Cloud API <span className="text-xs font-normal text-slate-500">(fallback oficial)</span></h2>
            <ProviderStatePill state={s?.meta.connected ? 'open' : 'close'} connected={Boolean(s?.meta.connected)} />
          </div>
          <div className="flex gap-2">
            {s?.preferredProvider !== 'meta' && s?.meta.configured && (
              <button className="btn-secondary" onClick={() => prefer.mutate('meta')}>
                <Star className="mr-1 inline h-4 w-4" /> Tornar preferencial
              </button>
            )}
            {s?.meta.configured && (
              <button className="btn-danger" onClick={() => disconnectMeta.mutate()} disabled={disconnectMeta.isPending}>
                Desvincular
              </button>
            )}
          </div>
        </div>

        {!s?.meta.configured ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Cole o <strong>Phone Number ID</strong> obtido no painel Meta for Developers → WhatsApp → API Setup.
              Usado automaticamente como fallback se a Evolution cair.
            </p>
            <div className="flex gap-2">
              <input
                className="input flex-1 font-mono"
                placeholder="ex: 123456789012345"
                value={metaPhoneId}
                onChange={(e) => setMetaPhoneId(e.target.value)}
              />
              <button
                className="btn-primary"
                disabled={!metaPhoneId.trim() || configureMeta.isPending}
                onClick={() => configureMeta.mutate()}
              >
                Vincular
              </button>
            </div>
          </div>
        ) : (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase text-slate-500">Número exibido</dt>
              <dd className="font-mono text-sm">{s.meta.displayNumber ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Nome verificado</dt>
              <dd className="text-sm">{s.meta.verifiedName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Phone Number ID</dt>
              <dd className="font-mono text-sm">{s.meta.phoneNumberId}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-slate-500">Qualidade</dt>
              <dd className="text-sm">{s.meta.qualityRating ?? '—'}</dd>
            </div>
          </dl>
        )}

        <div className="mt-4 space-y-3 border-t pt-3">
          <Field label="Webhook URL (para colar no painel da Meta)" value={s?.meta.webhookUrl ?? ''} onCopy={copy} />
          <Field label="Verify Token" value={s?.meta.verifyToken ?? ''} onCopy={copy} />
          <p className="text-xs text-slate-500">
            No painel Meta, inscreva-se no campo <strong>messages</strong>.
          </p>
        </div>
      </div>

      {/* ============== TEST ============== */}
      <div className="card p-6">
        <h2 className="mb-2 text-lg font-semibold">Enviar mensagem de teste</h2>
        <p className="mb-3 text-sm text-slate-600">
          Usa a cadeia de providers ({s?.preferredProvider === 'meta' ? 'Meta → Evolution' : 'Evolution → Meta'}) com fallback automático.
        </p>
        <div className="space-y-2">
          <input
            className="input"
            placeholder="Telefone destino (ex: 5511987654321)"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
          />
          <textarea
            className="input min-h-[80px]"
            placeholder="Mensagem"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={!testTo.trim() || !testText.trim() || testSend.isPending}
            onClick={() => testSend.mutate()}
          >
            <Send className="mr-1 inline h-4 w-4" /> Enviar teste
          </button>
        </div>
      </div>
    </div>
  );
}

function ActiveProviderBadge({
  active,
  preferred,
}: {
  active: 'evolution' | 'meta' | null;
  preferred: 'evolution' | 'meta' | null;
}) {
  if (!active) {
    return (
      <span className="badge bg-slate-200 text-slate-700">
        <AlertCircle className="mr-1 inline h-3 w-3" /> Nenhum provider conectado
      </span>
    );
  }
  const isPreferred = active === preferred;
  if (active === 'evolution') {
    return (
      <span className="badge bg-green-100 text-green-800">
        Evolution ✅ {isPreferred ? 'ativa' : '(em uso)'}
      </span>
    );
  }
  return (
    <span className="badge bg-amber-100 text-amber-800">
      Meta ⚠️ {isPreferred ? 'ativa' : 'em fallback'}
    </span>
  );
}

function ProviderStatePill({ state, connected }: { state: string; connected: boolean }) {
  if (connected) return <span className="badge bg-green-100 text-green-800">conectado</span>;
  if (state === 'connecting') return <span className="badge bg-amber-100 text-amber-800">conectando</span>;
  if (state === 'not_configured') return <span className="badge bg-slate-200 text-slate-700">não configurado</span>;
  return <span className="badge bg-red-100 text-red-700">{state}</span>;
}

function Field({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase text-slate-500">{label}</div>
      <div className="flex gap-2">
        <input className="input flex-1 font-mono text-sm" readOnly value={value} />
        <button className="btn-secondary" onClick={() => onCopy(value)} title="Copiar">
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
