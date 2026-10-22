import contextlib
import io
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import manifest

LOCK = """# index main sha256 {main}
# index community sha256 {community}
# minirootfs {release} sha256 {sha}
# minirootfs url https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/alpine-minirootfs-{release}-x86.tar.gz
agetty=2.42.3-r1
"""

SHA = "a" * 64
REQUIRED = [
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
LICENSES = [
    "licenses/v86-BSD-2-Clause.txt",
    "licenses/vgabios-LGPL.txt",
    "licenses/seabios-GPL-3.0.txt",
    "licenses/seabios-LGPL-3.0.txt",
    "licenses/seabios.config",
    "licenses/seabios-build.sh",
    "licenses/seabios-rel-1.16.2-source.tar.gz",
]


class ManifestReleaseTests(unittest.TestCase):
    def tree(self, root_release="3.24.3", lock_release="3.24.3", lock_sha=SHA):
        tmp = pathlib.Path(self.enterContext(tempfile.TemporaryDirectory()))
        output = tmp / "out"
        rootfs = tmp / "rootfs"
        (output / "alpine/9p/blob").mkdir(parents=True)
        (output / "v86").mkdir()
        (output / "licenses").mkdir()
        for name in REQUIRED + LICENSES:
            (output / name).write_bytes(b"asset\n")
        (output / "alpine/9p/blob/deadbeef.bin.zst").write_bytes(b"blob")
        lock = tmp / "packages.lock"
        lock.write_text(LOCK.format(main="b" * 64, community="c" * 64, release=lock_release, sha=lock_sha))
        (rootfs / "etc").mkdir(parents=True)
        (rootfs / "etc/alpine-release").write_text(root_release + "\n")
        (rootfs / "usr/share/kernel/virt").mkdir(parents=True)
        (rootfs / "usr/share/kernel/virt/kernel.release").write_text("6.18.58-0-virt\n")
        (rootfs / "lib/apk/db").mkdir(parents=True)
        (rootfs / "lib/apk/db/installed").write_text("P:zsh\nV:5.9-r7\nA:x86\nL:MIT\n\n")
        return output, rootfs, lock

    def run_manifest(self, output, rootfs, lock, sha=SHA):
        argv = [
            "manifest.py",
            str(output),
            str(rootfs),
            "2d6f9aaa0d5357595cd7d7dd93065987ec1445b5",
            "0.5.469",
            sha,
            "1767225600",
            "ea1b7a0733906b8425d948ae94fba63c32b1d425",
            str(rootfs.parent / "aports"),
            str(lock),
        ]
        out = io.StringIO()
        with mock.patch.object(manifest, "enrich_packages", return_value=[]), \
                mock.patch.object(sys, "argv", argv), \
                contextlib.redirect_stdout(out):
            manifest.main()
        return out.getvalue()

    def test_release_and_minirootfs_url_come_from_the_built_root(self):
        output, rootfs, lock = self.tree()
        summary = json.loads(self.run_manifest(output, rootfs, lock))

        document = json.loads((output / "manifest.json").read_text())
        inventory = json.loads((output / "licenses/packages.json").read_text())
        expected_url = "https://dl-cdn.alpinelinux.org/alpine/v3.24/releases/x86/alpine-minirootfs-3.24.3-x86.tar.gz"

        self.assertEqual(document["guest"]["release"], "3.24.3")
        self.assertEqual(document["release"], "alpine-3.24.3-v86-0.5.469")
        self.assertEqual(document["buildInputs"]["alpineMinirootfsUrl"], expected_url)
        self.assertEqual(document["buildInputs"]["alpineMinirootfsSha256"], SHA)
        self.assertEqual(inventory["release"], "3.24.3")
        self.assertEqual(summary["kernelRelease"], "6.18.58-0-virt")
        self.assertNotIn("3.24.2", json.dumps(document))
        self.assertNotIn("3.24.2", json.dumps(inventory))

    def test_rootfs_release_disagreeing_with_lock_fails_before_writing(self):
        output, rootfs, lock = self.tree(root_release="3.24.2", lock_release="3.24.3")

        with self.assertRaisesRegex(SystemExit, r"3\.24\.2 does not match packages\.lock minirootfs 3\.24\.3"):
            self.run_manifest(output, rootfs, lock)
        self.assertFalse((output / "manifest.json").exists())
        self.assertFalse((output / "licenses/packages.json").exists())

    def test_minirootfs_checksum_disagreeing_with_lock_fails(self):
        output, rootfs, lock = self.tree(lock_sha="b" * 64)

        with self.assertRaisesRegex(SystemExit, r"does not match packages\.lock"):
            self.run_manifest(output, rootfs, lock, sha="a" * 64)

    def test_lock_url_naming_another_release_fails(self):
        output, rootfs, lock = self.tree()
        lock.write_text(
            LOCK.format(main="b" * 64, community="c" * 64, release="3.24.3", sha=SHA).replace(
                "alpine-minirootfs-3.24.3-x86.tar.gz", "alpine-minirootfs-3.24.2-x86.tar.gz"
            )
        )

        with self.assertRaisesRegex(SystemExit, r"does not identify release 3\.24\.3"):
            self.run_manifest(output, rootfs, lock)

    def test_missing_lock_pin_fails(self):
        output, rootfs, lock = self.tree()
        lock.write_text("# index main sha256 b\nagetty=2.42.3-r1\n")

        with self.assertRaisesRegex(SystemExit, r"records no complete minirootfs pin"):
            self.run_manifest(output, rootfs, lock)


if __name__ == "__main__":
    unittest.main()
