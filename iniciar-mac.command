#!/bin/bash
set -e
cd "$(dirname "$0")"
docker compose up --build --wait -d
open http://127.0.0.1:52655
echo 'Usuario: deksa. Clave local: local.'
