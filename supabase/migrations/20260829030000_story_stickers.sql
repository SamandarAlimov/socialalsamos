-- Bosqich D: interaktiv story/reel stikerlari
--
-- Nima uchun alohida jadval?
-- Oddiy bezak stikerlari `post_media.edit_state.stickers` ichida qoladi — ular
-- shunchaki rasm. Interaktiv stikerlar esa javob qabul qiladi, natija
-- hisoblaydi va RLS talab qiladi; JSONB ichida bunday narsani to‘g‘ri
-- boshqarib bo‘lmaydi. Shuning uchun ular normal jadvalda.
--
-- Migratsiya idempotent.

-- ---------------------------------------------------------------------------
-- Turlar
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'story_sticker_type') then
    create type story_sticker_type as enum (
      'poll',
      'question',
      'quiz',
      'slider',
      'location',
      'music',
      'mention',
      'hashtag',
      'link',
      'countdown'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Stikerlar
-- ---------------------------------------------------------------------------

create table if not exists public.story_stickers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  media_id uuid references public.post_media(id) on delete cascade,
  type story_sticker_type not null,

  -- Joylashuv 0..1 nisbiy koordinatalarda (ADR-006 dagi model bilan bir xil).
  x numeric not null default 0.5,
  y numeric not null default 0.5,
  scale numeric not null default 0.6,
  rotation numeric not null default 0,
  z integer not null default 0,

  -- Reel uchun stiker ko‘rinadigan vaqt oynasi (sekundlarda).
  start_seconds numeric,
  end_seconds numeric,

  -- Turga xos sozlamalar: savol matni, variantlar, to‘g‘ri javob va h.k.
  config jsonb not null default '{}'::jsonb,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint story_stickers_position_check
    check (x >= -0.5 and x <= 1.5 and y >= -0.5 and y <= 1.5),
  constraint story_stickers_scale_check
    check (scale > 0 and scale <= 3),
  constraint story_stickers_window_check
    check (
      start_seconds is null
      or end_seconds is null
      or end_seconds > start_seconds
    ),
  constraint story_stickers_window_positive_check
    check (
      (start_seconds is null or start_seconds >= 0)
      and (end_seconds is null or end_seconds >= 0)
    )
);

create index if not exists story_stickers_post_idx
  on public.story_stickers (post_id, z);

create index if not exists story_stickers_media_idx
  on public.story_stickers (media_id);

-- ---------------------------------------------------------------------------
-- Javoblar
-- ---------------------------------------------------------------------------

create table if not exists public.story_sticker_responses (
  id uuid primary key default gen_random_uuid(),
  sticker_id uuid not null references public.story_stickers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  option_index integer,       -- poll, quiz
  numeric_value numeric,      -- slider
  text_answer text,           -- question

  created_at timestamptz not null default now(),
  unique (sticker_id, user_id)
);

create index if not exists story_sticker_responses_sticker_idx
  on public.story_sticker_responses (sticker_id);

-- Javob turga mos kelishini baza darajasida tekshiramiz: klient xato
-- yuborsa ham noto‘g‘ri ma’lumot saqlanmaydi.
create or replace function public.validate_story_sticker_response()
returns trigger
language plpgsql
as $$
declare
  v_type story_sticker_type;
  v_config jsonb;
  v_options integer;
begin
  select type, config into v_type, v_config
  from public.story_stickers
  where id = new.sticker_id;

  if v_type is null then
    raise exception 'Stiker topilmadi';
  end if;

  if v_type in ('poll', 'quiz') then
    v_options := coalesce(jsonb_array_length(v_config -> 'options'), 0);

    if new.option_index is null then
      raise exception 'Variant tanlanishi kerak';
    end if;

    if new.option_index < 0 or new.option_index >= v_options then
      raise exception 'Variant mavjud emas';
    end if;

    new.numeric_value := null;
    new.text_answer := null;

  elsif v_type = 'slider' then
    if new.numeric_value is null then
      raise exception 'Slayder qiymati kerak';
    end if;

    if new.numeric_value < 0 or new.numeric_value > 100 then
      raise exception 'Slayder qiymati 0..100 oralig‘ida bo‘lishi kerak';
    end if;

    new.option_index := null;
    new.text_answer := null;

  elsif v_type = 'question' then
    if new.text_answer is null or length(btrim(new.text_answer)) = 0 then
      raise exception 'Javob matni bo‘sh bo‘lmasligi kerak';
    end if;

    new.text_answer := left(btrim(new.text_answer), 280);
    new.option_index := null;
    new.numeric_value := null;

  else
    -- location, music, mention, hashtag, link, countdown javob qabul qilmaydi.
    raise exception 'Bu stiker turi javob qabul qilmaydi';
  end if;

  return new;
end $$;

drop trigger if exists validate_story_sticker_response_trigger on public.story_sticker_responses;
create trigger validate_story_sticker_response_trigger
  before insert or update on public.story_sticker_responses
  for each row execute function public.validate_story_sticker_response();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.story_stickers enable row level security;
alter table public.story_sticker_responses enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'story_stickers' and policyname = 'Story stickers are readable'
  ) then
    create policy "Story stickers are readable"
      on public.story_stickers for select
      using (
        exists (select 1 from public.posts p where p.id = post_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'story_stickers' and policyname = 'Post owner manages story stickers'
  ) then
    create policy "Post owner manages story stickers"
      on public.story_stickers for all
      using (
        exists (
          select 1 from public.posts p
          where p.id = post_id and p.user_id = auth.uid()
        )
      )
      with check (
        exists (
          select 1 from public.posts p
          where p.id = post_id and p.user_id = auth.uid()
        )
      );
  end if;

  -- Javoblarni faqat javob egasi va post egasi ko‘radi.
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'story_sticker_responses' and policyname = 'Own and owner readable responses'
  ) then
    create policy "Own and owner readable responses"
      on public.story_sticker_responses for select
      using (
        user_id = auth.uid()
        or exists (
          select 1
          from public.story_stickers s
          join public.posts p on p.id = s.post_id
          where s.id = sticker_id and p.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'story_sticker_responses' and policyname = 'Users write own responses'
  ) then
    create policy "Users write own responses"
      on public.story_sticker_responses for all
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Javob berish
-- ---------------------------------------------------------------------------

create or replace function public.respond_story_sticker(
  p_sticker_id uuid,
  p_option_index integer default null,
  p_numeric_value numeric default null,
  p_text_answer text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Avtorizatsiya talab qilinadi';
  end if;

  insert into public.story_sticker_responses (
    sticker_id, user_id, option_index, numeric_value, text_answer
  )
  values (p_sticker_id, v_user, p_option_index, p_numeric_value, p_text_answer)
  on conflict (sticker_id, user_id) do update
    set option_index = excluded.option_index,
        numeric_value = excluded.numeric_value,
        text_answer = excluded.text_answer,
        created_at = now()
  returning id into v_id;

  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Natijalar
-- ---------------------------------------------------------------------------

-- Natija jamlanmasi hammaga ko‘rinadi, lekin savol stikerining matnli
-- javoblari faqat post egasiga qaytariladi.
create or replace function public.story_sticker_results(p_sticker_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_type story_sticker_type;
  v_config jsonb;
  v_is_owner boolean;
  v_total integer;
  v_result jsonb;
begin
  select s.type, s.config, (p.user_id = v_user)
  into v_type, v_config, v_is_owner
  from public.story_stickers s
  join public.posts p on p.id = s.post_id
  where s.id = p_sticker_id;

  if v_type is null then
    raise exception 'Stiker topilmadi';
  end if;

  select count(*) into v_total
  from public.story_sticker_responses
  where sticker_id = p_sticker_id;

  if v_type in ('poll', 'quiz') then
    select jsonb_build_object(
      'type', v_type,
      'total', v_total,
      'counts', coalesce(jsonb_object_agg(option_index::text, cnt), '{}'::jsonb),
      'myChoice', (
        select option_index from public.story_sticker_responses
        where sticker_id = p_sticker_id and user_id = v_user
      ),
      'correctIndex', case
        when v_type = 'quiz' then v_config -> 'correctIndex'
        else null
      end
    )
    into v_result
    from (
      select option_index, count(*) as cnt
      from public.story_sticker_responses
      where sticker_id = p_sticker_id
      group by option_index
    ) grouped;

  elsif v_type = 'slider' then
    select jsonb_build_object(
      'type', 'slider',
      'total', v_total,
      'average', round(coalesce(avg(numeric_value), 0), 1),
      'myValue', (
        select numeric_value from public.story_sticker_responses
        where sticker_id = p_sticker_id and user_id = v_user
      )
    )
    into v_result
    from public.story_sticker_responses
    where sticker_id = p_sticker_id;

  elsif v_type = 'question' then
    v_result := jsonb_build_object(
      'type', 'question',
      'total', v_total,
      'answers', case
        when v_is_owner then (
          select coalesce(jsonb_agg(jsonb_build_object(
            'userId', user_id,
            'text', text_answer,
            'createdAt', created_at
          ) order by created_at desc), '[]'::jsonb)
          from public.story_sticker_responses
          where sticker_id = p_sticker_id
        )
        else '[]'::jsonb
      end
    );

  else
    v_result := jsonb_build_object('type', v_type, 'total', 0);
  end if;

  return coalesce(v_result, jsonb_build_object('type', v_type, 'total', v_total));
end $$;

grant execute on function public.respond_story_sticker(uuid, integer, numeric, text) to authenticated;
grant execute on function public.story_sticker_results(uuid) to authenticated;

-- Realtime: natijalar tirik yangilanishi uchun.
do $$
begin
  begin
    alter publication supabase_realtime add table public.story_sticker_responses;
  exception when others then
    null;
  end;
end $$;
