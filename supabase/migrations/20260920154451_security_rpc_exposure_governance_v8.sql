
-- Alsamos Security RPC Exposure Governance v8
-- Restore intended RPC grants, remove anonymous access from sensitive definer
-- functions, and maintain an explicit reviewed-public allowlist for the advisor.

-- Sensitive identity resolver was previously hardened to service_role only;
-- restore that intended boundary after legacy grant drift.
revoke all on function public.get_email_for_identifier(text) from public, anon, authenticated;
grant execute on function public.get_email_for_identifier(text) to service_role;

-- RBAC helpers are needed by authenticated RLS/admin workflows, never by anon.
revoke all on function public.has_admin_permission(uuid,text) from public, anon;
grant execute on function public.has_admin_permission(uuid,text) to authenticated, service_role;

revoke all on function public.has_admin_role(uuid,text) from public, anon;
grant execute on function public.has_admin_role(uuid,text) to authenticated, service_role;

revoke all on function public.is_admin_staff(uuid) from public, anon;
grant execute on function public.is_admin_staff(uuid) to authenticated, service_role;

-- Feedback mutation workflows all require a signed-in user/admin.
revoke all on function public.manage_platform_feedback(uuid,text,text,uuid,boolean,text) from public, anon;
grant execute on function public.manage_platform_feedback(uuid,text,text,uuid,boolean,text) to authenticated;

revoke all on function public.mark_platform_feedback_viewed(uuid) from public, anon;
grant execute on function public.mark_platform_feedback_viewed(uuid) to authenticated;

revoke all on function public.reply_platform_feedback(uuid,text,boolean) from public, anon;
grant execute on function public.reply_platform_feedback(uuid,text,boolean) to authenticated;

revoke all on function public.submit_platform_feedback(text,text,text,smallint,boolean,text,text,jsonb,text[]) from public, anon;
grant execute on function public.submit_platform_feedback(text,text,text,smallint,boolean,text,text,jsonb,text[]) to authenticated;

-- Private/user-scoped search and analytics ingestion.
revoke all on function public.search_visible_messages(uuid,text,text) from public, anon;
grant execute on function public.search_visible_messages(uuid,text,text) to authenticated;

revoke all on function public.track_post_analytics_session(uuid,text,text,text,bigint,bigint,bigint,bigint,boolean,boolean,boolean) from public, anon;
grant execute on function public.track_post_analytics_session(uuid,text,text,text,bigint,bigint,bigint,bigint,boolean,boolean,boolean) to authenticated;

revoke all on function public.video_job_quota_used(uuid) from public, anon;
grant execute on function public.video_job_quota_used(uuid) to authenticated, service_role;

-- Ad fraud scoring is an implementation detail of the signed-in delivery event RPC.
revoke all on function public.score_ad_event_risk_v4(uuid,uuid,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.score_ad_event_risk_v4(uuid,uuid,text,text,text,text,jsonb) to service_role;

revoke all on function public.record_ad_delivery_event_v4(uuid,text,text,text,text,text,text,numeric,jsonb) from public, anon;
grant execute on function public.record_ad_delivery_event_v4(uuid,text,text,text,text,text,text,numeric,jsonb) to authenticated;

-- Post view mutation is authenticated; product views intentionally remain public.
revoke all on function public.increment_post_views(uuid) from public, anon;
grant execute on function public.increment_post_views(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reviewed anonymous SECURITY DEFINER registry.
-- This does not grant access. It documents functions whose anonymous exposure
-- is intentional for public content, pre-signup validation, or RLS helpers.
-- ---------------------------------------------------------------------------
create table if not exists private.security_rpc_exposure_allowlist (
  signature text primary key,
  category text not null,
  reason text not null,
  reviewed_at timestamptz not null default now()
);

insert into private.security_rpc_exposure_allowlist(signature,category,reason) values
  ('can_view_post(p_post_id uuid)','policy_helper','Public-content RLS visibility helper.'),
  ('can_view_structured_post_compat(p_post_id uuid)','policy_helper','Compatibility RLS visibility helper for public structured posts.'),
  ('check_username_availability(p_username text, p_user_id uuid)','pre_auth','Signup username availability must work before authentication.'),
  ('get_live_stream_viewer_count(p_stream_id uuid)','public_read','Public aggregate live viewer count; returns no identities.'),
  ('get_nearby_check_ins(lat double precision, lon double precision, radius_km double precision, limit_count integer)','public_read','Public map discovery aggregate/location surface.'),
  ('get_place_reviews(place_id_param text, limit_count integer)','public_read','Public place review surface.'),
  ('get_seller_response_stats(_seller_user_id uuid)','public_read','Public marketplace seller aggregate metrics.'),
  ('images(p public.products)','computed_field','PostgREST computed field on public marketplace product rows.'),
  ('increment_product_views(_product_id uuid)','public_telemetry','Anonymous marketplace view counter is intentionally public.'),
  ('is_username_available(p_username text, p_current_user_id uuid)','pre_auth','Signup username availability must work before authentication.'),
  ('owns_post(p_post_id uuid)','policy_helper','RLS ownership helper; anonymous calls resolve false without auth.uid().'),
  ('poll_slider_summary(p_poll_id uuid)','public_read','Public poll aggregate without voter identities.'),
  ('search_hashtags(p_query text, p_limit integer)','public_read','Public hashtag discovery.'),
  ('search_music_tracks(p_query text, p_limit integer)','public_read','Public music catalog discovery; private rows still gated by auth.uid().'),
  ('trending_hashtags(p_limit integer, p_days integer)','public_read','Public trend aggregate over public posts.')
on conflict(signature) do update set
  category=excluded.category,
  reason=excluded.reason,
  reviewed_at=now();

create or replace function public.admin_security_rpc_surface_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.system.view')
    or public.has_admin_permission(v_actor,'admin.security.view')
    or public.has_admin_permission(v_actor,'security.view')
    or public.has_admin_permission(v_actor,'admin.audit.view')
  ) then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  return jsonb_build_object(
    'generated_at',now(),
    'total_anon_definer',(
      select count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.prosecdef
        and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    ),
    'reviewed',(
      select count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      join private.security_rpc_exposure_allowlist a
        on a.signature=(p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')')
      where n.nspname='public'
        and p.prosecdef
        and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    ),
    'unreviewed',(
      select count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      left join private.security_rpc_exposure_allowlist a
        on a.signature=(p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')')
      where n.nspname='public'
        and p.prosecdef
        and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
        and a.signature is null
    ),
    'items',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.reviewed asc,x.function_name,x.arguments)
      from (
        select
          p.proname as function_name,
          pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
          pg_catalog.pg_get_function_result(p.oid) as result_type,
          (a.signature is not null) as reviewed,
          a.category,
          a.reason,
          a.reviewed_at
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid=p.pronamespace
        left join private.security_rpc_exposure_allowlist a
          on a.signature=(p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')')
        where n.nspname='public'
          and p.prosecdef
          and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
      ) x
    ),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_security_rpc_surface_v1() from public,anon;
grant execute on function public.admin_security_rpc_surface_v1() to authenticated;

-- Upgrade posture with reviewed-vs-unreviewed anonymous definer signal.
create or replace function public.admin_security_posture_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_rls_no_policy integer;
  v_mutable_search_path integer;
  v_anon_definer integer;
  v_anon_definer_unreviewed integer;
  v_anon_definer_trigger integer;
  v_public_extensions integer;
  v_chain jsonb;
  v_country_known integer;
  v_country_unknown integer;
begin
  if v_actor is null or not (
    public.has_admin_permission(v_actor,'admin.system.view')
    or public.has_admin_permission(v_actor,'admin.security.view')
    or public.has_admin_permission(v_actor,'security.view')
    or public.has_admin_permission(v_actor,'admin.audit.view')
  ) then raise exception 'not_authorized' using errcode='42501'; end if;

  select count(*) into v_rls_no_policy
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relkind='r'
    and c.relrowsecurity
    and not exists(select 1 from pg_catalog.pg_policy p where p.polrelid=c.oid);

  select count(*) into v_mutable_search_path
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','alsamos_ops')
    and p.prokind='f'
    and not exists(
      select 1 from pg_catalog.pg_depend d
      where d.classid='pg_proc'::regclass
        and d.objid=p.oid
        and d.deptype='e'
    )
    and not exists(
      select 1
      from unnest(coalesce(p.proconfig,array[]::text[])) cfg
      where cfg like 'search_path=%'
    );

  select count(*) into v_anon_definer
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE');

  select count(*) into v_anon_definer_unreviewed
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  left join private.security_rpc_exposure_allowlist a
    on a.signature=(p.proname||'('||pg_catalog.pg_get_function_identity_arguments(p.oid)||')')
  where n.nspname='public'
    and p.prosecdef
    and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')
    and a.signature is null;

  select count(*) into v_anon_definer_trigger
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.prorettype='pg_catalog.trigger'::regtype
    and pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE');

  select count(*) into v_public_extensions
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid=e.extnamespace
  where n.nspname='public';

  v_chain:=public.admin_verify_audit_chain_v1();

  select count(*) filter(where country_code is not null),
         count(*) filter(where country_code is null)
    into v_country_known,v_country_unknown
  from private.user_country_resolution;

  return jsonb_build_object(
    'checked_at',now(),
    'audit_chain',v_chain,
    'rls_exposed_without_policy',v_rls_no_policy,
    'security_definer_public_execute',v_anon_definer,
    'advisor',jsonb_build_object(
      'rls_enabled_no_policy',v_rls_no_policy,
      'mutable_search_path',v_mutable_search_path,
      'anon_security_definer_rpc',v_anon_definer,
      'anon_security_definer_unreviewed',v_anon_definer_unreviewed,
      'anon_security_definer_trigger',v_anon_definer_trigger,
      'extensions_in_public',v_public_extensions
    ),
    'country_resolution',jsonb_build_object(
      'resolved',coalesce(v_country_known,0),
      'unknown',coalesce(v_country_unknown,0),
      'coverage_pct',case
        when coalesce(v_country_known,0)+coalesce(v_country_unknown,0)=0 then 0
        else round(100.0*v_country_known/(v_country_known+v_country_unknown),1)
      end
    ),
    'sla',jsonb_build_object(
      'at_risk',(select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and sla_state='at_risk'),
      'breached',(select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and sla_state='breached')
    ),
    'enforcement',jsonb_build_object(
      'failed',(select count(*) from public.enforcement_actions where status='failed'),
      'retry_requests',(select count(*) from public.enforcement_retry_requests),
      'retry_failed',(select count(*) from public.enforcement_retry_requests where status='failed')
    ),
    'audit_exports',jsonb_build_object(
      'total',(select count(*) from public.admin_audit_export_manifests),
      'latest_at',(select max(created_at) from public.admin_audit_export_manifests)
    )
  );
end;
$$;
revoke all on function public.admin_security_posture_v1() from public,anon;
grant execute on function public.admin_security_posture_v1() to authenticated;

notify pgrst,'reload schema';
