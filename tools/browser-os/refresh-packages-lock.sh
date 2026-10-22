#!/bin/sh
# Regenerate packages.lock from a freshly downloaded Alpine index snapshot.
#
# Alpine release branches are mutable: when v3.24 receives a security update the
# superseded package version is removed from the CDN, so a version pin that was
# correct yesterday can no longer be installed today. This script pins the index
# the versions were read from, so the lock and the resolver can never disagree.
set -eu

BRANCH=${ALPINE_BRANCH:-v3.24}
ARCH=${ALPINE_ARCH:-x86}
REPOSITORIES=${ALPINE_REPOSITORIES:-main community}
MIRROR=${ALPINE_MIRROR:-https://dl-cdn.alpinelinux.org/alpine}
TOOLS=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
LOCK="$TOOLS/packages.lock"

TEMP=$(mktemp -d)
trap 'rm -rf "$TEMP"' EXIT HUP INT TERM

fail() { printf '%s\n' "browser-os package lock: $*" >&2; exit 1; }
[ -f "$LOCK" ] || fail "missing $LOCK"

# Emit "<name> <version>" for every entry of an APKINDEX. Blank lines separate
# records; P: and V: always lead a record.
read_index() {
  tar -xzOf "$1" APKINDEX | awk '
    /^P:/ { name = substr($0, 3) }
    /^V:/ && name != "" { printf "%s %s\n", name, substr($0, 3) }
    /^$/ { name = "" }
  '
}

main_sha=
community_sha=
: > "$TEMP/index"
for repository in $REPOSITORIES; do
  url="$MIRROR/$BRANCH/$repository/$ARCH/APKINDEX.tar.gz"
  wget -q "$url" -O "$TEMP/$repository.tar.gz"
  read_index "$TEMP/$repository.tar.gz" >> "$TEMP/index"
  sha=$(sha256sum "$TEMP/$repository.tar.gz" | cut -d ' ' -f 1)
  case "$repository" in
    main) main_sha=$sha ;;
    community) community_sha=$sha ;;
    *) fail "unsupported repository '$repository'" ;;
  esac
done
[ -n "$main_sha" ] && [ -n "$community_sha" ] ||
  fail "expected main and community indexes for $REPOSITORIES"

# The required package set is the existing lock's names in their existing
# order; only versions and index hashes are regenerated.
awk '!/^#/ && NF == 1 { sub(/=.*$/, ""); print }' "$LOCK" > "$TEMP/required"

python3 - "$TEMP/index" "$TEMP/required" "$LOCK" "$main_sha" "$community_sha" "$BRANCH" <<'PY'
import sys

index_path, required_path, lock_path, main_sha, community_sha, branch = sys.argv[1:7]

live = {}
with open(index_path, encoding="utf-8") as handle:
    for line in handle:
        name, _, version = line.strip().partition(" ")
        if name:
            live[name] = version

with open(required_path, encoding="utf-8") as handle:
    required = [line.strip() for line in handle if line.strip()]

if not required:
    sys.exit(f"browser-os package lock: {lock_path} lists no packages")

absent = [name for name in required if name not in live]
if absent:
    sys.exit(
        f"browser-os package lock: removed from the Alpine {branch} branch: "
        f"{', '.join(absent)}; decide whether the guest still needs each "
        "package before dropping it"
    )

previous_pins = {}
with open(lock_path, encoding="utf-8") as handle:
    for line in handle:
        if line.startswith("#") or not line.strip():
            continue
        key, _, value = line.strip().partition("=")
        previous_pins[key] = value

drifted = []
lines = []
for name in required:
    version = live[name]
    previous = previous_pins.get(name)
    if previous is not None and previous != version:
        drifted.append(f"{name} {previous}->{version}")
    lines.append(f"{name}={version}")

header = [
    "# Alpine guest package lock for the visitor terminal.",
    "#",
    "# Every pin below is the version carried by the exact index snapshot named",
    "# in this header. Alpine release branches are mutable, so the build refuses",
    "# to resolve against a different snapshot instead of silently drifting.",
    "#",
    f"# index main sha256 {main_sha}",
    f"# index community sha256 {community_sha}",
    "#",
    "# Regenerate with tools/browser-os/refresh-packages-lock.sh and review the",
    "# resulting version bump as part of the change that needs it.",
    "",
]

with open(lock_path, "w", encoding="utf-8", newline="\n") as handle:
    handle.write("\n".join(header + lines) + "\n")

if drifted:
    print("refreshed pins: " + ", ".join(drifted))
else:
    print("package set unchanged")
PY