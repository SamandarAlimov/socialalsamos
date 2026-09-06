// Run with the path to an externally installed @electric-sql/pglite/dist/index.js.
// Uses an in-memory fixture only; never connects to Supabase or a real database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Pass the path to the PGlite module.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const author = '11111111-1111-4111-8111-111111111111';
const viewer = '22222222-2222-4222-8222-222222222222';
const stranger = '33333333-3333-4333-8333-333333333333';
const prefix = 'https://mbhjganbihamoiqmankv.supabase.co/storage/v1/object/public/message-attachments/';

try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function storage.foldername(text) returns text[] language sql immutable as
      $$ select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1] $$;
    create table public.posts (
      id text primary key, user_id uuid, media_urls text[], status text,
      visibility text, allowed_viewer uuid, media_type text default 'video'
    );
    create table public.post_media (
      id text primary key, post_id text references public.posts,
      storage_bucket text, storage_key text, storage_url text,
      thumbnail_bucket text, thumbnail_key text, thumbnail_url text
    );
    create table storage.buckets (id text primary key, public boolean);
    create table storage.objects (bucket_id text, name text);
    alter table public.posts enable row level security;
    alter table public.post_media enable row level security;
    alter table storage.objects enable row level security;
    create policy post_visibility on public.posts for select using (
      visibility = 'public' or user_id = (select auth.uid())
      or (visibility = 'friends' and allowed_viewer = (select auth.uid()))
    );
    create policy media_visibility on public.post_media for select using (
      exists (select 1 from public.posts where id = post_media.post_id)
    );
    grant usage on schema auth, storage to anon, authenticated;
    grant select on public.posts, public.post_media to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
    insert into storage.buckets values ('message-attachments', false), ('chat-media', false);
  `);
  const fixtures = [
    ['public', author, 'public', 'published'],
    ['private', author, 'private', 'published'],
    ['friends', author, 'friends', 'published'],
    ['draft', author, 'public', 'draft'],
    ['structured', author, 'public', 'published'],
    ['signed', author, 'public', null],
    ['forged', stranger, 'public', 'published'],
    ['foreign', author, 'public', 'published'],
  ];
  for (const [id, userId, visibility, status] of fixtures) {
    const key = `${author}/${id}.mp4`;
    let url = prefix + key;
    if (id === 'structured') url = null;
    if (id === 'signed') url = url.replace('/public/', '/sign/') + '?token=expired';
    if (id === 'foreign') url = url.replace('mbhjganbihamoiqmankv', 'another-project');
    await db.query('insert into public.posts values ($1,$2,$3,$4,$5,$6,$7)',
      [id, userId, url ? [url] : [], status, visibility, viewer, 'video']);
    await db.query('insert into storage.objects values ($1,$2)', ['message-attachments', key]);
  }
  await db.query('insert into storage.objects values ($1,$2),($1,$3)',
    ['message-attachments', `${author}/chat-only.mp4`, `${author}/thumbnail.jpg`]);
  await db.query('insert into public.post_media values ($1,$2,$3,$4,$5,$3,$6,$7)',
    ['structured-media', 'structured', 'message-attachments', `${author}/structured.mp4`,
      `storage://message-attachments/${author}/structured.mp4`, `${author}/thumbnail.jpg`, prefix + `${author}/thumbnail.jpg`]);

  const snapshot = async () => {
    const result = {};
    for (const table of ['public.posts', 'public.post_media', 'storage.objects', 'storage.buckets']) {
      result[table] = (await db.query(`select * from ${table} order by 1,2`)).rows;
    }
    return result;
  };
  const before = await snapshot();
  const marker = await readFile(new URL('../supabase/migrations/20260905224500_repair_broken_legacy_video_urls.sql', import.meta.url), 'utf8');
  const repair = await readFile(new URL('../supabase/migrations/20260906010535_legacy_post_storage_read_access.sql', import.meta.url), 'utf8');
  await db.exec(marker);
  await db.exec(repair);
  await db.exec(repair);
  assert.deepEqual(await snapshot(), before, 'Migrations must preserve all fixture data and bucket visibility');

  const visibleObjects = async (role, userId = '') => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await db.exec(`set role ${role}`);
    const rows = (await db.query('select name from storage.objects order by name')).rows.map(row => row.name.split('/').pop());
    await db.exec('reset role');
    return rows;
  };
  const publicFiles = ['public.mp4', 'signed.mp4', 'structured.mp4', 'thumbnail.jpg'];
  assert.deepEqual(await visibleObjects('anon'), publicFiles);
  assert.deepEqual(await visibleObjects('authenticated', stranger), publicFiles);
  assert.deepEqual(await visibleObjects('authenticated', viewer), ['friends.mp4', ...publicFiles]);
  assert.deepEqual(await visibleObjects('authenticated', author), ['friends.mp4', 'private.mp4', ...publicFiles]);
  assert.deepEqual(await snapshot(), before);
  console.log('PASS: SQL is idempotent and preserves posts, metadata, objects and private buckets.');
  console.log('PASS: public, signed, structured, thumbnail and friends reads respect the post audience.');
  console.log('PASS: unrelated chat, draft, foreign-project and forged cross-author references are denied.');
} finally {
  await db.close();
}
