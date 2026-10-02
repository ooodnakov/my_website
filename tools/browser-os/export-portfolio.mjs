import { chmod, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertPortfolioLinkIds } from "./portfolio-ids.mjs";
import { homeContent } from "../../apps/main/client/src/data/home/index.ts";

if (!process.argv[2]) throw new Error("Usage: node --experimental-strip-types export-portfolio.mjs OUTPUT_DIRECTORY");
const output = path.resolve(process.argv[2]);
const languages = ["en", "ru"];

const quickActionNames = new Map([
  ["cv", "cv"],
  ["pdf en", "pdf-en"],
  ["pdf ru", "pdf-ru"],
  ["archive", "archive"],
  ["архив", "archive"],
  ["vcard", "vcard"],
  ["mail", "mail"],
  ["почта", "mail"],
]);

function safeSlug(value) {
  const slug = value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug || slug.length > 24) throw new Error(`Portfolio value cannot form a stable action ID: ${value}`);
  return slug;
}

function actionId(kind, value) {
  const slug = safeSlug(value);
  const id = `${kind}-${slug}`;
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(id)) throw new Error(`Unsafe portfolio action ID: ${id}`);
  return id;
}

function validTarget(target) {
  if (typeof target !== "string" || target.length === 0 || target.length > 2048 || /[\u0000-\u001f\u007f]/.test(target)) {
    throw new Error("Portfolio link target must be a bounded printable string");
  }
  if (target.startsWith("/")) {
    if (target.startsWith("//") || target.includes("\\")) return false;
    try {
      return !decodeURIComponent(target).split("/").some(part => part === ".." || part.includes("\\"));
    } catch {
      return false;
    }
  }
  try {
    const url = new URL(target);
    if (url.protocol === "https:") return !url.username && !url.password;
    return url.protocol === "mailto:" && !url.pathname.startsWith("//");
  } catch {
    return false;
  }
}

function quickActionId(name) {
  const stableName = quickActionNames.get(name.trim().toLowerCase());
  if (!stableName) throw new Error(`Canonical quick link has no stable action ID: ${name}`);
  return `quick-${stableName}`;
}

function sectionData(content, type) {
  const section = content.sections.find(item => item.type === type);
  if (!section) throw new Error(`Canonical portfolio section is missing: ${type}`);
  return section.data;
}

function linksFor(content) {
  const links = [];
  const add = (id, label, target, section) => {
    if (!validTarget(target)) throw new Error(`Unsafe canonical portfolio target for ${id}`);
    links.push({ id, label, target, section });
  };
  for (const link of sectionData(content, "quickLinks")) {
    add(quickActionId(link.name), link.title, link.url, "quickLinks");
  }
  for (const social of sectionData(content, "social")) {
    add(actionId("social", social.name), social.name, social.url, "social");
  }
  for (const project of sectionData(content, "projects").items) {
    const name = project.name.trim().split(/\s+/).at(-1);
    if (name) add(actionId("project", name), name, project.url, "projects");
  }
  for (const item of sectionData(content, "archive").items) {
    const name = item.name.split("/").filter(Boolean).at(-1) ?? "item";
    add(actionId("archive", name), item.name, item.url, "archive");
  }
  assertPortfolioLinkIds(links.map(link => link.id));
  return links;
}

function aboutText(content) {
  const lines = sectionData(content, "about").lines;
  if (!Array.isArray(lines)) throw new Error("Canonical about section has no lines");
  return `${lines.filter(line => line.type === "content")
    .map(line => line.line.replace(/^\s*\d+\s*│\s?/, "").trimEnd()).join("\n")}\n`;
}

function projectText(project) {
  const name = project.name.trim().split(/\s+/).at(-1);
  const fields = [
    name,
    project.year && `Year: ${project.year}`,
    project.role && `Role: ${project.role}`,
    project.tech && `Tech: ${project.tech}`,
    project.stack && `Stack: ${project.stack}`,
    project.impact && `Impact: ${project.impact}`,
    project.artifact && `Artifact: ${project.artifact}`,
    project.description && `Description: ${project.description}`,
    `URL: ${project.url}`,
    name && `Try: open project-${safeSlug(name)}`,
  ].filter(Boolean);
  return fields.join("\n");
}

async function emit(directory, files) {
  await mkdir(directory, { recursive: true });
  for (const [name, value] of Object.entries(files)) {
    const target = path.join(directory, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, value, { encoding: "utf8", mode: 0o444 });
    await chmod(target, 0o444);
  }
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    await chmod(target, entry.isDirectory() ? 0o555 : 0o444);
    if (entry.isDirectory()) await freezeTree(target);
  }
  await chmod(directory, 0o555);
}

async function freezeTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    await chmod(target, entry.isDirectory() ? 0o555 : 0o444);
    if (entry.isDirectory()) await freezeTree(target);
  }
}

const existing = await readdir(output).catch(error => {
  if (error.code === "ENOENT") return [];
  throw error;
});
if (existing.length) throw new Error(`Refusing to overwrite non-empty portfolio output: ${output}`);
await mkdir(output, { recursive: true });
let expectedActions = null;
for (const language of languages) {
  const content = homeContent[language];
  if (!content?.hero || typeof content.hero.title !== "string" || typeof content.hero.desc !== "string") {
    throw new Error(`Canonical portfolio is incomplete for locale ${language}`);
  }
  const quickLinks = sectionData(content, "quickLinks");
  const projects = sectionData(content, "projects").items;
  const cv = sectionData(content, "cv");
  if (!Array.isArray(quickLinks) || !Array.isArray(projects) || !Array.isArray(cv.items) || typeof cv.ctaUrl !== "string") {
    throw new Error(`Canonical portfolio sections are incomplete for locale ${language}`);
  }
  const links = linksFor(content);
  const actionIds = links.map(link => link.id).sort();
  if (expectedActions && JSON.stringify(actionIds) !== JSON.stringify(expectedActions)) {
    throw new Error("Canonical portfolio locales must expose the same stable action IDs");
  }
  expectedActions ??= actionIds;
  const contacts = links.filter(link => ["quick-mail", "quick-vcard", "social-li", "social-gh", "social-tg"].includes(link.id));
  const site = {
    hero: content.hero,
    sections: content.sections.map(section => ({ type: section.type, title: section.title, data: section.data })),
  };
  const projectFiles = Object.fromEntries(projects.map(project => {
    const name = project.name.trim().split(/\s+/).at(-1);
    if (!name) throw new Error("Canonical project is missing its name");
    const id = actionId("project", name);
    return [`projects/${id}.txt`, `${projectText(project)}\n`];
  }));
  const files = {
    "site.json": `${JSON.stringify(site, null, 2)}\n`,
    "index.txt": `${content.hero.title}\n${content.hero.desc}\n`,
    "README.md": aboutText(content),
    "links.json": `${JSON.stringify(links, null, 2)}\n`,
    "links.txt": `${quickLinks.map(link => `${link.name}\t${link.title}\t${link.url}`).join("\n")}\n`,
    "projects.txt": `${projects.map(projectText).join("\n\n")}\n`,
    "cv.txt": `${cv.items.join("\n")}\n\nLink: ${cv.ctaUrl}\n`,
    "contact.txt": `${contacts.map(link => `${link.label}\t${link.target}`).join("\n")}\n`,
    ...projectFiles,
  };
  await emit(path.join(output, language), files);
}
if (!expectedActions) throw new Error("Canonical portfolio must include both locales");
console.log(JSON.stringify({ locales: languages, actionIds: expectedActions, output }));
