# FEATURES.md — Funcionalidades do ClinicBot Pro

## 🤖 Agente IA

### Agendamento Automático
- O agente coleta os campos obrigatórios configurados pelo admin (nome, data, horário, serviço, etc.)
- Verifica disponibilidade em tempo real consultando agendamentos + exceções de horário
- Confirma agendamento com resumo em linguagem natural
- Envia notificação para o profissional (se configurado)

### Cancelamento e Reagendamento
- Paciente pode cancelar digitando "quero cancelar" ou variações
- Agente lista próximos agendamentos do paciente para cancelar
- Suporte a reagendamento mantendo o mesmo serviço/profissional

### Configurações do Agente
| Campo | Descrição |
|-------|-----------|
| System Prompt | Personalidade e instruções base do agente |
| Campos Obrigatórios | Quais dados coletar antes de confirmar (ex: `name,date,time,service`) |
| Base de Conhecimento (FAQ) | Perguntas/respostas para o agente consultar |
| Notas de Instrução | Regras adicionais em texto livre |
| Modelo | Claude Sonnet 4.5, Opus 4.5, Haiku 3, GPT-4o |
| Temperatura | 0.0 (preciso) a 1.0 (criativo) |
| Anti-alucinação | Proíbe o agente de inventar horários/dados |

### Variáveis de Template no System Prompt
```
{{CLINIC_NAME}}       Nome da clínica
{{TODAY_DATE}}        Data atual formatada
{{SERVICES_LIST}}     Lista de serviços com duração e preço
{{AVAILABLE_SLOTS}}   Horários disponíveis para hoje
{{PATIENT_NAME}}      Nome do paciente (se já cadastrado)
{{PROFESSIONALS}}     Lista de profissionais disponíveis
{{WORKING_HOURS}}     Horários de funcionamento
```

### Simulador
- Teste o agente diretamente no painel sem precisar do WhatsApp
- Conversa isolada por sessão de simulação
- Botão "Reiniciar" para limpar o contexto

---

## 📅 Agendamentos

- Listagem com filtros: status, data, busca por paciente/telefone
- Cancelamento manual pelo painel
- Exportação CSV (até 10.000 registros)
- Indicador de origem: WhatsApp (Agente) vs Manual vs API
- Status: Pendente → Confirmado → Concluído (automático após 30min) / Cancelado / Não compareceu

---

## 👥 Pacientes

- Cadastro automático ao primeiro contato no WhatsApp
- Perfil com nome, telefone, email, CPF, convênio
- Flag VIP — pacientes VIP têm acesso em dias com `vipOnly: true`
- Histórico de consultas
- Exportação CSV

---

## 💬 Conversas

- Histórico completo de todas as conversas do WhatsApp
- Outcome: Agendado, Cancelado, Reagendado, Abandonado, Só Informação, Bloqueado
- Indicador de conversa ativa (verde) vs encerrada
- Exportação CSV

---

## 🕐 Horários de Funcionamento

- Configuração por dia da semana (Dom a Sáb)
- Horário de início, fim e intervalo (almoço)
- Intervalo de slots configurável: 15, 20, 30, 45, 60, 90 min
- **Exceções / Feriados**: bloquear dias específicos
  - Bloquear totalmente ou só para não-VIPs
  - Motivo opcional

---

## 🛠️ Serviços

- Cadastro de procedimentos com nome, descrição, duração e preço
- Cor personalizada por serviço (aparece no calendário)
- Ativo/Inativo (soft delete)
- O agente usa a lista de serviços para oferecer opções ao paciente

---

## 🔔 Lembretes Automáticos

- **24h antes**: mensagem confirmando presença ("Você confirma? Responda sim ou não.")
- **1h antes**: lembrete final
- Ambos controlados pelo container `cron` (executa a cada 5 min)
- Campos `reminderSent` e `hourReminderSent` evitam duplicatas
- Auto-complete: agendamentos confirmados marcados como COMPLETED após 30min do horário

---

## 📵 Blacklist

- Bloquear números de telefone específicos
- O agente ignora completamente mensagens de números bloqueados
- Motivo opcional para auditoria
- Gerenciamento pelo painel

---

## 🛡️ Proteção Anti-Abuso

- Rate limit por paciente: máximo de mensagens por janela de tempo
- Burst protection: agrupa mensagens enviadas em sequência rápida
- Mutex Redis: evita processamento paralelo do mesmo usuário
- Loop detector: detecta quando o agente fica pedindo o mesmo campo repetidamente

---

## 📊 Observabilidade

- Logs em banco de dados (INFO / WARNING / ERROR)
- Escopo por módulo: `agent`, `booking`, `reminder`, `cron`, `backup`, etc.
- Filtro por nível e janela de tempo (última hora, 6h, 24h, 3d, 7d)
- Metadata JSON expansível por log
- Retenção configurável (padrão 30 dias)

---

## 📅 Google Calendar

- Sincronização automática ao criar/cancelar agendamentos
- OAuth 2.0 — conecte com um clique no painel
- Criação de evento com detalhes do paciente e serviço
- Cancelamento refletido automaticamente

---

## 💾 Backup

- Backup automático agendado (configurável: 6h, 12h, 24h, semanal)
- Retenção configurável (7 a 90 dias)
- Backup manual via painel ou API
- Histórico de execuções com status e tempo

---

## 📤 Exportações

| Endpoint | Conteúdo |
|----------|---------|
| `GET /export/appointments.csv` | Agendamentos com todos os campos |
| `GET /export/patients.csv` | Pacientes cadastrados |
| `GET /export/conversations.csv` | Histórico de conversas |

---

## 🔧 Multi-Provedor WhatsApp

| Provedor | Quando usar |
|----------|-------------|
| **Evolution API** | Recomendado — open source, self-hosted, suporta multi-instância |
| **Meta Cloud API** | Número oficial verificado pelo Meta, maior confiabilidade |

Ambos podem coexistir — cada clínica pode usar um provedor diferente.
