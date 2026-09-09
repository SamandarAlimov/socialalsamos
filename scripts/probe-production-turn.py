#!/usr/bin/env python3
"""Probe the production TURN configuration without printing credentials.

The browser can report that TURN is *configured* even when the server never
returns a relay allocation. This script reads the same call_webrtc_config row
used by the web client and performs authenticated allocations with coturn's
turnutils_uclient over every configured TURN transport.
"""

from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs


@dataclass(frozen=True)
class TurnEndpoint:
    scheme: str
    host: str
    port: int
    transport: str
    username: str
    credential: str


def parse_turn_url(url: str, username: str, credential: str) -> TurnEndpoint | None:
    raw = url.strip()
    lower = raw.lower()
    if not (lower.startswith("turn:") or lower.startswith("turns:")):
        return None

    scheme, rest = raw.split(":", 1)
    scheme = scheme.lower()
    rest = rest.lstrip("/")
    authority, _, query = rest.partition("?")

    host = authority
    port = 5349 if scheme == "turns" else 3478

    if authority.startswith("["):
        closing = authority.find("]")
        if closing < 0:
            raise ValueError(f"Invalid bracketed TURN host: {raw}")
        host = authority[1:closing]
        suffix = authority[closing + 1 :]
        if suffix.startswith(":"):
            port = int(suffix[1:])
    elif authority.count(":") == 1:
        host, port_text = authority.rsplit(":", 1)
        port = int(port_text)

    params = parse_qs(query)
    transport = (params.get("transport", ["tcp" if scheme == "turns" else "udp"])[0] or "udp").lower()

    return TurnEndpoint(
        scheme=scheme,
        host=host,
        port=port,
        transport=transport,
        username=username,
        credential=credential,
    )


def url_list(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value if item]
    return []


def load_endpoints(path: Path) -> list[TurnEndpoint]:
    rows = json.loads(path.read_text())
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("Production call_webrtc_config ice_servers row is missing")

    value = rows[0].get("value") if isinstance(rows[0], dict) else None
    if not isinstance(value, list):
        raise RuntimeError("Production ice_servers value is not an array")

    endpoints: list[TurnEndpoint] = []
    for index, server in enumerate(value):
        if not isinstance(server, dict):
            continue
        username = str(server.get("username") or "")
        credential = str(server.get("credential") or server.get("password") or "")
        for raw_url in url_list(server.get("urls") or server.get("url")):
            endpoint = parse_turn_url(raw_url, username, credential)
            if endpoint:
                endpoints.append(endpoint)
                print(
                    "TURN config",
                    {
                        "entry": index,
                        "scheme": endpoint.scheme,
                        "host": endpoint.host,
                        "port": endpoint.port,
                        "transport": endpoint.transport,
                        "usernamePresent": bool(endpoint.username),
                        "credentialPresent": bool(endpoint.credential),
                    },
                )

    if not endpoints:
        raise RuntimeError("No TURN endpoint exists in production ice_servers config")
    return endpoints


def received_bytes(output: str) -> int:
    values = [int(value) for value in re.findall(r"tot_recv_bytes\s*~?\s*(\d+)", output)]
    return max(values, default=0)


def probe(endpoint: TurnEndpoint) -> tuple[bool, str]:
    if not endpoint.username or not endpoint.credential:
        return False, "TURN endpoint has no username/credential"

    try:
        addresses = socket.getaddrinfo(endpoint.host, endpoint.port, type=socket.SOCK_STREAM if endpoint.transport == "tcp" else socket.SOCK_DGRAM)
        if not addresses:
            return False, "DNS returned no address"
    except Exception as exc:  # pragma: no cover - network diagnostic
        return False, f"DNS failed: {type(exc).__name__}: {exc}"

    cmd = [
        "timeout",
        "20s",
        "turnutils_uclient",
        "-y",
        "-m",
        "2",
        "-n",
        "1",
        "-u",
        endpoint.username,
        "-w",
        endpoint.credential,
        "-p",
        str(endpoint.port),
    ]
    if endpoint.transport == "tcp" or endpoint.scheme == "turns":
        cmd.append("-t")
    if endpoint.scheme == "turns":
        cmd.append("-S")
    cmd.append(endpoint.host)

    completed = subprocess.run(cmd, capture_output=True, text=True, check=False)
    output = (completed.stdout or "") + "\n" + (completed.stderr or "")
    # Never allow credentials or usernames to leak into Actions logs.
    output = output.replace(endpoint.credential, "***").replace(endpoint.username, "***")
    recv = received_bytes(output)
    success = completed.returncode == 0 and recv > 0

    if success:
        return True, f"authenticated allocation + relay traffic succeeded ({recv} received bytes)"

    interesting = []
    for line in output.splitlines():
        lowered = line.lower()
        if any(token in lowered for token in ("error", "fail", "401", "438", "recv_bytes", "cannot", "timeout")):
            interesting.append(line.strip())
    detail = "; ".join(interesting[-6:]) or f"turnutils_uclient exit={completed.returncode}, received={recv}"
    return False, detail[:1200]


def main() -> int:
    config_path = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/ice-config.json")
    endpoints = load_endpoints(config_path)

    passed = 0
    for endpoint in endpoints:
        label = f"{endpoint.scheme}:{endpoint.host}:{endpoint.port}?transport={endpoint.transport}"
        ok, detail = probe(endpoint)
        print(("PASS" if ok else "FAIL"), label, "-", detail)
        passed += int(ok)

    print(f"TURN_RESULT passed={passed} total={len(endpoints)}")
    if passed == 0:
        print("TURN_ROOT_CAUSE: production TURN is configured but cannot create a usable relay allocation")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
