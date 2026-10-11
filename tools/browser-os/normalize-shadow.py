#!/usr/bin/env python3
"""Normalize locked guest account password-change dates for reproducible builds."""

from pathlib import Path
import sys


def normalized_content(content: bytes, day: bytes, required_accounts: set[bytes]) -> bytes:
    lines = []
    found: set[bytes] = set()
    for raw_line in content.splitlines(keepends=True):
        if raw_line.endswith(b"\r\n"):
            line, ending = raw_line[:-2], b"\r\n"
        elif raw_line.endswith(b"\n"):
            line, ending = raw_line[:-1], b"\n"
        else:
            line, ending = raw_line, b""
        fields = line.split(b":")
        if fields[0] in {b"root", b"visitor"}:
            if len(fields) < 3:
                raise ValueError("malformed locked guest account shadow row")
            fields[2] = day
            found.add(fields[0])
            line = b":".join(fields)
        lines.append(line + ending)
    if not required_accounts.issubset(found):
        raise ValueError("required locked guest account missing from shadow file")
    return b"".join(lines)


def normalize_shadow_files(rootfs: Path, source_date_epoch: int) -> None:
    if type(source_date_epoch) is not int or source_date_epoch < 0:
        raise ValueError("SOURCE_DATE_EPOCH must be a nonnegative integer")
    day = str(source_date_epoch // 86400).encode("ascii")
    shadow_paths = (
        (rootfs / "etc/shadow", {b"root", b"visitor"}),
        (rootfs / "etc/shadow-", {b"root"}),
    )
    normalized = []
    for path, required_accounts in shadow_paths:
        original = path.read_bytes()
        normalized.append((path, original, normalized_content(original, day, required_accounts)))
    for path, original, content in normalized:
        if content != original:
            path.write_bytes(content)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: normalize-shadow.py ROOTFS SOURCE_DATE_EPOCH")
    normalize_shadow_files(Path(sys.argv[1]), int(sys.argv[2]))
