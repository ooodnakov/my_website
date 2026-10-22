#!/bin/sh
# Verify a staged Alpine index tree against the snapshot recorded in the guest
# package lock.
#
# Usage: verify-packages-index.sh <packages.lock> <staged-index-root>
#
# The staged root must hold <repository>/x86/APKINDEX.tar.gz for every Alpine
# repository the guest build resolves against. Each file must match the sha256
# recorded in the lock header; a mismatch means the mutable branch has moved and
# the version pins below are no longer the ones the index offers.
set -eu

fail() { printf '%s\n' "browser-os package lock: $*" >&2; exit 1; }

[ "$#" -eq 2 ] || fail 'usage: verify-packages-index.sh <packages.lock> <staged-index-root>'
LOCK=$1
INDEX_ROOT=$2
[ -f "$LOCK" ] || fail "missing $LOCK"
[ -d "$INDEX_ROOT" ] || fail "missing staged index root $INDEX_ROOT"

locked_index_sha() {
  sed -n "s/^# index $1 sha256 //p" "$LOCK"
}

for repository in main community; do
  expected_sha=$(locked_index_sha "$repository")
  [ -n "$expected_sha" ] ||
    fail "records no $repository index sha256; regenerate the lock with tools/browser-os/refresh-packages-lock.sh"
  index="$INDEX_ROOT/$repository/x86/APKINDEX.tar.gz"
  [ -f "$index" ] || fail "missing staged $repository index at $index"
  actual_sha=$(sha256sum "$index" | cut -d ' ' -f 1)
  [ "$actual_sha" = "$expected_sha" ] ||
    fail "$repository index sha256 mismatch: $actual_sha != $expected_sha;
  the branch moved. Run tools/browser-os/refresh-packages-lock.sh and review the
  resulting package version bumps together with this build."
done