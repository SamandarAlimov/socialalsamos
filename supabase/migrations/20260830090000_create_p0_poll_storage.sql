-- =============================================================================
-- Create P0 corrective foundation
-- 1) restore strict poll-vote validation after poll type extension
-- 2) allow numeric slider/rating votes without option_id
-- 3) align Storage object limits with Create's 512 MiB video limit
-- 4) provision a private bucket for non-public Create assets without breaking
--    existing public media URLs
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Poll vote schema + validation
-- ---------------------------------------------------------------------------
alter table public.poll_votes
  alter column option_id drop not null;

-- Slider/rating votes have no option_id, therefore the old
-- unique(option_id, user_id) constraint cannot prevent repeated numeric votes.
create unique index if not exists poll_votes_numeric_user_uniq
  on public.poll_votes (poll_id, user_id)
  where option_id is null;

create or replace function public.validate_poll_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.polls;
  v_existing int;
begin
  select * into v_poll
  from public.polls
  where id = new.poll_id;

  if v_poll.id is null then
    raise exception 'So''rovnoma topilmadi';
  end if;

  if v_poll.closes_at is not null and v_poll.closes_at <= now() then
    raise exception 'So''rovnoma yakunlangan';
  end if;

  if v_poll.poll_type in ('slider', 'rating') then
    if new.option_id is not null then
      raise exception 'Slayder/reyting ovozida variant yuborilmaydi';
    end if;

    if new.numeric_value is null then
      raise exception 'Slayder/reyting uchun qiymat majburiy';
    end if;

    if v_poll.min_value is not null and new.numeric_value < v_poll.min_value then
      raise exception 'Qiymat ruxsat etilgan diapazondan kichik';
    end if;

    if v_poll.max_value is not null and new.numeric_value > v_poll.max_value then
      raise exception 'Qiymat ruxsat etilgan diapazondan katta';
    end if;

    if v_poll.step is not null
       and v_poll.min_value is not null
       and mod(new.numeric_value - v_poll.min_value, v_poll.step) <> 0 then
      raise exception 'Qiymat so''rovnoma qadamiga mos emas';
    end if;
  else
    if new.option_id is null then
      raise exception 'Variant tanlanmagan';
    end if;

    if new.numeric_value is not null then
      raise exception 'Bu so''rovnoma turi raqamli ovoz qabul qilmaydi';
    end if;

    if not exists (
      select 1
      from public.poll_options o
      where o.id = new.option_id
        and o.poll_id = new.poll_id
    ) then
      raise exception 'Variant bu so''rovnomaga tegishli emas';
    end if;

    select count(*) into v_existing
    from public.poll_votes v
    where v.poll_id = new.poll_id
      and v.user_id = new.user_id
      and (tg_op = 'INSERT' or v.id <> new.id);

    if not v_poll.allow_multiple and v_existing >= 1 then
      raise exception 'Bu so''rovnomada faqat bitta variant tanlanadi';
    end if;

    if v_poll.allow_multiple
       and v_poll.max_choices is not null
       and v_existing >= v_poll.max_choices then
      raise exception 'Eng ko''p % variant tanlash mumkin', v_poll.max_choices;
    end if;
  end if;

  return new;
end
$$;

-- Remove both historical trigger names so only one validator is active.
drop trigger if exists poll_votes_validate on public.poll_votes;
drop trigger if exists validate_poll_vote_trigger on public.poll_votes;

create trigger poll_votes_validate
  before insert or update on public.poll_votes
  for each row execute function public.validate_poll_vote();

-- ---------------------------------------------------------------------------
-- Storage limits + private bucket foundation
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 536870912
where id = 'media';

insert into storage.buckets (id, name, public, file_size_limit)
values ('media-private', 'media-private', false, 536870912)
on conflict (id) do update
  set public = false,
      file_size_limit = 536870912;

drop policy if exists "Private media readable by owner" on storage.objects;
create policy "Private media readable by owner"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can upload their private media" on storage.objects;
create policy "Users can upload their private media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their private media" on storage.objects;
create policy "Users can update their private media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their private media" on storage.objects;
create policy "Users can delete their private media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
