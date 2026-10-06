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
