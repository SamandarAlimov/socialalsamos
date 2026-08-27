-- Edge funksiyalar uchun umumiy tekshiruv/limit jurnali.
-- Maqsad: qattiqlashtirishni "log" rejimida boshlash — hech kim bloklanmaydi,
-- lekin real trafik yozib boriladi. Keyin AUTH_ENFORCE=on qilinadi.

create table if not exists public.function_usage (
  id uuid primary key default gen_random_uuid(),
  function_name text not null,
  user_id uuid,
  ip_hash text,
  outcome text not null default 'allowed'
    check (outcome in ('allowed', 'blocked', 'would_block')),
  reason text,
  mode text not null default 'log' check (mode in ('off', 'log', 'on')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists function_usage_fn_user_time_idx
  on public.function_usage (function_name, user_id, created_at desc);
create index if not exists function_usage_fn_ip_time_idx
  on public.function_usage (function_name, ip_hash, created_at desc);
create index if not exists function_usage_time_idx
  on public.function_usage (created_at desc);
create index if not exists function_usage_outcome_idx
  on public.function_usage (outcome, created_at desc);

-- Faqat service role yozadi/o'qiydi: RLS yoqilgan, hech qanday policy yo'q.
alter table public.function_usage enable row level security;

-- Eski yozuvlarni tozalash (pg_cron yoki qo'lda chaqirish uchun).
create or replace function public.prune_function_usage()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.function_usage
  where created_at < now() - interval '30 days';
$$;

revoke all on function public.prune_function_usage() from public;

comment on table public.function_usage is
  'Edge funksiyalarga kirish va limit hodisalari. outcome=would_block => log rejimida bloklanardi.';
