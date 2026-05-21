import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import api from '@/services/api';

export default function Conversations() {
  const [selected, setSelected] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => (await api.get('/conversations')).data,
  });

  const conv = useQuery({
    queryKey: ['conversation', selected],
    queryFn: async () => (await api.get(`/conversations/${selected}`)).data,
    enabled: !!selected,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Conversas</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card max-h-[70vh] overflow-y-auto">
          {(list.data?.conversations ?? []).map((c: any) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.clientPhone)}
              className={`block w-full border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 ${
                selected === c.clientPhone ? 'bg-brand-50' : ''
              }`}
            >
              <div className="font-medium">{c.clientPhone}</div>
              <div className="text-xs text-slate-500">{dayjs(c.lastMessageAt).format('DD/MM HH:mm')}</div>
            </button>
          ))}
          {(list.data?.conversations ?? []).length === 0 && (
            <div className="p-4 text-center text-sm text-slate-500">Nenhuma conversa ainda.</div>
          )}
        </div>

        <div className="card col-span-2 max-h-[70vh] overflow-y-auto p-4">
          {!selected && <div className="text-sm text-slate-500">Selecione uma conversa.</div>}
          {selected && conv.data && (
            <div className="space-y-2">
              {((conv.data.conversation?.messages ?? []) as any[]).map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[80%] rounded-lg p-2 text-sm ${
                    m.role === 'user' ? 'bg-slate-100' : 'ml-auto bg-brand-500 text-white'
                  }`}
                >
                  <div>{m.content}</div>
                  <div className={`mt-1 text-[10px] ${m.role === 'user' ? 'text-slate-500' : 'text-brand-100'}`}>
                    {m.ts ? dayjs(m.ts).format('DD/MM HH:mm') : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
