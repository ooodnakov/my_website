#!/usr/bin/env python3
import json
import pathlib
import sys


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: guest-build-identity.py INPUTS_JSON OUTPUT_JSON")
    inputs_path, output_path = map(pathlib.Path, sys.argv[1:])
    inputs = json.loads(inputs_path.read_text(encoding="utf-8"))
    if type(inputs) is not dict or set(inputs) != {"schemaVersion", "inputs"}:
        raise SystemExit("invalid guest build input descriptor")
    if type(inputs["schemaVersion"]) is not int or inputs["schemaVersion"] != 1:
        raise SystemExit("unsupported guest build input descriptor")
    if type(inputs["inputs"]) is not dict or not inputs["inputs"]:
        raise SystemExit("guest build input list is empty")
    for name, record in inputs["inputs"].items():
        if type(name) is not str or name.startswith("/") or ".." in pathlib.PurePosixPath(name).parts:
            raise SystemExit(f"invalid guest build input path: {name!r}")
        if type(record) is not dict or set(record) != {"bytes", "sha256"}:
            raise SystemExit(f"invalid guest build input record: {name}")
        if type(record["bytes"]) is not int or record["bytes"] < 0:
            raise SystemExit(f"invalid guest build input size: {name}")
        digest = record["sha256"]
        if type(digest) is not str or len(digest) != 64 or any(char not in "0123456789abcdef" for char in digest):
            raise SystemExit(f"invalid guest build input hash: {name}")

    identity = {
        "format": "browser-os-guest-build-identity/v1",
        "inputs": inputs["inputs"],
        "schemaVersion": 1,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes((json.dumps(identity, ensure_ascii=True, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
