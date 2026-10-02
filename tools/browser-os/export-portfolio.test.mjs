import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { homeContent } from "../../apps/main/client/src/data/home/index.ts";
import { assertPortfolioLinkIds, PORTFOLIO_LINK_IDS } from "./portfolio-ids.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const exporter = path.join(here, "export-portfolio.mjs");

async function makeWritable(directory) {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) await makeWritable(child);
    else await chmod(child, 0o644);
  }
}

async function readText(directory, name) {
  return readFile(path.join(directory, name), "utf8");
}

test("portfolio exporter derives both read-only locales from canonical home data", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "browser-os-portfolio-"));
  const output = path.join(temporaryRoot, "portfolio");
  try {
    execFileSync(process.execPath, ["--experimental-strip-types", exporter, output], { stdio: "pipe" });
    let expectedActionIds;
    for (const language of ["en", "ru"]) {
      const content = homeContent[language];
      const localeRoot = path.join(output, language);
      const sections = JSON.parse(JSON.stringify(content.sections.map(section => ({ type: section.type, title: section.title, data: section.data }))));
      assert.deepEqual(JSON.parse(await readText(localeRoot, "site.json")), { hero: content.hero, sections });
      assert.equal(await readText(localeRoot, "index.txt"), `${content.hero.title}\n${content.hero.desc}\n`);
      const about = content.sections.find(section => section.type === "about").data.lines
        .filter(line => line.type === "content")
        .map(line => line.line.replace(/^\s*\d+\s*│\s?/, "").trimEnd()).join("\n");
      assert.equal(await readText(localeRoot, "README.md"), `${about}\n`);
      const cv = content.sections.find(section => section.type === "cv").data;
      assert.equal(await readText(localeRoot, "cv.txt"), `${cv.items.join("\n")}\n\nLink: ${cv.ctaUrl}\n`);

      const links = JSON.parse(await readText(localeRoot, "links.json"));
      assert.ok(links.length > 0);
      assert.equal(new Set(links.map(link => link.id)).size, links.length);
      assert.ok(links.every(link => /^[a-z0-9][a-z0-9-]{0,31}$/.test(link.id)));
      assert.deepEqual(links.filter(link => link.section === "quickLinks").map(link => link.target),
        content.sections.find(section => section.type === "quickLinks").data.map(link => link.url));
      assert.deepEqual(links.filter(link => link.section === "social").map(link => link.target),
        content.sections.find(section => section.type === "social").data.map(link => link.url));
      const ids = links.map(link => link.id).sort();
      if (expectedActionIds) assert.deepEqual(ids, expectedActionIds);
      expectedActionIds = ids;

      const expectedProjects = content.sections.find(section => section.type === "projects").data.items;
      const projectsText = await readText(localeRoot, "projects.txt");
      for (const project of expectedProjects) {
        assert.ok(projectsText.includes(project.description));
        assert.ok(projectsText.includes(project.url));
      }
      assert.ok((await readText(localeRoot, "contact.txt")).includes("mailto:"));
      assert.equal((await stat(path.join(localeRoot, "site.json"))).mode & 0o777, 0o444);
      assert.equal((await stat(localeRoot)).mode & 0o777, 0o555);
    }
    assert.deepEqual(expectedActionIds, [...PORTFOLIO_LINK_IDS].sort());
    assert.throws(() => {
      try {
        execFileSync(process.execPath, ["--experimental-strip-types", exporter, output], { stdio: "pipe" });
      } catch (error) {
        assert.match(error.stderr.toString(), /non-empty portfolio output/);
        throw error;
      }
    });
  } finally {
    await makeWritable(temporaryRoot);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("fixed portfolio action allowlist rejects additions, omissions, and duplicates", () => {
  assert.doesNotThrow(() => assertPortfolioLinkIds(PORTFOLIO_LINK_IDS));
  assert.throws(() => assertPortfolioLinkIds([...PORTFOLIO_LINK_IDS, "social-unapproved"]), /unknown=social-unapproved/);
  assert.throws(() => assertPortfolioLinkIds(PORTFOLIO_LINK_IDS.filter(id => id !== "quick-mail")), /missing=quick-mail/);
  assert.throws(() => assertPortfolioLinkIds([...PORTFOLIO_LINK_IDS, PORTFOLIO_LINK_IDS[0]]), /Duplicate portfolio action ID/);
});
