# Lovable runbook — Conversation RLS fix

> **Lovable vazifasi faqat migrationni ishga tushirish, build/deploy va smoke-test qilish.**
> Kodni qayta yozmang, refactor qilmang va GitHub `main` dagi fayllarni o‘zgartirmang. GitHub `main` source of truth.

## Muammo

Profil sahifasida boshqa foydalanuvchiga `Message` bosilganda mavjud web flow avval `conversations` row yaratadi, keyin `conversation_participants` rowlarini qo‘shadi. RLS qattiqlashganidan keyin birinchi `INSERT ... RETURNING` creator hali participant bo‘lmagani uchun rad etila boshlagan:

`new row violates row-level security policy for table "conversations"`

Bu migration RLS'ni o‘chirib qo‘ymaydi va global yozish huquqini bermaydi. U bootstrap oqimini owner bilan cheklangan holda tiklaydi.

## 1. GitHub `main` ni sync qiling

Lovable projectni repositoryning eng so‘nggi `main` holatiga sinxronlang. Kodni Lovable ichida qayta generatsiya qilmang.

## 2. Pending migrationlarni timestamp bo‘yicha ishga tushiring

Bu fix uchun majburiy migration:

https://raw.githubusercontent.com/SamandarAlimov/socialalsamos/main/supabase/migrations/20260906150000_restore_conversation_creation_rls.sql

Migrationni aynan repositorydan oling. Oldin qo‘llangan migrationlarni qayta yozmang yoki tarixdan o‘chirmang.

## 3. DB tekshiruv

Migration tugagach SQL editor orqali quyidagilarni tekshiring:

```sql
select to_regprocedure('public.is_my_conversation(uuid)') as is_my_conversation,
       to_regprocedure('public.can_owner_add_conversation_participant(uuid,uuid)') as can_add_participant;
```

Ikkalasi ham function nomini qaytarishi kerak.

Policylar mavjudligini tekshiring:

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('conversations', 'conversation_participants')
  and policyname in (
    'conversations_insert_owner',
    'conversations_select_member_or_owner',
    'conversations_delete_owner',
    'conversation_participants_select_members',
    'conversation_participants_insert_owner_bootstrap'
  )
order by tablename, policyname;
```

5 ta policy qaytishi kerak.

## 4. Production smoke-test

Ikki oddiy account — A va B — bilan tekshiring:

1. A accountdan B profiliga kiring va `Message` bosing.
2. Yangi private conversation xatosiz ochilishi kerak.
3. Shu profilga qaytib `Message` ni yana bosing — mavjud private chat topilishi kerak, participant roster ko‘rinishi kerak.
4. A va B bir-biriga oddiy message yubora olishi kerak.
5. B A ni block qilgan holatda A yangi private conversationga B ni qo‘sha olmasligi kerak.
6. Story reply orqali yangi DM kerak bo‘lsa, shu bootstrap policylar bilan xatosiz ishlashi kerak.
7. Group/channel yaratish oqimi mavjud bo‘lsa, owner participant bootstrap regressiya qilmaganini tekshiring.

## 5. Build va deploy

Migration muvaffaqiyatli qo‘llangandan keyin latest `main` bilan production build va deployni bajaring. Build paytida kodni avtomatik refactor qilish yoki yangi UI generatsiya qilish kerak emas.

## Security natijasi

- RLS yoqilganicha qoladi.
- Har qanday authenticated user istalgan owner nomidan conversation yarata olmaydi: `owner_id = auth.uid()` shart.
- Creator rowni participant yozilishidan oldin faqat o‘zi ko‘ra oladi, shuning uchun `.insert().select()` ishlaydi.
- Participantlarni to‘g‘ridan-to‘g‘ri faqat conversation owner bootstrap qila oladi.
- Private conversation 2 participantdan oshmaydi.
- Block qilingan juftlik private DM bootstrapdan o‘tmaydi.
- Conversation participant rosteri faqat o‘sha conversation owner/memberlariga ko‘rinadi.
