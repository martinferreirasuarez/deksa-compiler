#!/usr/bin/env bash
set -euo pipefail

bundle_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fire_red_dir="$bundle_dir/pokefirered"
agbcc_dir="$bundle_dir/agbcc"

for tool in git node python3 make gcc g++ arm-none-eabi-as arm-none-eabi-ar; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Falta $tool. Instalá las herramientas de FireRed antes de continuar." >&2
    exit 1
  fi
done
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)' || {
  echo 'Se necesita Node.js 20 o posterior.' >&2
  exit 1
}
if [[ -e "$fire_red_dir" || -e "$agbcc_dir" ]]; then
  echo 'Ya existe pokefirered o agbcc en esta carpeta. No se sobrescribió nada.' >&2
  exit 1
fi

fire_red_commit="$(node -e 'process.stdout.write(require(process.argv[1]).fireRedCommit)' "$bundle_dir/bundle-manifest.json")"
agbcc_commit="$(node -e 'process.stdout.write(require(process.argv[1]).agbccCommit)' "$bundle_dir/bundle-manifest.json")"
fire_red_source="${DEKSA_FIRE_RED_SOURCE:-https://github.com/pret/pokefirered.git}"
agbcc_source="${DEKSA_AGBCC_SOURCE:-https://github.com/pret/agbcc.git}"

echo 'Preparando FireRed...'
git clone --quiet "$fire_red_source" "$fire_red_dir"
git -C "$fire_red_dir" checkout --quiet "$fire_red_commit"
git -C "$fire_red_dir" apply --check "$bundle_dir/fire-red-changes.patch"
git -C "$fire_red_dir" apply "$bundle_dir/fire-red-changes.patch"
cp -R "$bundle_dir/overlay/." "$fire_red_dir/"

echo 'Preparando el compilador de Game Boy Advance...'
git clone --quiet "$agbcc_source" "$agbcc_dir"
git -C "$agbcc_dir" checkout --quiet "$agbcc_commit"
(cd "$agbcc_dir" && bash ./build.sh && ./install.sh "$fire_red_dir")

echo 'Instalación lista. Ejecutá ./start.sh para abrir la app.'
