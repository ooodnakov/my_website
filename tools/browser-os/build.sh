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

docker build --platform linux/arm64 \
  --file "$ROOT/tools/browser-os/Dockerfile" \
  --tag "$IMAGE" \
  "$ROOT/tools/browser-os"
docker create --platform linux/arm64 --name "$CONTAINER" "$IMAGE" >/dev/null
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
docker start --attach "$CONTAINER"
docker cp "$CONTAINER:/out/." "$OUTPUT/"
