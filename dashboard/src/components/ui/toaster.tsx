'use client';

import { useToasts } from '@/hooks/use-toast';
import { X, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Toaster() {
  const { toasts, dismiss } = useToasts();

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-lg animate-fade-in',
            t.variant === 'destructive'
              ? 'bg-danger/10 border-danger/30 text-danger'
              : 'bg-surface border-border text-white',
          )}
        >
          {t.variant === 'destructive' ? (
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : (
            <CheckCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-success" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{t.title}</p>
            {t.description && <p className="text-xs opacity-70 mt-0.5">{t.description}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="text-muted hover:text-white flex-shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
