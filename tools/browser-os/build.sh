#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
OUTPUT=${1:-"$ROOT/apps/main/client/public/browser-os/alpine-3.24.2-v86-0.5.469"}
OUTPUT=$(mkdir -p "$OUTPUT" && CDPATH= cd -- "$OUTPUT" && pwd)

if [ -n "$(find "$OUTPUT" -mindepth 1 -print -quit)" ]; then
  printf '%s\n' "Refusing to overwrite non-empty output directory: $OUTPUT" >&2
  exit 1
fi

IMAGE=local/browser-os-builder:alpine-3.24.2-v86-0.5.469
CONTAINER=browser-os-build-$$
INPUT=$(mktemp -d)

cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  if [ -d "$INPUT/portfolio" ]; then
    if ! chmod -R u+w "$INPUT/portfolio"; then
      [ "$status" -ne 0 ] || status=1
    fi
  fi
  if ! rm -rf "$INPUT"; then
    [ "$status" -ne 0 ] || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

node --experimental-strip-types "$ROOT/tools/browser-os/export-portfolio.mjs" "$INPUT/portfolio"
node --experimental-strip-types "$ROOT/tools/browser-os/guest-build-inputs.mjs" "$ROOT" "$INPUT"
docker build --platform linux/arm64 \
  --file "$ROOT/tools/browser-os/Dockerfile" \
  --tag "$IMAGE" \
  "$ROOT/tools/browser-os"
docker create --platform linux/arm64 --tmpfs /tmp/browser-os-initramfs:rw,exec,nosuid,size=256m --name "$CONTAINER" "$IMAGE" >/dev/null
docker cp "$INPUT/portfolio" "$CONTAINER:/input/"
docker cp "$INPUT/guest-build-inputs.json" "$CONTAINER:/input/"
docker start --attach "$CONTAINER"
docker cp "$CONTAINER:/out/." "$OUTPUT/"
