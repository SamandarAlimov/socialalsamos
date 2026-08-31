#!/usr/bin/env node
/**
 * Alsamos Bridge - lokal kompyuter agenti.
 *
 * Faqat foydalanuvchi TASDIQLAGAN (`status = 'approved'`) vazifalarni bajaradi.
 * Kontrakt: docs/AI_PLATFORM_SPEC.md va docs/ALSAMOS_BRIDGE.md (v1.0.0).
 */
import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const CONTRACT_VERSION = '1.0.0';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const EMAIL = process.env.ALSAMOS_EMAIL;
const PASSWORD = process.env.ALSAMOS_PASSWORD;
const ROOT = path.resolve(process.env.ALSAMOS_BRIDGE_ROOT || path.join(os.homedir(), 'Alsamos'));
const ALLOW_SHELL = process.env.ALSAMOS_BRIDGE_ALLOW_SHELL === '1';
const POLL_MS = Number(process.env.ALSAMOS_BRIDGE_POLL_MS || 3000);
const DEVICE_NAME = process.env.ALSAMOS_BRIDGE_DEVICE || os.hostname();

const ACTION_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_CHARS = 16_000;
const MAX_READ_BYTES = 512 * 1024;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !EMAIL || !PASSWORD) {
  console.error('[bridge] SUPABASE_URL, SUPABASE_ANON_KEY, ALSAMOS_EMAIL, ALSAMOS_PASSWORD kerak.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: true },
});

const clip = (value) => {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.length > MAX_OUTPUT_CHARS ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n…[qisqartirildi]` : text;
};

/** Yo'lni ROOT ichida ushlab turadi (path traversal himoyasi). */
const safePath = (input) => {
  const target = path.resolve(ROOT, input ?? '.');
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (target !== ROOT && !target.startsWith(rootWithSep)) {
    throw new Error(`Ruxsat etilmagan yo'l: ${input}`);
  }
  return target;
};

const run = (command, cwd) =>
  new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: ACTION_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: clip(stdout),
          stderr: clip(stderr),
          code: error?.code ?? 0,
          error: error ? error.message : undefined,
        });
      },
    );
  });

const openCommand = (target) => {
  const quoted = JSON.stringify(target);
  if (process.platform === 'darwin') return `open ${quoted}`;
  if (process.platform === 'win32') return `start "" ${quoted}`;
  return `xdg-open ${quoted}`;
};

async function execute(task) {
  const payload = task.payload ?? {};

  switch (task.action) {
    case 'list_dir': {
      const dir = safePath(payload.path);
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const items = [];
      for (const entry of entries.slice(0, 500)) {
        let size = null;
        try {
          const stat = await fs.stat(path.join(dir, entry.name));
          size = stat.size;
        } catch {
          /* o'tkazib yuboramiz */
        }
        items.push({ name: entry.name, type: entry.isDirectory() ? 'dir' : 'file', size });
      }
      return { ok: true, data: { path: dir, entries: items } };
    }

    case 'read_file': {
      const file = safePath(payload.path);
      const stat = await fs.stat(file);
      if (stat.size > MAX_READ_BYTES) throw new Error('Fayl juda katta (512KB limit)');
      const content = await fs.readFile(file, 'utf8');
      return { ok: true, data: { path: file, size: stat.size, content: clip(content) } };
    }

    case 'write_file': {
      const file = safePath(payload.path);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, String(payload.content ?? ''), 'utf8');
      return { ok: true, data: { path: file, bytes: Buffer.byteLength(String(payload.content ?? '')) } };
    }

    case 'open': {
      const target = payload.target ?? payload.path ?? '';
      if (!target) throw new Error('target kerak');
      const result = await run(openCommand(target), ROOT);
      return { ok: result.ok, data: result };
    }

    case 'shell': {
      if (!ALLOW_SHELL) throw new Error("shell amali o'chirilgan (ALSAMOS_BRIDGE_ALLOW_SHELL=1 qiling)");
      const command = payload.command;
      if (!command || typeof command !== 'string') throw new Error('command kerak');
      const cwd = payload.cwd ? safePath(payload.cwd) : ROOT;
      const result = await run(command, cwd);
      return { ok: result.ok, data: result };
    }

    case 'screenshot':
    case 'click':
    case 'type_text':
    case 'key':
      throw new Error(`"${task.action}" amali bu Bridge versiyasida qo'llanmaydi`);

    default:
      throw new Error(`Noma'lum amal: ${task.action}`);
  }
}

async function registerDevice(userId) {
  const { data, error } = await supabase
    .from('ai_devices')
    .upsert(
      {
        user_id: userId,
        name: DEVICE_NAME,
        platform: `${process.platform}-${process.arch}`,
        agent_version: CONTRACT_VERSION,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,name' },
    )
    .select()
    .maybeSingle();

  if (error) console.warn('[bridge] qurilmani ro\u2019yxatga olish ogohlantirishi:', error.message);
  return data?.id ?? null;
}

async function claimNext(userId) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('ai_computer_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) throw error;
  const task = data?.[0];
  if (!task) return null;

  // Optimistik qulflash: faqat hali `approved` bo'lsa egallaymiz.
  const { data: claimed, error: claimError } = await supabase
    .from('ai_computer_tasks')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', task.id)
    .eq('status', 'approved')
    .select()
    .maybeSingle();

  if (claimError) throw claimError;
  return claimed ?? null;
}

async function finish(task, outcome) {
  const patch = outcome.ok
    ? { status: 'done', result: outcome.data ?? null, error: null }
    : { status: 'failed', error: outcome.error ?? 'Xatolik', result: outcome.data ?? null };

  const { error } = await supabase
    .from('ai_computer_tasks')
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq('id', task.id);

  if (error) console.error('[bridge] natijani yozishda xatolik:', error.message);
}

async function main() {
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  });
  if (authError || !auth?.user) {
    console.error('[bridge] kirish muvaffaqiyatsiz:', authError?.message);
    process.exit(1);
  }

  const userId = auth.user.id;
  await fs.mkdir(ROOT, { recursive: true });
  await registerDevice(userId);

  console.log(`[bridge] v${CONTRACT_VERSION} ishga tushdi`);
  console.log(`[bridge] qurilma: ${DEVICE_NAME}`);
  console.log(`[bridge] ildiz papka: ${ROOT}`);
  console.log(`[bridge] shell: ${ALLOW_SHELL ? 'yoqilgan' : "o'chirilgan"}`);

  let heartbeat = 0;
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
    console.log('\n[bridge] to\u2019xtatilmoqda…');
  });

  while (!stopping) {
    try {
      const task = await claimNext(userId);
      if (task) {
        console.log(`[bridge] vazifa: ${task.action} (${task.id})`);
        try {
          const outcome = await execute(task);
          await finish(task, outcome);
          console.log(`[bridge] bajarildi: ${task.action}`);
        } catch (error) {
          await finish(task, { ok: false, error: error?.message ?? String(error) });
          console.warn(`[bridge] xatolik: ${error?.message ?? error}`);
        }
        continue; // navbat bo'sh bo'lmasa darhol keyingisiga o'tamiz
      }

      if (++heartbeat % 20 === 0) await registerDevice(userId);
    } catch (error) {
      console.error('[bridge] navbat xatosi:', error?.message ?? error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  await supabase.auth.signOut();
  process.exit(0);
}

main().catch((error) => {
  console.error('[bridge] halokatli xatolik:', error);
  process.exit(1);
});
