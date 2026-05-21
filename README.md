# Clinic Bot

Sistema multi-tenant de agendamento inteligente para clínicas, com atendimento automático via WhatsApp e IA (Anthropic Claude), integração com Google Calendar e painel administrativo em React.

**Stack:** Node.js 20 + TypeScript + Fastify + Prisma + PostgreSQL 16 + Redis + BullMQ + Evolution API (self-hosted, primário) + WhatsApp Cloud API / Meta (fallback oficial) + Claude + Google Calendar + React 18 + Vite + TailwindCSS + Docker + Traefik v3.

---

## Sumário

- [Pré-requisitos](#pré-requisitos)
- [Configurar Google Calendar API](#configurar-google-calendar-api)
- [Configurar Claude API (Anthropic)](#configurar-claude-api-anthropic)
- [Rodar localmente (dev)](#rodar-localmente-dev)
- [Deploy na Hetzner (produção)](#deploy-na-hetzner-produção)
- [Conectar o WhatsApp (Meta Cloud API)](#conectar-o-whatsapp-meta-cloud-api)
- [Adicionar uma nova clínica](#adicionar-uma-nova-clínica)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Troubleshooting](#troubleshooting)
- [Sobre o WhatsApp Cloud API](#sobre-o-whatsapp-cloud-api)

---

## Pré-requisitos

- Docker 24+ e Docker Compose v2
- (Local opcional) Node.js 20+ se quiser rodar fora de container
- Conta Google Cloud (para OAuth do Google Calendar)
- Chave da API Anthropic (https://console.anthropic.com)
- Domínio próprio (apenas para produção) com DNS apontando para o servidor

---

## Configurar Google Calendar API

1. Acesse https://console.cloud.google.com e crie um projeto (ou use um existente).
2. **APIs & Services → Library** → habilite **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
   - User Type: **External**.
   - Preencha nome do app, e-mail de suporte, e domínio autorizado.
   - Em **Scopes**, adicione `https://www.googleapis.com/auth/calendar`.
   - Publique o app (deixe em "Testing" enquanto não publicado, mas adicione e-mails de teste — caso contrário o refresh token expira em 7 dias).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URIs:
     - Produção: `https://api.SEU-DOMINIO.com/google/callback`
     - Dev local: `http://localhost:3000/google/callback`
5. Copie `Client ID` e `Client Secret` para o `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://api.SEU-DOMINIO.com/google/callback
   ```

> O fluxo de autorização por clínica é feito pelo painel: **Configurações → Integrações → Conectar Google**.

---

## Configurar Claude API (Anthropic)

1. Crie uma conta em https://console.anthropic.com.
2. Em **API Keys**, gere uma chave (`sk-ant-...`).
3. No `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   CLAUDE_MODEL=claude-sonnet-4-5     # opções: claude-haiku-4-5 | claude-sonnet-4-5 | claude-opus-4-5-20250929
   CLAUDE_MAX_TOKENS=1024
   ```

**Recomendação:** `claude-sonnet-4-5` oferece o melhor custo-benefício para o caso de uso de recepcionista. Use `claude-haiku-4-5` se o volume for muito alto.

---

## Rodar localmente (dev)

```bash
cp .env.example .env
# edite .env com as chaves Anthropic e Google

docker compose -f docker-compose.dev.yml up -d
```

Serviços expostos:

- API: http://localhost:3000
- Frontend: http://localhost:5173
- PostgreSQL: localhost:5432 (user/pass do .env)
- Redis: localhost:6379

Para acompanhar logs:

```bash
docker compose -f docker-compose.dev.yml logs -f backend
```

Para acessar o banco:

```bash
docker exec -it clinic-postgres-dev psql -U clinic -d clinic_bot
```

---

## Deploy na Hetzner (produção)

### 1. Provisione o servidor

- Crie uma VPS Ubuntu 22.04+ (CX21 ou superior recomendado).
- Aponte o DNS A dos subdomínios para o IP do servidor:
  - `api.SEU-DOMINIO.com → IP`
  - `app.SEU-DOMINIO.com → IP`

### 2. Instale Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### 3. Clone o projeto

```bash
git clone <seu-repo> clinic-bot
cd clinic-bot
```

### 4. Configure variáveis

```bash
cp .env.example .env
nano .env
```

Preencha **obrigatoriamente**:

- `DOMAIN` (ex.: `clinica.com`)
- `ACME_EMAIL`
- `JWT_SECRET` (gere uma string longa: `openssl rand -hex 32`)
- `POSTGRES_PASSWORD`
- `ANTHROPIC_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `FRONTEND_URL`, `VITE_API_URL`

### 5. Prepare o Traefik

```bash
chmod 600 traefik/acme.json
```

### 6. Suba os serviços

```bash
docker compose up -d
```

O Traefik solicita os certificados Let's Encrypt automaticamente. Aguarde 1-2 min na primeira subida.

### 7. Verifique

```bash
docker compose ps
docker compose logs -f backend
curl https://api.SEU-DOMINIO.com/health
```

Acesse `https://app.SEU-DOMINIO.com` e clique em **Cadastrar nova clínica**.

---

## Conectar o WhatsApp (Meta Cloud API)

O projeto suporta **dois providers** de WhatsApp em paralelo, com **fallback automático**:

| Provider | Tipo | Uso | Conexão |
|----------|------|-----|---------|
| **Evolution API** | self-hosted (baileys) | primário | QR Code (1 instância por clínica) |
| **Meta Cloud API** | oficial Meta | fallback automático | Phone Number ID + token permanente |

Quando o backend precisa enviar uma mensagem, ele tenta primeiro a Evolution. Se a instância estiver desconectada **ou** o envio falhar, ele cai automaticamente na Meta. Cada tentativa é registrada na tabela `MessageLog` (`provider`, `ok`, `error`, `fallback`).

### A) Conectar via Evolution API (recomendado para começar)

A imagem `atendai/evolution-api:latest` já está incluída no `docker-compose` e roda lado a lado com o backend. Apenas:

1. Defina `EVOLUTION_API_KEY` no `.env` (qualquer string longa e aleatória).
2. Suba os containers: `docker compose -f docker-compose.dev.yml up -d`.
3. No painel (`/whatsapp`), clique em **Criar instância e gerar QR**.
4. Escaneie o QR no celular: WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho.
5. O status muda para **conectado** e o badge no topo mostra `Evolution ✅ ativa`.

> O webhook é configurado automaticamente pelo backend ao criar a instância, apontando para `PUBLIC_API_URL/webhook/evolution`.

### B) Configurar a Meta Cloud API (fallback)

1. Acesse [developers.facebook.com](https://developers.facebook.com/) e faça login com sua conta Facebook Business.
2. Clique em **My Apps** → **Create App** → selecione **Business** como tipo.
3. Dê um nome ao app (ex: `Clinic Bot`) e finalize a criação.
4. No painel do app, adicione o produto **WhatsApp** → **Set up**.
5. A Meta cria automaticamente uma **WhatsApp Business Account (WABA)** de teste com um número sandbox e um `Phone Number ID`.

### 2. Obter o Phone Number ID e o token temporário

Em **WhatsApp → API Setup** você verá:

- **Phone Number ID** (ex: `123456789012345`) → vai em `WHATSAPP_PHONE_NUMBER_ID`.
- **WhatsApp Business Account ID** (opcional) → vai em `WHATSAPP_BUSINESS_ACCOUNT_ID`.
- **Temporary access token** (24h, só para testes).

Para testar agora, adicione seu próprio celular em **Add phone number** (aparecerá logo abaixo dos números recipientes permitidos). Mensagens só podem ser enviadas para números nessa lista enquanto o app estiver em modo dev.

### 3. Gerar token PERMANENTE (System User)

O token temporário expira em 24h. Para produção use um **System User token**:

1. Vá em [business.facebook.com/settings](https://business.facebook.com/settings/) → **Users → System Users**.
2. Clique **Add** → crie um System User (role: Admin).
3. Em **Assigned Assets**, atribua seu App e sua WABA (Full Control).
4. Clique **Generate New Token** → selecione o app → marque os escopos `whatsapp_business_messaging` e `whatsapp_business_management` → expiração **Never**.
5. Copie o token e coloque em `WHATSAPP_TOKEN` no `.env` (não aparece de novo).

### 4. Configurar o Webhook

Ainda no painel do app, **WhatsApp → Configuration → Webhook → Edit**:

- **Callback URL:** `https://api.SEU-DOMINIO.com/webhook/meta` (ex: `https://api.terlan.com.br/webhook/meta`).
- **Verify Token:** o mesmo valor que você colocou em `WHATSAPP_VERIFY_TOKEN` no `.env` (pode ser qualquer string que você escolher).
- Clique **Verify and Save**. A Meta fará um `GET` na sua URL; o backend responde com o `hub.challenge`.
- Em **Webhook fields**, clique **Manage** e inscreva-se no campo **`messages`**.

O valor exato da URL e do Verify Token também é exibido no painel da clínica em **WhatsApp**, com botão de copiar.

### 5. (Produção) Adicionar número real

Para substituir o número sandbox por um número comercial real:

1. **WhatsApp → Phone Numbers → Add phone number**.
2. Forneça um número que **não** esteja vinculado a nenhuma conta WhatsApp pessoal/Business no celular.
3. Verifique via SMS ou ligação.
4. Defina **Display Name** (precisa de aprovação da Meta) e país.
5. Copie o novo **Phone Number ID** desse número.

### 6. Vincular a clínica ao número

1. Logue no painel (`https://app.SEU-DOMINIO.com`).
2. Vá em **WhatsApp** na barra lateral.
3. No card **Meta Cloud API**, cole o **Phone Number ID** e clique **Vincular**.
4. Pronto — toda mensagem enviada recairá na Meta se a Evolution estiver fora.

> Você pode escolher qual provider é o **preferencial** (botão "Tornar preferencial" em cada card). O outro vira fallback automático.

### Verificação rápida

```bash
# 1. Webhook respondendo ao verify challenge:
curl "https://api.SEU-DOMINIO.com/webhook/meta?hub.mode=subscribe&hub.verify_token=SEU_VERIFY_TOKEN&hub.challenge=teste123"
# deve retornar: teste123

# 2. Envio de teste pela própria API (autenticado):
curl -X POST https://api.SEU-DOMINIO.com/whatsapp/test \
  -H "Authorization: Bearer SEU_JWT" \
  -H "Content-Type: application/json" \
  -d '{"to":"5511999999999","text":"olá do clinic-bot"}'
```

---

## Adicionar uma nova clínica

### Via painel (recomendado)

Acesse `https://app.SEU-DOMINIO.com/login`, clique em **Cadastrar nova clínica** e preencha o formulário. Cada clínica fica completamente isolada (dados, agenda, sessão WhatsApp).

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

Depois:

1. Logue no painel com essas credenciais.
2. Cadastre profissionais em **Configurações → Profissionais**.
3. Defina horários de funcionamento em **Configurações → Clínica**.
4. Conecte o Google Calendar em **Configurações → Integrações**.
5. Conecte o WhatsApp em **WhatsApp** (vincule o Phone Number ID da Meta).

---

## Estrutura do projeto

```
clinic-bot/
├── docker-compose.yml          # produção (Traefik + SSL)
├── docker-compose.dev.yml      # desenvolvimento local
├── .env.example
├── traefik/
│   ├── traefik.yml
│   └── acme.json
├── backend/
│   ├── Dockerfile
│   ├── prisma/schema.prisma
│   └── src/
│       ├── server.ts
│       ├── config/env.ts
│       ├── lib/                # prisma, redis, logger, errors, retry
│       ├── api/                # rotas + middlewares
│       ├── whatsapp/           # Meta Cloud API client + queue worker
│       ├── ai/                 # Claude + prompt + orchestrator
│       ├── calendar/           # Google Calendar (auth/availability/booking)
│       ├── scheduler/          # booking + notifications
│       └── jobs/               # reminder + cleanup (BullMQ)
└── frontend/
    ├── Dockerfile
    └── src/
        ├── main.tsx, App.tsx
        ├── components/Layout.tsx
        ├── pages/              # Login, Dashboard, Appointments, Calendar,
        │                       # Conversations, WhatsAppSetup, Settings
        └── services/api.ts
```

---

## Troubleshooting

### O Traefik não emite certificado
- Verifique se DNS A está propagado: `dig api.SEU-DOMINIO.com`.
- Verifique se as portas 80 e 443 estão abertas no firewall da Hetzner.
- Confira `docker compose logs traefik`.
- Garanta `chmod 600 traefik/acme.json`.

### WhatsApp desconecta sozinho
- Normal nas primeiras conexões. Clique em **Reconectar**.
- Se persistir, clique em **Desconectar** e escaneie o QR novamente.
- Sessões são persistidas em `wa_sessions` (volume Docker). Para resetar uma clínica:
  ```bash
  docker exec clinic-backend rm -rf /app/sessions/<clinicId>
  ```

### IA respondendo em texto, não em JSON
- Verifique o modelo configurado em `CLAUDE_MODEL`.
- O orquestrador faz fallback para `REPLY` se o parse falhar, mas isso pode comer ações de agendamento.
- Aumente `CLAUDE_MAX_TOKENS` se o JSON estiver sendo truncado.

### Refresh token Google expirou
- Se o app Google está em **Testing**, refresh tokens expiram em 7 dias. Publique o app em produção (OAuth consent screen → Publish app).
- Em **Configurações → Integrações**, clique em **Desconectar** e reconecte.

### Erro `EACCES` no acme.json
```bash
chmod 600 traefik/acme.json
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
