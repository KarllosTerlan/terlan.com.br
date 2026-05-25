'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Calendar, Users, MessageSquare, TrendingUp, CheckCircle, Clock, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatDate } from '@/lib/utils';

type Stats = {
  totalAppointments: number;
  todayAppointments: number;
  pendingAppointments: number;
  totalClients: number;
  totalConversations: number;
  successRate: number;
  appointmentsByDay: Array<{ date: string; count: number }>;
  recentAppointments: Array<{
    id: string;
    dateTime: string;
    status: string;
    client: { name: string | null; phone: string };
    service: { name: string } | null;
    professional: { name: string };
  }>;
};

function StatCard({ icon: Icon, label, value, color = 'text-primary', sublabel }: {
  icon: React.ElementType; label: string; value: string | number;
  color?: string; sublabel?: string;
}) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`rounded-xl p-2.5 bg-white/5 border border-white/10 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sublabel && <p className="text-xs text-muted mt-0.5">{sublabel}</p>}
      </div>
    </div>
  );
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  CONFIRMED: CheckCircle,
  PENDING: Clock,
  CANCELLED: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'text-success',
  PENDING: 'text-warning',
  CANCELLED: 'text-danger',
  COMPLETED: 'text-primary',
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: api.getDashboard,
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="text-muted text-sm animate-pulse">Carregando...</div>;

  const stats = data as Stats;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">Visão Geral</h1>
        <p className="text-sm text-muted mt-1">Resumo em tempo real da clínica</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Calendar} label="Hoje" value={stats?.todayAppointments ?? 0} sublabel="agendamentos" />
        <StatCard icon={Clock} label="Pendentes" value={stats?.pendingAppointments ?? 0} color="text-warning" />
        <StatCard icon={Users} label="Pacientes" value={stats?.totalClients ?? 0} color="text-success" />
        <StatCard
          icon={TrendingUp}
          label="Taxa de Sucesso"
          value={`${stats?.successRate ?? 0}%`}
          color="text-primary"
          sublabel="conversas com agendamento"
        />
      </div>

      {/* Chart */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-white text-sm">Agendamentos por Dia</h2>
        </div>
        <div className="card-body h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.appointmentsByDay ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a3050" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => formatDate(d, { day: '2-digit', month: '2-digit' })}
                tick={{ fill: 'rgba(226,232,240,0.35)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fill: 'rgba(226,232,240,0.35)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#0d1526', border: '1px solid #1a3050', borderRadius: 12 }}
                labelFormatter={(d) => formatDate(d, { weekday: 'short', day: '2-digit', month: '2-digit' })}
              />
              <Bar dataKey="count" fill="#00d4ff" radius={[6, 6, 0, 0]} name="Agendamentos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Appointments */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h2 className="font-semibold text-white text-sm">Últimos Agendamentos</h2>
          <a href="/dashboard/appointments" className="text-xs text-primary hover:underline">Ver todos</a>
        </div>
        <div className="divide-y divide-border">
          {(stats?.recentAppointments ?? []).slice(0, 8).map((appt) => {
            const Icon = STATUS_ICONS[appt.status] ?? Clock;
            const color = STATUS_COLORS[appt.status] ?? 'text-muted';
            return (
              <div key={appt.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`h-4 w-4 flex-shrink-0 ${color}`} />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate font-medium">
                      {appt.client.name ?? appt.client.phone}
                    </p>
                    <p className="text-xs text-muted">{appt.service?.name ?? 'Consulta'} · {appt.professional.name}</p>
                  </div>
                </div>
                <p className="text-xs text-muted flex-shrink-0">
                  {formatDate(appt.dateTime, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            );
          })}
          {!stats?.recentAppointments?.length && (
            <p className="px-5 py-6 text-sm text-muted text-center">Nenhum agendamento ainda.</p>
          )}
        </div>
      </div>
    </div>
  );
}
