-- Mini app yuborish oqimi uchun qo'shimcha metadata va @nom bandligini tekshirish.
-- Additive: mavjud ustun/funksiyalarni buzmaydi.

-- 1) Kerakli ustunlar (avvalgi migratsiyalarda bo'lmasa qo'shiladi).
alter table public.mini_apps add column if not exists price_model text default 'free';
alter table public.mini_apps add column if not exists screenshots jsonb default '[]'::jsonb;
alter table public.mini_apps add column if not exists deep_link text;
alter table public.mini_apps add column if not exists privacy_url text;
alter table public.mini_apps add column if not exists support_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mini_apps_price_model_check'
  ) then
    alter table public.mini_apps
      add constraint mini_apps_price_model_check
      check (price_model in ('free', 'freemium', 'paid'));
  end if;
end $$;

update public.mini_apps set price_model = 'free' where price_model is null;
update public.mini_apps set screenshots = '[]'::jsonb where screenshots is null;

-- 2) @nom bandligini tekshirish.
-- Ilova nomlari ham, publisher nomlari ham bitta bo'shliqda: takrorlanmasligi kerak.
create or replace function public.mini_app_handle_available(p_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text;
  v_taken boolean := false;
begin
  v_handle := lower(coalesce(p_handle, ''));
  v_handle := regexp_replace(v_handle, '[^a-z0-9_]+', '_', 'g');
  v_handle := regexp_replace(v_handle, '_+', '_', 'g');
  v_handle := trim(both '_' from v_handle);

  if length(v_handle) < 3 or length(v_handle) > 32 then
    return jsonb_build_object('available', false, 'handle', v_handle, 'reason', 'INVALID_LENGTH');
  end if;

  if v_handle !~ '^[a-z][a-z0-9_]*$' then
    return jsonb_build_object('available', false, 'handle', v_handle, 'reason', 'INVALID_FORMAT');
  end if;

  select exists (select 1 from public.mini_apps where lower(handle) = v_handle) into v_taken;

  if not v_taken then
    select exists (select 1 from public.publishers where lower(handle) = v_handle) into v_taken;
  end if;

  return jsonb_build_object(
    'available', not v_taken,
    'handle', v_handle,
    'reason', case when v_taken then 'TAKEN' else null end
  );
end $$;

grant execute on function public.mini_app_handle_available(text) to authenticated, anon;

notify pgrst, 'reload schema';
