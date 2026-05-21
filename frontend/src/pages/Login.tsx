import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({
    email: '',
    password: '',
    clinicName: '',
    adminName: '',
    phone: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const url = mode === 'login' ? '/auth/login' : '/auth/register-clinic';
      const payload =
        mode === 'login'
          ? { email: form.email, password: form.password }
          : {
              clinicName: form.clinicName,
              adminName: form.adminName,
              email: form.email,
              password: form.password,
              phone: form.phone || undefined,
            };
      const { data } = await api.post(url, payload);
      localStorage.setItem('token', data.token);
      navigate('/');
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? 'Erro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-slate-100">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4 p-8">
        <h1 className="text-2xl font-bold text-brand-600">Clinic Bot</h1>
        <p className="text-sm text-slate-600">
          {mode === 'login' ? 'Entre com sua conta' : 'Cadastre sua clínica'}
        </p>

        {mode === 'register' && (
          <>
            <input
              className="input"
              placeholder="Nome da clínica"
              value={form.clinicName}
              onChange={(e) => setForm({ ...form, clinicName: e.target.value })}
              required
            />
            <input
              className="input"
              placeholder="Seu nome"
              value={form.adminName}
              onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              required
            />
            <input
              className="input"
              placeholder="Telefone (opcional)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </>
        )}

        <input
          className="input"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Senha"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />

        {err && <div className="rounded bg-red-50 p-2 text-sm text-red-700">{err}</div>}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? '...' : mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>

        <button
          type="button"
          className="w-full text-sm text-brand-600 hover:underline"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Cadastrar nova clínica' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  );
}
