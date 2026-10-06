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
    "linux-lts": ("main", "52fae6d7d56f3958f32e5bf9121a7536524b9ef4"),
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


_SOURCE_ASSIGNMENT = re.compile(
    r"""(?ms)^(?P<indent>[ \t]*)source=(?:"(?P<double>(?:\\.|[^"\\])*)"|'(?P<single>(?:\\.|[^'\\])*)'|(?P<bare>[^\s#]+))"""
)


def _condition_value(expression: str, variables: dict[str, str]) -> bool | None:
    try:
        operands = shlex.split(expression)
    except ValueError:
        return None
    if len(operands) == 2 and operands[0] in {"-n", "-z"}:
        value = _expand_reference(operands[1], variables)
        if "$" in value or "`" in value:
            return None
        return bool(value) if operands[0] == "-n" else not bool(value)
    if len(operands) == 3 and operands[1] in {"=", "==", "!="}:
        left = _expand_reference(operands[0], variables)
        right = _expand_reference(operands[2], variables)
        if "$" in left + right or "`" in left + right:
            return None
        equal = left == right
        return not equal if operands[1] == "!=" else equal
    return None


def _source_references(text: str, variables: dict[str, str]) -> list[str]:
    matches = list(_SOURCE_ASSIGNMENT.finditer(text))
    matches_by_line = {
        text.count("\n", 0, match.start()): match
        for match in matches
    }
    recognized_lines = set(matches_by_line)
    last_source_line = max(matches_by_line, default=-1)
    lines = text.splitlines()
    write_pattern = re.compile(r"(?m)\bsource[ \t]*(?:\+?=)")
    for write in write_pattern.finditer(text):
        line_number = text.count("\n", 0, write.start())
        line = lines[line_number].lstrip()
        if line.startswith("#"):
            continue
        if line_number not in recognized_lines:
            raise ValueError("unsupported APKBUILD source assignment syntax")

    conditions: list[bool | None] = []
    loops: list[tuple[str, list[str] | None]] = []
    case_depth = 0
    function_depth = 0
    skip_through = -1
    for line_number, line in enumerate(lines):
        if line_number > last_source_line:
            break
        if line_number <= skip_through:
            continue
        match = matches_by_line.get(line_number)
        if match is not None:
            indent_width = len(match.group("indent").expandtabs(4))
            if indent_width != 4 * (len(conditions) + len(loops)):
                raise ValueError("nested or indented APKBUILD source assignment is unsupported")
            line_end = text.find("\n", match.end())
            if line_end < 0:
                line_end = len(text)
            trailing = text[match.end():line_end].strip()
            if trailing and not trailing.startswith("#"):
                raise ValueError("inline APKBUILD source assignment syntax is unsupported")
            if False not in conditions:
                if None in conditions:
                    raise ValueError("source assignment uses an unsupported conditional")
                if case_depth or function_depth:
                    raise ValueError("source assignment uses an unsupported shell scope")
                if any(values is None for _name, values in loops) or len(loops) > 1:
                    raise ValueError("source assignment uses an unsupported loop")
                value = match.group("double")
                expand = True
                if value is None:
                    value = match.group("single")
                    if value is not None:
                        expand = False
                    else:
                        value = match.group("bare")
                value = value.replace("\\\n", " ")
                iterations = loops[0][1] if loops else [None]
                for item in iterations:
                    local_variables = dict(variables)
                    local_variables["source"] = variables.get("source", "")
                    if loops:
                        local_variables[loops[0][0]] = item
                    resolved = _expand_reference(value, local_variables) if expand else value
                    if expand and ("$" in resolved or "`" in resolved):
                        raise ValueError(f"unresolved source assignment: {resolved}")
                    variables["source"] = resolved
            skip_through = text.count("\n", 0, match.end())
            continue

        statement = line.strip()
        function_declaration = re.fullmatch(
            r"(?:function\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\(\s*\)\s*\{",
            statement,
        )
        if function_declaration:
            function_depth += 1
        elif statement == "}" and function_depth:
            function_depth -= 1
        elif statement.startswith("case ") and statement.endswith(" in"):
            case_depth += 1
        elif statement == "esac":
            if not case_depth:
                raise ValueError("unmatched APKBUILD esac")
            case_depth -= 1
        elif statement.startswith("if "):
            conditional = re.fullmatch(r"if\s+\[(.*)\]\s*;\s*then", statement)
            result = _condition_value(conditional.group(1), variables) if conditional else None
            conditions.append(result)
        elif statement == "else":
            if not conditions:
                raise ValueError("unmatched APKBUILD else")
            current = conditions[-1]
            conditions[-1] = None if current is None else not current
        elif statement.startswith("elif "):
            if not conditions:
                raise ValueError("unmatched APKBUILD elif")
            conditions[-1] = None
        elif statement == "fi":
            if not conditions:
                raise ValueError("unmatched APKBUILD fi")
            conditions.pop()
        elif not statement.startswith("#") and re.search(r"(?:^|;\s*)(?:for|while|until)\b", statement):
            inline_loop = re.search(r"\bdone(?:\s*;)?\s*$", statement)
            loop = re.fullmatch(
                r"for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+\$([A-Za-z_][A-Za-z0-9_]*)\s*;\s*do",
                statement,
            )
            if not inline_loop:
                values = None
                if loop and loop.group(2) in variables:
                    try:
                        values = shlex.split(variables[loop.group(2)], comments=False, posix=True)
                    except ValueError:
                        values = None
                loops.append((loop.group(1) if loop else "", values))
        elif statement == "done":
            if not loops:
                raise ValueError("unmatched APKBUILD done")
            loops.pop()

    if not matches:
        return []
    try:
        return shlex.split(variables.get("source", ""), comments=False, posix=True)
    except ValueError as error:
        raise ValueError("could not split resolved APKBUILD source list") from error


def _expand_readline_patch_loop(text: str, pkgname: str, pkgver: str) -> str:
    loop = re.compile(
        r'(?m)^_i=1\n'
        r'while \[ \$_i -le \$\{pkgver##\*\.\} \]; do\n'
        r'\t_patch=\$\(printf "%03d" \$_i\)\n'
        r'\t_name=\$pkgname\$\{_myver//\./\}-\$_patch\n'
        r'\tsource="\$source\n'
        r'\t\t\$_name\.patch::https://ftp\.gnu\.org/gnu/readline/readline-\$_myver-patches/\$_name"\n'
        r'\t_i=\$\(\(_i\+1\)\)\n'
        r'done\n'
    )
    matches = list(loop.finditer(text))
    if len(matches) != 1:
        raise ValueError("unsupported readline source patch loop")
    version, patch_count = pkgver.rsplit(".", 1)
    if not patch_count.isdigit() or int(patch_count) > 999:
        raise ValueError("invalid readline patch count")
    patch_base = f"{pkgname}{version.replace('.', '')}"
    statements = []
    for index in range(1, int(patch_count) + 1):
        name = f"{patch_base}-{index:03d}"
        statements.append(
            f'source="$source\n\t\t{name}.patch::'
            f'https://ftp.gnu.org/gnu/readline/readline-{version}-patches/{name}"'
        )
    match = matches[0]
    return text[:match.start()] + "\n".join(statements) + "\n" + text[match.end():]


def _source_items(
    text: str,
    repo: pathlib.Path,
    commit: str,
    recipe_path: str,
    pkgname: str,
    pkgver: str,
    pkgrel: str,
    architecture: str,
) -> list[dict]:
    if recipe_path == "main/readline/APKBUILD":
        text = _expand_readline_patch_loop(text, pkgname, pkgver)
    variables = {"pkgname": pkgname, "pkgver": pkgver, "pkgrel": pkgrel, "FLAVOR": ""}
    if architecture != "unknown":
        variables["CARCH"] = architecture
    # Alpine util-linux selects this source URL directory in a pkgver case arm.
    if pkgname == "util-linux":
        variables["_v"] = pkgver.rsplit(".", 1)[0] if pkgver.count(".") > 1 else pkgver
    elif pkgname == "sqlite":
        version_parts = pkgver.split(".")
        if len(version_parts) not in (3, 4) or any(not part.isdigit() for part in version_parts):
            raise ValueError(f"unsupported SQLite package version: {pkgver}")
        major, minor, patch = version_parts[:3]
        suffix = version_parts[3] if len(version_parts) == 4 else "0"
        variables["_ver"] = f"{major}{minor.zfill(2)}{patch.zfill(2)}{suffix.zfill(2)}"
    variable_pattern = re.compile(
        r"(?ms)^[ \t]*([A-Za-z_][A-Za-z0-9_]*)=(?:\"(.*?)\"|'(.*?)'|([^\s#]+))"
    )
    for match in variable_pattern.finditer(text):
        name = match.group(1)
        if name == "source":
            continue
        value = next(item for item in match.groups()[1:] if item is not None)
        resolved = _expand_reference(value, variables)
        if "$" not in resolved and "`" not in resolved and "$(" not in resolved:
            variables[name] = resolved
    references = _source_references(text, variables)

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
                filename = pathlib.PurePosixPath(fields[1].strip().lstrip("* ")).name
                checksum = (algorithm, fields[0])
                if filename in sums and sums[filename] != checksum:
                    raise ValueError(f"conflicting APKBUILD checksums for {filename}")
                sums[filename] = checksum

    if not references and sums:
        raise ValueError("APKBUILD checksum list has no effective source assignment")

    results = []
    recorded_checksum_names = set()
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
        checksum_name = pathlib.PurePosixPath(source_name).name
        checksum = sums.get(checksum_name)
        if checksum is None:
            raise ValueError(f"APKBUILD source has no declared checksum: {reference}")
        recorded_checksum_names.add(checksum_name)

        source = {
            "reference": reference,
            "referenceMode": "APKBUILD source list",
            "declaredFilename": source_name,
            "declaredUrl": declared_url if urllib.parse.urlsplit(declared_url).scheme else None,
            "checksumAlgorithm": checksum[0],
            "declaredChecksum": checksum[1],
            "kind": "patch" if source_name.endswith((".patch", ".patch.xz", ".diff")) else "source",
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
    missing_checksums = sorted(set(sums) - recorded_checksum_names)
    if missing_checksums:
        raise ValueError(
            "APKBUILD checksums are missing from the effective source list: "
            + ", ".join(missing_checksums)
        )
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
                recipe_text,
                repo,
                commit,
                relative,
                pkgname,
                pkgver,
                pkgrel,
                package["architecture"],
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
