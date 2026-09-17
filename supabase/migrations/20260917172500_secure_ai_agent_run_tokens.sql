-- ai_agent_runs contains an internal worker dispatch token and checkpoint.
-- Keep those server-only even for the row owner; users only need progress/status.

revoke select on public.ai_agent_runs from authenticated;

grant select (
  id,
  user_id,
  conversation_id,
  mode,
  requested_model,
  resolved_model,
  language,
  task,
  tool_groups,
  status,
  round_count,
  tool_call_count,
  max_rounds,
  max_tool_calls,
  max_run_ms,
  lease_until,
  last_error,
  final_text,
  created_at,
  updated_at,
  completed_at
) on public.ai_agent_runs to authenticated;
