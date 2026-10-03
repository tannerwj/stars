#!/usr/bin/env bash
# scripts/e2e-chrome.sh — ensure the sandbox test browser is up for `npm run test:e2e`.
#
# Sandbox Chromium cannot reach localhost or public HTTPS directly, so the
# e2e suite (e2e.config.ts) attaches over CDP to a headless Chromium that
# routes through a local forward proxy. This script launches a dedicated
# browser stack for this repo so parallel sessions can't disturb the run:
#   scripts/proxy_fwd.py  (FWD_PORT=8899) — forward proxy chaining to the
#                         sandbox egress proxy (adds Proxy-Authorization)
#   Chromium              — headless, CDP on 127.0.0.1:9223, proxy :8899
#
# Idempotent: safe to run before every test run. E2E_CDP_PORT overrides the
# CDP port (e2e.config.ts reads E2E_CDP / E2E_CDP_PORT).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CDP_PORT="${E2E_CDP_PORT:-9223}"
FWD_PORT="${E2E_FWD_PORT:-8899}"

# Dedicated forward proxy for this repo's suite.
if ! curl -s -o /dev/null --max-time 3 -x "http://127.0.0.1:${FWD_PORT}" https://example.com/ 2>/dev/null; then
  echo "starting forward proxy on 127.0.0.1:${FWD_PORT}…"
  FWD_PORT="${FWD_PORT}" nohup python3 "$HERE/proxy_fwd.py" > "/tmp/e2e-fwdproxy-${FWD_PORT}.log" 2>&1 &
  sleep 1
fi

# Dedicated Chromium for this repo's suite.
if ! curl -s --max-time 2 "http://127.0.0.1:${CDP_PORT}/json/version" > /dev/null 2>&1; then
  echo "starting Chromium with CDP on :${CDP_PORT}…"
  rm -rf /tmp/e2e-chrome-profile-stars && mkdir -p /tmp/e2e-chrome-profile-stars
  nohup /opt/meta-chromium/chrome --headless --no-sandbox --disable-gpu \
    --user-data-dir=/tmp/e2e-chrome-profile-stars \
    --remote-debugging-port="${CDP_PORT}" \
    --proxy-server="http://127.0.0.1:${FWD_PORT}" \
    --ignore-certificate-errors \
    --no-first-run --no-default-browser-check \
    about:blank > /tmp/e2e-chromium-stars.log 2>&1 &
  for _ in $(seq 1 30); do
    curl -s --max-time 2 "http://127.0.0.1:${CDP_PORT}/json/version" > /dev/null 2>&1 && break
    sleep 1
  done
fi
echo "chromium up on :${CDP_PORT} (proxy :${FWD_PORT})"
