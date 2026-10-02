"""Attach immutable Alpine APKBUILD and source-material provenance to APK rows."""

from __future__ import annotations

import fnmatch
import hashlib
import pathlib
import re
import shlex
import subprocess
import urllib.parse

APORTS_REPOSITORY = "https://gitlab.alpinelinux.org/alpine/aports"
APORTS_BRANCH = "3.24-stable"
APORTS_COMMITS = {
    "main": "d5a34efc88bbe8d18737fda28125071c4aef8517",
    "community": "7805e4fb29efc937492a3173e55dc72ecd9fcdaf",
    "testing": "7805e4fb29efc937492a3173e55dc72ecd9fcdaf",
}
APORTS_RECIPE_OVERRIDES = {
    "openssl": ("main", "013edf8b29199933e8ea34dde460b5584b979042"),
}


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _git(root: pathlib.Path, *args: str) -> bytes:
    return subprocess.check_output(["git", "-C", str(root), *args])


def _git_file(root: pathlib.Path, commit: str, path: str) -> bytes:
    return subprocess.check_output(
        ["git", "-C", str(root), "show", f"{commit}:{path}"],
        stderr=subprocess.DEVNULL,
    )


def _assignment(text: str, name: str) -> str:
    match = re.search(
        rf"(?ms)^{re.escape(name)}=(?:\"(.*?)\"|'(.*?)'|([^\s#]+))",
        text,
    )
    if not match:
        raise ValueError(f"unsupported or missing APKBUILD assignment: {name}")
    return next(value for value in match.groups() if value is not None)


def _literal_assignment(text: str, name: str) -> str:
    value = _assignment(text, name).strip()
    if not value or "$" in value or "`" in value or "$(" in value:
        raise ValueError(f"non-literal APKBUILD {name}: {value}")
    return value

def _expand_reference(reference: str, variables: dict[str, str]) -> str:
    def expand_braced(match: re.Match) -> str:
        name, replace_op, search, replacement, trim_op, pattern = match.groups()
        value = variables.get(name)
        if value is None:
            return match.group(0)
        if replace_op == "/":
            return value.replace(search, replacement or "", 1)
        if trim_op in {"%", "%%"}:
            matches = [index for index in range(len(value) + 1) if fnmatch.fnmatchcase(value[index:], pattern)]
            if matches:
                index = max(matches) if trim_op == "%" else min(matches)
                return value[:index]
        if trim_op in {"#", "##"}:
            matches = [index for index in range(len(value) + 1) if fnmatch.fnmatchcase(value[:index], pattern)]
            if matches:
                index = min(matches) if trim_op == "#" else max(matches)
                return value[index:]
        return value

    expanded = re.sub(
        r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(/)([^/}]*)(?:/([^}]*))?|(%{1,2}|#{1,2})([^}]*))?\}",
        expand_braced,
        reference,
    )
    for name, value in sorted(variables.items(), key=lambda pair: len(pair[0]), reverse=True):
        expanded = re.sub(rf"\${re.escape(name)}(?![A-Za-z0-9_])", lambda _match: value, expanded)
    return expanded


def _source_items(
    text: str,
    repo: pathlib.Path,
    commit: str,
    recipe_path: str,
    pkgname: str,
    pkgver: str,
    pkgrel: str,
) -> list[dict]:
    try:
        source_text = _assignment(text, "source").replace("\\\n", " ")
        references = shlex.split(source_text, comments=False, posix=True)
    except ValueError:
        references = []

    variables = {"pkgname": pkgname, "pkgver": pkgver, "pkgrel": pkgrel}
    # Alpine util-linux selects this source URL directory in a pkgver case arm.
    if pkgname == "util-linux":
        variables["_v"] = pkgver.rsplit(".", 1)[0] if pkgver.count(".") > 1 else pkgver
    variable_pattern = re.compile(
        r"(?ms)^[ \t]*([A-Za-z_][A-Za-z0-9_]*)=(?:\"(.*?)\"|'(.*?)'|([^\s#]+))"
    )
    for match in variable_pattern.finditer(text):
        name = match.group(1)
        value = next(item for item in match.groups()[1:] if item is not None)
        resolved = _expand_reference(value, variables)
        if "$" not in resolved and "`" not in resolved and "$(" not in resolved:
            variables[name] = resolved
    references = [
        material
        for reference in references
        for material in shlex.split(_expand_reference(reference, variables), comments=False, posix=True)
    ]

    sums: dict[str, tuple[str, str]] = {}
    sum_pattern = re.compile(
        r"(?ms)^([A-Za-z0-9_]*sums)=(?:\"(.*?)\"|'(.*?)'|([^\s#]+))"
    )
    for match in sum_pattern.finditer(text):
        algorithm = match.group(1).removesuffix("sums")
        sum_text = next(value for value in match.groups()[1:] if value is not None)
        for line in sum_text.splitlines():
            fields = line.split(None, 1)
            if len(fields) == 2 and fields[0] not in {"SKIP", "unset"}:
                sums[pathlib.PurePosixPath(fields[1].strip().lstrip("* ")).name] = (algorithm, fields[0])

    source_list_derived = not references
    if source_list_derived:
        references = list(sums)

    results = []
    recipe_dir = pathlib.PurePosixPath(recipe_path).parent
    for reference in references:
        if "::" in reference:
            source_name, declared_url = reference.split("::", 1)
        else:
            declared_url = reference
            source_name = pathlib.PurePosixPath(urllib.parse.urlsplit(declared_url).path).name
        source_name = source_name.strip()
        if not source_name or "$" in source_name or "`" in source_name:
            raise ValueError(f"unresolved APKBUILD source filename: {reference}")
        checksum = sums.get(pathlib.PurePosixPath(source_name).name)
        if checksum is None:
            raise ValueError(f"APKBUILD source has no declared checksum: {reference}")

        source = {
            "reference": reference,
            "referenceMode": "checksum-list fallback" if source_list_derived else "APKBUILD source list",
            "declaredFilename": source_name,
            "declaredUrl": declared_url if urllib.parse.urlsplit(declared_url).scheme else None,
            "checksumAlgorithm": checksum[0],
            "declaredChecksum": checksum[1],
            "kind": "patch" if source_name.endswith((".patch", ".diff")) else "source",
        }
        local_path = (recipe_dir / source_name).as_posix()
        if not urllib.parse.urlsplit(declared_url).scheme:
            try:
                data = _git_file(repo, commit, local_path)
            except subprocess.CalledProcessError as error:
                raise ValueError(f"APKBUILD local source file is missing: {local_path}") from error
            source["path"] = local_path
            source["blobSha1"] = _git(repo, "rev-parse", f"{commit}:{local_path}").decode().strip()
            source["sha256"] = _sha256(data)
            if source["kind"] == "source":
                source["kind"] = "packaging-file"
        else:
            source["availability"] = "upstream-reference"
        results.append(source)
    return results


def _candidate_recipe(
    repo: pathlib.Path, origin: str, package_name: str, package_version: str
) -> tuple[str, str, str, str, str, str, str, str]:
    candidates = []
    if origin in APORTS_RECIPE_OVERRIDES:
        candidates.append(APORTS_RECIPE_OVERRIDES[origin])
    candidates.extend((area, APORTS_COMMITS[area]) for area in ("main", "community", "testing"))
    mismatches: list[str] = []
    for area, commit in candidates:
        relative = f"{area}/{origin}/APKBUILD"
        try:
            recipe = _git_file(repo, commit, relative).decode()
        except subprocess.CalledProcessError:
            continue
        pkgname_expression = _assignment(recipe, "pkgname").strip().strip("\"'")
        pkgname = package_name if "$" in pkgname_expression else pkgname_expression
        pkgver = _literal_assignment(recipe, "pkgver")
        pkgrel = _literal_assignment(recipe, "pkgrel")
        expected = f"{pkgver}-r{pkgrel}"
        if package_version == expected:
            return area, commit, relative, recipe, pkgname, pkgname_expression, pkgver, pkgrel
        mismatches.append(f"{relative}@{commit[:12]}={expected}")
    detail = "; ".join(mismatches) if mismatches else "no recipe path found"
    raise ValueError(
        f"no pinned APKBUILD version match for {origin} {package_version}: {detail}"
    )

def enrich_packages(packages: list[dict], aports_root: pathlib.Path) -> list[dict]:
    repo = aports_root.resolve()
    commits = set(APORTS_COMMITS.values()) | {commit for _area, commit in APORTS_RECIPE_OVERRIDES.values()}
    for commit in commits:
        _git(repo, "cat-file", "-e", f"{commit}^{{commit}}")

    for package in packages:
        origin = package["origin"]
        area, commit, relative, recipe_text, pkgname, pkgname_expression, pkgver, pkgrel = _candidate_recipe(
            repo, origin, package["name"], package["version"]
        )
        recipe_bytes = recipe_text.encode()
        recipe_blob = _git(repo, "rev-parse", f"{commit}:{relative}").decode().strip()
        recipe_license = _assignment(recipe_text, "license").strip().strip("\"'")
        package["sourceRecipe"] = {
            "repository": APORTS_REPOSITORY,
            "branch": APORTS_BRANCH,
            "repositoryArea": area,
            "commit": commit,
            "path": relative,
            "blobSha1": recipe_blob,
            "sha256": _sha256(recipe_bytes),
            "recipePkgname": pkgname,
            "recipePkgnameExpression": pkgname_expression,
            "recipePkgver": pkgver,
            "recipePkgrel": pkgrel,
            "recipeLicenseExpression": recipe_license,
            "versionMatch": True,
            "sourceMaterials": _source_items(
                recipe_text, repo, commit, relative, pkgname, pkgver, pkgrel
            ),
        }
        package["licenseObligations"] = {
            "installedLicenseExpression": package["license"],
            "recipeLicenseExpression": recipe_license,
            "noticesVerified": False,
            "sourceBundleIncluded": False,
            "sourceAvailability": "Use the pinned APKBUILD sourceMaterials; applicable notice and corresponding-source duties remain with the distributor.",
        }
    return packages
