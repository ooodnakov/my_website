import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const buildScript = path.join(here, "build.sh");
const fakeDocker = `#!/bin/sh
set -eu
case "$1" in
  cp)
    if [ -d "$2/en" ]; then
      [ "$(stat -c %a "$2/en")" = 555 ]
      printf '%s\\n' "$2" > "$DOCKER_PORTFOLIO"
    elif [ -f "$2" ]; then
      [ -s "$2" ]
    else
      printf 'guest asset\\n' > "$3/guest-asset"
    fi
    ;;
  start)
    if [ "$DOCKER_START_SIGNAL" = TERM ]; then
      kill -TERM "$PPID"
      sleep 1
      exit 0
    fi
    exit "$DOCKER_START_STATUS"
    ;;
esac
exit 0
`;

async function runBuild(startStatus, sendTerm = false) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "browser-os-build-cleanup-"));
  try {
    const bin = path.join(temporaryRoot, "bin");
    const stagingRoot = path.join(temporaryRoot, "staging");
    const output = path.join(temporaryRoot, "output");
    const portfolioPath = path.join(temporaryRoot, "portfolio-path");
    await mkdir(bin);
    await mkdir(stagingRoot);
    await writeFile(path.join(bin, "docker"), fakeDocker, { mode: 0o755 });
    await chmod(path.join(bin, "docker"), 0o755);

    const result = spawnSync(buildScript, [output], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        TMPDIR: stagingRoot,
        DOCKER_PORTFOLIO: portfolioPath,
        DOCKER_START_STATUS: String(startStatus),
        DOCKER_START_SIGNAL: sendTerm ? "TERM" : "",
      },
    });
    assert.ifError(result.error);
    assert.equal(result.status, sendTerm ? 143 : startStatus, result.stderr);
    if (startStatus === 0 && !sendTerm) {
      assert.equal(await readFile(path.join(output, "guest-asset"), "utf8"), "guest asset\n");
    } else {
      assert.deepEqual(await readdir(output), []);
    }
    const stagedPortfolio = (await readFile(portfolioPath, "utf8")).trim();
    assert.ok(stagedPortfolio.startsWith(`${stagingRoot}${path.sep}`));
    assert.deepEqual(await readdir(stagingRoot), []);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

test("build.sh removes its read-only export staging tree on success, failure, and cancellation", async t => {
  await t.test("successful build", () => runBuild(0));
  await t.test("failed guest build preserves its status", () => runBuild(37));
  await t.test("TERM cancellation cleans staging and exits with the signal status", () => runBuild(0, true));
});

test("guest input descriptor excludes Python bytecode and hashes the Docker exclusion rules", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "browser-os-inputs-"));
  try {
    const repository = path.join(temporaryRoot, "repo");
    const staging = path.join(temporaryRoot, "staging");
    const dockerIgnoreRules = "**/__pycache__\n**/*.pyc\n**/*.pyo\n";
    const fixedInputs = [
      "docs/browser-os/com2-protocol.md",
      "apps/main/client/src/data/home/index.ts",
      "tools/browser-os/.dockerignore",
      "tools/browser-os/Dockerfile",
      "tools/browser-os/build.sh",
      "tools/browser-os/guest-build.sh",
      "tools/browser-os/guest-build-inputs.mjs",
      "tools/browser-os/guest-build-identity.py",
      "tools/browser-os/manifest.py",
      "tools/browser-os/source_provenance.py",
      "tools/browser-os/normalize-initramfs.py",
      "tools/browser-os/normalize-shadow.py",
      "tools/browser-os/packages.lock",
      "tools/browser-os/python-zstd-fallback.patch",
      "tools/browser-os/export-portfolio.mjs",
      "tools/browser-os/portfolio-ids.mjs",
    ];
    for (const relative of fixedInputs) {
      const filename = path.join(repository, relative);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, relative === "tools/browser-os/.dockerignore" ? dockerIgnoreRules : "");
    }
    const guest = path.join(repository, "tools/browser-os/guest");
    await mkdir(path.join(guest, "__pycache__"), { recursive: true });
    await writeFile(path.join(guest, "browser-osd"), "guest source");
    await writeFile(path.join(guest, "helper.py"), "python source");
    await writeFile(path.join(guest, "helper.pyc"), "loose bytecode");
    await writeFile(path.join(guest, "helper.pyo"), "optimized bytecode");
    await writeFile(path.join(guest, "__pycache__", "helper.cpython-312.pyc"), "cached bytecode");
    await mkdir(path.join(staging, "portfolio"), { recursive: true });
    await writeFile(path.join(staging, "portfolio", "links.json"), "{}\n");

    const result = spawnSync(process.execPath, [
      path.join(here, "guest-build-inputs.mjs"),
      repository,
      staging,
    ], { encoding: "utf8" });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const descriptor = JSON.parse(await readFile(path.join(staging, "guest-build-inputs.json"), "utf8"));
    const inputs = Object.keys(descriptor.inputs);
    assert.ok(inputs.includes("tools/browser-os/.dockerignore"));
    assert.equal(
      descriptor.inputs["tools/browser-os/.dockerignore"].sha256,
      createHash("sha256").update(dockerIgnoreRules).digest("hex"),
    );
    assert.ok(inputs.includes("tools/browser-os/guest/browser-osd"));
    assert.ok(inputs.includes("tools/browser-os/guest/helper.py"));
    assert.equal(inputs.some(filename => /__pycache__|\.py[co]$/.test(filename)), false);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
