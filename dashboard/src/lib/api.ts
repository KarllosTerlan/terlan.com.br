// API client — todas as chamadas ao Fastify backend.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('clinic');
}

export type Clinic = {
  id: string;
  name: string;
  phone: string;
  timezone: string;
  active: boolean;
};

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Sessão expirada');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Erro desconhecido');
  }

  return res.json() as Promise<T>;
}

export const api = {
  // ── Auth ──
  login: (email: string, password: string) =>
    request<{ token: string; clinic: Clinic; user: { id: string; email: string; role: string } }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) },
    ),

  // ── Dashboard ──
  getDashboard: () => request<{
    totalAppointments: number;
    todayAppointments: number;
    pendingAppointments: number;
    totalClients: number;
    totalConversations: number;
    successRate: number;
    appointmentsByDay: Array<{ date: string; count: number }>;
    recentAppointments: unknown[];
  }>('/dashboard'),

  // ── Appointments ──
  getAppointments: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ appointments: unknown[]; total: number }>(`/appointments${q}`);
  },
  createAppointment: (data: unknown) =>
    request('/appointments', { method: 'POST', body: JSON.stringify(data) }),
  updateAppointment: (id: string, data: unknown) =>
    request(`/appointments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  cancelAppointment: (id: string, reason?: string) =>
    request(`/appointments/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // ── Patients ──
  getPatients: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ clients: unknown[]; total: number }>(`/patients${q}`);
  },
  getPatient: (id: string) => request(`/patients/${id}`),
  updatePatient: (id: string, data: unknown) =>
    request(`/patients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // ── Conversations ──
  getConversations: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ conversations: unknown[]; total: number }>(`/conversations${q}`);
  },
  getConversation: (id: string) => request(`/conversations/${id}`),
  archiveConversation: (id: string) =>
    request(`/conversations/${id}`, { method: 'DELETE' }),

  // ── Services ──
  getServices: () => request<{ services: unknown[] }>('/services'),
  createService: (data: unknown) =>
    request('/services', { method: 'POST', body: JSON.stringify(data) }),
  updateService: (id: string, data: unknown) =>
    request(`/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteService: (id: string) =>
    request(`/services/${id}`, { method: 'DELETE' }),

  // ── Working Hours ──
  getWorkingHours: () => request<{ hours: unknown[] }>('/working-hours'),
  saveWorkingHours: (hours: unknown[]) =>
    request('/working-hours', { method: 'PUT', body: JSON.stringify(hours) }),
  getScheduleExceptions: (month?: string) => {
    const q = month ? `?month=${month}` : '';
    return request<{ exceptions: unknown[] }>(`/schedule-exceptions${q}`);
  },
  createScheduleException: (data: unknown) =>
    request('/schedule-exceptions', { method: 'POST', body: JSON.stringify(data) }),
  deleteScheduleException: (id: string) =>
    request(`/schedule-exceptions/${id}`, { method: 'DELETE' }),

  // ── Agent Config ──
  getAgentConfig: () => request<{ config: unknown }>('/agent/config'),
  saveAgentConfig: (data: unknown) =>
    request('/agent/config', { method: 'PUT', body: JSON.stringify(data) }),
  simulateAgent: (message: string, phone?: string) =>
    request<{ reply: string }>('/agent/simulate', {
      method: 'POST',
      body: JSON.stringify({ message, phone }),
    }),
  resetSimulator: (phone?: string) => {
    const q = phone ? `?phone=${encodeURIComponent(phone)}` : '';
    return request(`/agent/simulate${q}`, { method: 'DELETE' });
  },

  // ── Blacklist ──
  getBlacklist: () => request<{ blacklist: unknown[] }>('/blacklist'),
  addToBlacklist: (phone: string, reason?: string) =>
    request('/blacklist', { method: 'POST', body: JSON.stringify({ phone, reason }) }),
  removeFromBlacklist: (phone: string) =>
    request(`/blacklist/${encodeURIComponent(phone)}`, { method: 'DELETE' }),

  // ── Logs / Observability ──
  getLogs: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ logs: unknown[] }>(`/logs${q}`);
  },

  // ── Backup ──
  getBackupConfig: () => request<{ config: unknown }>('/backup/config'),
  saveBackupConfig: (data: unknown) =>
    request('/backup/config', { method: 'PUT', body: JSON.stringify(data) }),
  getBackupRuns: () => request<{ runs: unknown[] }>('/backup/runs'),
  triggerBackup: () => request('/backup/trigger', { method: 'POST' }),

  // ── Clinic Settings ──
  getClinic: () => request<{ clinic: unknown }>('/clinics/me'),
  updateClinic: (data: unknown) =>
    request('/clinics/me', { method: 'PUT', body: JSON.stringify(data) }),

  // ── Professionals ──
  getProfessionals: () => request<{ professionals: unknown[] }>('/professionals'),

  // ── Google Calendar ──
  getGoogleStatus: () => request<{ connected: boolean; email?: string }>('/google/status'),
  googleAuthUrl: () => request<{ url: string }>('/google/auth-url'),
  disconnectGoogle: () => request('/google/disconnect', { method: 'POST' }),

  // ── WhatsApp ──
  getWhatsappStatus: () => request<{ connected: boolean; qr?: string }>('/whatsapp/status'),

  // ── Exports ──
  exportAppointments: () => `${BASE_URL}/export/appointments.csv`,
  exportPatients: () => `${BASE_URL}/export/patients.csv`,
  exportConversations: () => `${BASE_URL}/export/conversations.csv`,
};
