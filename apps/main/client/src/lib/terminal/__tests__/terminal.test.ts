import assert from "node:assert/strict";

import { VirtualFileSystem } from "../../vfs";
import { completeInput } from "../completion";
import { createCommandRegistry } from "../commands";
import { parseCommand } from "../parser";
import { Shell } from "../../shell";
import type { ShellState } from "../types";

const registry = createCommandRegistry();
const vfs = new VirtualFileSystem("en");
const state: ShellState = { history: [], user: "user", host: "main", branch: "main" };

assert.deepEqual(parseCommand("open 'cv.txt'").args, ["cv.txt"]);
assert.equal(parseCommand("  PROJECTS  ").command, "projects");

assert.ok(registry.get("tour"));
assert.equal(registry.get("resume"), registry.get("cv"));
assert.equal(registry.get("email"), registry.get("contact"));
assert.equal(registry.get("gh"), registry.get("github"));

assert.equal(vfs.readFile("/README.md").includes("────"), false);
assert.ok(vfs.resolvePath("/contact/gh.txt"));
assert.equal(vfs.findUrl("gh.txt"), "https://github.com/ooodnakov");

vfs.changeDirectory("/projects");
vfs.setLang("ru");
assert.equal(vfs.getPwd(), "/projects");

const commandCompletion = completeInput("to", registry, vfs);
assert.equal(commandCompletion.replacement, "tour");

const pathCompletion = completeInput("open /cont", registry, vfs);
assert.equal(pathCompletion.replacement, "open /contact/");

const tour = registry.get("tour")!.execute({ raw: "tour", args: [], vfs, state, registry, lang: "en" });
assert.ok(tour.lines?.some((line) => line.includes("links")));

const contact = registry.get("contact")!.execute({ raw: "contact", args: [], vfs, state, registry, lang: "en" });
assert.ok(contact.lines?.some((line) => line.includes("github.com/ooodnakov")));

const github = registry.get("github")!.execute({ raw: "github", args: [], vfs, state, registry, lang: "en" });
assert.equal(github.openUrl, "https://github.com/ooodnakov");

const terminalWrites: string[] = [];
const fakeTerminal = {
  write: (value: string) => terminalWrites.push(value),
  writeln: (value: string) => terminalWrites.push(`${value}\n`),
  clear: () => terminalWrites.push("<clear>"),
  onKey: () => undefined,
};
const shell = new Shell(fakeTerminal as never, new VirtualFileSystem("en"));
(shell as any).state.history = ["about", "projects", "contact"];
(shell as any).currentInput = "draft";
(shell as any).startReverseSearch();
(shell as any).handleReverseSearchKey("p", { key: "p", altKey: false, ctrlKey: false, metaKey: false } as KeyboardEvent);
assert.equal((shell as any).currentInput, "projects");
(shell as any).handleReverseSearchKey("", { key: "Escape", altKey: false, ctrlKey: false, metaKey: false } as KeyboardEvent);
assert.equal((shell as any).currentInput, "draft");
(shell as any).startReverseSearch();
(shell as any).handleReverseSearchKey("", { key: "c", altKey: false, ctrlKey: true, metaKey: false } as KeyboardEvent);
assert.equal((shell as any).currentInput, "");

console.log("terminal tests passed");
