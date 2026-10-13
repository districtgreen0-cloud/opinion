#!/usr/bin/env bash
# Full stack locally: Worker + Durable Objects + D1 on :8787, Vite on :4700 pointed at it.
set -euo pipefail
cd "$(dirname "$0")/.."
npm --prefix worker run dev &
API=$!
trap 'kill $API 2>/dev/null' EXIT
until curl -sf http://localhost:8787/api/health >/dev/null; do sleep 1; done
VITE_API_URL=http://localhost:8787 npm --prefix web run dev
