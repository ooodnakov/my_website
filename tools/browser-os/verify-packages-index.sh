#!/bin/sh
# Verify that apk resolved against the Alpine index snapshot recorded in the
# guest package lock.
#
# Usage: verify-packages-index.sh <packages.lock> <directory-with-indexes>
#
# Alpine release branches are mutable: when a security update lands, the
# superseded version is removed from the CDN and a version pin that the lock
# names can no longer be selected. apk caches the index it actually used under
# /var/cache/apk, so hashing that cache answers the only question that matters:
# did the solver see the snapshot the pins were generated from?
set -eu

fail() { printf '%s\n' "browser-os package lock: $*" >&2; exit 1; }

[ "$#" -eq 2 ] || fail 'usage: verify-packages-index.sh <packages.lock> <directory-with-indexes>'
LOCK=$1
INDEX_DIR=$2
[ -f "$LOCK" ] || fail "missing $LOCK"
[ -d "$INDEX_DIR" ] || fail "missing index directory $INDEX_DIR"

locked_index_sha() {
  sed -n "s/^# index $1 sha256 //p" "$LOCK"
}

CACHE=$(mktemp)
trap 'rm -f "$CACHE"' EXIT HUP INT TERM
find "$INDEX_DIR" -type f -exec sha256sum {} \; > "$CACHE"
[ -s "$CACHE" ] || fail "no cached index files under $INDEX_DIR"

for repository in main community; do
  expected_sha=$(locked_index_sha "$repository")
  [ -n "$expected_sha" ] ||
    fail "records no $repository index sha256; regenerate the lock with tools/browser-os/refresh-packages-lock.sh"
  grep -q "^$expected_sha " "$CACHE" ||
    fail "$repository index does not match the recorded snapshot $expected_sha;
  the branch moved. Run tools/browser-os/refresh-packages-lock.sh and review the
  resulting package version bumps together with this build."
done