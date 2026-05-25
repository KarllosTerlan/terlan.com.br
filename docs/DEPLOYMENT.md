# DEPLOYMENT.md — Guia de Implantação

## Pré-requisitos

- VPS com mínimo 2 vCPU / 4 GB RAM (recomendado 4 vCPU / 8 GB)
- Sistema Operacional: Ubuntu 22.04 LTS
- Docker 24+ e Docker Compose v2+
- Domínio com DNS apontando para o servidor:
  - `api.seudominio.com` → IP do servidor
  - `app.seudominio.com` → IP do servidor

## 1. Preparação do Servidor

```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Instalar Docker Compose v2
sudo apt install docker-compose-plugin -y

# Verificar
docker --version
docker compose version
```

## 2. Clonar e Configurar

```bash
# Clonar repositório
git clone <URL_DO_REPO> clinicbot
cd clinicbot

# Criar arquivo de configuração
cp .env.example .env
nano .env
```

### Variáveis obrigatórias no `.env`

```bash
# Domínio
DOMAIN=seudominio.com
ACME_EMAIL=seu@email.com

# Banco de dados
POSTGRES_USER=clinicbot
POSTGRES_PASSWORD=<senha_forte_aleatória>
POSTGRES_DB=clinicbot
DATABASE_URL=postgresql://clinicbot:<senha>@postgres:5432/clinicbot?schema=public

# Redis
REDIS_URL=redis://redis:6379

# Segurança
JWT_SECRET=<string_aleatória_64_chars>
CRON_SECRET=<string_aleatória_32_chars>
EVOLUTION_WEBHOOK_TOKEN=<string_aleatória_32_chars>

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Evolution API
EVOLUTION_API_KEY=<string_aleatória_32_chars>
EVOLUTION_API_URL=http://evolution:8080

# Google OAuth (opcional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.seudominio.com/google/callback

# WhatsApp Meta (opcional, se não usar Evolution)
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
```

## 3. Preparar Traefik

```bash
# Criar arquivo de certificados (obrigatório ter permissão 600)
mkdir -p traefik
touch traefik/acme.json
chmod 600 traefik/acme.json
```

## 4. Deploy

```bash
# Build e start completo
docker compose up -d --build

# Aguardar serviços subirem (~2min)
docker compose ps

# Acompanhar logs
docker compose logs -f backend
```

## 5. Banco de Dados (Primeira Vez)

```bash
# Executar migrações do Prisma
docker compose exec backend npm run prisma:deploy

# (Opcional) Abrir Prisma Studio para visualizar dados
docker compose exec backend npm run prisma:studio -- --port 5555
```

## 6. Criar Primeira Clínica

```bash
# Via Prisma Studio ou diretamente no banco:
docker compose exec postgres psql -U clinicbot -d clinicbot -c "
INSERT INTO \"User\" (id, email, password, role, clinic_id, created_at)
  VALUES (gen_random_uuid(), 'admin@clinica.com', crypt('senha123', gen_salt('bf')), 'ADMIN', NULL, now());
"
```

Ou use o endpoint `POST /auth/register` (se habilitado no ambiente de setup).

## 7. Configurar WhatsApp (Evolution API)

```bash
# 1. Acessar Evolution API (autenticar com EVOLUTION_API_KEY):
curl -s https://api.seudominio.com/evolution-api/instance/create \
  -H "apikey: <EVOLUTION_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "clinica1", "qrcode": true}'

# 2. Pegar QR Code e escanear com WhatsApp

# 3. Configurar webhook da instância para o backend:
curl -s https://api.seudominio.com/evolution-api/webhook/set/clinica1 \
  -H "apikey: <EVOLUTION_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.seudominio.com/webhook/evolution",
    "webhook_by_events": false,
    "events": ["MESSAGES_UPSERT", "CONNECTION_UPDATE"]
  }'
```

## 8. Verificar Deploy

```bash
# Health check backend
curl https://api.seudominio.com/health

# Dashboard
open https://app.seudominio.com
```

## Atualizações

```bash
git pull origin main
docker compose up -d --build
docker compose exec backend npm run prisma:deploy
```

## Monitoramento

```bash
# Logs em tempo real
docker compose logs -f

# Status dos containers
docker compose ps

# Uso de recursos
docker stats

# Ver erros recentes no painel
# → Dashboard → Configurações → Observabilidade
```

## Backup Manual

```bash
# Via API
curl -X POST https://api.seudominio.com/backup/trigger \
  -H "Authorization: Bearer <JWT_TOKEN>"

# Direto no banco
docker compose exec postgres pg_dump -U clinicbot clinicbot > backup_$(date +%Y%m%d).sql
```
