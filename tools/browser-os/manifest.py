#!/usr/bin/env python3
import hashlib
import json
import pathlib
import re
import sys

from source_provenance import APORTS_BRANCH, APORTS_COMMITS, APORTS_RECIPE_OVERRIDES, APORTS_REPOSITORY, enrich_packages


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def minirootfs_pin(lock_path: pathlib.Path) -> tuple[str, str, str]:
    text = lock_path.read_text(encoding="utf-8")
    version = re.search(r"^# minirootfs (\S+) sha256 ", text, re.MULTILINE)
    digest = re.search(r"^# minirootfs \S+ sha256 ([0-9a-f]{64})$", text, re.MULTILINE)
    url = re.search(r"^# minirootfs url (\S+)$", text, re.MULTILINE)
    if not (version and digest and url):
        raise SystemExit(f"{lock_path} records no complete minirootfs pin")
    return version.group(1), digest.group(1), url.group(1)


def resolve_release(
    rootfs: pathlib.Path, lock_path: pathlib.Path, alpine_sha256: str
) -> tuple[str, str]:
    """Return the built root release and its pinned URL, refusing disagreement."""
    pinned_version, pinned_sha256, url = minirootfs_pin(lock_path)
    release_path = rootfs / "etc/alpine-release"
    if not release_path.is_file():
        raise SystemExit(f"built rootfs has no /etc/alpine-release: {release_path}")
    release = release_path.read_text(encoding="utf-8").strip()
    if not release:
        raise SystemExit("built rootfs /etc/alpine-release is empty")
    if release != pinned_version:
        raise SystemExit(
            f"built rootfs release {release} does not match packages.lock minirootfs {pinned_version}"
        )
    if alpine_sha256 != pinned_sha256:
        raise SystemExit(
            f"minirootfs sha256 {alpine_sha256} does not match packages.lock {pinned_sha256}"
        )
    basename = url.rsplit("/", 1)[-1]
    match = re.fullmatch(r"alpine-minirootfs-(.+)-[A-Za-z0-9_]+\.tar\.gz", basename)
    if not match or match.group(1) != release:
        raise SystemExit(
            f"packages.lock minirootfs url {basename} does not identify release {release}"
        )
    return release, url


def read_apk_database(path: pathlib.Path) -> list[dict[str, str]]:
    packages: list[dict[str, str]] = []
    for record in path.read_text().strip().split("\n\n"):
        fields: dict[str, str] = {}
        for line in record.splitlines():
            if len(line) > 2 and line[1] == ":":
                fields.setdefault(line[0], line[2:])
        if "P" in fields:
            packages.append({
                "name": fields["P"],
                "version": fields.get("V", "unknown"),
                "architecture": fields.get("A", "unknown"),
                "license": fields.get("L", "unspecified"),
                "origin": fields.get("o", fields["P"]),
                "apkPackageChecksum": fields.get("C", "unavailable"),
                "upstreamHomepage": fields.get("U", "unavailable"),
            })
    return sorted(packages, key=lambda package: package["name"])


def main() -> None:
    if len(sys.argv) != 10:
        raise SystemExit("usage: manifest.py OUTPUT ROOTFS V86_COMMIT V86_VERSION ALPINE_SHA256 SOURCE_DATE_EPOCH SEABIOS_COMMIT APORTS_SOURCE PACKAGES_LOCK")

    output = pathlib.Path(sys.argv[1]).resolve()
    rootfs = pathlib.Path(sys.argv[2]).resolve()
    v86_commit, v86_version, alpine_sha256, source_date_epoch, seabios_commit, aports_source = sys.argv[3:9]
    packages_lock = pathlib.Path(sys.argv[9]).resolve()
    release, minirootfs_url = resolve_release(rootfs, packages_lock, alpine_sha256)
    required = [
        "alpine/vmlinuz",
        "alpine/initramfs",
        "alpine/9p/fs.json",
        "alpine/guest-build.json",
        "v86/seabios.bin",
        "v86/vgabios.bin",
        "v86/libv86.mjs",
        "v86/v86.wasm",
        "v86/v86-fallback.wasm",
    ]
    for name in required:
        if not (output / name).is_file():
            raise SystemExit(f"missing generated runtime asset: {name}")

    assets = {}
    for path in sorted(item for item in output.rglob("*") if item.is_file()):
        relative = path.relative_to(output).as_posix()
        assets[relative] = {"bytes": path.stat().st_size, "sha256": sha256(path)}

    blobs = sorted(
        path.relative_to(output).as_posix()
        for path in (output / "alpine/9p/blob").iterdir()
        if path.is_file()
    )
    packages = enrich_packages(read_apk_database(rootfs / "lib/apk/db/installed"), pathlib.Path(aports_source))
    kernel_release = (rootfs / "usr/share/kernel/virt/kernel.release").read_text().strip()
    runtime_paths = required + blobs
    transfer_bytes = sum(assets[path]["bytes"] for path in runtime_paths)
    blob_bytes = sum(assets[path]["bytes"] for path in blobs)
    package_inventory = {
        "format": "apk-installed-package-inventory/v2",
        "repository": "https://dl-cdn.alpinelinux.org/alpine/v3.24/{main,community}",
        "release": release,
        "alpineAports": {
            "repository": APORTS_REPOSITORY,
            "branch": APORTS_BRANCH,
            "repositorySnapshots": {
                area: commit for area, commit in APORTS_COMMITS.items() if area != "testing"
            },
            "recipeOverrides": {
                origin: {"repositoryArea": area, "commit": commit}
                for origin, (area, commit) in APORTS_RECIPE_OVERRIDES.items()
            },
        },
        "licenseNotice": "APK license expressions are declarations, not proof that all notices or corresponding source are bundled. Review each package's licenseObligations before redistribution.",
        "packages": packages,
    }
    (output / "licenses/packages.json").write_text(
        json.dumps(package_inventory, indent=2, sort_keys=True) + "\n"
    )

    license_assets = [
        "licenses/v86-BSD-2-Clause.txt",
        "licenses/vgabios-LGPL.txt",
        "licenses/seabios-GPL-3.0.txt",
        "licenses/seabios-LGPL-3.0.txt",
        "licenses/seabios.config",
        "licenses/seabios-build.sh",
        "licenses/seabios-rel-1.16.2-source.tar.gz",
        "licenses/packages.json",
    ]
    for name in license_assets:
        path = output / name
        assets[name] = {"bytes": path.stat().st_size, "sha256": sha256(path)}

    manifest = {
        "schemaVersion": 1,
        "release": f"alpine-{release}-v86-{v86_version}",
        "guest": {
            "distribution": "Alpine Linux",
            "release": release,
            "architecture": "x86/i686",
            "kernelRelease": kernel_release,
            "login": "visitor (uid 1000; root account locked)",
            "serialConsole": "ttyS0 at 115200 8N1",
            "memoryBytes": 128 * 1024 * 1024,
            "buildIdentityPath": "alpine/guest-build.json",
            "buildId": assets["alpine/guest-build.json"]["sha256"],
            "networkBackend": None,
            "assetPaths": {
                "kernel": "alpine/vmlinuz",
                "initrd": "alpine/initramfs",
                "filesystemJson": "alpine/9p/fs.json",
                "filesystemBlobs": "alpine/9p/blob/",
            },
            "kernelCommandLine": "console=ttyS0,115200n8 root=host9p rootfstype=9p rootflags=trans=virtio,version=9p2000.L rw modules=virtio_pci",
        },
        "emulator": {
            "name": "v86",
            "version": v86_version,
            "sourceCommit": v86_commit,
            "npmIntegrity": "sha512-Yf7litYx7eOIf3xuijD//nViEJK+qy+TUwVNK/tufvlT9d5RkavHPH5qlvcuvsAkOgtHOd+jVT8wZeZqwJL5/A==",
            "networkDevice": None,
            "assetPaths": {
                "bios": "v86/seabios.bin",
                "vgaBios": "v86/vgabios.bin",
                "javascript": "v86/libv86.mjs",
                "wasm": "v86/v86.wasm",
                "fallbackWasm": "v86/v86-fallback.wasm",
            },
            "biosSource": {
                "repository": "https://git.seabios.org/seabios.git",
                "version": "rel-1.16.2",
                "commit": seabios_commit,
                "sourceArchive": "licenses/seabios-rel-1.16.2-source.tar.gz",
                "buildConfig": "licenses/seabios.config",
                "buildScript": "licenses/seabios-build.sh",
                "licenseFiles": [
                    "licenses/seabios-GPL-3.0.txt",
                    "licenses/seabios-LGPL-3.0.txt",
                    "licenses/vgabios-LGPL.txt",
                ],
            },
        },
        "buildInputs": {
            "alpineMinirootfsUrl": minirootfs_url,
            "alpineMinirootfsSha256": alpine_sha256,
            "sourceDateEpoch": int(source_date_epoch),
            "packageLock": "alpine/packages.lock",
            "packageInventory": "licenses/packages.json",
            "sourceMaterials": {
                "alpinePackages": {
                    "repository": APORTS_REPOSITORY,
                    "branch": APORTS_BRANCH,
                    "repositorySnapshots": {
                        area: commit for area, commit in APORTS_COMMITS.items() if area != "testing"
                    },
                    "recipeOverrides": {
                        origin: {"repositoryArea": area, "commit": commit}
                        for origin, (area, commit) in APORTS_RECIPE_OVERRIDES.items()
                    },
                    "packageInventory": "licenses/packages.json",
                    "sourceAvailability": "Per-package APKBUILD sourceMaterials includes declared archive hashes and immutable references to Alpine patch and packaging files.",
                    "notices": "Package notice texts are not asserted complete by this manifest; distributors must satisfy each licenseObligations record.",
                },
                "v86": {
                    "repository": "https://github.com/copy/v86.git",
                    "commit": v86_commit,
                    "licenseFile": "licenses/v86-BSD-2-Clause.txt",
                },
                "seabios": {
                    "repository": "https://git.seabios.org/seabios.git",
                    "version": "rel-1.16.2",
                    "commit": seabios_commit,
                    "sourceArchive": "licenses/seabios-rel-1.16.2-source.tar.gz",
                },
            },
        },
        "assets": assets,
        "transfer": {
            "assetCount": len(runtime_paths),
            "uncompressedBytes": transfer_bytes,
            "compressed9pBlobBytes": blob_bytes,
            "note": "Byte counts include the precompressed 9p blob files and all required runtime assets, before HTTP transfer compression.",
        },
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(json.dumps({
        "manifest": str(output / "manifest.json"),
        "runtimeAssets": len(runtime_paths),
        "uncompressedTransferBytes": transfer_bytes,
        "compressed9pBlobBytes": blob_bytes,
        "kernelRelease": kernel_release,
        "installedPackages": len(packages),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
