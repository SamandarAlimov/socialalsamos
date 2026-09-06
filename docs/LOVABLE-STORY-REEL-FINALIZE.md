# Lovable runbook — Story / Reel publishing finalization

> **Lovable vazifasi faqat migratsiyani ishga tushirish, build va deploy qilish.**
> Frontend/backend kodini qayta yozmang, refactor qilmang va boshqa fayllarni o‘zgartirmang. GitHub `main` bu release uchun source of truth.

## 1. GitHub `main` ni sinxronlang

Avval repositoryning eng so‘nggi `main` holatini Lovable projectga sync qiling. Story va Reel uchun canonical Create UI allaqachon `/create` / `/compose` oqimida mavjud.

Tekshiriladigan asosiy kodlar:

- `src/pages/ComposePage.tsx`
- `src/components/create/StoryComposer.tsx`
- `src/components/create/ReelComposer.tsx`
- `src/hooks/useStories.ts`
- `src/components/stories/StoryViewer.tsx`
- `src/components/stickers/StoryStickerOverlay.tsx`

## 2. Supabase migratsiyalarini Lovable ichida ishga tushiring

Repositorydagi **pending** migratsiyalarni timestamp bo‘yicha ketma-ket qo‘llang. Oldin qo‘llangan migratsiyani qayta yaratmang yoki tarixdan o‘chirmang.

Story/Reel pipeline uchun muhim foundation fayllari:

- https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260828230000_create_flow_foundation.sql
- https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260828234500_poll_types_video_jobs_music_ingest.sql
- https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260830091000_atomic_create_publish.sql
- https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260830110000_publish_formatted_content.sql
- https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260830112000_collaboration_lifecycle.sql
- https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260830114000_unified_story_foundation.sql
- https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260830114100_story_draft_lifecycle.sql
- https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260905104500_allow_external_post_media.sql

**Final hardening migratsiyasi — bu release uchun majburiy:**

- https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260906113000_story_reel_publish_hardening.sql

Agar yuqoridagi eski foundation migratsiyalar migration history’da allaqachon `applied` bo‘lsa, ularni qo‘lda qayta ishlatmang; faqat pending migratsiyalarni qo‘llang. Final `20260906113000_story_reel_publish_hardening.sql` esa ushbu release bilan albatta applied bo‘lishi kerak.

## 3. Migratsiyadan keyingi DB tekshiruvi

Lovable SQL runner orqali quyidagi read-only tekshiruvni bajaring:

```sql
select
  to_regprocedure('public.publish_post_draft(jsonb)') as publish_post_draft,
  to_regprocedure('public.publish_story_draft(jsonb)') as publish_story_draft,
  to_regprocedure('public.create_story_draft(jsonb)') as create_story_draft,
  to_regprocedure('public.activate_story_draft(uuid)') as activate_story_draft,
  to_regprocedure('public.discard_story_draft(uuid)') as discard_story_draft,
  to_regprocedure('public.delete_story(uuid)') as delete_story,
  to_regprocedure('public.can_view_post(uuid)') as can_view_post;
```

Hammasi `null` bo‘lmagan function nomini qaytarishi kerak.

Keyin schema ustunlarini tekshiring:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'posts' and column_name in (
      'post_kind', 'status', 'scheduled_at', 'published_at',
      'formatted_content', 'edit_state'
    ))
    or
    (table_name = 'stories' and column_name in (
      'post_id', 'media_id', 'storage_bucket', 'storage_key', 'is_active'
    ))
    or
    (table_name = 'post_media' and column_name in (
      'storage_bucket', 'storage_key', 'thumbnail_bucket', 'thumbnail_key'
    ))
  )
order by table_name, column_name;
```

Agar kutilgan ustun yoki RPC yo‘q bo‘lsa, **frontend kodini o‘zgartirmang**. Missing/pending migrationni topib timestamp tartibida qo‘llang.

## 4. Build va deploy

Migratsiyalar muvaffaqiyatli tugagach:

1. `main` dan dependency install qiling.
2. CI bilan bir xil tekshiruvlarni ishga tushiring: Create regression tests, TypeScript typecheck va production build.
3. Build green bo‘lsa production deploy qiling.
4. Service worker/PWA cache yangi bundle versiyasini olganini tekshiring.

## 5. Production smoke test

Quyidagilarni bir xil test account bilan ketma-ket tekshiring:

1. **Post** — oddiy post joylanadi va Home/Profile’da ko‘rinadi.
2. **Reel** — bitta video va multi-clip Reel joylanadi; caption, cover, music va visibility saqlanadi; Home/Video surface’da ochiladi.
3. **Story image** — rasm Story yaratiladi, 24 soatlik rail’da ochiladi.
4. **Story video** — video Story autoplay/progress bilan ishlaydi.
5. **Story stickers** — poll/quiz/slider/question Story’da ko‘rinadi va boshqa user javob bera oladi.
6. **Story privacy** — `friends` faqat mutual follow’ga, `private` faqat egasiga ko‘rinadi.
7. **Story draft privacy** — sticker tahriri vaqtida draft boshqa userga Home/Story rail orqali ko‘rinmaydi.
8. **Story delete** — owner menu orqali o‘chirilganda Story yo‘qoladi va linked `posts`/`post_media` graph orphan qolmaydi.
9. **Scheduled post** — vaqti kelmaguncha boshqa userga ko‘rinmaydi; publish bo‘lgach ko‘rinadi.
10. **Collaborator preview** — pending collaborator invite qabul qilishdan oldin preview qila oladi, begona user esa unpublished postni ko‘ra olmaydi.

## 6. Release qoidasi

Smoke testlardan bittasi yiqilsa deployni “fixed” deb belgilamang. Error log + failing RPC/migration nomini qayd qiling va GitHubdagi mavjud kodni Lovable ichida o‘zboshimchalik bilan qayta yozmang. Fix GitHub orqali qilinadi, keyin Lovable faqat yangi `main`ni sync/deploy qiladi.
