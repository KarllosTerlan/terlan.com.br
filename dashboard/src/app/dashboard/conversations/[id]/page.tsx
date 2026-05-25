'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime, OUTCOME_LABELS } from '@/lib/utils';
import { ArrowLeft, Send, RotateCcw } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type Message = { role: 'user' | 'assistant'; content: string; createdAt?: string };
type Conversation = {
  id: string;
  phone: string;
  active: boolean;
  outcome?: string;
  messageCount?: number;
  messages: Message[];
  client?: { name?: string; phone: string };
  createdAt: string;
  updatedAt: string;
};

export default function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.getConversation(id),
    refetchInterval: 10000,
  });

  const conversation = data as Conversation | undefined;

  const archiveMut = useMutation({
    mutationFn: () => api.archiveConversation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversa arquivada' });
      router.back();
    },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.messages]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="text-center py-20 text-muted">Conversa não encontrada</div>
    );
  }

  const messages: Message[] = conversation.messages ?? [];

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="btn-ghost p-2">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-white text-lg truncate">
            {conversation.client?.name ?? conversation.phone}
          </h1>
          <p className="text-xs text-muted">
            {conversation.phone} ·{' '}
            {conversation.active ? (
              <span className="text-success">● Ativa</span>
            ) : (
              <span className="text-muted">● Encerrada</span>
            )}
            {conversation.outcome && (
              <> · <span className="text-primary">{OUTCOME_LABELS[conversation.outcome] ?? conversation.outcome}</span></>
            )}
          </p>
        </div>
        {conversation.active && (
          <button
            onClick={() => archiveMut.mutate()}
            disabled={archiveMut.isPending}
            className="btn-ghost text-sm text-danger gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Arquivar
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="card">
        <div className="card-body space-y-3 max-h-[60vh] overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-center text-muted text-sm py-8">Nenhuma mensagem</p>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-start' : 'justify-end',
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                    msg.role === 'user'
                      ? 'bg-white/8 text-white rounded-tl-sm'
                      : 'bg-primary/15 text-white border border-primary/25 rounded-tr-sm',
                  )}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  {msg.createdAt && (
                    <p className="text-[10px] text-muted mt-1 text-right">
                      {formatDateTime(msg.createdAt)}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-white/3 p-3">
          <p className="text-xs text-muted">Iniciada em</p>
          <p className="text-sm text-white mt-0.5">{formatDateTime(conversation.createdAt)}</p>
        </div>
        <div className="rounded-xl border border-border bg-white/3 p-3">
          <p className="text-xs text-muted">Última atividade</p>
          <p className="text-sm text-white mt-0.5">{formatDateTime(conversation.updatedAt)}</p>
        </div>
      </div>
    </div>
  );
}
