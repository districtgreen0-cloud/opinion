#!/usr/bin/env bash
# One-shot setup: installs both apps and prepares the local database.
set -euo pipefail
cd "$(dirname "$0")/.."

need() { command -v "$1" >/dev/null || { echo "✗ $1 is required ($2)"; exit 1; }; }
need node "https://nodejs.org — v20+"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || { echo "✗ Node 20+ required (found $(node -v))"; exit 1; }

echo "→ installing web"
npm --prefix web ci || npm --prefix web install
echo "→ installing worker"
npm --prefix worker ci || npm --prefix worker install
echo "→ applying D1 migrations locally"
npm --prefix worker run migrate:local

echo
echo "✓ ready"
echo "  npm run dev        demo mode   → http://localhost:4700"
echo "  npm run dev:live   full stack  → http://localhost:4700 (API on :8787)"
echo "  npm run deploy     Cloudflare  (see BUILD.md §4 first)"
