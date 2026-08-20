-- 1. Fix broken conversations SELECT policy (self-referencing join)
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
CREATE POLICY "Users can view their conversations"
ON public.conversations FOR SELECT TO authenticated
USING (public.is_conversation_participant(id, auth.uid()));

-- 2. Restore EXECUTE for functions required by RLS policies and app RPCs
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_join_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_message_to_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_channel_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_video_call(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_call(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_moderate_live_stream(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_post_poll_expired(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_blocked_between(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_presence(uuid) TO authenticated;

-- App-invoked RPCs
GRANT EXECUTE ON FUNCTION public.block_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_video_call_guarded(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_video_call(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_for_identifier(text) TO anon, authenticated;
