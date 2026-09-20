-- Admin Control Plane v3.3: cover foreign keys used by cascades and operator queries.

create index if not exists appeals_appellant_idx
  on public.appeals(appellant_id);
create index if not exists appeals_enforcement_action_idx
  on public.appeals(enforcement_action_id);

create index if not exists enforcement_actions_case_idx
  on public.enforcement_actions(case_id);
create index if not exists enforcement_actions_created_by_idx
  on public.enforcement_actions(created_by);

create index if not exists moderation_case_reports_linked_by_idx
  on public.moderation_case_reports(linked_by);
create index if not exists moderation_cases_opened_by_idx
  on public.moderation_cases(opened_by);
create index if not exists moderation_decisions_decided_by_idx
  on public.moderation_decisions(decided_by);
create index if not exists moderation_evidence_captured_by_idx
  on public.moderation_evidence(captured_by);
