# Proposal: `linux-virt=6.18.55-r0`

Status: proposal only; not an approved compatibility update. The Website CI pin remains `linux-virt=6.18.54-r0`. Exact `6.18.54-r0` APK/source artifacts and verified hashes were not recovered from the current Alpine v3.24 `main/x86_64` package index; that index supplies `6.18.55-r0`. Keep the newer pin separate from the Website pin until the owner approves it. Do not float or silently replace either version.

## Package and source provenance

- Distribution/repository: Alpine Linux 3.24, [`main/x86_64` package index](https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/); package `linux-virt=6.18.55-r0`.
- APKINDEX package checksum (base64): `Q1JrMVoVE1Vw30rhuGKo8VsKCUIfs=`. This is the index's package checksum, not a separately downloaded APK SHA-256.
- Recipe source: Alpine aports commit [`52fae6d7d56f3958f32e5bf9121a7536524b9ef4`](https://gitlab.alpinelinux.org/alpine/aports/-/blob/52fae6d7d56f3958f32e5bf9121a7536524b9ef4/main/linux-lts/APKBUILD), `main/linux-lts/APKBUILD`; Git blob SHA-1 `32112e4a925ef0040c81f832366de609d51ece7c`; recipe content SHA-256 `00a7e0fd554965d5bde51c782bfa919fb1b02e9ce86fca3c01c10091f2e2ad39`.
- Kernel source archive: `linux-6.18.tar.xz`, SHA-512 `88599ffdec96d150c1feb9b261ba93bb0301a9d0e1ad6bef7aeab1f5372cbfc57d8b43c7e902bd8f76921d1dbd8189663c142ea869e51d0e2b483b150ee00fe0`.
- Stable patch archive: `patch-6.18.55.patch.xz`, SHA-512 `274d804a47fc28a8260907ac27f2efc95a4668f67d31a036e88c82cdaf16e8a2ba33dce18f7b344595d2cbd60d310e7b6b0ccae6d1f4dab2eb65badb61e8ef66`.
- x86 virtual kernel config: `virt.x86.config`, SHA-256 `e25b0907879f6292d3e7805390fb2e6d475111c9583885232c39e8a449ff44e2`.
- Generated `alpine/vmlinuz` SHA-256: `44a79a6471ebe42d1e4d97965bbc61752934ab0d1f6a38b5604dfc9d2df33531`; reported release `6.18.55-0-virt`.
- Build provenance also pins `SOURCE_DATE_EPOCH=1767225600` and Alpine 3.24 ARM64 builder image `sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6`.

## Generated output and tests

- The two complete current-input exports are byte-identical (`diff -qr` exit 0). Their independent mkinitfs tmpfs filesystem IDs are `3cafc35796f758e0` and `a4c3d7e6dd3e5853`; both used builder image `sha256:b803fe2f237edd1d2893e16cc542f4f039d1c741e93cde416dbd554284b6935e`.
- Package inventory SHA-256: `833018fd02d62117c3653e971cebee4861c9787a43f637c3cf0464790f7ffc9d`. Current manifest SHA-256: `cf5b623d1b3bef64af68aac77200547a337905891d9f3930e4c6da2810e7e4b0`. Guest build identity SHA-256: `444afd30b7a912c64fb2d21f804d78f12f7142fd70b1a8e79b89ef517ec94c80`; the descriptor includes the current broker source hash `297a96b56c748bb91e251affffdcb4eaef78fd3fdc74af5e941be9b0ae400280`.
- Generated kernel SHA-256: `44a79a6471ebe42d1e4d97965bbc61752934ab0d1f6a38b5604dfc9d2df33531`; release `6.18.55-0-virt`. The complete output contains 87 installed packages, 2,695 runtime assets, 48,855,339 uncompressed bytes, and 30,447,778 compressed 9p-blob bytes.
- The broker suite passed 13 tests; full Python discovery passed 30 tests; `pnpm --dir tools/browser-os test` passed 10 tests.
- Real Node and Chromium guest runs both reached the guest shell but timed out after 15 minutes waiting for COM2 bootstrap; the captured COM2 frame lists were empty. No successful paired browser smoke is demonstrated. These runs exercise the generated guest and smoke parser, not the Website Worker implementation in PR #19.
