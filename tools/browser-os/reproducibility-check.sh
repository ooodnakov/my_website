#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"' EXIT HUP INT TERM
FIRST="$TEMP/first"
SECOND="$TEMP/second"
mkdir -p "$FIRST" "$SECOND"

if ! "$ROOT/tools/browser-os/build.sh" "$FIRST" >"$TEMP/first.log" 2>&1; then
  cat "$TEMP/first.log" >&2
  exit 1
fi
if ! "$ROOT/tools/browser-os/build.sh" "$SECOND" >"$TEMP/second.log" 2>&1; then
  cat "$TEMP/second.log" >&2
  exit 1
fi

read_filesystem_id() {
  result=
  while IFS= read -r line; do
    case "$line" in
      __BROWSER_OS_TMPFS_FSID__=*) result=${line#*=} ;;
    esac
  done < "$1"
  [ -n "$result" ] || { printf '%s\n' "missing tmpfs filesystem ID in $1" >&2; return 1; }
  printf '%s\n' "$result"
}
FIRST_FSID=$(read_filesystem_id "$TEMP/first.log")
SECOND_FSID=$(read_filesystem_id "$TEMP/second.log")
[ "$FIRST_FSID" != "$SECOND_FSID" ] || {
  printf '%s\n' "builds used the same initramfs staging filesystem: $FIRST_FSID" >&2
  exit 1
}

diff -qr "$FIRST" "$SECOND"
printf '%s\n' "byte-identical complete exports from distinct tmpfs filesystems ($FIRST_FSID, $SECOND_FSID)"
