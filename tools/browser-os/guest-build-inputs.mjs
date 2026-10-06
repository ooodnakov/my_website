import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [repositoryArgument, stagingArgument] = process.argv.slice(2);
if (!repositoryArgument || !stagingArgument) throw new Error("Usage: guest-build-inputs.mjs REPOSITORY STAGING_DIRECTORY");
const repository = path.resolve(repositoryArgument);
const staging = path.resolve(stagingArgument);

const fixed = [
  "docs/browser-os/com2-protocol.md",
  "apps/main/client/src/data/home/index.ts",
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

async function walk(directory, prefix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const filename = path.join(directory, entry.name);
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await walk(filename, relative));
    else if (entry.isFile()) files.push([relative, filename]);
    else throw new Error(`Unsupported guest build input: ${relative}`);
  }
  return files;
}

const files = fixed.map(relative => [relative, path.join(repository, relative)]);
files.push(...await walk(path.join(repository, "tools/browser-os/guest"), "tools/browser-os/guest"));
files.push(...await walk(path.join(staging, "portfolio"), "portfolio"));
const inputs = {};
for (const [relative, filename] of files.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
  const bytes = await readFile(filename);
  if (Object.hasOwn(inputs, relative)) throw new Error(`Duplicate guest build input: ${relative}`);
  inputs[relative] = { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}
await writeFile(path.join(staging, "guest-build-inputs.json"), `${JSON.stringify({ schemaVersion: 1, inputs }, null, 2)}\n`, { flag: "wx" });
