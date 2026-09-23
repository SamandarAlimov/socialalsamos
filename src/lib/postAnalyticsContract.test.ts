import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(path: string) {
  return readFileSync(resolve(process.cwd(), 'src', path), 'utf8');
}

function root(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('creator analytics contracts', () => {
  it('keeps qualified telemetry independent from the legacy unique-view row', () => {
    const hook = src('hooks/usePostViews.ts');

    expect(hook).toContain('createQualifiedSessionId');
    expect(hook).toContain("path === '/' || path === '/home'");
    expect(hook).toContain("document.querySelectorAll<HTMLVideoElement>('video')");
    expect(hook).toContain('MAX_ANALYTICS_SESSIONS');
    expect(hook).toContain('analyticsRetryAfter');
    expect(hook).toContain("onConflict: 'post_id,user_id'");
  });

  it('refreshes creator insights from realtime changes and a visibility-aware poll', () => {
    const hook = src('hooks/usePostInsights.ts');

    expect(hook).toContain(".channel(`post-insights:${postId}:${user.id}`)");
    expect(hook).toContain("table: 'post_views'");
    expect(hook).toContain("table: 'post_likes'");
    expect(hook).toContain("table: 'comments'");
    expect(hook).toContain("table: 'reposts'");
    expect(hook).toContain("table: 'bookmarks'");
    expect(hook).toContain('30_000');
    expect(hook).toContain('isRecoverableInsightsRpc');
    expect(hook).toContain("data_source: 'client_fallback'");
  });

  it('tracks successful share actions through the canonical share rpc', () => {
    const dialog = src('components/SharePostDialog.tsx');

    expect(dialog).toContain("rpc('track_post_share'");
    expect(dialog).toContain("trackShare('internal_chat', 'chat')");
    expect(dialog).toContain("trackShare('copy_link', 'clipboard')");
    expect(dialog).toContain("trackShare('external'");
    expect(dialog).toContain("trackShare('native_share')");
  });

  it('keeps canonical share telemetry owner-scoped and window-aware', () => {
    const migration = root('supabase/migrations/20260923183000_creator_analytics_v2.sql');

    expect(migration).toContain('create table if not exists public.post_share_events');
    expect(migration).toContain('unique (actor_id, post_id, client_event_id)');
    expect(migration).toContain('grant execute on function public.track_post_share');
    expect(migration).toContain('grant execute on function public.get_post_insights(uuid, integer) to authenticated, service_role');
    expect(migration).toContain('and s.first_seen_at >= v_since');
    expect(migration).toContain("'data_source', 'server_rpc'");
    expect(migration).toContain("'telemetry_coverage_pct'");
    expect(migration).toContain('post_share_events_mark_analytics_engagement');
  });

  it('excludes creators and collaborators from audience/view analytics', () => {
    const migration = root('supabase/migrations/20260923190000_creator_analytics_integrity_v3.sql');

    expect(migration).toContain('delete from public.post_views pv');
    expect(migration).toContain('post_views_guard_creator');
    expect(migration).toContain('post_views_sync_count');
    expect(migration).toContain('v_owner = v_user');
    expect(migration).toContain("pc.status = 'accepted'");
    expect(migration).toContain("'historical_views_are_unique', true");
    expect(migration).toContain("'views_include_qualified_sessions', true");
    expect(migration).toContain("'canonical_share_events', true");
  });

  it('counts qualified repeat sessions as views without double-counting the first unique row', () => {
    const migration = root('supabase/migrations/20260923190000_creator_analytics_integrity_v3.sql');

    expect(migration).toContain('v_views := v_historical_views + v_telemetry_views');
    expect(migration).toContain('abs(extract(epoch from (s.first_seen_at - pv.viewed_at))) <= 300');
    expect(migration).toContain('union\n    select s.viewer_id');
    expect(migration).toContain('combined_view_counts');
  });
});
