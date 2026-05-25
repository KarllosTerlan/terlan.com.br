# API.md — Referência da API REST

Base URL: `https://api.seudominio.com`

Todas as rotas (exceto `/auth/login` e `/webhook/*` e `/cron/*`) requerem:
```
Authorization: Bearer <JWT>
```

---

## Autenticação

### `POST /auth/login`
```json
// Request
{ "email": "admin@clinica.com", "password": "senha123" }

// Response 200
{
  "token": "eyJhbGc...",
  "user": { "id": "...", "email": "...", "role": "ADMIN" },
  "clinic": { "id": "...", "name": "Clínica Exemplo" }
}
```

---

## Dashboard

### `GET /dashboard`
Retorna KPIs e dados para gráficos.
```json
// Response 200
{
  "today": 12,
  "pending": 5,
  "totalPatients": 348,
  "successRate": 87,
  "appointmentsByDay": [
    { "date": "2025-01-20", "count": 8 },
    ...
  ],
  "recentAppointments": [ ... ]
}
```

---

## Agendamentos

### `GET /appointments`
Query params: `status`, `date` (YYYY-MM-DD), `search`, `page` (default 1), `limit` (default 20)

### `POST /appointments`
```json
{
  "patientName": "João Silva",
  "patientPhone": "5511999999999",
  "serviceId": "uuid",
  "professionalId": "uuid",
  "scheduledAt": "2025-02-01T09:00:00.000Z"
}
```

### `DELETE /appointments/:id`
Cancela agendamento. Body opcional: `{ "reason": "Paciente remarcou" }`

---

## Pacientes

### `GET /patients`
Query params: `search`, `vipOnly` (true/false), `page`, `limit`

---

## Conversas

### `GET /conversations`
Query params: `outcome`, `active` (true/false), `page`, `limit`

### `GET /conversations/:id`
Detalhes com mensagens completas.

### `DELETE /conversations/:id`
Arquiva a conversa.

---

## Serviços

### `GET /services`
Lista todos os serviços (incluindo inativos).

### `POST /services`
```json
{
  "name": "Consulta",
  "description": "Consulta médica geral",
  "durationMinutes": 30,
  "price": 150.00,
  "color": "#00d4ff"
}
```

### `PUT /services/:id`
Mesmos campos do POST.

### `DELETE /services/:id`
Soft delete (marca `active = false`).

---

## Horários

### `GET /working-hours`
Lista horários por dia da semana.

### `PUT /working-hours`
```json
[
  {
    "weekday": 1,
    "enabled": true,
    "startTime": "08:00",
    "endTime": "18:00",
    "breakStart": "12:00",
    "breakEnd": "13:00",
    "slotIntervalMinutes": 30
  },
  ...
]
```
Substitui todos os registros da clínica.

### `GET /schedule-exceptions`

### `POST /schedule-exceptions`
```json
{
  "date": "2025-12-25",
  "reason": "Natal",
  "blocked": true,
  "vipOnly": false
}
```

### `DELETE /schedule-exceptions/:id`

---

## Agente IA

### `GET /agent/config`
Retorna a configuração atual do agente.

### `PUT /agent/config`
```json
{
  "agentSystemPrompt": "Você é uma assistente virtual chamada Ana...",
  "agentRequiredFields": "name,date,time,service",
  "agentFaqEntries": [
    { "question": "Qual o endereço?", "answer": "Rua X, 123", "whenToUse": "pergunta de endereço" }
  ],
  "agentInstructionNotes": "Sempre perguntar sobre convênio.",
  "antiHallucinationMode": true,
  "agentModel": "claude-sonnet-4-5",
  "agentTemperature": 0.3,
  "agentMaxTokens": 1024,
  "notifyWhatsappAlerts": "5511999999999",
  "notifyWhatsappSchedule": "5511999999999"
}
```

### `POST /agent/simulate`
```json
// Request
{ "phone": "5511999999999", "text": "Olá, quero marcar consulta" }

// Response
{ "reply": "Olá! Claro, fico feliz em ajudar..." }
```

### `DELETE /agent/simulate`
Limpa contexto do simulador para o número informado.

---

## Blacklist

### `GET /blacklist`
Query params: `search`, `page`, `limit`

### `POST /blacklist`
```json
{ "phone": "5511999999999", "reason": "Spam" }
```

### `DELETE /blacklist/:phone`

---

## Logs

### `GET /logs`
Query params: `level` (INFO/WARNING/ERROR), `scope`, `hours` (default 24), `limit` (default 100)

### `DELETE /logs`
Query params: `olderThanDays` (default 30)

---

## Backup

### `GET /backup/config`

### `PUT /backup/config`
```json
{
  "enabled": true,
  "frequencyHours": 24,
  "retentionDays": 30
}
```

### `GET /backup/runs`
Histórico de execuções.

### `POST /backup/trigger`
Inicia backup imediato.

---

## Exportações

### `GET /export/appointments.csv`
Download direto de CSV. Params: `startDate`, `endDate` (YYYY-MM-DD)

### `GET /export/patients.csv`

### `GET /export/conversations.csv`

---

## Cron (protegido por `x-cron-token`)

### `POST /cron/reminders`
Envia lembretes de 24h e 1h, completa agendamentos passados.

### `POST /cron/inactivity`
Fecha conversas inativas, limpa logs antigos.

### `POST /cron/backup`
Executa backup agendado (se configurado).

---

## Webhooks

### `POST /webhook/evolution`
Header: `x-evolution-token: <EVOLUTION_WEBHOOK_TOKEN>`

### `POST /webhook/meta`
Verifica token via query param `hub.verify_token`.

---

## Google Calendar

### `GET /google/status`
```json
{ "connected": true, "email": "admin@gmail.com" }
```

### `GET /google/auth-url`
```json
{ "url": "https://accounts.google.com/o/oauth2/auth?..." }
```

### `POST /google/disconnect`

### `GET /google/callback`
Redirect OAuth (chamado pelo Google).

---

## Erros

| Status | Significado |
|--------|-------------|
| 400 | Dados inválidos |
| 401 | Token ausente ou inválido |
| 403 | Sem permissão |
| 404 | Recurso não encontrado |
| 409 | Conflito (ex: horário já ocupado) |
| 429 | Rate limit atingido |
| 500 | Erro interno do servidor |

Formato padrão de erro:
```json
{ "error": "Mensagem de erro descritiva" }
```
