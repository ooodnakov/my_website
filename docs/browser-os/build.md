# Maintained Alpine x86 guest

`tools/browser-os/` builds the maintained Alpine x86 guest used by the browser-only v86 preview. It replaces neither the lightweight terminal nor any frontend/session code. The generated guest is offline and ephemeral. A root-owned broker owns raw COM1/`ttyS0` for xterm bytes and framed COM2/`ttyS1` for control, then runs the nonroot `visitor` login zsh on a controlling PTY. Safe quick dispatch is intentionally disabled until a complete ZLE key/UTF-8 decoder boundary can be proved; see [`com2-protocol.md`](./com2-protocol.md).

## Pins and build method

- v86: npm `0.5.469`, SHA-512 integrity `sha512-Yf7litYx7eOIf3xuijD//nViEJK+qy+TUwVNK/tufvlT9d5RkavHPH5qlvcuvsAkOgtHOd+jVT8wZeZqwJL5/A==`, source commit `2d6f9aaa0d5357595cd7d7dd93065987ec1445b5`.
- Distro: Alpine Linux `3.24.2`, i386 minirootfs SHA-256 `757f07c5a3476ba3947cfbea2323b7f02fb6fb2fba8a3a3c2b9d17f0a54c9226`.
- The builder image starts from Alpine 3.24 ARM64 image digest `sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6`; builder packages are version-pinned in `Dockerfile`. Guest package roots are exact-pinned in `packages.lock`; the generated inventory records every installed package with exact recipe-version matches and immutable APKBUILD/source-material references. The `linux-lts` recipe is pinned separately at aports commit `52fae6d7d56f3958f32e5bf9121a7536524b9ef4` for `linux-virt=6.18.55-r0`; OpenSSL retains its separate recipe pin.
- Review status: `linux-virt=6.18.55-r0` is a proposal replacing the previous `6.18.54-r0`, not an accepted compatibility update. It remains exact-pinned because the Alpine v3.24 package repository used by this build supplies `6.18.55-r0`; review its APK/package source metadata and full manifest inventory hashes alongside the PR diff and real guest regressions before acceptance. Do not unpin or float the kernel.
- The guest rootfs follows the upstream Alpine/9p build at the pinned v86 commit: `linux-virt`, `mkinitfs -F "base virtio 9p"`, 9p JSON plus SHA-256-addressed Zstandard blobs. `mkinitfs` writes to a container-private tmpfs; `normalize-initramfs.py` zeros only newc host `c_devmajor`/`c_devminor` metadata and keeps guest `rdevmajor`/`rdevminor` device semantics unchanged. Kernel and initrd are separate files; no disk image or old demo ISO is used.
- The image explicitly creates a locked `visitor` account with UID/GID 1000 and `/home/visitor`; a root-owned `browser-osd` supervises a nonroot login zsh on a controlling PTY instead of a serial agetty. The real guest smoke checks the passwd/group fields, home ownership, and effective shell identity.
- ARM64 builds use an ordinary `linux/arm64` Docker container with `qemu-i386` and `proot -0 -q qemu-i386`. This is explicit userspace emulation: no binfmt registration, privileged container, added capability, weakened seccomp, host package installation, or host credential mount. The rootfs deliberately omits Alpine's `busybox-suid` package because PRoot cannot preserve its setuid helper; this guest has no need for that helper.
- Upstream `copy-to-sha256.py` expects Python's optional `compression.zstd` module on Python 3.14. Alpine's pinned Python does not provide it; `python-zstd-fallback.patch` falls back to pinned `py3-zstandard` without changing upstream's preferred built-in path.
- The zsh completion index is generated at build time and loaded with `compinit -C`; interactive startup does not scan the lazy 9p-mounted completion tree.
- `normalize-shadow.py` fixes only the locked root/visitor password-change day to `SOURCE_DATE_EPOCH`; this avoids host-day drift in `/etc/shadow` and `/etc/shadow-` without changing credentials or other account records.

The reproducible command for the ARM64 builder is:

```sh
./tools/browser-os/build.sh
```

## Canonical portfolio export

`build.sh` runs `export-portfolio.mjs` from the repository's pinned Node runtime and passes its temporary output into the guest builder. The exporter imports `apps/main/client/src/data/home/index.ts`; it does not maintain a second copy of the portfolio strings. It emits matching English and Russian JSON/text views plus stable, validated action IDs for canonical links. The generated portfolio tree is root-owned and read-only in the guest. `/site.json` is the compatibility path for the selected locale, while `/home/visitor` remains the separate writable workspace.

On exit, `build.sh` restores write permission only within its private staging tree before removing it; the copied guest portfolio remains read-only.

To verify initramfs reproducibility across two separate staging filesystems, run:

```sh
./tools/browser-os/reproducibility-check.sh
```

The check builds complete exports in separate Docker containers, asserts distinct tmpfs filesystem IDs for `mkinitfs`, and compares every output path and byte. It fails if the runs share a staging filesystem or any generated asset differs.

The script builds and runs an ephemeral local ARM64 builder image, then copies only generated public assets back to the requested output. It refuses a non-empty destination; to choose another path:

```sh
./tools/browser-os/build.sh /absolute/path/to/browser-os-output
```

Network access is used only by the ephemeral builder to fetch the SHA-256-verified Alpine minirootfs, exact-version APKs, the pinned Alpine aports recipe snapshots from the official GitHub mirror (the inventory records the canonical GitLab repository and exact commits), pinned public v86/SeaBIOS sources, and the integrity-verified npm package. The final v86 options do not specify a network device or relay.

## Asset contract and production handoff

The default generated release directory is:

```text
apps/main/client/public/browser-os/alpine-3.24.2-v86-0.5.469/
```

`manifest.json` is the source of truth for all paths, byte sizes, SHA-256 hashes, package inventory, memory configuration, guest kernel command line, v86 version/source and measured image-byte totals. `guest.buildId` is the SHA-256 of `alpine/guest-build.json`; it is independent of the 9p `fs.json` hash. Runtime paths are:

| Manifest key | Public path |
|---|---|
| `guest.assetPaths.kernel` | `alpine/vmlinuz` |
| `guest.assetPaths.initrd` | `alpine/initramfs` |
| `guest.assetPaths.filesystemJson` | `alpine/9p/fs.json` |
| `guest.assetPaths.filesystemBlobs` | `alpine/9p/blob/` |
| `guest.buildIdentityPath` | `alpine/guest-build.json` |
| `emulator.assetPaths.bios` | `v86/seabios.bin` |
| `emulator.assetPaths.vgaBios` | `v86/vgabios.bin` |
| `emulator.assetPaths.javascript` | `v86/libv86.mjs` |
| `emulator.assetPaths.wasm` | `v86/v86.wasm` |
| `emulator.assetPaths.fallbackWasm` | `v86/v86-fallback.wasm` |

The Vite public directory copies this release tree to the app's `dist/public/browser-os/...`; the production static server and Docker image consume that same built `public` tree. Generate the release in the packaging checkout before `pnpm --dir apps/main build` and the Docker image build. No release binaries live in an agent-private path. The large generated tree is not committed; the pinned build recipe and generated hash manifest are the source artifact, and the deploy/package pipeline must carry the entire named release directory atomically with the app build. Never publish a partial version directory or mix manifests and files from different builds. The `main-browser` CI job builds the pinned assets and app, then the production browser test fetches the manifest, checks required kernel, initramfs, 9p and v86 assets, and verifies every manifest-listed release asset by HTTP status, byte size and SHA-256. Browser requests use relative same-origin paths; the v86 9p blobs are already Zstandard-compressed.
The `main-browser` job also runs the metadata parser regressions and boots the generated guest in Node mode before the production asset test.

Initial RAM is configured at **128 MiB**; this is a build setting, not a claim about total browser memory. `manifest.transfer.uncompressedBytes` is the complete runtime-asset payload inventory before HTTP content encoding; it includes lazy-demand 9p blobs and both WASM variants, so it is not the initial download size. Node smoke checks local files and is not a network-transfer measurement. The browser smoke serves assets with cache validators compatible with `express.static` defaults (`Cache-Control: public, max-age=0`, ETag and Last-Modified); a conditional `304` contributes zero response-body bytes. The loopback harness applies no HTTP content coding. Its byte counters advance as file-stream chunks are piped to HTTP responses; the shell-ready snapshot includes only server-side response bytes written by that point, not a capture of Chromium's exact bytes received by the marker. Cumulative counters cover the full workload and exclude HTTP headers, the harness and application shell. These local samples do not establish production network percentiles or device performance.

### Historical pre-broker single-run baseline

On the previous ARM64 guest build, isolated sequential Node `22.23.3` and Chromium `153.0.8010.47` runs reached shell readiness in `101,453 ms` and `142,371 ms`. Both configured **128 MiB**. Chromium transferred `20,554,009` guest-asset response-body bytes at shell readiness and `25,735,090` across the full workload; the latter includes `1,214` conditional `304` guest responses with zero body bytes. There were `1,308` guest-asset requests by readiness and `179` unique guest-asset paths across the workload. That manifest inventoried `34,121,721` bytes across `1,384` runtime assets; these measurements do not describe the current broker build.

The observed shell-ready payload is below the provisional `25 MiB` initial-transfer budget. Both startup samples exceed the provisional `15 s` desktop and `25 s` phone latency goals. This is one ARM64 runner sample, not a p95 or named-device result; keep the OS opt-in and do not claim those latency targets are met.

## Repeatable real-image smoke runs

Install the isolated tooling package once, then run the provenance/normalizer regressions and both image checks against the generated directory:

```sh
pnpm --dir tools/browser-os install --frozen-lockfile
python3 -m unittest discover -s tools/browser-os -p 'test_*.py'
pnpm --dir tools/browser-os test
pnpm --dir tools/browser-os smoke
```

- Use `--node` or `--browser` to run one target; pass a release directory as the first positional argument when it is not in the default Vite path. The browser runner uses real Chromium, serves generated bytes over loopback with explicit WASM MIME, and exercises the VM rather than a mock.
- The current local smoke harness still delays its first `hello` behind the COM1 `__GUEST_READY__` marker. That is not COM2 readiness and does not match the Website Worker cold path, which sends `hello` on `emulator-ready`. Cold-start interop remains blocked until the host decoder/Worker accept a typed bootstrap, send `hello` once, then send locale only after identity-matched `ready`. Do not treat markers, fixed delays, retries, or resynchronization as acceptance evidence.
- Both smoke modes cover `visitor`/i686 identity, 9p, writable home/tmp, pipelines, UTF-8, native tools and Ctrl+C. Node reports typed readiness, `ctrlCToPromptMs`, configured RAM and manifest hashes; browser mode additionally reports server-streamed guest-asset bytes at shell readiness and cache behavior.
- Broker regressions cover malformed/oversized frames, stale sessions/sequences, sequence exhaustion, monotonic portfolio request IDs and byte-order cancellation. Real guest smoke checks startup file owner/mode, retained home across locale changes, portfolio request/ACK interop, partial UTF-8/escape input, busy and unsent-input rejection, Ctrl+C across the COM1/COM2 race, real `less`/`nano` resize and wrapping, fail-closed dispatch, and COM1 availability after COM2 revocation. Every fence must report `unknown`, and dispatch must be rejected until a verifiable ZLE decoder boundary and live executor exist.

## Redistribution and source inventory

`licenses/packages.json` records every installed APK's exact version, architecture, declared license, origin, APK content checksum, and upstream homepage (explicitly not a source-code URL). Each package has a pinned aports `APKBUILD` path, repository commit, Git blob SHA-1 and content SHA-256, an exact recipe-version match, and complete source-material entries mapped to their declared archive checksums; Alpine patches and packaging files also carry immutable paths and content hashes.
The generated inventory records its exact package and source-material totals. The main/community APK repositories use the commits recorded in the inventory; the `linux-lts` kernel and OpenSSL recipe overrides are pinned separately when their published package versions differ from the primary snapshot.

The pinned resolver evaluates supported `if`/`else` source branches and static source loops; each declared checksum filename must map to an effective source entry or the build fails. Unsupported source-writing syntax, conditions, and loops fail closed rather than silently omitting material.

`licenseObligations` preserves both installed and recipe license expressions and explicitly records that package notices have not been verified and package source is not bundled. Its source-material references identify where distributors can obtain corresponding source, including Alpine patches; they do not claim that publishing only the homepage or recipe completes a license obligation. Review each license before redistributing binaries and provide required notices and corresponding source. `licenses/` retains the v86 BSD-2-Clause notice, SeaBIOS GPL-3.0/LGPL-3.0 notices, VGA BIOS LGPL notice, and the exact SeaBIOS `rel-1.16.2` source archive. The kernel and all Alpine transitive packages retain their independent licenses; the package inventory is a provenance record, not a legal-compliance determination.

Generated assets are not proof of browser compatibility until both smoke targets pass against that exact manifest. Any missing tool, mount or boot behavior is a release blocker, not something to paper over with a shell alias or the legacy image.
