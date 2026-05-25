import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR', opts ?? { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatPhone(phone: string): string {
  const p = phone.replace(/\D/g, '');
  if (p.length === 13) return `+${p.slice(0,2)} (${p.slice(2,4)}) ${p.slice(4,9)}-${p.slice(9)}`;
  if (p.length === 11) return `(${p.slice(0,2)}) ${p.slice(2,7)}-${p.slice(7)}`;
  return phone;
}

export const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
  COMPLETED: 'Concluído',
  NO_SHOW: 'Não compareceu',
};

export const STATUS_COLORS: Record<string, string> = {
  PENDING: 'badge-warning',
  CONFIRMED: 'badge-primary',
  CANCELLED: 'badge-danger',
  COMPLETED: 'badge-success',
  NO_SHOW: 'badge-muted',
};

export const OUTCOME_LABELS: Record<string, string> = {
  UNKNOWN: 'Em andamento',
  BOOKED: 'Agendado',
  CANCELLED: 'Cancelado',
  RESCHEDULED: 'Reagendado',
  ABANDONED: 'Abandonado',
  INFO_ONLY: 'Só informação',
  BLOCKED: 'Bloqueado',
};

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
