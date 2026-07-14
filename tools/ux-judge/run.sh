#!/usr/bin/env bash
# Full UX-judge loop: capture the SPA -> vision-judge each screen -> aggregate a scored
# punch-list. Run inside the dev shell so node/playwright/claude are all on PATH:
#   nix develop -c bash tools/ux-judge/run.sh
# Target a preview or local build with UX_BASE_URL=... (default: live prod inspector).
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
export UX_STAMP="${UX_STAMP:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
NM="$(dirname "$(dirname "$(readlink -f "$(command -v playwright)")")")/lib/node_modules"
export NODE_PATH="$NM"

echo "== capture =="
node "$dir/capture.mjs"
echo "== judge =="
bash "$dir/judge.sh"
echo "== report =="
node "$dir/report.mjs"
echo
echo "report -> $dir/out/report.md"
