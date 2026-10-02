# Maintained Alpine x86 guest

`tools/browser-os/` builds the maintained Alpine x86 guest used by the browser-only v86 preview. It replaces neither the lightweight terminal nor any frontend/session code. The generated guest is offline, ephemeral and runs as `visitor`; its only emulated serial device is COM1/`ttyS0` for the xterm byte stream. COM2 is the separately documented proposal in [`com2-protocol.md`](./com2-protocol.md).

## Pins and build method

- v86: npm `0.5.469`, SHA-512 integrity `sha512-Yf7litYx7eOIf3xuijD//nViEJK+qy+TUwVNK/tufvlT9d5RkavHPH5qlvcuvsAkOgtHOd+jVT8wZeZqwJL5/A==`, source commit `2d6f9aaa0d5357595cd7d7dd93065987ec1445b5`.
- Distro: Alpine Linux `3.24.2`, i386 minirootfs SHA-256 `757f07c5a3476ba3947cfbea2323b7f02fb6fb2fba8a3a3c2b9d17f0a54c9226`.
- The builder image starts from Alpine 3.24 ARM64 image digest `sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6`; builder packages are version-pinned in `Dockerfile`. Guest packages, including Linux `6.18.54-r0`, zsh `5.9-r7`, jq `1.8.2-r0`, git `2.54.0-r0`, eza `0.23.4-r0`, fzf `0.73.1-r1`, and zoxide `0.9.9-r0`, are exact-pinned in `packages.lock`.
- The guest rootfs follows the upstream Alpine/9p build at the pinned v86 commit: `linux-virt`, `mkinitfs -F "base virtio 9p"`, 9p JSON plus SHA-256-addressed Zstandard blobs. Kernel and initrd are separate files; no disk image or old demo ISO is used.
- ARM64 builds use an ordinary `linux/arm64` Docker container with `qemu-i386` and `proot -0 -q qemu-i386`. This is explicit userspace emulation: no binfmt registration, privileged container, added capability, weakened seccomp, host package installation, or host credential mount. The rootfs deliberately omits Alpine's `busybox-suid` package because PRoot cannot preserve its setuid helper; this guest has no need for that helper.
- Upstream `copy-to-sha256.py` expects Python's optional `compression.zstd` module on Python 3.14. Alpine's pinned Python does not provide it; `python-zstd-fallback.patch` falls back to pinned `py3-zstandard` without changing upstream's preferred built-in path.
- The zsh completion index is generated at build time and loaded with `compinit -C`; interactive startup does not scan the lazy 9p-mounted completion tree.

The reproducible command for the ARM64 builder is:

```sh
./tools/browser-os/build.sh
```

The script builds and runs an ephemeral local ARM64 builder image, then copies only generated public assets back to the requested output. It refuses a non-empty destination; to choose another path:

```sh
./tools/browser-os/build.sh /absolute/path/to/browser-os-output
```

Network access is used only by the ephemeral builder to fetch the SHA-256-verified Alpine minirootfs, exact-version APKs, pinned public v86 source, and the integrity-verified npm package. The final v86 options do not specify a network device or relay.

## Asset contract and production handoff

The default generated release directory is:

```text
apps/main/client/public/browser-os/alpine-3.24.2-v86-0.5.469/
```

`manifest.json` is the source of truth for all paths, byte sizes, SHA-256 hashes, package inventory, memory configuration, guest kernel command line, v86 version/source and measured image-byte totals. Runtime paths are:

| Manifest key | Public path |
|---|---|
| `guest.assetPaths.kernel` | `alpine/vmlinuz` |
| `guest.assetPaths.initrd` | `alpine/initramfs` |
| `guest.assetPaths.filesystemJson` | `alpine/9p/fs.json` |
| `guest.assetPaths.filesystemBlobs` | `alpine/9p/blob/` |
| `emulator.assetPaths.bios` | `v86/seabios.bin` |
| `emulator.assetPaths.vgaBios` | `v86/vgabios.bin` |
| `emulator.assetPaths.javascript` | `v86/libv86.mjs` |
| `emulator.assetPaths.wasm` | `v86/v86.wasm` |
| `emulator.assetPaths.fallbackWasm` | `v86/v86-fallback.wasm` |

The Vite public directory copies this release tree to the app's `dist/public/browser-os/...`; the production static server and Docker image consume that same built `public` tree. Generate the release in the packaging checkout before the existing `pnpm --dir apps/main build` and Docker image build. No release binaries live in an agent-private path. The large generated tree is not committed; the pinned build recipe and generated hash manifest are the source artifact, and the deploy/package pipeline must carry the entire named release directory atomically with the app build. Never publish a partial version directory or mix manifests and files from different builds. Browser requests use relative same-origin paths; the v86 9p blobs are already Zstandard-compressed, while WASM uses `application/wasm` and is eligible for ordinary HTTP compression.

Initial RAM is configured at **128 MiB**; this is a build setting, not a claim about total browser memory. `manifest.transfer.uncompressedBytes` is the complete runtime-asset payload inventory before HTTP content encoding; it includes lazy-demand 9p blobs and both WASM variants, so it is not the initial download size. Node smoke checks local files and is not a network-transfer measurement. The browser smoke serves assets with cache validators compatible with `express.static` defaults (`Cache-Control: public, max-age=0`, ETag and Last-Modified); a conditional `304` contributes zero response-body bytes. The loopback harness applies no HTTP content coding. It measures guest-asset response-body bytes at shell readiness and cumulatively across the full workload, excluding HTTP headers, the harness and application shell. These local samples do not establish production network percentiles or device performance.

### Observed single-run sample

On the available ARM64 Linux runner, Node `22.23.3` reached guest shell readiness in `110,343 ms`; Chromium `153.0.8010.47` reached readiness in `145,126 ms`. Both configured **128 MiB**. Chromium transferred `20,557,911` guest-asset body bytes at shell readiness and `25,738,992` across the full smoke workload; the latter includes `1,214` conditional `304` guest responses with zero body bytes. There were `1,308` guest-asset requests by readiness and `179` unique guest-asset paths across the workload. The manifest inventories `34,125,623` bytes across `1,384` runtime assets.

The observed shell-ready payload is below the provisional `25 MiB` initial-transfer budget. Both startup samples exceed the provisional `15 s` desktop and `25 s` phone latency goals. This is one ARM64 runner sample, not a p95 or named-device result; keep the OS opt-in and do not claim those latency targets are met.

## Repeatable real-image smoke runs

Install the isolated tooling package once, then run both checks against the generated directory:

```sh
pnpm --dir tools/browser-os install --frozen-lockfile
pnpm --dir tools/browser-os test
pnpm --dir tools/browser-os smoke
```

Use `--node` or `--browser` to run one target; pass a release directory as the first positional argument when it is not in the default Vite path. The browser runner uses real Chromium (`CHROMIUM_PATH` can select another installed binary), serves the generated bytes over loopback with explicit WASM MIME, and exercises the VM rather than a mock. Both modes require standalone shell-ready/result markers, `visitor`/i686 identity, a 9p root mount, writable home/tmp, pipelines, redirection, permissions, exit status, quoted UTF-8, and real zsh/jq/eza/git/fzf/zoxide operations plus Ctrl+C recovery. Node reports boot time, outputs, configured RAM and manifest hashes; browser mode additionally reports actual guest-asset response payload bytes at shell readiness and across the smoke workload.

## Redistribution and source inventory

Each release includes `licenses/packages.json` with exact installed package version, architecture, SPDX license field, origin, APK database package checksum and source URL. `packages.lock` and the Alpine minirootfs checksum pin guest inputs. The unused `/lib/modules` tree is omitted after the virtio/9p modules have been copied into initramfs; post-boot dynamic module loading is intentionally unavailable. `licenses/` contains the v86 BSD-2-Clause notice, SeaBIOS GPL-3.0/LGPL-3.0 notices, the VGA BIOS LGPL notice, and a source archive plus the pinned v86 build config/script for SeaBIOS `rel-1.16.2` at the exact commit recorded in `manifest.json`. The kernel, BusyBox, Alpine packages and their transitive dependencies retain their independent licenses; package source origins and checksums are listed rather than collapsed into a blanket project license. License and source assets are included in the generated release but excluded from the runtime transfer-byte sum.

Generated assets are not proof of browser compatibility until both smoke targets pass against that exact manifest. Any missing tool, mount or boot behavior is a release blocker, not something to paper over with a shell alias or the legacy image.
