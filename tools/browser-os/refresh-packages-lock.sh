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

# Alpine stamps each index with the aports commit that produced it, e.g.
# "v3.24.3-10-g058e35320f8". The manifest resolves every installed package back
# to an APKBUILD, so the recipe revisions have to come from the same snapshot as
# the package versions or provenance verification fails. The index carries only
# an abbreviated commit, which has to be expanded to the full revision the
# build fetches.
read_aports_commit() {
  description=$(tar -xzOf "$1" DESCRIPTION)
  case "$description" in
    *-g[0-9a-f]*) ;;
    *) fail "cannot read an aports commit from DESCRIPTION '$description'" ;;
  esac
  short=${description##*-g}
  commit=$(wget -qO- "$APORTS_API/commits/$short" |
    python3 -c 'import json,sys
try:
    print(json.load(sys.stdin)["sha"])
except Exception:
    sys.exit(1)') || fail "aports commit $short from $1 is not available"
  printf '%s\n' "$commit"
}

main_sha=
community_sha=
main_aports=
community_aports=
# API used only to expand an abbreviated aports revision into the full one.
APORTS_API=${APORTS_API:-https://api.github.com/repos/alpinelinux/aports}

: > "$TEMP/index"
for repository in $REPOSITORIES; do
  url="$MIRROR/$BRANCH/$repository/$ARCH/APKINDEX.tar.gz"
  wget -q "$url" -O "$TEMP/$repository.tar.gz"
  read_index "$TEMP/$repository.tar.gz" >> "$TEMP/index"
  sha=$(sha256sum "$TEMP/$repository.tar.gz" | cut -d ' ' -f 1)
  aports=$(read_aports_commit "$TEMP/$repository.tar.gz")
  case "$repository" in
    main) main_sha=$sha; main_aports=$aports ;;
    community) community_sha=$sha; community_aports=$aports ;;
    *) fail "unsupported repository '$repository'" ;;
  esac
done
[ -n "$main_sha" ] && [ -n "$community_sha" ] ||
  fail "expected main and community indexes for $REPOSITORIES"

# The guest root starts from a minirootfs, which is a release snapshot of its
# own. Pinning an older one against a newer branch leaves the base packages on
# the old release, and the manifest then cannot resolve them to recipes from
# this snapshot. Take the minirootfs matching alpine-base in this index.
base_version=$(awk '$1 == "alpine-base" { print $2; exit }' "$TEMP/index")
[ -n "$base_version" ] || fail 'the index does not list alpine-base'
MINIROOTFS_VERSION=${base_version%-r*}
MINIROOTFS_URL="$MIRROR/$BRANCH/releases/$ARCH/alpine-minirootfs-$MINIROOTFS_VERSION-$ARCH.tar.gz"
wget -q "$MINIROOTFS_URL" -O "$TEMP/minirootfs.tar.gz" ||
  fail "no minirootfs for $MINIROOTFS_VERSION at $MINIROOTFS_URL"
minirootfs_sha=$(sha256sum "$TEMP/minirootfs.tar.gz" | cut -d ' ' -f 1)
published_sha=$(wget -qO- "$MINIROOTFS_URL.sha256" | cut -d ' ' -f 1)
[ "$minirootfs_sha" = "$published_sha" ] ||
  fail "minirootfs $MINIROOTFS_VERSION sha256 $minirootfs_sha != published $published_sha"

# The required package set is the existing lock's names in their existing
# order; only versions and index hashes are regenerated.
awk '!/^#/ && NF == 1 { sub(/=.*$/, ""); print }' "$LOCK" > "$TEMP/required"

python3 - "$TEMP/index" "$TEMP/required" "$LOCK" "$main_sha" "$community_sha" "$BRANCH" \
  "$main_aports" "$community_aports" "$TOOLS/source_provenance.py" \
  "$MINIROOTFS_VERSION" "$minirootfs_sha" "$MINIROOTFS_URL" <<'PY'
import pathlib
import re
import sys

(
    index_path,
    required_path,
    lock_path,
    main_sha,
    community_sha,
    branch,
    main_aports,
    community_aports,
    provenance_path,
    minirootfs_version,
    minirootfs_sha,
    minirootfs_url,
) = sys.argv[1:13]

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
    "# The guest root is a minirootfs release; pinning an older one against this",
    "# snapshot leaves the base packages on the previous release.",
    f"# minirootfs {minirootfs_version} sha256 {minirootfs_sha}",
    f"# minirootfs url {minirootfs_url}",
    "#",
    "# The manifest resolves every installed package back to an APKBUILD, so the",
    "# recipe revisions must come from the snapshot that built these versions.",
    f"# aports main {main_aports}",
    f"# aports community {community_aports}",
    "#",
    "# Regenerate with tools/browser-os/refresh-packages-lock.sh and review the",
    "# resulting version bump as part of the change that needs it.",
    "",
]

with open(lock_path, "w", encoding="utf-8", newline="\n") as handle:
    handle.write("\n".join(header + lines) + "\n")

# Keep source_provenance.py in step with the snapshot it must resolve against.
provenance = pathlib.Path(provenance_path)
source = provenance.read_text(encoding="utf-8")
updated = source
for area, commit in (("main", main_aports), ("community", community_aports), ("testing", community_aports)):
    pattern = rf'^(APORTS_COMMITS = \{{.*?^\s*"{area}":\s*)"[0-9a-f]{{40}}"(,?)$'
    replacement = rf'\g<1>"{commit}"\g<2>'
    updated, count = re.subn(
        pattern, replacement, updated, count=1, flags=re.MULTILINE | re.DOTALL
    )
    if count != 1:
        sys.exit(f"browser-os package lock: could not update APORTS_COMMITS[{area!r}]")
updated, count = re.subn(
    r'^(APORTS_RECIPE_OVERRIDES = \{\s*"openssl":\s*\("main",\s*)"[0-9a-f]{40}"(\))',
    rf'\g<1>"{main_aports}"\g<2>',
    updated,
    count=1,
    flags=re.MULTILINE,
)
if count != 1:
    sys.exit(
        "browser-os package lock: could not update APORTS_RECIPE_OVERRIDES['openssl']"
    )
provenance.write_text(updated, encoding="utf-8", newline="\n")

if drifted:
    print("refreshed pins: " + ", ".join(drifted))
else:
    print("package set unchanged")
PY