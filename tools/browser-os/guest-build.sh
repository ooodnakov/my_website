#!/bin/sh
set -eu

OUT=/out
WORK=/tmp/browser-os-build
ROOTFS="$WORK/rootfs"
V86_SOURCE="$WORK/v86"
V86_COMMIT=2d6f9aaa0d5357595cd7d7dd93065987ec1445b5
SEABIOS_COMMIT=ea1b7a0733906b8425d948ae94fba63c32b1d425
ALPINE_URL=https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/alpine-minirootfs-3.24.2-x86.tar.gz
ALPINE_SHA256=757f07c5a3476ba3947cfbea2323b7f02fb6fb2fba8a3a3c2b9d17f0a54c9226
V86_VERSION=0.5.469
V86_NPM_INTEGRITY=sha512-Yf7litYx7eOIf3xuijD//nViEJK+qy+TUwVNK/tufvlT9d5RkavHPH5qlvcuvsAkOgtHOd+jVT8wZeZqwJL5/A==
APORTS_MAIN_COMMIT=d5a34efc88bbe8d18737fda28125071c4aef8517
APORTS_COMMUNITY_COMMIT=7805e4fb29efc937492a3173e55dc72ecd9fcdaf
APORTS_OPENSSL_COMMIT=013edf8b29199933e8ea34dde460b5584b979042
APORTS_KERNEL_COMMIT=52fae6d7d56f3958f32e5bf9121a7536524b9ef4
SOURCE_DATE_EPOCH=1767225600
export SOURCE_DATE_EPOCH

fail() { printf '%s\n' "browser-os build: $*" >&2; exit 1; }
mkdir -p "$OUT"
[ -d "$OUT" ] || fail 'output directory not available'
rm -rf "$WORK"
mkdir -p "$ROOTFS" "$ROOTFS/tmp/mkinitfs-stage" "$OUT/alpine/9p/blob" "$OUT/alpine" "$OUT/v86" "$OUT/licenses"
printf '%s\n' "__BROWSER_OS_TMPFS_FSID__=$(stat -f -c %i /tmp/browser-os-initramfs)"

wget -q "$ALPINE_URL" -O "$WORK/alpine-minirootfs.tar.gz"
actual_alpine_sha=$(sha256sum "$WORK/alpine-minirootfs.tar.gz" | cut -d ' ' -f 1)
[ "$actual_alpine_sha" = "$ALPINE_SHA256" ] || fail "Alpine minirootfs sha256 mismatch: $actual_alpine_sha"
tar -xzf "$WORK/alpine-minirootfs.tar.gz" -C "$ROOTFS"
printf '%s\n' \
  'https://dl-cdn.alpinelinux.org/alpine/v3.24/main' \
  'https://dl-cdn.alpinelinux.org/alpine/v3.24/community' \
  > "$ROOTFS/etc/apk/repositories"

# PRoot's explicit qemu user-mode path executes x86 binaries without binfmt,
# elevated container capabilities, or host configuration changes.
cd /
PROOT_NET='proot -0 -q qemu-i386 -b /etc/resolv.conf:/etc/resolv.conf -r /tmp/browser-os-build/rootfs'
PROOT='proot -0 -q qemu-i386 -b /tmp/browser-os-initramfs:/tmp/mkinitfs-stage -r /tmp/browser-os-build/rootfs'
$PROOT_NET /sbin/apk update
set --
while IFS= read -r package; do
  case "$package" in ''|'#'*) continue ;; esac
  set -- "$@" "$package"
done < /usr/local/share/browser-os/packages.lock
$PROOT_NET /sbin/apk --no-scripts add "$@"
APORTS_SOURCE="$WORK/aports"
# GitHub mirror of Alpine's canonical GitLab aports repository for hosted CI access.
APORTS_MIRROR=https://github.com/alpinelinux/aports.git
git clone --filter=blob:none --no-checkout "$APORTS_MIRROR" "$APORTS_SOURCE"
git -C "$APORTS_SOURCE" fetch --depth=1 origin "$APORTS_COMMUNITY_COMMIT"
git -C "$APORTS_SOURCE" fetch --depth=1 origin "$APORTS_MAIN_COMMIT"
git -C "$APORTS_SOURCE" fetch --depth=1 origin "$APORTS_OPENSSL_COMMIT"
git -C "$APORTS_SOURCE" fetch --depth=1 origin "$APORTS_KERNEL_COMMIT"
git -C "$APORTS_SOURCE" checkout --detach "$APORTS_COMMUNITY_COMMIT"
[ -d /input/portfolio/en ] && [ -d /input/portfolio/ru ] || fail 'canonical portfolio exports are missing'
mkdir -p "$ROOTFS/portfolio"
cp -R /input/portfolio/. "$ROOTFS/portfolio/"
mkdir -p "$ROOTFS/usr/local/bin"
cp /usr/local/share/browser-os/guest/about /usr/local/share/browser-os/guest/contact /usr/local/share/browser-os/guest/cv /usr/local/share/browser-os/guest/links /usr/local/share/browser-os/guest/projects /usr/local/share/browser-os/guest/tour /usr/local/share/browser-os/guest/open /usr/local/share/browser-os/guest/copy-contact /usr/local/share/browser-os/guest/set-locale "$ROOTFS/usr/local/bin/"
install -D -m 0555 /usr/local/share/browser-os/guest/guestctl "$ROOTFS/usr/local/bin/guestctl"
install -D -m 0555 /usr/local/share/browser-os/guest/browser-osd "$ROOTFS/usr/local/sbin/browser-osd"
install -D -m 0444 /usr/local/share/browser-os/guest/zle-hooks.zsh "$ROOTFS/etc/browser-os/zle-hooks.zsh"

$PROOT /bin/sh -ec '
  passwd -l root
  mkdir -p /tmp /run /var/log /portfolio
  addgroup -g 1000 visitor
  adduser -D -u 1000 -G visitor -h /home/visitor -s /bin/zsh -g "Browser OS visitor" visitor
  # Verify BusyBox adduser -D left the visitor password locked.
  grep -q "^visitor:!" /etc/shadow || { echo "visitor account password is not locked" >&2; exit 1; }
  chown -R root:root /portfolio
  ln -s en /portfolio/current
  ln -s portfolio/current/site.json /site.json
  chmod -R a-w /portfolio
  chmod 0555 /portfolio
  chown -R 1000:1000 /home/visitor
  chmod 0700 /home/visitor
  chmod 1777 /tmp
  grep -qxF /bin/zsh /etc/shells || echo /bin/zsh >> /etc/shells
  rc-update add devfs sysinit
  rc-update add dmesg sysinit
  rc-update add mdev sysinit
  rc-update add sysctl boot
  rc-update add hostname boot
  rc-update add bootmisc boot
  rc-update add killprocs shutdown
  rc-update add mount-ro shutdown
  cat > /etc/inittab <<"EOF"
::sysinit:/sbin/openrc sysinit
::sysinit:/sbin/openrc boot
::wait:/sbin/openrc default
::respawn:/usr/local/sbin/browser-osd
::ctrlaltdel:/sbin/reboot
::shutdown:/sbin/openrc shutdown
EOF
  cat > /etc/motd <<"EOF"
Alpine Linux x86 guest; offline, ephemeral browser-local session.
Visitor tools: zsh, jq, git, eza, fzf, zoxide, guestctl.
EOF
  cat > /home/visitor/.zshrc <<"EOF"
export LANG=C.UTF-8
export PATH="/usr/local/bin:$PATH"
export TERM=xterm-256color
export HISTFILE=$HOME/.zsh_history
export HISTSIZE=10000 SAVEHIST=10000
setopt append_history share_history hist_ignore_all_dups
alias a="eza -lah --git --color-scale all -g --smart-group --icons always --hyperlink auto"
autoload -Uz compinit
compinit -C -u -d "$HOME/.zcompdump"
source /etc/browser-os/zle-hooks.zsh
if command -v zoxide >/dev/null 2>&1; then eval "$(zoxide init zsh)"; fi
autoload -Uz add-zsh-hook
_browser_os_shell_ready() {
  add-zsh-hook -d precmd _browser_os_shell_ready
  print -r -- "shellReady" >> /run/browser-os/shell-out 2>/dev/null
  print -r -- "__GUEST_READY__"
}
add-zsh-hook precmd _browser_os_shell_ready
EOF
  chown 1000:1000 /home/visitor/.zshrc
  chmod 0600 /home/visitor/.zshrc
'
HOME=/home/visitor $PROOT /bin/zsh -fc 'autoload -Uz compinit; compinit -u -d /home/visitor/.zcompdump'
chown 1000:1000 "$ROOTFS/home/visitor/.zcompdump"
chmod 0444 "$ROOTFS/home/visitor/.zcompdump"
python3 /usr/local/bin/normalize-shadow.py "$ROOTFS" "$SOURCE_DATE_EPOCH"
python3 /usr/local/bin/guest-build-identity.py /input/guest-build-inputs.json "$OUT/alpine/guest-build.json"
install -D -m 0444 "$OUT/alpine/guest-build.json" "$ROOTFS/etc/browser-os/guest-build.json"
cmp -s "$OUT/alpine/guest-build.json" "$ROOTFS/etc/browser-os/guest-build.json" || fail 'embedded guest build identity differs from published descriptor'

python3 -c 'import os,pathlib,sys; epoch=int(sys.argv[2]); [os.utime(path,(epoch,epoch),follow_symlinks=False) for path in [pathlib.Path(sys.argv[1]),*pathlib.Path(sys.argv[1]).rglob("*")]]' "$ROOTFS" "$SOURCE_DATE_EPOCH"
$PROOT /sbin/mkinitfs -F "base virtio 9p" -t /tmp/mkinitfs-stage "$($PROOT /bin/cat /usr/share/kernel/virt/kernel.release)"
/usr/local/bin/normalize-initramfs.py "$ROOTFS/boot/initramfs-virt"
# 9p rootfiles never load modules after the initramfs has mounted the guest.
rm -rf "$ROOTFS/lib/modules"

mkdir -p "$V86_SOURCE"
git clone --filter=blob:none https://github.com/copy/v86.git "$V86_SOURCE"
git -C "$V86_SOURCE" checkout --detach "$V86_COMMIT"
[ "$(git -C "$V86_SOURCE" rev-parse HEAD)" = "$V86_COMMIT" ] || fail 'v86 source revision mismatch'
git -C "$V86_SOURCE" apply /usr/local/share/browser-os/python-zstd-fallback.patch
SEABIOS_SOURCE="$WORK/seabios"
git clone --filter=blob:none https://git.seabios.org/seabios.git "$SEABIOS_SOURCE"
git -C "$SEABIOS_SOURCE" checkout --detach "$SEABIOS_COMMIT"
[ "$(git -C "$SEABIOS_SOURCE" rev-parse HEAD)" = "$SEABIOS_COMMIT" ] || fail 'SeaBIOS source revision mismatch'


wget -q "https://registry.npmjs.org/v86/-/v86-$V86_VERSION.tgz" -O "$WORK/v86.tgz"
actual_v86_integrity=$(python3 -c 'import base64,hashlib,sys; print("sha512-" + base64.b64encode(hashlib.sha512(open(sys.argv[1], "rb").read()).digest()).decode())' "$WORK/v86.tgz")
[ "$actual_v86_integrity" = "$V86_NPM_INTEGRITY" ] || fail "v86 npm integrity mismatch: $actual_v86_integrity"
mkdir -p "$WORK/npm"
tar -xzf "$WORK/v86.tgz" -C "$WORK/npm"
cp "$WORK/npm/package/build/libv86.mjs" "$OUT/v86/libv86.mjs"
cp "$WORK/npm/package/build/v86.wasm" "$OUT/v86/v86.wasm"
cp "$WORK/npm/package/build/v86-fallback.wasm" "$OUT/v86/v86-fallback.wasm"
cp "$V86_SOURCE/bios/seabios.bin" "$OUT/v86/seabios.bin"
cp "$V86_SOURCE/bios/vgabios.bin" "$OUT/v86/vgabios.bin"
cp "$V86_SOURCE/LICENSE" "$OUT/licenses/v86-BSD-2-Clause.txt"
cp "$V86_SOURCE/bios/COPYING.LESSER" "$OUT/licenses/vgabios-LGPL.txt"
cp "$SEABIOS_SOURCE/COPYING" "$OUT/licenses/seabios-GPL-3.0.txt"
cp "$SEABIOS_SOURCE/COPYING.LESSER" "$OUT/licenses/seabios-LGPL-3.0.txt"
cp "$V86_SOURCE/bios/seabios.config" "$OUT/licenses/seabios.config"
cp "$V86_SOURCE/bios/fetch-and-build-seabios.sh" "$OUT/licenses/seabios-build.sh"
tar --sort=name --mtime="@$SOURCE_DATE_EPOCH" --owner=0 --group=0 --numeric-owner --format=gnu --exclude=.git -czf "$OUT/licenses/seabios-rel-1.16.2-source.tar.gz" -C "$WORK" seabios
cp "$ROOTFS/boot/vmlinuz-virt" "$OUT/alpine/vmlinuz"
cp "$ROOTFS/boot/initramfs-virt" "$OUT/alpine/initramfs"
rm -rf "$ROOTFS/boot"
cp /usr/local/share/browser-os/packages.lock "$OUT/alpine/packages.lock"

# Do not ship stale APK indexes or cache payloads in the guest filesystem.
rm -rf "$ROOTFS/var/cache/apk" "$ROOTFS/var/log/apk.log"
python3 -c 'import os,pathlib,sys; epoch=int(sys.argv[2]); [os.utime(path,(epoch,epoch),follow_symlinks=False) for path in [pathlib.Path(sys.argv[1]),*pathlib.Path(sys.argv[1]).rglob("*")]]' "$ROOTFS" "$SOURCE_DATE_EPOCH"
python3 "$V86_SOURCE/tools/fs2json.py" --exclude /boot --exclude /var/cache/apk --zstd --out "$OUT/alpine/9p/fs.json" "$ROOTFS"
python3 "$V86_SOURCE/tools/copy-to-sha256.py" --zstd "$ROOTFS" "$OUT/alpine/9p/blob"

# Source-date normalization makes locally generated files deterministic. Keep
# the original upstream package/kernel mtimes represented in package contents.
find "$OUT" -type f -exec touch -d "@$SOURCE_DATE_EPOCH" {} +
python3 /usr/local/bin/manifest.py "$OUT" "$ROOTFS" "$V86_COMMIT" "$V86_VERSION" "$ALPINE_SHA256" "$SOURCE_DATE_EPOCH" "$SEABIOS_COMMIT" "$APORTS_SOURCE"
printf '%s\n' "Guest assets generated at $OUT"
