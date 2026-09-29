#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
docker compose up --build --wait -d
xdg-open http://127.0.0.1:52655 >/dev/null 2>&1 || true
echo 'Abrí http://127.0.0.1:52655 — usuario deksa, clave local.'
