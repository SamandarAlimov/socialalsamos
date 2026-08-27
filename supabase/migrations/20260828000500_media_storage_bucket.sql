-- =====================================================================
-- Ommaviy `media` storage buckchasi
--
-- Fayl yuklash oldin tashqi https://api.alsamos.com/api/media/presign
-- serveriga bog'liq edi. U server javob bermaganda (yoki CORS preflight
-- muvaffaqiyatsiz bo'lganda) platformada hech qanday fayl yuklanmaydi.
-- Endi asosiy yo'l - to'g'ridan to'g'ri Supabase Storage.
--
-- Kalit tuzilishi: <user_id>/<kind>/<timestamp>-<rand>-<name>
-- Shu sababli RLS siyosati birinchi papka nomini auth.uid() bilan
-- solishtiradi: har kim faqat o'z papkasiga yozadi.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update
  set public = true,
      file_size_limit = 52428800;

-- Hamma ko'radi (bucket ommaviy).
drop policy if exists "Media files are publicly readable" on storage.objects;
create policy "Media files are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'media');

-- Faqat o'z papkasiga yuklash mumkin.
drop policy if exists "Users can upload their own media" on storage.objects;
create policy "Users can upload their own media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update their own media" on storage.objects;
create policy "Users can update their own media"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete their own media" on storage.objects;
create policy "Users can delete their own media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
