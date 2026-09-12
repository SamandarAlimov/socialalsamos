#!/usr/bin/env python3
"""Inventory custom runtime secret names used by Supabase Edge Functions.

The script never reads or prints secret values. It scans function source code for
common environment access patterns and excludes variables Supabase injects for
Edge Functions automatically.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FUNCTIONS = ROOT / "supabase" / "functions"

PLATFORM_MANAGED = {
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "SB_REGION",
    "SB_EXECUTION_ID",
    "SB_DEPLOYMENT_ID",
    "DENO_DEPLOYMENT_ID",
}

PATTERNS = [
    re.compile(r"Deno\.env\.get\(\s*['\"]([A-Z][A-Z0-9_]*)['\"]\s*\)"),
    re.compile(r"process\.env\.([A-Z][A-Z0-9_]*)"),
    re.compile(r"process\.env\[\s*['\"]([A-Z][A-Z0-9_]*)['\"]\s*\]"),
    # A number of Alsamos functions wrap Deno.env.get in env()/getEnv().
    re.compile(r"\b(?:env|getEnv|requireEnv|optionalEnv)\(\s*['\"]([A-Z][A-Z0-9_]*)['\"]\s*\)"),
]


def discover() -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    if not FUNCTIONS.exists():
        raise SystemExit(f"Edge Functions directory not found: {FUNCTIONS}")

    for path in sorted(FUNCTIONS.rglob("*")):
        if not path.is_file() or path.suffix not in {".ts", ".tsx", ".js", ".mjs"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for pattern in PATTERNS:
            for name in pattern.findall(text):
                if name in PLATFORM_MANAGED:
                    continue
                rel = str(path.relative_to(ROOT))
                found.setdefault(name, set()).add(rel)
    return found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", help="Write the secret names to this file")
    parser.add_argument(
        "--details",
        action="store_true",
        help="Also print source files that reference each secret name",
    )
    args = parser.parse_args()

    found = discover()
    names = sorted(found)

    print(f"Custom Edge Function runtime secrets referenced by source: {len(names)}")
    for name in names:
        if args.details:
            files = ", ".join(sorted(found[name]))
            print(f"- {name}: {files}")
        else:
            print(f"- {name}")

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text("".join(f"{name}\n" for name in names), encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
