# Kernel pin: `linux-virt`

Status: current pinned snapshot plus the superseded `6.18.55-r0` candidate record. `6.18.55-r0` is no longer installed by the guest build. `tools/browser-os/packages.lock` pins one Alpine `v3.24` index snapshot and the aports revisions `manifest.py` resolves every installed package against; the current snapshot carries `linux-virt=6.18.58-r0`, kernel release `6.18.58-0-virt`. The Website CI pin remains `linux-virt=6.18.54-r0`; nothing in this record changes it.

## Current pinned snapshot

- Index `main/x86` SHA-256 `44400b7224dedab99ffc18aba39ba4df982725cacfe30621fb3c999c46d44e86`; `community/x86` SHA-256 `b283995953cff78a0c3b28043fbde1ae98a2f5cd77b3378e8aa0a1cc62296d5f`. `verify-packages-index.sh` refuses to build against any other snapshot.
- aports revisions: `main` `4f5be284ba89eb2c6f0c9376668ec1f8d7265d26`, `community` `220a7ab3ba8de1c79bffebd42c2f86a9baff6b2f`.
- Kernel recipe `main/linux-lts/APKBUILD` at the recorded `main` revision declares `pkgver=6.18.58`, `pkgrel=0`; `zsh/APKBUILD` declares `pkgver=5.9`, `pkgrel=7`.
- minirootfs `3.24.3`, SHA-256 `a73bd9ed20a5ed1503a0688957add539e10340c7ca1d9e8c06c34a76ddc5f715`.
- `alpine/vmlinuz` is built from that snapshot, so its SHA-256 changes with the kernel bump; the retained `44a79a6471ebe42d1e4d97965bbc61752934ab0d1f6a38b5604dfc9d2df33531` describes the superseded `6.18.55-r0` output, not a current asset.
- Regenerate with `tools/browser-os/refresh-packages-lock.sh` and review every resulting version, index hash, and aports revision change. A snapshot that no longer carries a pinned version fails the build; versions are never floated silently.

## Superseded candidate (`6.18.55-r0`)

- Distribution/repository: Alpine Linux 3.24, [`main/x86` package index](https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86/); package `linux-virt=6.18.55-r0`, APK architecture `x86` (i686 guest), file `linux-virt-6.18.55-r0.apk`.
- APKINDEX package checksum (APK's `Q1` SHA-1 digest): `Q1JrMVoVE1Vw30rhuGKo8VsKCUIfs=` decodes to `26b315a15135570df4ae1b862a8f15b0a09421fb`. This hashes the compressed APK control member, not the complete `.apk` file. The independently measured x86 APK was 26,655,783 bytes with SHA-256 `2c6fc72381cfcda690a5d175c80e71b3e95c89cb3c53f77bbab9633eb8dcbb61`.
- Recipe source: Alpine aports commit [`52fae6d7d56f3958f32e5bf9121a7536524b9ef4`](https://gitlab.alpinelinux.org/alpine/aports/-/blob/52fae6d7d56f3958f32e5bf9121a7536524b9ef4/main/linux-lts/APKBUILD), `main/linux-lts/APKBUILD`; Git blob SHA-1 `32112e4a925ef0040c81f832366de609d51ece7c`; recipe content SHA-256 `00a7e0fd554965d5bde51c782bfa919fb1b02e9ce86fca3c01c10091f2e2ad39`.
- Kernel source archive: `linux-6.18.tar.xz`, SHA-512 `88599ffdec96d150c1feb9b261ba93bb0301a9d0e1ad6bef7aeab1f5372cbfc57d8b43c7e902bd8f76921d1dbd8189663c142ea869e51d0e2b483b150ee00fe0`.
- Stable patch archive: `patch-6.18.55.patch.xz`, SHA-512 `274d804a47fc28a8260907ac27f2efc95a4668f67d31a036e88c82cdaf16e8a2ba33dce18f7b344595d2cbd60d310e7b6b0ccae6d1f4dab2eb65badb61e8ef66`.
- x86 virtual kernel config: `virt.x86.config`, SHA-256 `e25b0907879f6292d3e7805390fb2e6d475111c9583885232c39e8a449ff44e2`.
- That build's `alpine/vmlinuz` SHA-256: `44a79a6471ebe42d1e4d97965bbc61752934ab0d1f6a38b5604dfc9d2df33531`; reported release `6.18.55-0-virt`.
- Build provenance also pins `SOURCE_DATE_EPOCH=1767225600` and Alpine 3.24 ARM64 builder image `sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6`.

## Retained generated evidence

- Retained manifest SHA-256 `20740fa24d75e783fa5ffdf9144ef1f48459aa5dfd9a1582cb8e1cf732118a63`; retained guest descriptor/build ID SHA-256 `1547e2abe7d02b8b4dcf174267e3d90d03952befbd0370af4d5c0928958d4224`. That manifest records 2,704 files (2,695 runtime files), 48,855,088 runtime bytes, 30,447,695 compressed 9p-blob bytes, and 52 source records.
- The retained G/H exports were byte-identical. Their log SHA-256 values are G `a10171152c1f4ee9b6cd89b1afa0f0c11bd76a81c9d18e042cad0385dcdcab7a` and H `62fa6fb519a9ce93719ad1b851e6c106803137bd1e4ee2bdcf51d4608b90fcfa`.
- These are historical outputs for an earlier source and package snapshot, not current assets. Current generated output and its `main-browser` result are the authority for this head.

## Zsh control prototype

The pinned-zsh safe-point patch, its exact-application check, and the measured input-ordinal boundary are documented in [`zle-safe-point-design.md`](./zle-safe-point-design.md). Quick-action dispatch remains disabled.
