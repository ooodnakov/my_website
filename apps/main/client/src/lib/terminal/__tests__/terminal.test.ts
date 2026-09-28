import assert from "node:assert/strict";

import { VirtualFileSystem } from "../../vfs";
import { completeInput } from "../completion";
import { createCommandRegistry } from "../commands";
import { parseCommand } from "../parser";
import { Shell } from "../../shell";
import { WasmCommandProvider } from "../wasmCommands";
import type { ShellState } from "../types";

const registry = createCommandRegistry();
const vfs = new VirtualFileSystem("en");
const state: ShellState = { history: [], user: "user", host: "main", branch: "main", shell: "zsh", theme: "powerlevel10k" };

assert.deepEqual(parseCommand("open 'cv.txt'").args, ["cv.txt"]);
assert.equal(parseCommand("  PROJECTS  ").command, "projects");

assert.ok(registry.get("tour"));
assert.equal(registry.get("resume"), registry.get("cv"));
assert.equal(registry.get("email"), registry.get("contact"));
assert.equal(registry.get("copy-email"), registry.get("copy-contact"));
assert.equal(registry.get("gh"), registry.get("github"));
assert.equal(registry.get("omz"), registry.get("plugins"));
assert.equal(registry.get("zsh"), registry.get("plugins"));
assert.notEqual(registry.get("ls"), registry.get("eza"));
assert.equal(registry.get("ll"), registry.get("eza"));
const wasmProvider = new WasmCommandProvider();
const shellRegistry = createCommandRegistry(wasmProvider.commands);
assert.ok(shellRegistry.get("wasm"));
assert.ok(shellRegistry.get("jq"));

assert.equal(vfs.readFile("/README.md").includes("────"), false);
assert.ok(vfs.resolvePath("/contact/gh.txt"));
assert.equal(vfs.findUrl("gh.txt"), "https://github.com/ooodnakov");
assert.ok(vfs.readFile("/site.json").includes("hero"));
assert.ok(vfs.readFile("/projects/lemma.txt").includes("Role:"));
assert.ok(vfs.readFile("/projects/lemma.txt").includes("Impact:"));
assert.ok(vfs.readFile("/projects/lemma.txt").includes("Artifact:"));
assert.equal(vfs.makeDirectory("/tmp/nested", { parents: true }), "");
assert.equal(vfs.makeDirectory("/tmp/nested"), "mkdir: cannot create directory /tmp/nested: File exists");
assert.equal(vfs.writeFile("/tmp/nested/copy.json", vfs.readFile("/site.json")), "");
assert.equal(vfs.writeFile("/tmp/nested/.", "bad"), "write: /tmp/nested/.: invalid path");
assert.ok(vfs.resolvePath("/tmp/nested/copy.json"));
assert.equal(vfs.remove("/tmp/nested/copy.json"), "");
assert.equal(vfs.remove("/tmp/nested"), "rm: cannot remove /tmp/nested: Is a directory");
assert.equal(vfs.remove("/tmp", { recursive: true }), "");

vfs.changeDirectory("/projects");
vfs.setLang("ru");
assert.equal(vfs.getPwd(), "/projects");

const commandCompletion = completeInput("to", registry, vfs);
assert.equal(commandCompletion.replacement, "tour");
const wasmCompletion = completeInput("wa", shellRegistry, vfs);
assert.equal(wasmCompletion.replacement, "wasm");

const pathCompletion = completeInput("open /cont", registry, vfs);
assert.equal(pathCompletion.replacement, "open /contact/");

const tour = registry.get("tour")!.execute({ raw: "tour", args: [], vfs, state, registry, lang: "en" });
assert.ok(tour.lines?.some((line) => line.includes("links")));

const contact = registry.get("contact")!.execute({ raw: "contact", args: [], vfs, state, registry, lang: "en" });
assert.ok(contact.lines?.some((line) => line.includes("github.com/ooodnakov")));

const copiedContact = await registry.get("copy-contact")!.execute({ raw: "copy-contact", args: [], vfs, state, registry, lang: "en" });
assert.ok(copiedContact.lines?.some((line) => line.includes("ooodnakov@yandex.ru")));

const github = registry.get("github")!.execute({ raw: "github", args: [], vfs, state, registry, lang: "en" });
assert.equal(github.openUrl, "https://github.com/ooodnakov");

const plugins = registry.get("plugins")!.execute({ raw: "plugins", args: [], vfs, state, registry, lang: "en" });
assert.ok(plugins.lines?.some((line) => line.includes("Oh My Zsh") || line.includes("autosuggestions")));

const classicListing = registry.get("ls")!.execute({ raw: "ls /projects", args: ["/projects"], vfs, state, registry, lang: "en" });
const modernListing = registry.get("eza")!.execute({ raw: "eza -la /projects", args: ["-la", "/projects"], vfs, state, registry, lang: "en" });
assert.ok(classicListing.lines?.some((line) => line.includes("\x1b]8;;https://")));
assert.ok(modernListing.lines?.some((line) => line.includes("Permissions")));
assert.ok(modernListing.lines?.some((line) => line.includes("") || line.includes("")));

const terminalWrites: string[] = [];
let terminalFocuses = 0;
const fakeTerminal = {
  write: (value: string) => terminalWrites.push(value),
  writeln: (value: string) => terminalWrites.push(`${value}\n`),
  clear: () => terminalWrites.push("<clear>"),
  onKey: () => undefined,
  focus: () => { terminalFocuses += 1; },
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
(shell as any).handleReverseSearchKey("c", { key: "c", altKey: false, ctrlKey: false, metaKey: false } as KeyboardEvent);
assert.equal((shell as any).currentInput, "contact");
(shell as any).handleReverseSearchKey("", { key: "ArrowLeft", altKey: false, ctrlKey: false, metaKey: false } as KeyboardEvent);
assert.equal((shell as any).reverseSearch, false);
assert.equal((shell as any).currentInput, "contact");
(shell as any).startReverseSearch();
(shell as any).handleReverseSearchKey("", { key: "c", altKey: false, ctrlKey: true, metaKey: false } as KeyboardEvent);
assert.equal((shell as any).currentInput, "");
(shell as any).state.history = ["tour"];
(shell as any).startReverseSearch();
(shell as any).handleReverseSearchKey("t", { key: "t", altKey: false, ctrlKey: false, metaKey: false } as KeyboardEvent);
assert.equal(shell.submitCommand("", false), true);
assert.equal(terminalFocuses, 0);
assert.equal(shell.submitCommand("plugins"), true);
assert.equal(terminalFocuses, 1);
assert.equal((shell as any).reverseSearch, false);

const previousWindow = (globalThis as any).window;
const storage: Record<string, string> = {
  "terminal.history": JSON.stringify(["about"]),
};
(globalThis as any).window = {
  localStorage: {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => {
      storage[key] = value;
    },
  },
};
const persistedShell = new Shell(fakeTerminal as never, new VirtualFileSystem("en"));
assert.deepEqual((persistedShell as any).state.history, ["about"]);
assert.equal(persistedShell.submitCommand("contact"), true);
assert.ok(storage["terminal.history"].includes("contact"));
(globalThis as any).window = previousWindow;

assert.ok(wasmProvider.has("jq"));
const sameFileVfs = new VirtualFileSystem("en");
const cpSelf = await wasmProvider.execute({ raw: "cp /site.json /site.json", parsed: parseCommand("cp /site.json /site.json"), vfs: sameFileVfs, state, registry });
assert.equal(cpSelf.exitCode, 1);
assert.ok(cpSelf.lines?.some((line) => line.includes("same file")));
const mvSelf = await wasmProvider.execute({ raw: "mv /site.json /site.json", parsed: parseCommand("mv /site.json /site.json"), vfs: sameFileVfs, state, registry });
assert.equal(mvSelf.exitCode, 1);
assert.ok(mvSelf.lines?.some((line) => line.includes("same file")));
const cpDir = await wasmProvider.execute({ raw: "cp /contact /tmp/contact", parsed: parseCommand("cp /contact /tmp/contact"), vfs: sameFileVfs, state, registry });
assert.equal(cpDir.exitCode, 1);
assert.ok(cpDir.lines?.some((line) => line.includes("cp: /contact: Is a directory")));
const jqResult = await wasmProvider.execute({
  raw: "jq -r .hero.title /site.json",
  parsed: parseCommand("jq -r .hero.title /site.json"),
  vfs: new VirtualFileSystem("en"),
  state,
  registry,
});
assert.equal(jqResult.exitCode, 0);
assert.ok(jqResult.lines?.some((line) => line.length > 0));

console.log("terminal tests passed");
