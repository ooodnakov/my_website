import assert from "node:assert/strict";

import { VirtualFileSystem } from "../../vfs";
import { completeInput } from "../completion";
import { createCommandRegistry } from "../commands";
import { parseCommand } from "../parser";
import { isSafeTerminalLink } from "../links";
import { Shell } from "../../shell";
import { WasmCommandProvider } from "../wasmCommands";
import { LegacyTerminalSession } from "../legacySession";
import { bindTerminalInput } from "../input";
import { CLEAR_TERMINAL_OUTPUT, type TerminalOutput, type TerminalSessionInput, type VisitorCommand } from "../session";
import type { ShellState } from "../types";

const registry = createCommandRegistry();
const vfs = new VirtualFileSystem("en");
const state: ShellState = { history: [], user: "user", host: "main", branch: "main", shell: "zsh", theme: "powerlevel10k" };

const linkBase = "https://example.com/en";
for (const uri of ["/cv/en", "../cv/ru", "./cv", "#contact", "//example.com/cv/en", "https://external.example/project", "http://external.example", "mailto:user@example.com"]) {
  assert.equal(isSafeTerminalLink(uri, linkBase), true, uri);
}
for (const uri of ["", "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,test", "file:///etc/passwd", "ftp://example.com", "//external.example/cv", "\\\\external.example/cv", " https://example.com", "java\nscript:alert(1)", "https://[invalid"]) {
  assert.equal(isSafeTerminalLink(uri, linkBase), false, uri);
}

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
assert.equal(registry.get("a")?.name, "a");
assert.ok(registry.names().includes("a"));
const listingVfs = new VirtualFileSystem("en");
const fixtureDir = listingVfs.resolvePath("/")!;
fixtureDir.children![".hidden"] = { type: "file", name: ".hidden", content: "secret", parent: fixtureDir };
fixtureDir.children!["-draft"] = { type: "file", name: "-draft", content: "draft", parent: fixtureDir };
fixtureDir.children!["same.txt"] = { type: "file", name: "same.txt", content: "same", parent: fixtureDir, owner: "alex", group: "alex", gitStatus: "modified" };
fixtureDir.children!["different.txt"] = { type: "file", name: "different.txt", content: "different", parent: fixtureDir, owner: "alex", group: "writers", gitStatus: "added", url: "https://example.com/file" };
fixtureDir.children!["with space.txt"] = { type: "file", name: "with space.txt", content: "space", parent: fixtureDir };
fixtureDir.children!["large.bin"] = { type: "file", name: "large.bin", size: 2 * 1024 * 1024, mtime: "17 Jun 2020", parent: fixtureDir };
listingVfs.makeDirectory("/empty");
fixtureDir.children!["conflicted.txt"] = { type: "file", name: "conflicted.txt", content: "conflict", parent: fixtureDir, owner: "alex", group: "editors", gitStatus: "conflicted" };
const runListing = (line: string, fs = listingVfs) => {
  const parsed = parseCommand(line);
  return registry.get(parsed.command)!.execute({ raw: line, args: parsed.args, vfs: fs, state, registry, lang: "en" });
};
const defaultListing = runListing("a");
const expandedListing = runListing("eza -lah --git --color-scale all -g --smart-group --icons always --hyperlink auto");
assert.deepEqual(defaultListing.lines, expandedListing.lines);
const stripTerminalControls = (value: string) => value
  .replace(/\x1b\]8;;.*?(?:\x07|\x1b\\)/g, "")
  .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
const visibleNameCount = (listing: { lines?: string[] }, name: string) =>
  (listing.lines ?? []).filter((line) => stripTerminalControls(line).includes(name)).length;
assert.equal(visibleNameCount(defaultListing, ".hidden"), 1);
assert.equal(visibleNameCount(runListing("a -a"), ".hidden"), 1);
assert.equal(visibleNameCount(runListing("a -aa"), ".hidden"), 1);
assert.equal(visibleNameCount(runListing("a -a -a"), ".hidden"), 1);
assert.equal(visibleNameCount(runListing("eza -lah --git --color-scale all -g --smart-group --icons always --hyperlink auto -a -a"), ".hidden"), 1);
const noIconListing = runListing("a --no-icons --no-hyperlink");
const headerNameOffset = stripTerminalControls(noIconListing.lines?.find((line) => stripTerminalControls(line).includes("Permissions")) ?? "").indexOf("Name");
for (const name of ["same.txt", "different.txt", "conflicted.txt", ".hidden", "README.md"]) {
  assert.equal(stripTerminalControls(noIconListing.lines?.find((line) => stripTerminalControls(line).includes(name)) ?? "").indexOf(name), headerNameOffset);
}
const multipleListing = runListing("a /projects /quicklinks");
assert.ok(multipleListing.lines?.includes("/projects:"));
assert.ok(multipleListing.lines?.includes("/quicklinks:"));
assert.ok(multipleListing.lines?.some((line) => line.includes("lemma.txt")));
assert.ok(multipleListing.lines?.some((line) => line.includes("cv.txt")));
const mixedListing = runListing("a /projects /definitely-missing");
assert.equal(mixedListing.exitCode, 2);
assert.ok(mixedListing.lines?.some((line) => line.includes("definitely-missing") && line.includes("No such file")));
const endOfOptionsListing = runListing("a -- -draft /projects");
assert.ok(endOfOptionsListing.lines?.includes("-draft:"));
assert.ok(endOfOptionsListing.lines?.includes("/projects:"));
assert.ok(endOfOptionsListing.lines?.some((line) => line.includes("lemma.txt")));
for (const invalidMode of [
  "a --icons definitely-invalid",
  "a --icons=",
  "a --icons",
  "a --icons --no-git",
  "a --icons=invalid",
  "a --hyperlink sometimes",
  "a --hyperlink=",
  "a --hyperlink",
  "a --hyperlink=invalid",
  "a --color-scale definitely-invalid",
  "a --color-scale=",
  "a --color-scale",
  "a --color-scale --no-git",
  "a --color-scale=invalid",
]) {
  assert.equal(runListing(invalidMode).exitCode, 2, invalidMode);
}
assert.equal(runListing("a --icons auto --hyperlink automatic --color-scale size,age /projects").exitCode, undefined);
assert.equal(runListing("a --icons=always --hyperlink=auto --color-scale=all").exitCode, undefined);
assert.deepEqual(
  runListing("a /projects").lines,
  runListing("eza -lah --git --color-scale all -g --smart-group --icons always --hyperlink auto /projects").lines,
);
assert.ok(defaultListing.lines?.some((line) => line.includes("2097152")));
const headerOnlyListing = runListing("eza -h /projects");
assert.equal(headerOnlyListing.lines?.[0].replace(/\x1b\[[0-9;]*m/g, ""), "Name");
assert.ok(!headerOnlyListing.lines?.some((line) => /\b\d+(?:\.\d+)?[KMG]\b/.test(line)));
assert.ok(completeInput("a", registry, listingVfs).candidates.includes("a"));
assert.ok(defaultListing.lines?.some((line) => line.includes("Permissions") && line.includes("Owner") && line.includes("Group") && line.includes("Git")));
assert.ok(defaultListing.lines?.some((line) => line.includes(".hidden")));
assert.ok(!defaultListing.lines?.some((line) => line.includes("  .  ") || line.includes("  ..  ")));
assert.ok(defaultListing.lines?.some((line) => line.includes("modified") && line.includes("alex")));
assert.ok(defaultListing.lines?.some((line) => line.includes("writers") && line.includes("added")));
assert.ok(defaultListing.lines?.some((line) => line.includes("\x1b[") && line.includes("\x1b]8;;https://example.com/file")));
const sameGroupLine = defaultListing.lines?.find((line) => line.includes("same.txt")) ?? "";
const differentGroupLine = defaultListing.lines?.find((line) => line.includes("different.txt")) ?? "";
assert.ok(!sameGroupLine.includes("\x1b]8;;"));
assert.ok(defaultListing.lines?.some((line) => line.includes("\x1b[1;31m")));
assert.ok(defaultListing.lines?.some((line) => line.includes("\x1b[1;33m")));
assert.ok(runListing("a -a").lines?.some((line) => line.includes(".hidden")));
assert.ok(runListing('a "with space.txt"').lines?.some((line) => line.includes("with space.txt")));
assert.ok(runListing("a --icons always --hyperlink auto /projects").lines?.some((line) => line.includes("lemma.txt")));
assert.ok(!defaultListing.lines?.some((line) => line.includes("untracked") || line.includes("https://") && !line.includes("example.com")));
const noLinkListing = runListing("a --no-icons --no-hyperlink --no-git");
assert.ok(noLinkListing.lines?.every((line) => !line.includes("\x1b]8;;") && !line.includes("") && !line.includes("modified")));
assert.ok(noLinkListing.lines?.some((line) => line.includes("same.txt")));
assert.match(sameGroupLine, /alex\s+\s+modified/);
assert.ok(differentGroupLine.includes("writers"));
assert.ok(defaultListing.lines?.some((line) => line.includes("  -   ")));
const pathListing = runListing('a "projects"');
assert.ok(pathListing.lines?.some((line) => line.includes("lemma.txt")));
assert.ok(runListing("a /projects").lines?.some((line) => line.includes("lemma.txt")));
assert.ok(runListing("a -- -draft").lines?.some((line) => line.includes("-draft")));
assert.ok(runListing("a missing-path").lines?.[0].includes("No such file"));
const emptyListing = runListing("a /empty");
assert.equal(emptyListing.lines?.length, 1);
assert.match(emptyListing.lines?.[0] ?? "", /Permissions/);
assert.ok(runListing("a /projects/lemma.txt").lines?.some((line) => line.includes("lemma.txt")));
assert.ok(runListing("a --icons=never --hyperlink=never").lines?.every((line) => !line.includes("\x1b]8;;") && !line.includes("")));
assert.ok(runListing("a --icons always --hyperlink auto").lines?.some((line) => line.includes("\x1b]8;;")));
assert.ok(runListing("a --no-git").lines?.every((line) => !line.includes("modified")));
const aHelp = registry.get("help")!.execute({ raw: "help a", args: ["a"], vfs: listingVfs, state, registry, lang: "en" });
const aManual = registry.get("man")!.execute({ raw: "man a", args: ["a"], vfs: listingVfs, state, registry, lang: "en" });
assert.ok(aHelp.lines?.some((line) => line.includes("full eza long-listing preset")));
assert.ok(aManual.lines?.some((line) => line.includes("color-scale all")));
assert.ok(completeInput("a /pro", registry, listingVfs).candidates.length > 0);
assert.equal(registry.get("ll"), registry.get("eza"));
assert.equal(registry.get("la"), registry.get("eza"));
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

let sessionTerminalFocuses = 0;
let keyListenerRegistrations = 0;
let keyListenerDisposals = 0;
const sessionTerminal = {
  write: (_value: string) => undefined,
  writeln: (_value: string) => undefined,
  clear: () => undefined,
  onKey: () => {
    keyListenerRegistrations += 1;
    return { dispose: () => { keyListenerDisposals += 1; } };
  },
  focus: () => { sessionTerminalFocuses += 1; },
};
const session = new LegacyTerminalSession({ terminal: sessionTerminal as never, language: "en" });
const sessionStates: string[] = [];
const streamedOutput: TerminalOutput[] = [];
let commandIsBusy = false;
const commandReady = Promise.withResolvers<void>();
let expectClearCommand = false;
let clearIsBusy = false;
const clearReady = Promise.withResolvers<void>();
session.subscribeState(({ status }) => {
  sessionStates.push(status);
  if (status === "busy") {
    commandIsBusy = true;
    if (expectClearCommand) clearIsBusy = true;
  }
  if (status === "ready" && commandIsBusy) commandReady.resolve();
  if (status === "ready" && clearIsBusy) clearReady.resolve();
});
session.subscribeOutput((output) => streamedOutput.push(output));
assert.equal(session.input.owner, "legacy-shell-key-events");
assert.equal(session.getState().status, "idle");
await session.start();
await session.start();
assert.equal(session.getState().status, "ready");
assert.equal(keyListenerRegistrations, 1);
assert.ok(streamedOutput.some((output) => typeof output === "string" && output.includes("Welcome")));
assert.equal(session.runVisitorCommand("projects"), true);
assert.equal(sessionTerminalFocuses, 1);
assert.equal(session.getState().status, "busy");
for (const malformed of ["not-allowed", "toString", "constructor", "__proto__", null, undefined, 42, {}, []]) {
  assert.equal(session.runVisitorCommand(malformed as VisitorCommand), false, String(malformed));
}
await commandReady.promise;
assert.ok(streamedOutput.some((output) => typeof output === "string" && output.includes("lemma.txt")));
expectClearCommand = true;
assert.equal(session.runVisitorCommand("clear", { focus: false }), true);
assert.equal(sessionTerminalFocuses, 1);
await clearReady.promise;
assert.ok(streamedOutput.includes(CLEAR_TERMINAL_OUTPUT));
session.dispose();
session.dispose();
assert.equal(session.getState().status, "disposed");
assert.equal(keyListenerDisposals, 1);
assert.equal(session.runVisitorCommand("projects"), false);
assert.deepEqual(sessionStates, ["ready", "busy", "ready", "busy", "ready", "disposed"]);
let reentrantListenerRegistrations = 0;
let reentrantListenerDisposals = 0;
let reentrantOptionOutputs = 0;
let reentrantSubscriberOutputs = 0;
const reentrantTerminal = {
  write: (_value: string) => undefined,
  writeln: (_value: string) => undefined,
  clear: () => undefined,
  onKey: () => {
    reentrantListenerRegistrations += 1;
    return { dispose: () => { reentrantListenerDisposals += 1; } };
  },
  focus: () => undefined,
};
let reentrantSession!: LegacyTerminalSession;
reentrantSession = new LegacyTerminalSession({
  terminal: reentrantTerminal as never,
  language: "en",
  onOutput: () => { reentrantOptionOutputs += 1; },
});
reentrantSession.subscribeOutput(() => {
  reentrantSubscriberOutputs += 1;
  reentrantSession.dispose();
});
await reentrantSession.start();
assert.equal(reentrantSession.getState().status, "disposed");
assert.equal(reentrantListenerRegistrations, 1);
assert.equal(reentrantListenerDisposals, 1);
assert.equal(reentrantOptionOutputs, 1);
assert.equal(reentrantSubscriberOutputs, 1);

let failedListenerRegistrations = 0;
const failingSession = new LegacyTerminalSession({
  terminal: {
    ...reentrantTerminal,
    onKey: () => {
      failedListenerRegistrations += 1;
      throw new Error("injected listener attachment failure");
    },
  } as never,
  language: "en",
});
await assert.rejects(failingSession.start(), /injected listener attachment failure/);
assert.equal(failingSession.getState().status, "failed");
assert.match(failingSession.getState().error?.message ?? "", /injected listener attachment failure/);
assert.equal(failingSession.runVisitorCommand("tour"), false);
assert.equal(failedListenerRegistrations, 1);
failingSession.dispose();

const clipboardWrite = Promise.withResolvers<void>();
const clipboardDone = Promise.withResolvers<void>();
const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
let clipboardWriteStarted = false;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { clipboard: { writeText: () => {
    clipboardWriteStarted = true;
    return clipboardWrite.promise.then(clipboardDone.resolve);
  } } },
});
let pendingSessionOutputs = 0;
const pendingSession = new LegacyTerminalSession({
  terminal: sessionTerminal as never,
  language: "en",
  onOutput: () => { pendingSessionOutputs += 1; },
});
await pendingSession.start();
assert.equal(pendingSession.runVisitorCommand("copy-contact"), true);
assert.equal(pendingSession.getState().status, "busy");
assert.equal(clipboardWriteStarted, true);
const acceptedCommandOutputCount = pendingSessionOutputs;
pendingSession.dispose();
clipboardWrite.resolve();
await clipboardDone.promise;
await Promise.resolve();
await Promise.resolve();
assert.equal(pendingSession.getState().status, "disposed");
assert.equal(pendingSessionOutputs, acceptedCommandOutputCount);
if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
else Reflect.deleteProperty(globalThis, "navigator");

const textListeners = new Set<(text: string) => void>();
const binaryListeners = new Set<(binary: string) => void>();
let inputListenerDisposals = 0;
const streamingTerminal = {
  onData: (listener: (text: string) => void) => {
    textListeners.add(listener);
    return { dispose: () => { textListeners.delete(listener); inputListenerDisposals += 1; } };
  },
  onBinary: (listener: (binary: string) => void) => {
    binaryListeners.add(listener);
    return { dispose: () => { binaryListeners.delete(listener); inputListenerDisposals += 1; } };
  },
};
const sentInput: Uint8Array[] = [];
const streamingInput: TerminalSessionInput = {
  owner: "session-byte-stream",
  sendBytes: (bytes) => sentInput.push(bytes),
};
assert.equal(bindTerminalInput(streamingTerminal as never, { owner: "legacy-shell-key-events" }), null);
assert.equal(textListeners.size + binaryListeners.size, 0);
const inputBinding = bindTerminalInput(streamingTerminal as never, streamingInput);
assert.ok(inputBinding);
assert.equal(textListeners.size, 1);
assert.equal(binaryListeners.size, 1);
textListeners.forEach((listener) => listener("я"));
binaryListeners.forEach((listener) => listener("\x03\xff"));
assert.deepEqual(Array.from(sentInput[0]), Array.from(new TextEncoder().encode("я")));
assert.deepEqual(Array.from(sentInput[1]), [3, 255]);
inputBinding.dispose();
inputBinding.dispose();
assert.equal(textListeners.size + binaryListeners.size, 0);
assert.equal(inputListenerDisposals, 2);
console.log("terminal tests passed");
