'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatPhone, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils';
import { ArrowLeft, Star, Phone, Mail, CreditCard, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type Patient = {
  id: string;
  name?: string;
  phone: string;
  email?: string;
  cpf?: string;
  insurance?: string;
  isVip: boolean;
  notes?: string;
  lastContact?: string;
  createdAt: string;
  appointments?: Array<{
    id: string;
    scheduledAt: string;
    status: string;
    serviceName?: string;
  }>;
};

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['patient', id],
    queryFn: () => api.getPatient(id),
  });

  const patient = data as Patient | undefined;

  const vipMut = useMutation({
    mutationFn: (vip: boolean) => api.updatePatient(id, { isVip: vip }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['patient', id] });
      qc.invalidateQueries({ queryKey: ['patients'] });
      toast({ title: 'Paciente atualizado' });
    },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!patient) {
    return <div className="text-center py-20 text-muted">Paciente não encontrado</div>;
  }

  const appointments = patient.appointments ?? [];
  const upcoming = appointments.filter((a) => new Date(a.scheduledAt) >= new Date());
  const past = appointments.filter((a) => new Date(a.scheduledAt) < new Date());

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="btn-ghost p-2">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-white text-lg">
              {patient.name ?? patient.phone}
            </h1>
            {patient.isVip && (
              <span className="badge-warning text-[10px]">VIP</span>
            )}
          </div>
          <p className="text-xs text-muted">{formatPhone(patient.phone)}</p>
        </div>
        <button
          onClick={() => vipMut.mutate(!patient.isVip)}
          disabled={vipMut.isPending}
          className={cn('btn-ghost gap-1.5', patient.isVip ? 'text-warning' : 'text-muted')}
          title={patient.isVip ? 'Remover VIP' : 'Marcar como VIP'}
        >
          <Star className={cn('h-4 w-4', patient.isVip && 'fill-warning')} />
          {patient.isVip ? 'VIP' : 'Marcar VIP'}
        </button>
      </div>

      {/* Info card */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-white text-sm">Informações</h2>
        </div>
        <div className="card-body grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow icon={<Phone className="h-4 w-4" />} label="Telefone" value={formatPhone(patient.phone)} />
          {patient.email && (
            <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={patient.email} />
          )}
          {patient.cpf && (
            <InfoRow icon={<CreditCard className="h-4 w-4" />} label="CPF" value={patient.cpf} />
          )}
          {patient.insurance && (
            <InfoRow icon={<CreditCard className="h-4 w-4" />} label="Convênio" value={patient.insurance} />
          )}
          <InfoRow
            icon={<Calendar className="h-4 w-4" />}
            label="Cadastrado em"
            value={formatDate(patient.createdAt)}
          />
          {patient.lastContact && (
            <InfoRow
              icon={<Calendar className="h-4 w-4" />}
              label="Último contato"
              value={formatDate(patient.lastContact)}
            />
          )}
        </div>
        {patient.notes && (
          <div className="px-5 pb-5">
            <p className="text-xs text-muted mb-1">Observações</p>
            <p className="text-sm text-white bg-white/3 rounded-xl p-3 border border-border">
              {patient.notes}
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total" value={appointments.length} />
        <StatCard label="Próximos" value={upcoming.length} color="text-primary" />
        <StatCard label="Realizados" value={past.filter((a) => a.status === 'COMPLETED').length} color="text-success" />
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-white text-sm">Próximos Agendamentos</h2>
          </div>
          <div className="card-body space-y-2">
            {upcoming
              .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
              .map((a) => (
                <ApptRow key={a.id} appt={a} />
              ))}
          </div>
        </div>
      )}

      {/* History */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-white text-sm">Histórico</h2>
        </div>
        <div className="card-body space-y-2">
          {past.length === 0 ? (
            <p className="text-muted text-sm py-4 text-center">Nenhum agendamento anterior</p>
          ) : (
            past
              .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
              .map((a) => (
                <ApptRow key={a.id} appt={a} />
              ))
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="text-muted mt-0.5">{icon}</span>
      <div>
        <p className="text-[11px] text-muted">{label}</p>
        <p className="text-sm text-white">{value}</p>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = 'text-white',
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white/3 p-4 text-center">
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}

function ApptRow({
  appt,
}: {
  appt: { scheduledAt: string; status: string; serviceName?: string };
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-white/3 px-3.5 py-2.5 gap-3">
      <div>
        <p className="text-sm text-white">{formatDate(appt.scheduledAt)}</p>
        {appt.serviceName && (
          <p className="text-xs text-muted mt-0.5">{appt.serviceName}</p>
        )}
      </div>
      <span className={cn('badge text-[10px]', STATUS_COLORS[appt.status])}>
        {STATUS_LABELS[appt.status] ?? appt.status}
      </span>
    </div>
  );
}
