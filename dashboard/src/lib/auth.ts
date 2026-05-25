'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, setToken, clearToken, type Clinic } from '@/lib/api';

export function useAuth() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.login(email, password);
      setToken(res.token);
      localStorage.setItem('clinic', JSON.stringify(res.clinic));
      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearToken();
    router.push('/login');
  };

  return { login, logout, loading, error };
}

export function useClinic(): Clinic | null {
  const [clinic, setClinic] = useState<Clinic | null>(null);
  useEffect(() => {
    const stored = localStorage.getItem('clinic');
    if (stored) setClinic(JSON.parse(stored) as Clinic);
  }, []);
  return clinic;
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('token'));
}
