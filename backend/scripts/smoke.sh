#!/usr/bin/env bash
# Smoke-test the Lightfern Reach API (health, brief, streamed run).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8787}"
BASE_URL="${BASE_URL%/}"

echo "==> health"
curl -sf "${BASE_URL}/api/health" | head -c 500
echo
echo

echo "==> brief"
BRIEF_JSON="$(curl -sf -X POST "${BASE_URL}/api/brief" \
  -H 'Content-Type: application/json' \
  -d '{
    "description": "pre-seed investors in London who back AI sales tools",
    "targetType": "investors",
    "goal": "introduce our Lightfern hackathon project",
    "location": "London"
  }')"
echo "${BRIEF_JSON}" | head -c 400
echo
echo

echo "==> run (SSE stream)"
curl -sfN -X POST "${BASE_URL}/api/run" \
  -H 'Content-Type: application/json' \
  -d "{\"brief\": $(echo "${BRIEF_JSON}" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["brief"]))')}" \
  | while IFS= read -r line; do
      if [[ "${line}" == data:* ]]; then
        echo "${line}" | head -c 120
        echo
      fi
    done

echo
echo "smoke OK"
