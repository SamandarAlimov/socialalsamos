# Alsamos AI Sandbox

This service runs short AI-requested code snippets inside disposable Docker
containers. It is designed for the Ubuntu sandbox host and should be called only
from Supabase Edge Functions with `SANDBOX_API_URL` and `SANDBOX_API_KEY`.

## Server Setup

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin git nginx certbot python3-certbot-nginx
sudo systemctl enable --now docker

git clone https://github.com/SamandarAlimov/socialalsamos.git
cd socialalsamos/sandbox/server

sudo docker build -f runner.Dockerfile -t alsamos-ai-runner:latest .
openssl rand -hex 32 > .sandbox_api_key
printf 'SANDBOX_API_KEY=%s\n' "$(cat .sandbox_api_key)" > .env
sudo docker compose up -d --build
```

## Local Smoke Test

```bash
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/run \
  -H "Authorization: Bearer $(cat .sandbox_api_key)" \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(2 + 2)"}'
```

## Supabase Secrets

Expose the service behind HTTPS, then set:

```bash
supabase secrets set SANDBOX_API_URL=https://sandbox.example.com
supabase secrets set SANDBOX_API_KEY="$(cat .sandbox_api_key)"
supabase functions deploy ai-agent
supabase functions deploy code-sandbox
```
