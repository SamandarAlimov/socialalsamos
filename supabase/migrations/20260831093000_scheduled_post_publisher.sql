-- =============================================================================
-- P1: Rejalashtirilgan postlarni chiqaruvchi navbat
--
-- Muammo: create oqimi `scheduled_at` ni yozib, postni `scheduled` holatida
-- qoldirardi. Uni `published` holatiga o'tkazadigan hech narsa yo'q edi, ya'ni
-- "Rejalashtirish" tugmasi foydalanuvchiga yolg'on aytardi.
--
-- Yechim: navbatni bazadagi bitta funksiya chiqaradi. Edge Function faqat shu
-- funksiyani chaqiradi, shuning uchun web va superapp mijozlari bir xil
-- xatti-harakatni oladi (docs/CREATE-PRO-PLAN.md, "Superapp bilan muvofiqlik").
--
-- Xavfsizlik: funksiya security definer, lekin faqat service_role chaqiradi.
-- Oddiy foydalanuvchi boshqa odamning postini chiqarib yubora olmaydi.
-- =============================================================================

-- Cron har daqiqada ishlaydi, shuning uchun qismli indeks: faqat navbatdagi
-- postlar indeksda bo'ladi, million bosilgan post emas.
create index if not exists posts_scheduled_due_idx
  on public.posts (scheduled_at)
  where status = 'scheduled';

-- Bir nechta ishchi parallel ishlasa ham bitta post ikki marta chiqmaydi:
-- FOR UPDATE SKIP LOCKED band qatorlarni chetlab o'tadi.
create or replace function public.publish_due_scheduled_posts(
  p_limit integer default 200
)
returns table (
  post_id uuid,
  author_id uuid,
  published_time timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
begin
  return query
  with due as (
    select p.id
    from public.posts p
    where p.status = 'scheduled'
      and p.scheduled_at is not null
      and p.scheduled_at <= now()
    order by p.scheduled_at
    limit v_limit
    for update skip locked
  )
  update public.posts p
  set status = 'published',
      published_at = coalesce(p.published_at, now())
  from due
  where p.id = due.id
  returning p.id, p.user_id, p.published_at;
end
$$;

comment on function public.publish_due_scheduled_posts(integer) is
  'P1: vaqti kelgan rejalashtirilgan postlarni chiqaradi. Faqat cron/service_role.';

revoke all on function public.publish_due_scheduled_posts(integer) from public;
revoke all on function public.publish_due_scheduled_posts(integer) from authenticated;
grant execute on function public.publish_due_scheduled_posts(integer) to service_role;

notify pgrst, 'reload schema';
