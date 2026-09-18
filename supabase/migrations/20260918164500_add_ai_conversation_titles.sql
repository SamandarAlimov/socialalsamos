alter table public.ai_conversations
  add column if not exists title text;

comment on column public.ai_conversations.title is
  'Short semantic title for the AI conversation. User-renamed titles are stored here too.';
