import type { CommandDefinition, CommandResult } from "./types";
import { createDefinitionLookup, type TerminalCommandProvider, type TerminalCommandRequest } from "./providers";

const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[1;33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[38;5;246m${s}\x1b[0m`;

type JqModule = typeof import("jq-wasm");
let jqModule: Promise<JqModule> | null = null;

function loadJq() {
  jqModule ??= import("jq-wasm");
  return jqModule;
}

function splitFlagsAndQuery(args: string[]) {
  const flags: string[] = [];
  const rest: string[] = [];
  for (const arg of args) {
    if (!rest.length && arg.startsWith("-")) flags.push(arg);
    else rest.push(arg);
  }
  return { flags, query: rest[0], file: rest[1] };
}

const definitions: CommandDefinition[] = [
  {
    name: "wasm",
    category: "system",
    summary: "Show browser WASM toolchain status",
    usage: "wasm",
    execute: () => ({
      lines: [
        yellow("Browser WASM toolchain"),
        "jq        jq-wasm 1.8.x, lazy-loaded on first use",
        "coreutils phase-1 adapter: mkdir, cp, mv, rm run against the terminal virtual FS",
        dim("Next: mount uutils WASI coreutils behind this provider without changing the shell UI."),
      ],
    }),
  },

  {
    name: "mkdir",
    category: "filesystem",
    summary: "Create directories in the terminal virtual FS",
    usage: "mkdir <dir>",
    execute: (ctx) => {
      const parents = ctx.args.includes("-p");
      const paths = ctx.args.filter((arg) => arg !== "-p");
      if (!paths[0]) return { lines: [red("mkdir: missing operand")], exitCode: 1 };
      const errors = paths.map((path) => ctx.vfs.makeDirectory(path, { parents })).filter(Boolean);
      return { lines: errors.map(red), exitCode: errors.length ? 1 : 0 };
    },
  },
  {
    name: "cp",
    category: "filesystem",
    summary: "Copy files in the terminal virtual FS",
    usage: "cp <source> <dest>",
    execute: (ctx) => {
      const [source, dest] = ctx.args;
      if (!source || !dest) return { lines: [red("cp: usage: cp <source> <dest>")], exitCode: 1 };
      const content = ctx.vfs.readFile(source);
      if (content.startsWith("cat:")) return { lines: [red(`cp: ${source}: No such file or directory`)], exitCode: 1 };
      const err = ctx.vfs.writeFile(ctx.vfs.destinationPath(source, dest), content);
      return { lines: err ? [red(err)] : [], exitCode: err ? 1 : 0 };
    },
  },

  {
    name: "mv",
    category: "filesystem",
    summary: "Move files in the terminal virtual FS",
    usage: "mv <source> <dest>",
    execute: (ctx) => {
      const [source, dest] = ctx.args;
      if (!source || !dest) return { lines: [red("mv: usage: mv <source> <dest>")], exitCode: 1 };
      const content = ctx.vfs.readFile(source);
      if (content.startsWith("cat:")) return { lines: [red(`mv: ${source}: No such file or directory`)], exitCode: 1 };
      const writeErr = ctx.vfs.writeFile(ctx.vfs.destinationPath(source, dest), content);
      if (writeErr) return { lines: [red(writeErr)], exitCode: 1 };
      const removeErr = ctx.vfs.remove(source);
      return { lines: removeErr ? [red(removeErr)] : [], exitCode: removeErr ? 1 : 0 };
    },
  },
  {
    name: "rm",
    category: "filesystem",
    summary: "Remove files or empty virtual directories",
    usage: "rm <path>",
    execute: (ctx) => {
      const recursive = ctx.args.some((arg) => arg === "-r" || arg === "-R" || arg === "--recursive");
      const paths = ctx.args.filter((arg) => !["-r", "-R", "--recursive"].includes(arg));
      if (!paths[0]) return { lines: [red("rm: missing operand")], exitCode: 1 };
      const errors = paths.map((path) => ctx.vfs.remove(path, { recursive })).filter(Boolean);
      return { lines: errors.map(red), exitCode: errors.length ? 1 : 0 };
    },
  },
  {
    name: "jq",
    category: "text",
    summary: "Run jq JSON filters with WebAssembly",
    usage: "jq [-r|-c] <filter> <json-file>",
    examples: ["jq . /site.json", "jq -r .hero.title /site.json", "jq '.projects[].name' /site.json"],
    description: "Executes jq in the browser through jq-wasm. Input is read from the terminal virtual filesystem.",
    execute: async (ctx) => runJq({ raw: ctx.raw, parsed: { raw: ctx.raw, command: "jq", args: ctx.args, tokens: ["jq", ...ctx.args] }, vfs: ctx.vfs, state: ctx.state, registry: ctx.registry }),
  },
];

async function runJq(request: TerminalCommandRequest): Promise<CommandResult> {
  const { flags, query, file } = splitFlagsAndQuery(request.parsed.args);
  if (!query || !file) return { lines: [red("jq: usage: jq [-r|-c] <filter> <json-file>")], exitCode: 2 };

  const content = request.vfs.readFile(file);
  if (content.startsWith("cat:")) return { lines: [red(`jq: ${file}: No such file or directory`)], exitCode: 2 };

  try {
    JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    return { lines: [red(`jq: ${file}: ${message}`)], exitCode: 4 };
  }

  const jq = await loadJq();
  const result = await jq.raw(content, query, flags);
  const lines = [...result.stdout.trimEnd().split("\n").filter(Boolean), ...result.stderr.trimEnd().split("\n").filter(Boolean).map(red)];
  return { lines: lines.length ? lines : [], exitCode: result.exitCode };
}

export class WasmCommandProvider implements TerminalCommandProvider {
  readonly id = "wasm";
  readonly commands = definitions;
  private readonly lookup = createDefinitionLookup(definitions);

  has(command: string) {
    return this.lookup.has(command.toLowerCase());
  }

  execute(request: TerminalCommandRequest) {
    if (request.parsed.command === "jq") return runJq(request);
    const definition = this.lookup.get(request.parsed.command);
    if (!definition) return { lines: [red(`${request.parsed.command}: command not found`)], exitCode: 127 };
    return definition.execute({
      raw: request.raw,
      args: request.parsed.args,
      vfs: request.vfs,
      state: request.state,
      registry: request.registry,
      lang: request.vfs.lang,
    });
  }
}
