#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/socialalsamos}"
SANDBOX_DIR="$APP_DIR/sandbox/server"

if ! command -v docker >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y docker.io docker-compose-plugin
  sudo systemctl enable --now docker
fi

cd "$SANDBOX_DIR"

sudo docker build -f runner.Dockerfile -t alsamos-ai-runner:latest .

if [ ! -f .sandbox_api_key ]; then
  umask 077
  openssl rand -hex 32 > .sandbox_api_key
fi

printf 'SANDBOX_API_KEY=%s\n' "$(cat .sandbox_api_key)" > .env
sudo docker compose up -d --build

echo "SANDBOX_API_KEY=$(cat .sandbox_api_key)"
echo "SANDBOX_LOCAL_URL=http://127.0.0.1:8787"
curl -fsS http://127.0.0.1:8787/health
echo
