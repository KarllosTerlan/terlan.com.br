# ARCHITECTURE.md — Arquitetura do ClinicBot Pro

## Visão Geral

```
┌──────────────────────────────────────────────────────────────────┐
│                          Internet                                 │
└───────────────┬───────────────────────────────┬──────────────────┘
                │                               │
        WhatsApp Cloud / Evolution       Browser (Dashboard)
                │                               │
        POST /webhook/...            app.DOMAIN → :3001
                │                               │
┌───────────────▼───────────────────────────────▼──────────────────┐
│                      Traefik (TLS/HTTPS)                         │
│              api.DOMAIN → :3000  |  app.DOMAIN → :3001           │
└───────────────┬───────────────────────────────┬──────────────────┘
                │                               │
┌───────────────▼────────────┐  ┌───────────────▼────────────┐
│    Fastify Backend (:3000) │  │  Next.js Dashboard (:3001) │
│                            │  │                             │
│  • REST API (JWT)          │  │  • App Router               │
│  • Webhook handlers        │  │  • TanStack Query           │
│  • Agent AI pipeline       │  │  • Tailwind + shadcn        │
│  • BullMQ workers          │  └─────────────────────────────┘
│  • Cron endpoints          │
└──────────┬─────────────────┘
           │
    ┌──────┴──────┐
    │             │
┌───▼───┐   ┌────▼────┐
│  PG   │   │  Redis  │
│  16   │   │    7    │
└───────┘   └─────────┘
```

## Módulos Backend

### `/src/ai/` — Pipeline do Agente IA

| Arquivo | Responsabilidade |
|---------|-----------------|
| `agent.ts` | Orquestrador principal — recebe mensagem, executa pipeline, retorna resposta |
| `guardrail.ts` | Constrói o system prompt com dados reais da clínica |
| `loop-detector.ts` | Detecta quando o agente está preso em loop perguntando o mesmo campo |
| `abuse-guard.ts` | Blacklist, rate-limit por paciente, detecção de bots |
| `context.ts` | Monta janela de mensagens, histórico e perfil do paciente |
| `validators.ts` | Valida campos coletados pelo agente (data, hora, campos obrigatórios) |
| `utils.ts` | Utilitários: findOrCreateClient, upsertConversation |

### `/src/api/routes/` — API REST

| Rota | Descrição |
|------|-----------|
| `POST /auth/login` | Login JWT |
| `GET /dashboard` | KPIs e gráficos |
| `GET/POST /appointments` | CRUD de agendamentos |
| `GET /patients` | Listagem de pacientes |
| `GET/DELETE /conversations` | Histórico de conversas |
| `GET/POST/PUT/DELETE /services` | Gerenciar serviços |
| `GET/PUT /working-hours` | Horários de atendimento |
| `GET/POST/DELETE /schedule-exceptions` | Feriados e exceções |
| `GET/PUT /agent/config` | Configurações do agente IA |
| `POST /agent/simulate` | Simulador do agente |
| `GET/POST/DELETE /blacklist` | Lista de bloqueio |
| `GET /logs` | Logs do sistema |
| `GET/PUT /backup/config` | Configuração de backup |
| `POST /backup/trigger` | Backup manual |
| `GET /export/appointments.csv` | Exportar agendamentos |
| `GET /export/patients.csv` | Exportar pacientes |
| `POST /webhook/evolution` | Webhook Evolution API |
| `POST /webhook/meta` | Webhook Meta Cloud API |
| `POST /cron/reminders` | Envio de lembretes (cron) |
| `POST /cron/inactivity` | Fechar conversas inativas (cron) |
| `POST /cron/backup` | Executar backup agendado (cron) |

### Pipeline de Processamento de Mensagem

```
WhatsApp → webhook.ts → BullMQ queue
                           │
                    handler.ts worker
                           │
                    agent.ts::runAgent()
                      │
                      ├─ abuse-guard: telefone bloqueado?
                      │
                      ├─ Redis mutex: lock por (clinicId, phone) 25s
                      │
                      ├─ burst debounce: aguarda 3.5s de silêncio
                      │
                      ├─ loop-detector: agente está em loop?
                      │
                      ├─ guardrail: constrói system prompt
                      │    └─ slots disponíveis, serviços, FAQ, etc.
                      │
                      ├─ context: histórico + perfil do paciente
                      │
                      ├─ Claude API (tool use loop, max 4 rounds)
                      │    ├─ check_availability
                      │    ├─ confirm_appointment
                      │    ├─ list_my_appointments
                      │    ├─ cancel_appointment
                      │    └─ reschedule_appointment
                      │
                      ├─ booking.service: salva no DB
                      │
                      ├─ calendar/booking: sincroniza Google
                      │
                      ├─ notifications: notifica profissional/clínica
                      │
                      └─ sender: responde via WhatsApp
```

## Modelo de Dados (Principais)

```
Clinic ──< Professional ──< Appointment ──> Client
   │                            │
   ├──< Service                 └──> Service
   ├──< WorkingHours
   ├──< ScheduleException
   ├──< Conversation ──< (messages JSON)
   ├──< PhoneBlacklist
   ├──< SystemLog
   └──< BackupConfig ──< BackupRun
```

## Fluxo de Autenticação

1. `POST /auth/login` → valida email/senha → retorna JWT (HS256, payload: `{ userId, clinicId, role }`)
2. Dashboard armazena token no `localStorage`
3. Todas as requisições autenticadas enviam `Authorization: Bearer <token>`
4. Middleware `auth.ts` no Fastify verifica e injeta `req.auth.clinicId`

## Multi-tenancy

Cada `Clinic` tem um registro independente no banco. Todos os dados são isolados por `clinicId`. O JWT garante que cada usuário só acessa dados da sua clínica.

Para adicionar uma nova clínica (processo atual):
1. `POST /clinics` (admin ou seed)
2. `POST /auth/register` com `clinicId`
3. Configurar WhatsApp (instância Evolution) e apontar webhook para `/webhook/evolution`
