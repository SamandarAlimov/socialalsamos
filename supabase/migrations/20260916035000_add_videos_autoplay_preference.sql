alter table public.user_settings
  add column if not exists videos_autoplay boolean not null default true;
