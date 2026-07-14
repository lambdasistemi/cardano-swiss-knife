#!/usr/bin/env bash
# Score every captured screenshot with a headless Claude vision pass -> per-scenario JSON.
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
out="$dir/out"
rubric="$dir/rubric.md"
shopt -s nullglob
: > "$out/judge.err"
for img in "$out"/[0-9]*.png; do
  name="$(basename "$img" .png)"
  scenario="${name%@*}"
  vp="${name##*@}"
  width="${vp##*-}"
  prompt="You are a strict UX judge. Use the Read tool to view the screenshot at ${img} and read the rubric at ${rubric}. It is scenario '${scenario}' of the Ledger Inspector SPA, captured at the ${vp} viewport (${width}px wide) — judge how well the layout holds AT THIS width (clean reflow, no cramping/clipping/overlap, no horizontal scroll, controls still usable) as part of every relevant dimension; a narrow view must be composed for its width, not a squished desktop. Score against every rubric dimension and output ONLY the JSON object the rubric specifies with scenario set to '${name}' — no prose, no markdown fences."
  echo "judging ${name} ..."
  if ! claude -p "$prompt" --allowedTools "Read" > "$out/${name}.judge.txt" 2>>"$out/judge.err"; then
    echo "  claude failed for ${name} (see out/judge.err)"
  fi
done
echo "judging done"
