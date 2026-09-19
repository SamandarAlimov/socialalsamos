# Alsamos AI Sandbox

This service runs short AI-requested code snippets inside disposable Docker
containers. It is designed for the Ubuntu sandbox host and should be called only
from Supabase Edge Functions with `SANDBOX_API_URL` and `SANDBOX_API_KEY`.

The runner has a writable **temporary** `/workspace` but the container root
filesystem remains read-only and networking remains disabled. Code can create
downloadable deliverables only inside `/workspace/outputs`. The server collects
up to 8 supported files (20 MB total) and removes the entire workspace after the
request.

Supported generated files: `.xlsx`, `.docx`, `.pptx`, `.pdf`, `.csv`,
`.md`, `.txt`, and `.json`. Python includes `openpyxl`, `python-docx`,
`python-pptx`, and `reportlab`.

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

curl -s http://127.0.0.1:8787/run \
  -H "Authorization: Bearer $(cat .sandbox_api_key)" \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"from openpyxl import Workbook\nwb=Workbook()\nws=wb.active\nws.append([\"Name\",\"Value\"])\nws.append([\"Alsamos\",42])\nwb.save(\"/workspace/outputs/demo.xlsx\")\nprint(\"done\")"}'
```

The second response should include a `files` array with `demo.xlsx` as base64.
The Supabase AI tool uploads that payload into the private
`ai-generated-files` bucket and strips the base64 before streaming the tool
result to the browser.

## Supabase Secrets

Expose the service behind HTTPS, then set:

```bash
supabase secrets set SANDBOX_API_URL=https://sandbox.example.com
supabase secrets set SANDBOX_API_KEY="$(cat .sandbox_api_key)"
supabase functions deploy ai-agent
supabase functions deploy ai-agent-worker
supabase functions deploy code-sandbox
```
