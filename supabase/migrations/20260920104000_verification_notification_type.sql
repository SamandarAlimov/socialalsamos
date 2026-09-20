-- Verification is a first-class platform notification emitted by the admin
-- workflow. The legacy notification type constraint did not allow it, which
-- caused verification approval/rejection to fail transactionally.

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type = any (
      array[
        'message'::text,
        'like'::text,
        'comment'::text,
        'follow'::text,
        'mention'::text,
        'collaboration_invite'::text,
        'collaboration_accepted'::text,
        'verification'::text
      ]
    )
  );

notify pgrst, 'reload schema';
