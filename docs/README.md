# ClinicBot Pro — Documentação Completa

Bem-vindo à documentação oficial do **ClinicBot Pro**, o sistema inteligente de agendamento por WhatsApp para clínicas.

## Índice

| Documento | Descrição |
|-----------|-----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Visão técnica completa da arquitetura |
| [FEATURES.md](./FEATURES.md) | Todas as funcionalidades do sistema |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Guia passo a passo de implantação |
| [API.md](./API.md) | Referência completa da API REST |
| [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) | Resolução de problemas comuns |

## O que é o ClinicBot Pro?

O ClinicBot Pro é um sistema **SaaS multi-tenant** que permite clínicas oferecerem agendamento automático via WhatsApp, com um agente de IA configurável que:

- Atende pacientes 24/7 pelo WhatsApp
- Coleta dados, verifica disponibilidade e confirma agendamentos
- Envia lembretes automáticos (24h e 1h antes)
- Detecta loops e comportamentos abusivos
- É completamente configurável pelo painel de controle

## Stack Tecnológico

| Camada | Tecnologia |
|--------|-----------|
| Backend | Fastify 4 · Node.js 20 · TypeScript · Prisma 5 |
| IA | Anthropic Claude (padrão) · OpenAI GPT-4o (opcional) |
| Banco de Dados | PostgreSQL 16 |
| Cache / Filas | Redis 7 · BullMQ |
| Frontend | Next.js 15 · Tailwind CSS · TanStack Query |
| WhatsApp | Evolution API (primário) · Meta Cloud API (fallback) |
| Deploy | Docker · Traefik (TLS automático) |
