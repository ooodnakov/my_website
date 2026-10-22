import importlib.util
import pathlib
import stat
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("normalize-shadow.py")
SPEC = importlib.util.spec_from_file_location("normalize_shadow", MODULE_PATH)
NORMALIZER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(NORMALIZER)


class NormalizeShadowTest(unittest.TestCase):
    def make_rootfs(self, directory, day):
        rootfs = pathlib.Path(directory)
        (rootfs / "etc").mkdir()
        shadow = rootfs / "etc/shadow"
        backup = rootfs / "etc/shadow-"
        shadow.write_bytes(
            f"root:!*:{day}:0:::::\nvisitor:!:{day}:0:99999:7:::\nbin:!::0:::::\n".encode()
        )
        backup.write_bytes(f"root:!*:{day}:0:::::\n".encode())
        shadow.chmod(0o640)
        backup.chmod(0o640)
        return rootfs, shadow, backup

    def test_normalizes_only_locked_guest_account_dates_and_preserves_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            rootfs, shadow, backup = self.make_rootfs(directory, 20732)

            NORMALIZER.normalize_shadow_files(rootfs, 1767225600)

            expected_day = 20454
            self.assertEqual(
                shadow.read_bytes(),
                f"root:!*:{expected_day}:0:::::\nvisitor:!:{expected_day}:0:99999:7:::\nbin:!::0:::::\n".encode(),
            )
            self.assertEqual(backup.read_bytes(), f"root:!*:{expected_day}:0:::::\n".encode())
            self.assertEqual(stat.S_IMODE(shadow.stat().st_mode), 0o640)
            self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o640)

    def test_outputs_do_not_depend_on_build_day(self):
        with tempfile.TemporaryDirectory() as first_directory, tempfile.TemporaryDirectory() as second_directory:
            first = self.make_rootfs(first_directory, 20731)
            second = self.make_rootfs(second_directory, 20732)

            NORMALIZER.normalize_shadow_files(first[0], 1767225600)
            NORMALIZER.normalize_shadow_files(second[0], 1767225600)

            self.assertEqual(first[1].read_bytes(), second[1].read_bytes())
            self.assertEqual(first[2].read_bytes(), second[2].read_bytes())

    def test_malformed_shadow_row_fails_before_any_file_is_rewritten(self):
        with tempfile.TemporaryDirectory() as directory:
            rootfs, shadow, backup = self.make_rootfs(directory, 20731)
            original_shadow = b"root:!*\nvisitor:!:20731:0:99999:7:::\n"
            shadow.write_bytes(original_shadow)
            original_backup = backup.read_bytes()

            with self.assertRaisesRegex(ValueError, "malformed"):
                NORMALIZER.normalize_shadow_files(rootfs, 1767225600)

            self.assertEqual(shadow.read_bytes(), original_shadow)
            self.assertEqual(backup.read_bytes(), original_backup)


if __name__ == "__main__":
    unittest.main()
