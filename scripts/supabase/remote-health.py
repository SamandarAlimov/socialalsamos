#!/usr/bin/env python3
"""Read-only production schema checks through the Supabase Management API.

Requires SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF. The token value is never
printed. This lets CI decide whether a project is truly fresh and verify the
critical Alsamos backend after migrations without needing a service-role key.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def query(sql: str) -> list[dict]:
    token = required_env("SUPABASE_ACCESS_TOKEN")
    project_ref = required_env("SUPABASE_PROJECT_REF")
    url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
    body = json.dumps({"query": sql, "read_only": True}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "AlsamosSupabaseDeploy/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:2000]
        raise SystemExit(f"Supabase Management API query failed ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Supabase Management API is unreachable: {exc.reason}") from exc

    # The Management API has used both direct row arrays and wrapped result
    # shapes over time. Accept the known shapes while keeping checks strict.
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        for key in ("result", "data", "rows"):
            value = payload.get(key)
            if isinstance(value, list):
                return [row for row in value if isinstance(row, dict)]
            if isinstance(value, dict):
                rows = value.get("rows")
                if isinstance(rows, list):
                    return [row for row in rows if isinstance(row, dict)]
        # Some API versions return a single row object directly.
        if payload:
            return [payload]
    raise SystemExit(f"Unexpected Management API response shape: {type(payload).__name__}")


def first_row(sql: str) -> dict:
    rows = query(sql)
    if not rows:
        raise SystemExit("Supabase Management API returned no rows")
    return rows[0]


def bool_value(row: dict, name: str) -> bool:
    value = row.get(name)
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).lower() in {"true", "t", "1", "yes"}


def detect_mode() -> str:
    row = first_row(
        """
        select
          to_regclass('public.profiles') is not null as profiles_exists,
          to_regclass('public.posts') is not null as posts_exists,
          to_regclass('public.comments') is not null as comments_exists,
          to_regclass('public.messages') is not null as messages_exists,
          (
            select count(*)::int
            from pg_catalog.pg_tables
            where schemaname = 'public'
              and tablename <> 'spatial_ref_sys'
          ) as public_table_count;
        """
    )
    core = [
        bool_value(row, "profiles_exists"),
        bool_value(row, "posts_exists"),
        bool_value(row, "comments_exists"),
        bool_value(row, "messages_exists"),
    ]
    table_count = int(row.get("public_table_count") or 0)

    if all(core):
        return "incremental"
    if not any(core) and table_count == 0:
        return "fresh"
    return "mixed"


def verify() -> None:
    row = first_row(
        """
        select
          to_regclass('public.profiles') is not null as profiles_exists,
          to_regclass('public.posts') is not null as posts_exists,
          to_regclass('public.comments') is not null as comments_exists,
          to_regclass('public.messages') is not null as messages_exists,
          to_regclass('public.user_addresses') is not null as marketplace_addresses_exists,
          to_regclass('public.user_stores') is not null as marketplace_stores_exists,
          to_regclass('public.web_search_documents') is not null as search_index_exists,
          exists (
            select 1
            from pg_catalog.pg_proc p
            join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname = 'create_wallet_payment_intent'
          ) as wallet_rpc_exists,
          exists (
            select 1
            from pg_catalog.pg_trigger t
            join pg_catalog.pg_class c on c.oid = t.tgrelid
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            join pg_catalog.pg_proc p on p.oid = t.tgfoid
            join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
            where n.nspname = 'auth'
              and c.relname = 'users'
              and not t.tgisinternal
              and pn.nspname = 'public'
              and p.proname = 'handle_new_user'
          ) as auth_profile_trigger_exists,
          coalesce((
            select count(*)::int
            from auth.users u
            left join public.profiles p on p.id = u.id
            where p.id is null
          ), 0) as auth_users_without_profiles,
          coalesce((
            select c.relrowsecurity
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'profiles'
          ), false) as profiles_rls,
          coalesce((
            select c.relrowsecurity
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'posts'
          ), false) as posts_rls,
          coalesce((
            select c.relrowsecurity
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'comments'
          ), false) as comments_rls,
          coalesce((
            select c.relrowsecurity
            from pg_catalog.pg_class c
            join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = 'messages'
          ), false) as messages_rls;
        """
    )

    required_bools = [
        "profiles_exists",
        "posts_exists",
        "comments_exists",
        "messages_exists",
        "marketplace_addresses_exists",
        "marketplace_stores_exists",
        "search_index_exists",
        "wallet_rpc_exists",
        "auth_profile_trigger_exists",
        "profiles_rls",
        "posts_rls",
        "comments_rls",
        "messages_rls",
    ]
    failures = [name for name in required_bools if not bool_value(row, name)]
    missing_profiles = int(row.get("auth_users_without_profiles") or 0)
    if missing_profiles:
        failures.append(f"auth_users_without_profiles={missing_profiles}")

    if failures:
        print("Supabase backend health check FAILED:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        raise SystemExit(1)

    print("Supabase backend health check passed:")
    print("- core social tables: profiles, posts, comments, messages")
    print("- marketplace foundation: user_addresses, user_stores")
    print("- global search index: web_search_documents")
    print("- wallet RPC: create_wallet_payment_intent")
    print("- auth -> profile trigger present and all Auth users have profiles")
    print("- RLS enabled on core social tables")


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    mode_parser = sub.add_parser("mode", help="Detect fresh/incremental/mixed schema state")
    mode_parser.add_argument("--github-output", help="Optional path to $GITHUB_OUTPUT")
    sub.add_parser("verify", help="Verify the critical production schema")
    args = parser.parse_args()

    if args.command == "mode":
        mode = detect_mode()
        print(mode)
        if args.github_output:
            with open(args.github_output, "a", encoding="utf-8") as handle:
                handle.write(f"detected_mode={mode}\n")
        return 0

    verify()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
