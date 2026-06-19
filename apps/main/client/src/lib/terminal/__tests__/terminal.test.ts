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
assert.equal(registry.get("gh"), registry.get("github"));
assert.equal(registry.get("omz"), registry.get("plugins"));
assert.equal(registry.get("zsh"), registry.get("plugins"));
const wasmProvider = new WasmCommandProvider();
const shellRegistry = createCommandRegistry(wasmProvider.commands);
assert.ok(shellRegistry.get("wasm"));
assert.ok(shellRegistry.get("jq"));

assert.equal(vfs.readFile("/README.md").includes("────"), false);
assert.ok(vfs.resolvePath("/contact/gh.txt"));
assert.equal(vfs.findUrl("gh.txt"), "https://github.com/ooodnakov");
assert.ok(vfs.readFile("/site.json").includes("hero"));
assert.equal(vfs.makeDirectory("/tmp/nested", { parents: true }), "");
assert.equal(vfs.writeFile("/tmp/nested/copy.json", vfs.readFile("/site.json")), "");
assert.ok(vfs.resolvePath("/tmp/nested/copy.json"));
assert.equal(vfs.remove("/tmp"), "rm: cannot remove /tmp: Is a directory");
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

const github = registry.get("github")!.execute({ raw: "github", args: [], vfs, state, registry, lang: "en" });
assert.equal(github.openUrl, "https://github.com/ooodnakov");

const plugins = registry.get("plugins")!.execute({ raw: "plugins", args: [], vfs, state, registry, lang: "en" });
assert.ok(plugins.lines?.some((line) => line.includes("Oh My Zsh") || line.includes("autosuggestions")));

const terminalWrites: string[] = [];
const fakeTerminal = {
  write: (value: string) => terminalWrites.push(value),
  writeln: (value: string) => terminalWrites.push(`${value}\n`),
  clear: () => terminalWrites.push("<clear>"),
  onKey: () => undefined,
  focus: () => undefined,
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
assert.equal(shell.submitCommand("plugins"), true);
assert.equal((shell as any).reverseSearch, false);

assert.ok(wasmProvider.has("jq"));
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
