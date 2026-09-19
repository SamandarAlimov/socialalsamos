insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'ai-generated-files',
  'ai-generated-files',
  false,
  20971520,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/pdf',
    'text/csv',
    'text/plain',
    'text/markdown',
    'application/json'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own AI generated files" on storage.objects;

create policy "Users can read own AI generated files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ai-generated-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can delete own AI generated files" on storage.objects;

create policy "Users can delete own AI generated files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ai-generated-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
