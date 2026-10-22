"""Regression tests for the Alpine package lock / index snapshot guard.

The guest build resolves packages from a staged copy of the Alpine index. If the
lock did not pin that index, a security update on the mutable v3.24 branch would
remove the superseded versions the lock names and `apk add` would fail with an
opaque solver dump naming packages rather than the cause. These tests pin the
guard's observable behaviour and the shape of the committed lock.
"""

import hashlib
import io
import pathlib
import re
import shutil
import subprocess
import tarfile
import tempfile
import unittest

TOOLS = pathlib.Path(__file__).resolve().parent
VERIFY = TOOLS / "verify-packages-index.sh"
LOCK = TOOLS / "packages.lock"
REPOSITORIES = ("main", "community")

PACKAGE_VERSION = re.compile(r"^[0-9][^=\s]*-r\d+$")
PACKAGE_NAME = re.compile(r"^[a-z0-9][a-z0-9+._-]*$")


def index_tarball(marker):
    """A stand-in Alpine APKINDEX carrying one package record."""
    record = (
        f"P:example-{marker}\n"
        "V:1.0-r0\n"
        "A:x86_64\n"
        "S:1024\n"
        "I:4096\n"
        "T:Example package\n"
        "U:https://example.invalid/\n"
        "L:MIT\n"
        "o:example\n"
        "m:Example <example@example.invalid>\n"
        "t:1700000000\n"
        "c:0000000000000000000000000000000000000000\n"
        "D:so:libc.musl-x86_64.so.1\n"
        "p:so:libexample.so.1=1\n"
        "\n"
    ).encode()
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz", format=tarfile.GNU_FORMAT) as archive:
        info = tarfile.TarInfo("APKINDEX")
        info.size = len(record)
        info.mtime = 0
        archive.addfile(info, io.BytesIO(record))
    return buffer.getvalue()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


class VerifyPackagesIndexTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, temporary)
        self.root = pathlib.Path(temporary)

        self.staged = self.root / "apk-repo"
        for repository in REPOSITORIES:
            directory = self.staged / repository / "x86"
            directory.mkdir(parents=True)
            (directory / "APKINDEX.tar.gz").write_bytes(index_tarball(repository))

        self.lock = self.root / "packages.lock"
        self.write_lock(
            {repository: sha256(index_tarball(repository)) for repository in REPOSITORIES}
        )

    def write_lock(self, digests, pins=("zsh=5.9-r7",)):
        lines = ["# Alpine guest package lock for the visitor terminal."]
        lines += [f"# index {name} sha256 {digest}" for name, digest in digests.items()]
        self.lock.write_text("\n".join(lines + list(pins)) + "\n", encoding="utf-8")

    def stage(self, repository, data):
        (self.staged / repository / "x86" / "APKINDEX.tar.gz").write_bytes(data)

    def verify(self):
        return subprocess.run(
            ["sh", str(VERIFY), str(self.lock), str(self.staged)],
            capture_output=True,
            text=True,
            check=False,
        )

    def test_matching_snapshot_is_accepted(self):
        result = self.verify()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_drifted_index_is_rejected_with_refresh_instructions(self):
        # An Alpine security update replacing an index is the regression this
        # guard exists for: the build must stop and say how to regenerate, and
        # must name the repository that moved.
        self.stage("main", index_tarball("main-after-update"))
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("main index sha256 mismatch", result.stderr)
        self.assertIn("refresh-packages-lock.sh", result.stderr)
        self.assertNotIn("community index sha256 mismatch", result.stderr)

    def test_drifted_community_index_is_rejected(self):
        self.stage("community", index_tarball("community-after-update"))
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("community index sha256 mismatch", result.stderr)

    def test_lock_without_recorded_snapshot_fails_closed(self):
        # A lock that forgets its index hashes must not silently resolve against
        # whatever the branch happens to serve.
        self.write_lock({})
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("records no main index sha256", result.stderr)
        self.assertIn("refresh-packages-lock.sh", result.stderr)

    def test_missing_staged_index_is_rejected(self):
        (self.staged / "community" / "x86" / "APKINDEX.tar.gz").unlink()
        result = self.verify()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("missing staged community index", result.stderr)


class CommittedPackagesLockTest(unittest.TestCase):
    def setUp(self):
        self.text = LOCK.read_text(encoding="utf-8")
        self.pins = [
            line
            for line in self.text.splitlines()
            if line.strip() and not line.startswith("#")
        ]

    def test_every_repository_records_exactly_one_index_sha256(self):
        for repository in REPOSITORIES:
            recorded = [
                line
                for line in self.text.splitlines()
                if line.startswith(f"# index {repository} sha256 ")
            ]
            self.assertEqual(len(recorded), 1, f"{repository} must record one sha256")
            self.assertRegex(recorded[0].rsplit(" ", 1)[1], r"^[0-9a-f]{64}$")

    def test_pins_are_unique_and_well_formed(self):
        names = [line.split("=", 1)[0] for line in self.pins]
        self.assertEqual(len(names), len(set(names)), "duplicate package pin")
        self.assertTrue(self.pins, "lock pins no packages")
        for line, name in zip(self.pins, names):
            _, separator, version = line.partition("=")
            self.assertEqual(separator, "=", line)
            self.assertRegex(name, PACKAGE_NAME)
            self.assertRegex(version, PACKAGE_VERSION)


if __name__ == "__main__":
    unittest.main()