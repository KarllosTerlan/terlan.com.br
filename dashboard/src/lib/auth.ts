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
      localStorage.setItem('clinic', JSON.stringify(res.user.clinic));
      localStorage.setItem('user', JSON.stringify({
        id: res.user.id,
        name: res.user.name,
        email: res.user.email,
        role: res.user.role,
      }));
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

export function useRegister() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const register = async (data: { clinicName: string; adminName: string; email: string; password: string; phone?: string }) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.registerClinic(data);
      setToken(res.token);
      localStorage.setItem('clinic', JSON.stringify(res.user.clinic));
      localStorage.setItem('user', JSON.stringify({
        id: res.user.id,
        name: res.user.name,
        email: res.user.email,
        role: res.user.role,
      }));
      router.push('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return { register, loading, error };
}


  const [clinic, setClinic] = useState<Clinic | null>(null);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('clinic');
      if (stored && stored !== 'undefined' && stored !== 'null') {
        setClinic(JSON.parse(stored) as Clinic);
      }
    } catch {
      localStorage.removeItem('clinic');
    }
  }, []);
  return clinic;
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('token'));
}
