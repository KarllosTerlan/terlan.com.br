'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { useState, useRef, useEffect } from 'react';
import { Bot, Send, RotateCcw, Plus, Trash2, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const schema = z.object({
  agentSystemPrompt: z.string().min(10, 'Mínimo 10 caracteres'),
  agentRequiredFields: z.string(),
  agentInstructionNotes: z.string().optional(),
  antiHallucinationMode: z.boolean(),
  agentModel: z.string().min(1),
  agentTemperature: z.number().min(0).max(1),
  agentMaxTokens: z.number().int().min(200).max(4000),
  notifyWhatsappAlerts: z.string().optional(),
  notifyWhatsappSchedule: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

type FaqEntry = { question: string; answer: string; whenToUse?: string };
type ChatMessage = { role: 'user' | 'assistant'; content: string };

export default function AgentConfigPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [faqEntries, setFaqEntries] = useState<FaqEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['agent-config'],
    queryFn: api.getAgentConfig,
  });

  const config = data?.config as Record<string, unknown> | null | undefined;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      agentSystemPrompt: '',
      agentRequiredFields: 'name,date,time',
      agentInstructionNotes: '',
      antiHallucinationMode: true,
      agentModel: 'claude-sonnet-4-5',
      agentTemperature: 0.3,
      agentMaxTokens: 1500,
      notifyWhatsappAlerts: '',
      notifyWhatsappSchedule: '',
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        agentSystemPrompt: String(config.agentSystemPrompt ?? ''),
        agentRequiredFields: Array.isArray(config.agentRequiredFields)
          ? (config.agentRequiredFields as string[]).join(',')
          : 'name,date,time',
        agentInstructionNotes: String(config.agentInstructionNotes ?? ''),
        antiHallucinationMode: Boolean(config.antiHallucinationMode ?? true),
        agentModel: String(config.agentModel ?? 'claude-sonnet-4-5'),
        agentTemperature: Number(config.agentTemperature ?? 0.3),
        agentMaxTokens: Number(config.agentMaxTokens ?? 1500),
        notifyWhatsappAlerts: String(config.notifyWhatsappAlerts ?? ''),
        notifyWhatsappSchedule: String(config.notifyWhatsappSchedule ?? ''),
      });
      if (Array.isArray(config.agentFaqEntries)) {
        setFaqEntries(config.agentFaqEntries as FaqEntry[]);
      }
    }
  }, [config, form]);

  const saveMut = useMutation({
    mutationFn: (formData: FormData) =>
      api.saveAgentConfig({
        ...formData,
        agentRequiredFields: formData.agentRequiredFields.split(',').map((s) => s.trim()).filter(Boolean),
        agentFaqEntries: faqEntries,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-config'] });
      toast({ title: 'Configurações salvas com sucesso!' });
    },
    onError: (err) => toast({ title: (err as Error).message, variant: 'destructive' }),
  });

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const res = await api.simulateAgent(msg);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.reply }]);
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `Erro: ${(err as Error).message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const resetChat = async () => {
    await api.resetSimulator();
    setChatMessages([]);
    toast({ title: 'Conversa reiniciada' });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  if (isLoading) return <div className="text-muted text-sm animate-pulse">Carregando...</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Agente IA
        </h1>
        <p className="text-sm text-muted mt-1">Configure o comportamento do assistente de agendamento</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        {/* Config Form */}
        <form onSubmit={form.handleSubmit((d) => saveMut.mutate(d))} className="space-y-4">
          {/* System Prompt */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-white text-sm">Prompt do Sistema</h2>
              <p className="text-xs text-muted mt-0.5">Instruções de personalidade e comportamento do agente</p>
            </div>
            <div className="card-body">
              <textarea
                {...form.register('agentSystemPrompt')}
                className="input h-48 resize-none font-mono text-xs"
                placeholder="Você é um assistente de agendamento da Clínica {{CLINIC_NAME}}..."
              />
              {form.formState.errors.agentSystemPrompt && (
                <p className="text-danger text-xs mt-1">{form.formState.errors.agentSystemPrompt.message}</p>
              )}
              <p className="text-xs text-muted mt-2">
                Variáveis disponíveis: <span className="font-mono text-primary/70">{'{{CLINIC_NAME}} {{TODAY_DATE}} {{SERVICES_LIST}} {{AVAILABLE_SLOTS}} {{PATIENT_NAME}}'}</span>
              </p>
            </div>
          </div>

          {/* Required Fields */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-white text-sm">Campos Obrigatórios</h2>
              <p className="text-xs text-muted mt-0.5">Separados por vírgula — o agente coleta esses dados antes de confirmar</p>
            </div>
            <div className="card-body">
              <input
                {...form.register('agentRequiredFields')}
                className="input font-mono text-sm"
                placeholder="name,date,time,service"
              />
            </div>
          </div>

          {/* FAQ Entries */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white text-sm">Base de Conhecimento (FAQ)</h2>
                <p className="text-xs text-muted mt-0.5">Perguntas e respostas frequentes para o agente</p>
              </div>
              <button
                type="button"
                onClick={() => setFaqEntries((prev) => [...prev, { question: '', answer: '', whenToUse: '' }])}
                className="btn-ghost text-xs gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </button>
            </div>
            <div className="card-body space-y-3">
              {faqEntries.length === 0 && (
                <p className="text-xs text-muted text-center py-4">Nenhuma entrada ainda. Clique em "Adicionar".</p>
              )}
              {faqEntries.map((entry, i) => (
                <div key={i} className="p-4 rounded-xl border border-border space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <input
                      value={entry.question}
                      onChange={(e) => {
                        const updated = [...faqEntries];
                        updated[i] = { ...updated[i], question: e.target.value };
                        setFaqEntries(updated);
                      }}
                      className="input text-sm"
                      placeholder="Pergunta"
                    />
                    <button
                      type="button"
                      onClick={() => setFaqEntries((prev) => prev.filter((_, idx) => idx !== i))}
                      className="btn-danger p-2 flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <textarea
                    value={entry.answer}
                    onChange={(e) => {
                      const updated = [...faqEntries];
                      updated[i] = { ...updated[i], answer: e.target.value };
                      setFaqEntries(updated);
                    }}
                    className="input h-20 resize-none text-sm"
                    placeholder="Resposta"
                  />
                  <input
                    value={entry.whenToUse ?? ''}
                    onChange={(e) => {
                      const updated = [...faqEntries];
                      updated[i] = { ...updated[i], whenToUse: e.target.value };
                      setFaqEntries(updated);
                    }}
                    className="input text-xs text-muted"
                    placeholder="Quando usar (opcional, ex: 'quando perguntarem sobre preço')"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold text-white text-sm">Notas de Instrução</h2>
            </div>
            <div className="card-body">
              <textarea
                {...form.register('agentInstructionNotes')}
                className="input h-24 resize-none text-sm"
                placeholder="Observações adicionais para o agente seguir..."
              />
            </div>
          </div>

          {/* Advanced */}
          <div className="card">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="card-header w-full flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <h2 className="font-semibold text-white text-sm">Configurações Avançadas</h2>
              {showAdvanced ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
            </button>
            {showAdvanced && (
              <div className="card-body space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted font-medium">Modelo</span>
                    <select {...form.register('agentModel')} className="input">
                      <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
                      <option value="claude-opus-4-5">Claude Opus 4.5</option>
                      <option value="claude-haiku-3">Claude Haiku 3</option>
                      <option value="gpt-4o">GPT-4o (OpenAI)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs text-muted font-medium">
                      Temperatura: {form.watch('agentTemperature')}
                    </span>
                    <input
                      {...form.register('agentTemperature', { valueAsNumber: true })}
                      type="range" min="0" max="1" step="0.1"
                      className="w-full accent-primary"
                    />
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs text-muted font-medium">Máx. Tokens</span>
                    <input {...form.register('agentMaxTokens', { valueAsNumber: true })} type="number" className="input" />
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer mt-5">
                    <input {...form.register('antiHallucinationMode')} type="checkbox" className="rounded border-border" />
                    <div>
                      <p className="text-sm text-white font-medium">Anti-alucinação</p>
                      <p className="text-xs text-muted">Proíbe o agente de inventar dados</p>
                    </div>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border">
                  <label className="space-y-1">
                    <span className="text-xs text-muted font-medium">Alertas WhatsApp</span>
                    <input {...form.register('notifyWhatsappAlerts')} className="input" placeholder="+5511999999999" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted font-medium">Notif. Agendamentos</span>
                    <input {...form.register('notifyWhatsappSchedule')} className="input" placeholder="+5511999999999" />
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saveMut.isPending} className="btn-primary gap-2">
              <Save className="h-4 w-4" />
              {saveMut.isPending ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </form>

        {/* Simulator */}
        <div className="card flex flex-col h-[600px] xl:sticky xl:top-5">
          <div className="card-header flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white text-sm">Simulador</h2>
              <p className="text-xs text-muted mt-0.5">Teste o agente sem enviar WhatsApp</p>
            </div>
            <button onClick={resetChat} className="btn-ghost text-xs gap-1.5 py-1.5 px-2.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Reiniciar
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="h-full flex items-center justify-center text-center">
                <div>
                  <Bot className="h-10 w-10 text-primary/20 mx-auto mb-3" />
                  <p className="text-sm text-muted">Digite uma mensagem para iniciar a simulação</p>
                </div>
              </div>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === 'user'
                      ? 'bg-primary/20 text-white rounded-br-sm'
                      : 'bg-surface border border-border text-white rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-surface border border-border rounded-2xl rounded-bl-sm px-4 py-2.5">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-1.5 w-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3 flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChat()}
              className="input flex-1 text-sm"
              placeholder="Simular mensagem do paciente..."
            />
            <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} className="btn-primary p-2.5">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
