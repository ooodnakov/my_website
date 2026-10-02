import gzip
import importlib.util
import pathlib
import tempfile
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("normalize-initramfs.py")
SPEC = importlib.util.spec_from_file_location("normalize_initramfs", MODULE_PATH)
NORMALIZER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(NORMALIZER)


def cpio_entry(name, mode, data=b"", devmajor=0, devminor=0, rdevmajor=0, rdevminor=0):
    name_bytes = name.encode() + b"\0"
    fields = [1, mode, 0, 0, 1, 123456, len(data), devmajor, devminor,
              rdevmajor, rdevminor, len(name_bytes), 0]
    header = b"070701" + b"".join(f"{value:08x}".encode() for value in fields)
    record = header + name_bytes
    record += b"\0" * (-len(record) % 4)
    record += data
    return record + b"\0" * (-len(data) % 4)


def archive(devminor):
    return (
        cpio_entry("etc", 0o040755, devmajor=0, devminor=devminor)
        + cpio_entry("etc/init", 0o100755, b"#!/bin/sh\n", devminor=devminor)
        + cpio_entry("dev/ttyS0", 0o020600, devminor=devminor,
                     rdevmajor=4, rdevminor=64)
        + cpio_entry("TRAILER!!!", 0, devminor=devminor)
    )


class NormalizeInitramfsTest(unittest.TestCase):
    def test_host_device_metadata_normalizes_without_changing_guest_devices(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [pathlib.Path(directory) / "a.gz", pathlib.Path(directory) / "b.gz"]
            paths[0].write_bytes(gzip.compress(archive(291), mtime=111))
            paths[1].write_bytes(gzip.compress(archive(307), mtime=222))

            results = [NORMALIZER.normalize_initramfs(path) for path in paths]

            self.assertEqual(results, [(4, 4), (4, 4)])
            self.assertEqual(paths[0].read_bytes(), paths[1].read_bytes())
            entries = list(NORMALIZER.iter_newc_records(gzip.decompress(paths[0].read_bytes())))
            device = next(fields for _offset, name, fields in entries if name == "dev/ttyS0")
            self.assertEqual(device[7:9], (0, 0))
            self.assertEqual(device[9:11], (4, 64))
            self.assertEqual(gzip.decompress(paths[0].read_bytes()), archive(0))

    def test_rejects_invalid_archive_without_replacing_input(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "bad.gz"
            original = gzip.compress(b"not a cpio archive")
            path.write_bytes(original)

            with self.assertRaises(ValueError):
                NORMALIZER.normalize_initramfs(path)

            self.assertEqual(path.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
