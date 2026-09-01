-- Blocking (NO ACTION) FKs to auth.users / public.profiles prevent user deletion.
-- Nullable admin/moderator columns -> SET NULL; NOT NULL ownership columns -> CASCADE.

-- CASCADE (NOT NULL ownership)
ALTER TABLE public.pinned_messages DROP CONSTRAINT pinned_messages_pinned_by_fkey,
  ADD CONSTRAINT pinned_messages_pinned_by_fkey FOREIGN KEY (pinned_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.call_history DROP CONSTRAINT call_history_caller_id_fkey,
  ADD CONSTRAINT call_history_caller_id_fkey FOREIGN KEY (caller_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.orders DROP CONSTRAINT orders_buyer_id_fkey,
  ADD CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.product_reviews DROP CONSTRAINT product_reviews_user_id_fkey,
  ADD CONSTRAINT product_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.product_messages DROP CONSTRAINT product_messages_sender_id_fkey,
  ADD CONSTRAINT product_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.product_messages DROP CONSTRAINT product_messages_receiver_id_fkey,
  ADD CONSTRAINT product_messages_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.video_calls DROP CONSTRAINT video_calls_host_id_fkey,
  ADD CONSTRAINT video_calls_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- SET NULL (nullable admin / moderation references)
ALTER TABLE public.call_history DROP CONSTRAINT call_history_callee_id_fkey,
  ADD CONSTRAINT call_history_callee_id_fkey FOREIGN KEY (callee_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.verification_requests DROP CONSTRAINT verification_requests_reviewed_by_fkey,
  ADD CONSTRAINT verification_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_granted_by_fkey,
  ADD CONSTRAINT user_roles_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.products DROP CONSTRAINT products_moderated_by_fkey,
  ADD CONSTRAINT products_moderated_by_fkey FOREIGN KEY (moderated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.channel_join_requests DROP CONSTRAINT channel_join_requests_reviewed_by_fkey,
  ADD CONSTRAINT channel_join_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.order_status_history DROP CONSTRAINT order_status_history_created_by_fkey,
  ADD CONSTRAINT order_status_history_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.seller_verification_requests DROP CONSTRAINT seller_verification_requests_reviewed_by_fkey,
  ADD CONSTRAINT seller_verification_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.product_reports DROP CONSTRAINT product_reports_moderator_id_fkey,
  ADD CONSTRAINT product_reports_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.reports DROP CONSTRAINT reports_reviewed_by_fkey,
  ADD CONSTRAINT reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.reserved_usernames DROP CONSTRAINT reserved_usernames_released_to_fkey,
  ADD CONSTRAINT reserved_usernames_released_to_fkey FOREIGN KEY (released_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.reserved_usernames DROP CONSTRAINT reserved_usernames_reserved_by_fkey,
  ADD CONSTRAINT reserved_usernames_reserved_by_fkey FOREIGN KEY (reserved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.reserved_usernames DROP CONSTRAINT reserved_usernames_released_by_fkey,
  ADD CONSTRAINT reserved_usernames_released_by_fkey FOREIGN KEY (released_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.feature_flags DROP CONSTRAINT feature_flags_updated_by_fkey,
  ADD CONSTRAINT feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
