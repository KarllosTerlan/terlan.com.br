# TROUBLESHOOTING.md — Resolução de Problemas

## Agente não responde no WhatsApp

**1. Verificar se a instância Evolution está conectada**
```bash
docker compose logs evolution | tail -30
# Procurar por "open" no status da conexão
```
Acesse o painel → Configurações → WhatsApp para ver o status e reescanear o QR Code.

**2. Verificar se o webhook está configurado corretamente**
```bash
curl https://api.seudominio.com/health
# Deve retornar { "status": "ok" }
```

**3. Verificar filas BullMQ (mensagens travadas)**
```bash
docker compose logs backend | grep "error\|Error" | tail -20
```

**4. Verificar Observabilidade no painel**
→ Dashboard → Configurações → Observabilidade → filtrar por ERROR nas últimas 24h

---

## Erro "JWT inválido" no dashboard

- Verifique se o `JWT_SECRET` no `.env` é o mesmo que estava quando o token foi gerado
- Se alterou o JWT_SECRET, todos os usuários precisam fazer login novamente
- Verifique se `FRONTEND_URL` aponta para a URL correta do dashboard

---

## Agendamentos não aparecem no Google Calendar

**1. Verificar conexão**
→ Dashboard → Configurações → Google Calendar

**2. Verificar logs**
```bash
docker compose logs backend | grep "google\|calendar" | tail -20
```

**3. Reconectar**
- Desconecte e reconecte o Google Calendar no painel
- Certifique-se de que `GOOGLE_REDIRECT_URI` no `.env` aponta para a URL correta

---

## Banco de dados não conecta

```bash
# Verificar se Postgres está rodando
docker compose ps postgres

# Verificar logs
docker compose logs postgres | tail -20

# Testar conexão
docker compose exec postgres pg_isready -U clinicbot
```

---

## Migração do Prisma falha

```bash
# Ver erro detalhado
docker compose exec backend npm run prisma:deploy

# Gerar migration nova (em desenvolvimento)
docker compose exec backend npm run prisma:migrate -- --name <nome_da_migration>

# Resetar banco (CUIDADO: apaga todos os dados)
docker compose exec backend npm run prisma:reset
```

---

## Container `cron` não envia lembretes

```bash
# Verificar logs do cron
docker compose logs cron | tail -20

# Verificar se CRON_SECRET está correto
echo $CRON_SECRET

# Testar manualmente
curl -X POST https://api.seudominio.com/cron/reminders \
  -H "x-cron-token: <CRON_SECRET>"
```

---

## Dashboard não carrega (Next.js)

```bash
# Ver logs
docker compose logs dashboard | tail -30

# Rebuild
docker compose up -d --build dashboard
```

Verifique se `NEXT_PUBLIC_API_URL` no docker-compose.yml aponta para a URL correta da API.

---

## Erro "Slot not available" ao agendar

O agente retornou que o horário não está disponível. Possíveis causas:
1. Não há WorkingHours configurado para aquele dia da semana
2. Existe uma ScheduleException bloqueando aquele dia
3. Já existe agendamento naquele horário

→ Dashboard → Configurações → Horários para verificar configuração

---

## Mensagem travada (agente não responde depois de certo tempo)

O Redis mutex expira após 25 segundos. Se uma mensagem ficar travada:
```bash
# Limpar lock manualmente (substituir phone e clinicId)
docker compose exec redis redis-cli DEL "lock:agent:<clinicId>:<phone>"
```

---

## Performance degradada

```bash
# Ver uso de recursos
docker stats

# Ver conexões ativas no Postgres
docker compose exec postgres psql -U clinicbot -c "SELECT count(*) FROM pg_stat_activity;"

# Ver tamanho do banco
docker compose exec postgres psql -U clinicbot -c "SELECT pg_size_pretty(pg_database_size('clinicbot'));"
```

Se os logs estão crescendo muito, configure retenção menor:
→ Dashboard → Configurações → Observabilidade → ajustar retenção

---

## Erros comuns por código

| Erro | Causa | Solução |
|------|-------|---------|
| `P2002` (Prisma) | Violação de unique constraint | Dado duplicado — verificar campos únicos |
| `ECONNREFUSED` | Serviço interno não responde | Verificar `docker compose ps` |
| `429 Too Many Requests` | Rate limit atingido | Aguardar janela de tempo ou aumentar limite |
| `ENOTFOUND evolution` | DNS interno Docker falhou | `docker compose restart` |
| `Invalid API key` | Chave Anthropic/Evolution errada | Verificar `.env` |

---

## Logs úteis

```bash
# Todos os logs juntos
docker compose logs -f --tail=50

# Só erros no backend
docker compose logs backend 2>&1 | grep "ERROR\|Error\|error"

# Logs do agente em tempo real
docker compose logs -f backend | grep "agent\|Agent\|claude"

# Limpeza de espaço em disco (containers parados, imagens antigas)
docker system prune -f
```
