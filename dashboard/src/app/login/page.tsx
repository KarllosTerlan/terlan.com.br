'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Bot, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const { login, loading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login(email, password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 rounded-2xl bg-primary/10 border border-primary/25 shadow-[0_0_24px_rgba(0,212,255,0.15)]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Bot className="h-6 w-6 text-primary" />
              </div>
            </div>
            <div>
              <p className="font-bold tracking-wider text-white text-xl leading-none">
                CLINIC<span className="text-primary">BOT</span>
              </p>
              <p className="text-[11px] text-muted-subtle tracking-widest uppercase mt-1">Pro</p>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="card">
          <div className="card-header text-center">
            <h1 className="font-semibold text-white">Entrar no painel</h1>
            <p className="text-xs text-muted mt-1">Acesse com suas credenciais</p>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="space-y-1.5 block">
                <span className="text-xs text-muted font-medium">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                />
              </label>

              <label className="space-y-1.5 block">
                <span className="text-xs text-muted font-medium">Senha</span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input pr-10"
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>

              {error && (
                <div className="rounded-xl bg-danger/10 border border-danger/20 px-4 py-3">
                  <p className="text-sm text-danger">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="btn-primary w-full"
              >
                {loading ? (
                  <span className="flex items-center gap-2 justify-center">
                    <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Entrando...
                  </span>
                ) : (
                  'Entrar'
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-[11px] text-muted mt-6">
          ClinicBot Pro · Sistema de Agendamento Inteligente
        </p>
      </div>
    </div>
  );
}
