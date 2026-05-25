# Clinic Bot

Sistema multi-tenant de agendamento inteligente para clínicas, com atendimento automático via WhatsApp e IA (Claude), integração com Google Calendar e painel administrativo Next.js.

**Stack:** Node.js 20 + TypeScript + Fastify + Prisma + PostgreSQL 16 + Redis + BullMQ + Evolution API (self-hosted, primário) + WhatsApp Cloud API / Meta (fallback) + Anthropic Claude + Google Calendar + **Next.js 15** + TailwindCSS + Docker + Traefik v3.

---

## Sumário

- [Pré-requisitos](#pré-requisitos)
- [Configurar Claude API](#configurar-claude-api-anthropic)
- [Configurar Google Calendar API](#configurar-google-calendar-api)
- [Rodar localmente (dev)](#rodar-localmente-dev)
- [Deploy em produção (Hetzner)](#deploy-em-produção-hetzner)
- [Como atualizar o sistema](#como-atualizar-o-sistema)
- [Conectar o WhatsApp](#conectar-o-whatsapp)
- [Adicionar uma nova clínica](#adicionar-uma-nova-clínica)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Troubleshooting](#troubleshooting)
- [Sobre o WhatsApp Cloud API](#sobre-o-whatsapp-cloud-api)

---

## Pré-requisitos

- **Docker 24+** e **Docker Compose v2** (obrigatório)
- Node.js 20+ apenas se quiser rodar backend/dashboard fora de container
- Chave da API Anthropic → https://console.anthropic.com
- Conta Google Cloud (para OAuth do Google Calendar — opcional)
- Domínio próprio com DNS apontando para o servidor (apenas produção)

> **Verificar versões instaladas:**
> ```bash
> docker --version          # precisa ser 24+
> docker compose version    # precisa ser v2 (comando sem hífen)
> ```

---

## Configurar Claude API (Anthropic)

1. Crie conta em https://console.anthropic.com → **API Keys** → gere uma chave (`sk-ant-...`).
2. No `.env`:
   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   CLAUDE_MODEL=claude-sonnet-4-5
   CLAUDE_MAX_TOKENS=1024
   ```

| Modelo | Velocidade | Custo | Recomendado para |
|--------|-----------|-------|------------------|
| `claude-haiku-4-5` | Mais rápido | Mais barato | Alto volume de mensagens |
| `claude-sonnet-4-5` | Médio | Médio | **Uso geral (padrão)** |
| `claude-opus-4-5-20250929` | Mais lento | Mais caro | Casos complexos |

> **Atenção:** Se a IA não estiver respondendo, verifique a chave no `.env` do servidor. O placeholder padrão é `PREENCHA_SUA_CHAVE_sk-ant-...` — precisa ser substituído por uma chave real.

---

## Configurar Google Calendar API

> Esta integração é **opcional**. O sistema funciona normalmente sem ela.

1. Acesse https://console.cloud.google.com → crie ou selecione um projeto.
2. **APIs & Services → Library** → habilite **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
   - User Type: **External**
   - Adicione o scope `https://www.googleapis.com/auth/calendar`
   - **Importante:** Publique o app (não deixe em "Testing" em produção — refresh tokens expiram em 7 dias no modo Testing)
4. **Credentials → Create OAuth client ID** → Web application:
   - Redirect URI produção: `https://api.SEU-DOMINIO.com/google/callback`
   - Redirect URI local: `http://localhost:3000/google/callback`
5. No `.env`:
   ```env
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
   GOOGLE_REDIRECT_URI=https://api.SEU-DOMINIO.com/google/callback
   ```

> Após o deploy, conecte cada clínica individualmente pelo painel: **Configurações → Integrações → Conectar Google**.

---

## Rodar localmente (dev)

```bash
cp .env.example .env
# edite .env com pelo menos: ANTHROPIC_API_KEY

docker compose -f docker-compose.dev.yml up -d
```

Serviços disponíveis após subir:

| Serviço | URL | Container |
|---------|-----|----------|
| API (backend) | http://localhost:3000 | `clinic-backend-dev` |
| Dashboard (Next.js) | http://localhost:3001 | `clinic-dashboard-dev` |
| PostgreSQL | localhost:**5434** | `clinic-postgres-dev` |
| Redis | localhost:**6380** | `clinic-redis-dev` |
| Evolution API | http://localhost:8080 | `clinic-evolution-dev` |

> **Atenção às portas:** Em dev, PostgreSQL roda na **5434** e Redis na **6380** para não conflitar com instalações locais.

**Comandos úteis:**

```bash
# Ver logs em tempo real
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml logs -f dashboard

# Reiniciar só o backend após mudança de código
docker compose -f docker-compose.dev.yml restart backend

# Acessar o banco de dados
docker exec -it clinic-postgres-dev psql -U clinic -d clinic_bot

# Parar tudo
docker compose -f docker-compose.dev.yml down
```

---

## Deploy em produção (Hetzner)

### 1. Provisione o servidor

- VPS Ubuntu 22.04+ (mínimo CX21: 2 vCPU, 4 GB RAM)
- Aponte 2 registros DNS tipo A para o IP do servidor:
  ```
  api.SEU-DOMINIO.com  →  IP-DO-SERVIDOR
  app.SEU-DOMINIO.com  →  IP-DO-SERVIDOR
  ```
  > Aguarde a propagação antes de fazer o deploy (pode levar até 1h). Verifique com: `dig api.SEU-DOMINIO.com`

### 2. Instale Docker no servidor

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker   # aplica o grupo sem precisar sair da sessão
```

### 3. Clone o projeto

```bash
git clone https://github.com/SEU-USUARIO/SEU-REPO.git /opt/terlan
cd /opt/terlan
```

### 4. Configure as variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

Variáveis **obrigatórias** para o sistema funcionar:

```env
DOMAIN=seu-dominio.com
ACME_EMAIL=seu@email.com

JWT_SECRET=         # gere com: openssl rand -hex 32
POSTGRES_PASSWORD=  # qualquer senha forte
CRON_SECRET=        # gere com: openssl rand -hex 16

ANTHROPIC_API_KEY=sk-ant-...   # chave real da Anthropic

EVOLUTION_API_KEY=             # string aleatória longa
EVOLUTION_WEBHOOK_TOKEN=       # mesma string acima

FRONTEND_URL=https://app.seu-dominio.com
PUBLIC_API_URL=https://api.seu-dominio.com
```

Variáveis **opcionais** (Google Calendar e WhatsApp Meta):

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://api.seu-dominio.com/google/callback

WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
```

> **Não altere** `DATABASE_URL`, `REDIS_URL` e `EVOLUTION_API_URL` — eles já apontam para os serviços internos do Docker pela rede `clinic-network`.

### 5. Prepare o Traefik

```bash
chmod 600 traefik/acme.json
```

> Se esse arquivo não existir: `touch traefik/acme.json && chmod 600 traefik/acme.json`

### 6. Suba todos os serviços

```bash
docker compose up -d
```

O Traefik emite os certificados SSL automaticamente via Let's Encrypt. Na primeira subida aguarde **1-2 minutos** antes de acessar o HTTPS.

### 7. Verifique se está tudo rodando

```bash
# Status de todos os containers (todos devem estar Up ou healthy)
docker compose ps

# Testar a API
curl https://api.SEU-DOMINIO.com/health
# esperado: {"ok":true}

# Ver logs do backend em tempo real
docker compose logs -f backend
```

Containers que devem estar rodando:

| Container | Descrição |
|-----------|-----------|
| `clinic-postgres` | Banco de dados (deve estar `healthy`) |
| `clinic-redis` | Cache e filas (deve estar `healthy`) |
| `clinic-evolution` | WhatsApp via QR Code |
| `clinic-backend` | API Fastify (porta 3000) |
| `clinic-dashboard` | Painel Next.js (porta 3001) |
| `clinic-cron` | Cron de lembretes (roda a cada 5 min) |

Acesse `https://app.SEU-DOMINIO.com` e clique em **Cadastrar nova clínica**.

---

## Como atualizar o sistema

Sempre que fizer mudanças no código e quiser aplicar em produção:

```bash
# No servidor (SSH)
cd /opt/terlan
git pull

# Se mudou o backend:
docker compose build backend --no-cache
docker compose up -d backend

# Se mudou o dashboard (Next.js):
# IMPORTANTE: o dashboard precisa de rebuild completo porque o
# NEXT_PUBLIC_API_URL é injetado em tempo de build (não runtime).
docker compose build dashboard --no-cache
docker compose up -d dashboard

# Se mudou os dois:
docker compose build backend dashboard --no-cache
docker compose up -d
```

> **Por que `--no-cache`?** O Next.js bake a URL da API no bundle durante o build. Se você não usar `--no-cache`, o Docker pode usar uma camada cacheada com a URL antiga.

Ver o log do build:
```bash
docker compose build dashboard --no-cache > /tmp/build.log 2>&1
tail -f /tmp/build.log
```

---

## Conectar o WhatsApp

O sistema suporta **dois providers** simultâneos com **fallback automático**:

| Provider | Tipo | Uso | Conexão |
|----------|------|-----|---------|
| **Evolution API** | Self-hosted (baileys) | Primário | QR Code — 1 instância por clínica |
| **Meta Cloud API** | API oficial da Meta | Fallback automático | Phone Number ID + token permanente |

O backend tenta sempre a Evolution primeiro. Se a instância estiver desconectada ou o envio falhar, cai automaticamente na Meta. Cada tentativa é registrada na tabela `MessageLog` com os campos `provider`, `ok`, `error` e `fallback`.

### Opção A — Evolution API via QR Code (mais fácil para começar)

O container já está incluso no `docker-compose`. Basta:

1. Defina no `.env`: `EVOLUTION_API_KEY=qualquer-string-longa`
2. Suba os containers: `docker compose up -d`
3. No painel, acesse **WhatsApp → Criar instância e gerar QR**
4. Escaneie o QR: **WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho**
5. Status muda para **conectado** — badge no topo mostra `Evolution ✅ ativa`

> O webhook é configurado automaticamente pelo backend, apontando para `PUBLIC_API_URL/webhook/evolution`.

### Opção B — Meta Cloud API (número oficial, sem QR)

**Passo 1 — Criar app Meta:**
1. Acesse [developers.facebook.com](https://developers.facebook.com/) → **My Apps → Create App → Business**
2. Adicione o produto **WhatsApp → Set up**
3. Copie o **Phone Number ID** e o **token temporário** (24h) em **WhatsApp → API Setup**

**Passo 2 — Gerar token permanente (obrigatório para produção):**
1. [business.facebook.com/settings](https://business.facebook.com/settings/) → **Users → System Users → Add**
2. Role: Admin → **Assigned Assets**: selecione seu app e WABA (Full Control)
3. **Generate New Token** → escopos: `whatsapp_business_messaging` + `whatsapp_business_management` → expiração: **Never**
4. Salve o token em `WHATSAPP_TOKEN` no `.env` (não aparece de novo)

**Passo 3 — Configurar webhook:**

No painel do app, **WhatsApp → Configuration → Webhook → Edit**:
- **Callback URL:** `https://api.SEU-DOMINIO.com/webhook/meta`
- **Verify Token:** valor de `WHATSAPP_VERIFY_TOKEN` no `.env` (qualquer string)
- Clique **Verify and Save** → em **Webhook fields**, inscreva-se em **`messages`**

**Passo 4 — Vincular ao painel:**
1. Logue em `https://app.SEU-DOMINIO.com`
2. Vá em **WhatsApp** → card **Meta Cloud API** → cole o **Phone Number ID** → **Vincular**

**Verificação:**

```bash
# Webhook funcionando (deve retornar: teste123)
curl "https://api.SEU-DOMINIO.com/webhook/meta?hub.mode=subscribe&hub.verify_token=SEU_VERIFY_TOKEN&hub.challenge=teste123"

# Envio de mensagem de teste (substitua SEU_JWT)
curl -X POST https://api.SEU-DOMINIO.com/whatsapp/test \
  -H "Authorization: Bearer SEU_JWT" \
  -H "Content-Type: application/json" \
  -d '{"to":"5511999999999","text":"olá do clinic-bot"}'
```

---

## Adicionar uma nova clínica

Cada clínica tem seus próprios dados, agenda, profissionais e sessão WhatsApp. O sistema é multi-tenant.

### Via painel (recomendado)

Acesse `https://app.SEU-DOMINIO.com/login` → clique em **Cadastrar nova clínica** → preencha o formulário.

### Via API

```bash
curl -X POST https://api.SEU-DOMINIO.com/auth/register-clinic \
  -H "Content-Type: application/json" \
  -d '{
    "clinicName": "Clínica Exemplo",
    "adminName": "Dr. Fulano",
    "email": "admin@exemplo.com",
    "password": "senha-forte-aqui",
    "phone": "+5511999999999"
  }'
```

**Após criar a clínica:**

1. Logue no painel com as credenciais criadas
2. **Configurações → Profissionais** — cadastre os profissionais com horários
3. **Configurações → Clínica** — defina horários de funcionamento
4. **WhatsApp** — conecte a instância Evolution (QR) ou vincule o Phone Number ID da Meta
5. **Configurações → Integrações** — conecte o Google Calendar (opcional)

---

## Estrutura do projeto

```
clinic-bot/
├── docker-compose.yml          # produção (Traefik + SSL automático)
├── docker-compose.dev.yml      # desenvolvimento local
├── .env.example                # template de variáveis — NUNCA commitar o .env real
├── traefik/
│   ├── traefik.yml
│   └── acme.json               # certificados SSL (deve ter chmod 600)
├── backend/
│   ├── Dockerfile
│   ├── prisma/schema.prisma    # schema do banco — editar aqui para mudar tabelas
│   └── src/
│       ├── server.ts           # entry point
│       ├── config/env.ts       # validação de variáveis de ambiente
│       ├── lib/                # prisma client, redis, logger, erros
│       ├── api/
│       │   ├── routes/         # appointments, auth, clients, professionals...
│       │   └── middlewares/    # auth JWT, rate limit
│       ├── whatsapp/           # Evolution API + Meta Cloud API + fallback logic
│       ├── ai/                 # Claude, prompts, orquestrador de intenções
│       ├── calendar/           # Google Calendar (OAuth, availability, booking)
│       ├── scheduler/          # bookAppointment, cancelAppointment, reschedule
│       └── jobs/               # BullMQ — lembretes, inatividade, backup
└── dashboard/                  # painel administrativo (Next.js 15)
    ├── Dockerfile
    └── src/
        ├── app/
        │   ├── login/          # página de login + cadastro de clínica
        │   └── dashboard/
        │       ├── appointments/   # agendamentos (lista + criação manual)
        │       ├── calendar/       # visão de calendário
        │       ├── conversations/  # histórico WhatsApp
        │       ├── patients/       # clientes/pacientes
        │       └── settings/       # configurações da clínica
        ├── lib/
        │   ├── api.ts          # todas as chamadas ao backend
        │   └── auth.ts         # hooks useAuth, useRegister, useClinic
        └── components/
            └── auth-guard.tsx  # proteção de rotas autenticadas
```

---

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha. Tabela resumida:

| Variável | Obrigatória | Descrição |
|----------|-------------|----------|
| `DOMAIN` | ✅ | Domínio base (ex: `clinica.com`) |
| `ACME_EMAIL` | ✅ | E-mail para certificados Let's Encrypt |
| `JWT_SECRET` | ✅ | Segredo JWT — gere com `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | ✅ | Senha do banco |
| `CRON_SECRET` | ✅ | Token do cron interno — gere com `openssl rand -hex 16` |
| `ANTHROPIC_API_KEY` | ✅ | Chave `sk-ant-...` da Anthropic |
| `CLAUDE_MODEL` | ✅ | Modelo Claude (padrão: `claude-sonnet-4-5`) |
| `EVOLUTION_API_KEY` | ✅ | Chave da Evolution API (qualquer string longa) |
| `EVOLUTION_WEBHOOK_TOKEN` | ✅ | Igual a `EVOLUTION_API_KEY` |
| `FRONTEND_URL` | ✅ | `https://app.seu-dominio.com` |
| `PUBLIC_API_URL` | ✅ | `https://api.seu-dominio.com` |
| `GOOGLE_CLIENT_ID` | ⬜ | OAuth Google Calendar |
| `GOOGLE_CLIENT_SECRET` | ⬜ | OAuth Google Calendar |
| `GOOGLE_REDIRECT_URI` | ⬜ | `https://api.seu-dominio.com/google/callback` |
| `WHATSAPP_TOKEN` | ⬜ | Token System User da Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | ⬜ | ID do número no painel Meta |
| `WHATSAPP_VERIFY_TOKEN` | ⬜ | Token de verificação do webhook Meta |

> `DATABASE_URL`, `REDIS_URL` e `EVOLUTION_API_URL` usam nomes de serviços Docker internos — **não alterar**.

---

## Troubleshooting

### Dashboard abre, mas todas as chamadas de API falham (401 ou rede)

**Causa:** O `NEXT_PUBLIC_API_URL` é injetado no bundle Next.js **em tempo de build**, não em runtime. Se o dashboard foi construído sem a variável correta, todas as requisições vão para `http://localhost:3000` (que não existe no navegador do usuário).

**Solução:** Rebuild obrigatório após qualquer mudança de domínio:
```bash
docker compose build dashboard --no-cache
docker compose up -d dashboard
```
Verifique se o `docker-compose.yml` tem:
```yaml
dashboard:
  build:
    args:
      NEXT_PUBLIC_API_URL: https://api.${DOMAIN}
```

---

### Login retorna 401 logo após o redirecionamento

**Causa:** O handler de 401 na API estava redirecionando para `/login` mesmo durante o próprio login (sem token ativo), criando um loop.

**Como verificar:** Abra o DevTools → Network → veja se `POST /auth/login` retorna 401 ou se é a requisição seguinte que falha.

**Solução:** Já corrigido no código (`api.ts` — verifica `hadToken` antes de redirecionar). Se o problema voltar, confirme que `dashboard/src/lib/api.ts` tem o interceptor de 401 com a guarda `hadToken`.

---

### Página em branco / hydration error no dashboard

**Causa:** O `AuthGuard` acessava `localStorage` direto no corpo do componente, causando mismatch SSR/client no Next.js 15.

**Solução:** Já corrigido (`auth-guard.tsx` usa `useState` + `useEffect`). Se aparecer de novo, verifique se alguém adicionou acesso a `localStorage`/`sessionStorage` fora de um `useEffect`.

---

### Traefik não emite certificado SSL

```bash
# 1. Verificar propagação DNS (deve retornar o IP do servidor)
dig api.SEU-DOMINIO.com

# 2. Verificar se as portas 80 e 443 estão abertas (no firewall da Hetzner e no SO)
curl http://api.SEU-DOMINIO.com/health

# 3. Ver logs do Traefik
docker compose logs traefik

# 4. Permissão do acme.json (obrigatório: 600)
ls -la traefik/acme.json
chmod 600 traefik/acme.json
```

> O Traefik **não emite** o certificado se as portas 80/443 estiverem bloqueadas. Verifique o painel de firewall da Hetzner.

---

### Container não sobe / sai com erro

```bash
# Ver logs do container com problema
docker compose logs backend
docker compose logs dashboard

# Verificar variáveis que o backend recebe
docker compose exec backend env | grep -E 'JWT|ANTHROPIC|DATABASE'

# Reiniciar um container específico
docker compose restart backend

# Rebuild completo de um serviço
docker compose build backend --no-cache
docker compose up -d backend
```

---

### IA não responde / responde texto puro em vez de ações

- Confirme que `ANTHROPIC_API_KEY` não é o placeholder (`PREENCHA_SUA_CHAVE_sk-ant-...`)
- Verifique o modelo: `CLAUDE_MODEL=claude-sonnet-4-5`
- Se o JSON de resposta estiver truncado, aumente `CLAUDE_MAX_TOKENS=2048`
- O orquestrador faz fallback para `REPLY` quando não consegue parsear o JSON — isso é normal em casos extremos, mas não deve ser frequente

```bash
# Ver logs da IA em tempo real
docker compose logs -f backend | grep -i 'claude\|anthropic\|ai'
```

---

### WhatsApp desconecta sozinho

- Isso é normal nas primeiras conexões do baileys (Evolution). Clique em **Reconectar** no painel.
- Se persistir, clique em **Desconectar** → escaneie o QR novamente.
- Para resetar a sessão de uma clínica específica:
  ```bash
  docker compose exec evolution rm -rf /evolution/instances/<clinicId>
  docker compose restart evolution
  ```

---

### Refresh token Google expirou

- App em modo **Testing** no Google: refresh tokens expiram em **7 dias**. Publique o app: **OAuth consent screen → Publish app**.
- No painel: **Configurações → Integrações → Desconectar** → conecte novamente.

---

### Banco de dados: erro de conexão ou migration pendente

```bash
# Ver se o Postgres está healthy
docker compose ps postgres

# Rodar migrations manualmente
docker compose exec backend npx prisma migrate deploy

# Acessar o banco diretamente
docker compose exec postgres psql -U clinic -d clinic_bot

# Ver tabelas
\dt
```

---

### Agendamento criado mas não aparece na lista

- Confirme que o `clinicId` do token JWT é o mesmo da criação (cada clínica só vê seus próprios dados)
- Verifique o status: agendamentos cancelados não aparecem na listagem padrão
- Confirme no banco:
  ```bash
  docker compose exec postgres psql -U clinic -d clinic_bot -c "SELECT id, status, source FROM \"Appointment\" ORDER BY \"dateTime\" DESC LIMIT 10;"
  ```

---

## Sobre o WhatsApp Cloud API

Esta aplicação usa a **WhatsApp Business Cloud API** — a API **oficial** da Meta.

**Vantagens:**

- Sem risco de banimento por uso de biblioteca não-oficial.
- Cobrança por conversa: quando o cliente inicia a conversa, você tem uma **janela gratuita de 24h** para responder — ideal para atendimento.
- Suporte oficial, webhooks confiáveis, sem necessidade de manter sessão/QR Code.

**Considerações:**

- Mensagens iniciadas pela empresa fora da janela de 24h precisam usar **templates** aprovados (cobrados por categoria).
- Em modo dev, só é possível enviar para números pré-aprovados na lista de testes. Para abrir ao público, publique o app na Meta.
- O número usado **não pode** estar logado no WhatsApp pessoal ou Business no celular ao mesmo tempo.

Veja a [documentação oficial](https://developers.facebook.com/docs/whatsapp/cloud-api) para detalhes de preços e políticas.

---

## Licença

MIT
