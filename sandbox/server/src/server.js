import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const port = Number(process.env.PORT || 8787);
const apiKey = process.env.SANDBOX_API_KEY;
const image = process.env.SANDBOX_IMAGE || 'alsamos-ai-runner:latest';
const maxCodeBytes = 128 * 1024;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method !== 'POST' || req.url !== '/run') {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    if (!apiKey || req.headers.authorization !== `Bearer ${apiKey}`) {
      sendJson(res, 401, { error: 'Unauthorized' });
      return;
    }

    const body = await readJsonBody(req);
    const language = String(body?.language || 'javascript').toLowerCase();
    const code = String(body?.code || '');
    const stdin = String(body?.stdin || '');
    const timeoutMs = Math.min(Math.max(Number(body?.timeoutMs || 15000), 1000), 30000);

    if (!code.trim()) {
      sendJson(res, 400, { error: 'Code is required' });
      return;
    }
    if (Buffer.byteLength(code, 'utf8') > maxCodeBytes) {
      sendJson(res, 413, { error: 'Code is too large' });
      return;
    }

    const spec = commandFor(language);
    if (!spec) {
      sendJson(res, 400, { error: `Unsupported language: ${language}` });
      return;
    }

    const runId = crypto.randomUUID();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `alsamos-sandbox-${runId}-`));

    try {
      await fs.writeFile(path.join(tmpDir, spec.file), code, 'utf8');
      const result = await runDocker(tmpDir, spec, stdin, timeoutMs);
      sendJson(res, 200, { id: runId, language, ...result });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString('utf8');
      if (Buffer.byteLength(body, 'utf8') > 256 * 1024) {
        req.destroy(new Error('Request body is too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function commandFor(language) {
  switch (language) {
    case 'javascript':
    case 'js':
    case 'jsx':
      return { file: 'main.js', command: ['node', '/workspace/main.js'] };
    case 'typescript':
    case 'ts':
    case 'tsx':
      return { file: 'main.ts', command: ['tsx', '/workspace/main.ts'] };
    case 'python':
    case 'py':
      return { file: 'main.py', command: ['python3', '/workspace/main.py'] };
    case 'bash':
    case 'sh':
    case 'shell':
      return { file: 'main.sh', command: ['bash', '/workspace/main.sh'] };
    default:
      return null;
  }
}

function runDocker(tmpDir, spec, stdin, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = [
      'run',
      '--rm',
      '--network', 'none',
      '--memory', '256m',
      '--cpus', '1',
      '--pids-limit', '128',
      '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
      '-v', `${tmpDir}:/workspace:ro`,
      image,
      ...spec.command,
    ];

    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout = appendLimited(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendLimited(stderr, chunk);
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });

    child.stdin.end(stdin);
  });
}

function appendLimited(current, chunk) {
  const next = current + chunk.toString('utf8');
  return next.length > 24000 ? next.slice(next.length - 24000) : next;
}

server.listen(port, () => {
  console.log(`Alsamos AI sandbox listening on ${port}`);
});
