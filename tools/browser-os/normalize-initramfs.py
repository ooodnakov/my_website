#!/usr/bin/env python3
"""Normalize host filesystem IDs in mkinitfs newc archives, preserving rdev IDs."""

from __future__ import annotations

import gzip
import os
import pathlib
import stat
import sys

_HEADER_SIZE = 110
_MAGIC = {b"070701", b"070702"}


def iter_newc_records(data: bytes):
    offset = 0
    saw_trailer = False
    while offset < len(data):
        if not any(data[offset:]):
            break
        if data[offset : offset + 6] not in _MAGIC or offset + _HEADER_SIZE > len(data):
            raise ValueError(f"invalid newc header at byte {offset}")
        header = data[offset : offset + _HEADER_SIZE]
        fields = tuple(int(header[start : start + 8], 16) for start in range(6, 110, 8))
        file_size = fields[6]
        name_size = fields[11]
        name_start = offset + _HEADER_SIZE
        name_end = name_start + name_size
        data_start = (name_end + 3) & ~3
        data_end = data_start + file_size
        if name_size < 1 or name_end > len(data) or data_end > len(data):
            raise ValueError(f"truncated newc entry at byte {offset}")
        name_bytes = data[name_start:name_end]
        if name_bytes[-1] != 0:
            raise ValueError(f"unterminated newc name at byte {offset}")
        name = name_bytes[:-1].decode("utf-8", errors="surrogateescape")
        yield offset, name, fields
        offset = (data_end + 3) & ~3
        if name == "TRAILER!!!":
            saw_trailer = True
            break
    if not saw_trailer:
        raise ValueError("newc archive has no TRAILER!!! entry")
    if any(data[offset:]):
        raise ValueError("unexpected nonzero data after newc trailer")


def normalize_initramfs(path: pathlib.Path) -> tuple[int, int]:
    compressed = path.read_bytes()
    archive = gzip.decompress(compressed)
    normalized = bytearray(archive)
    records = changed = 0
    for offset, _name, _fields in iter_newc_records(archive):
        records += 1
        device_ids = archive[offset + 62 : offset + 78]
        if device_ids != b"0000000000000000":
            normalized[offset + 62 : offset + 78] = b"0000000000000000"
            changed += 1

    if not records:
        raise ValueError("empty newc archive")
    result = gzip.compress(bytes(normalized), compresslevel=9, mtime=0)
    mode = stat.S_IMODE(path.stat().st_mode)
    temporary = path.with_name(path.name + ".normalized")
    try:
        temporary.write_bytes(result)
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return records, changed


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: normalize-initramfs.py INITRAMFS")
    path = pathlib.Path(sys.argv[1])
    records, changed = normalize_initramfs(path)
    print(f"normalized host device IDs in {changed} of {records} initramfs entries")


if __name__ == "__main__":
    main()
