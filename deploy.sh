#!/usr/bin/env bash
# deploy.sh — executa no servidor em /opt/terlan
set -euo pipefail

COMPOSE="docker compose -f docker-compose.server.yml"

echo "==> Pulling latest code..."
git pull origin main

echo "==> Building images..."
$COMPOSE build --no-cache

echo "==> Starting services..."
$COMPOSE up -d

echo "==> Waiting for backend..."
sleep 10
docker logs --tail 30 clinic-backend

echo "==> Done! URLs:"
echo "    Frontend: https://app.terlan.com.br"
echo "    API:      https://api.terlan.com.br"
