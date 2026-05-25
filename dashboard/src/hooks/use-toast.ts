'use client';

import { useState, useCallback } from 'react';

type ToastVariant = 'default' | 'destructive';

type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
};

type ToastOptions = Omit<Toast, 'id'>;

// Global state
let toasts: Toast[] = [];
let listeners: Array<(toasts: Toast[]) => void> = [];

function notify(toast: Toast) {
  toasts = [...toasts, toast];
  listeners.forEach((l) => l(toasts));
}

function dismiss(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  listeners.forEach((l) => l(toasts));
}

export function toast(options: ToastOptions) {
  const id = Math.random().toString(36).slice(2);
  notify({ id, ...options });
  setTimeout(() => dismiss(id), 4000);
}

export function useToast() {
  return { toast };
}

export function useToasts() {
  const [state, setState] = useState<Toast[]>(toasts);

  useState(() => {
    listeners.push(setState);
    return () => {
      listeners = listeners.filter((l) => l !== setState);
    };
  });

  return { toasts: state, dismiss };
}
