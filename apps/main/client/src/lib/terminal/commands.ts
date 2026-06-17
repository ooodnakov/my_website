import type { CommandContext, CommandDefinition, CommandRegistry } from "./types";

const green = (s: string) => `\x1b[1;32m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[1;34m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[1;33m${s}\x1b[0m`;

function text(ctx: CommandContext, path: string): string | null {
  const content = ctx.vfs.readFile(path);
  return content.startsWith("cat:") ? null : content;
}

function lines(ctx: CommandContext, path: string): string[] | string {
  const content = ctx.vfs.readFile(path);
  if (content.startsWith("cat:")) return content;
  return content.split("\n");
}

function listNamed(ctx: CommandContext, path: string): string[] {
  const stats = ctx.vfs.listStats(path);
  if (typeof stats === "string") return [red(stats)];
  return stats.map((item) => {
    const label = item.type === "dir" ? blue(`${item.name}/`) : item.executable ? green(item.name) : item.name;
    return item.url ? `${label} -> ${item.url}` : label;
  });
}

const definitions: CommandDefinition[] = [
  { name: "help", category: "session", summary: "Show available commands", usage: "help [command]", examples: ["help", "help grep"], execute: (ctx) => {
    const requested = ctx.args[0];
    if (requested) {
      const cmd = ctx.registry.get(requested);
      if (!cmd) return { lines: [red(`help: no help topics match '${requested}'`)] };
      return { lines: [yellow(cmd.name), cmd.summary, `usage: ${cmd.usage}`, ...(cmd.aliases?.length ? [`aliases: ${cmd.aliases.join(", ")}`] : []), ...(cmd.examples?.length ? ["examples:", ...cmd.examples.map((e) => `  ${e}`)] : [])] };
    }
    const byCategory = ctx.registry.all().reduce<Record<string, CommandDefinition[]>>((acc, cmd) => {
      (acc[cmd.category] ??= []).push(cmd);
      return acc;
    }, {});
    return { lines: Object.entries(byCategory).flatMap(([category, cmds]) => [yellow(category), ...cmds.map((cmd) => `  ${green(cmd.name.padEnd(10))} ${cmd.summary}`)]) };
  } },
  { name: "man", category: "session", summary: "Show detailed command manual", usage: "man <command>", examples: ["man ls"], execute: (ctx) => {
    const cmd = ctx.registry.get(ctx.args[0] ?? "");
    if (!cmd) return { lines: [red("man: missing or unknown command")] };
    return { lines: [yellow(`NAME`), `  ${cmd.name} - ${cmd.summary}`, yellow("SYNOPSIS"), `  ${cmd.usage}`, yellow("DESCRIPTION"), `  ${cmd.description ?? cmd.summary}`, ...(cmd.aliases?.length ? [yellow("ALIASES"), `  ${cmd.aliases.join(", ")}`] : []), ...(cmd.examples?.length ? [yellow("EXAMPLES"), ...cmd.examples.map((e) => `  ${e}`)] : [])] };
  } },
  { name: "clear", category: "session", summary: "Clear terminal screen", usage: "clear", execute: () => ({ clear: true }) },
  { name: "history", category: "session", summary: "Show command history", usage: "history", execute: (ctx) => ({ lines: ctx.state.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`) }) },
  { name: "pwd", category: "filesystem", summary: "Print working directory", usage: "pwd", execute: (ctx) => ({ lines: [ctx.vfs.getPwd()] }) },
  { name: "cd", category: "filesystem", summary: "Change directory", usage: "cd [dir]", examples: ["cd projects", "cd .."], execute: (ctx) => {
    const err = ctx.vfs.changeDirectory(ctx.args[0] || "/");
    return err ? { lines: [red(err)] } : {};
  } },
  { name: "ls", aliases: ["eza", "ll", "la"], category: "filesystem", summary: "List directory contents", usage: "ls [-la] [dir]", examples: ["ls", "ll projects"], execute: (ctx) => {
    const long = ctx.raw.split(/\s+/)[0] === "ll" || ctx.raw.includes("-l") || ctx.raw.includes("-a");
    const target = ctx.args.find((a) => !a.startsWith("-")) || ".";
    const stats = ctx.vfs.listStats(target);
    if (typeof stats === "string") return { lines: [red(stats)] };
    if (long) return { lines: stats.map((s) => `${s.mode} ${String(s.size).padStart(5)} ${s.mtime} ${s.type === "dir" ? blue(`${s.name}/`) : s.executable ? green(s.name) : s.name}`) };
    return { lines: [stats.map((s) => s.type === "dir" ? blue(`${s.name}/`) : s.executable ? green(s.name) : s.name).join("  ")] };
  } },
  { name: "tree", category: "filesystem", summary: "Print recursive directory tree", usage: "tree [dir]", execute: (ctx) => {
    const start = ctx.args[0] || ".";
    const walked = ctx.vfs.walk(start);
    if (typeof walked === "string") return { lines: [red(walked)] };
    const root = ctx.vfs.stat(start);
    const rootPath = root?.path ?? "/";
    return { lines: walked.map((s) => `${"  ".repeat(Math.max(0, s.path.replace(rootPath, "").split("/").filter(Boolean).length))}${s.type === "dir" ? blue(`${s.name}/`) : s.name}`) };
  } },
  { name: "find", aliases: ["fd"], category: "filesystem", summary: "Find virtual files by name", usage: "find [dir] [pattern]", examples: ["find / txt"], execute: (ctx) => {
    const dir = ctx.args[0] && !ctx.args[0].startsWith("-") ? ctx.args[0] : "/";
    const pattern = ctx.args[1] ?? "";
    const walked = ctx.vfs.walk(dir);
    if (typeof walked === "string") return { lines: [red(walked)] };
    return { lines: walked.filter((s) => s.path.includes(pattern)).map((s) => s.path) };
  } },
  { name: "cat", aliases: ["bat", "less"], category: "text", summary: "Print file contents", usage: "cat <file>", execute: (ctx) => {
    if (!ctx.args[0]) return { lines: [red("cat: missing file operand")] };
    const content = ctx.vfs.readFile(ctx.args[0]);
    return { lines: [content.startsWith("cat:") ? red(content) : content] };
  } },
  { name: "head", category: "text", summary: "Print first lines of a file", usage: "head [-n N] <file>", execute: (ctx) => {
    const nIndex = ctx.args.indexOf("-n");
    const n = nIndex >= 0 ? Number(ctx.args[nIndex + 1] ?? 10) : 10;
    const file = ctx.args.find((arg, i) => arg !== "-n" && i !== nIndex + 1 && !/^\d+$/.test(arg));
    if (!file) return { lines: [red("head: missing file operand")] };
    const out = lines(ctx, file);
    return { lines: typeof out === "string" ? [red(out)] : out.slice(0, n) };
  } },
  { name: "tail", category: "text", summary: "Print last lines of a file", usage: "tail [-n N] <file>", execute: (ctx) => {
    const nIndex = ctx.args.indexOf("-n");
    const n = nIndex >= 0 ? Number(ctx.args[nIndex + 1] ?? 10) : 10;
    const file = ctx.args.find((arg, i) => arg !== "-n" && i !== nIndex + 1 && !/^\d+$/.test(arg));
    if (!file) return { lines: [red("tail: missing file operand")] };
    const out = lines(ctx, file);
    return { lines: typeof out === "string" ? [red(out)] : out.slice(-n) };
  } },
  { name: "grep", category: "text", summary: "Search file text", usage: "grep <pattern> <file>", execute: (ctx) => {
    const [pattern, file] = ctx.args;
    if (!pattern || !file) return { lines: [red("grep: usage: grep <pattern> <file>")] };
    const out = lines(ctx, file);
    if (typeof out === "string") return { lines: [red(out)] };
    return { lines: out.filter((line) => line.toLowerCase().includes(pattern.toLowerCase())) };
  } },
  { name: "wc", category: "text", summary: "Count lines, words, and bytes", usage: "wc <file>", execute: (ctx) => {
    const file = ctx.args[0];
    if (!file) return { lines: [red("wc: missing file operand")] };
    const content = text(ctx, file);
    if (content == null) return { lines: [red(`wc: ${file}: No such file or directory`)] };
    return { lines: [`${content.split("\n").length} ${content.trim().split(/\s+/).filter(Boolean).length} ${content.length} ${file}`] };
  } },
  { name: "sort", category: "text", summary: "Sort file lines", usage: "sort <file>", execute: (ctx) => {
    const out = lines(ctx, ctx.args[0] ?? "");
    return { lines: typeof out === "string" ? [red(out)] : [...out].sort() };
  } },
  { name: "uniq", category: "text", summary: "Remove repeated adjacent lines", usage: "uniq <file>", execute: (ctx) => {
    const out = lines(ctx, ctx.args[0] ?? "");
    if (typeof out === "string") return { lines: [red(out)] };
    return { lines: out.filter((line, i) => i === 0 || line !== out[i - 1]) };
  } },
  { name: "echo", category: "text", summary: "Print text", usage: "echo [text]", execute: (ctx) => ({ lines: [ctx.args.join(" ")] }) },
  { name: "date", category: "system", summary: "Print current date", usage: "date", execute: () => ({ lines: [new Date().toString()] }) },
  { name: "whoami", category: "system", summary: "Print current user", usage: "whoami", execute: (ctx) => ({ lines: [ctx.state.user] }) },
  { name: "hostname", category: "system", summary: "Print host name", usage: "hostname", execute: (ctx) => ({ lines: [ctx.state.host] }) },
  { name: "sudo", category: "system", summary: "Deny superuser access", usage: "sudo <command>", execute: () => ({ lines: [red("user is not in the sudoers file. This incident will be reported.")] }) },
  { name: "open", category: "portfolio", summary: "Open a URL-backed virtual file", usage: "open <path|name>", examples: ["open cv.txt", "open gh.txt"], execute: (ctx) => {
    const target = ctx.args[0];
    if (!target) return { lines: [red("open: missing target")] };
    const url = ctx.vfs.findUrl(target);
    if (!url) return { lines: [red(`open: ${target}: no URL associated with target`)] };
    return { lines: [`Opening ${url}`], openUrl: url };
  } },
  { name: "about", category: "portfolio", summary: "Show README/about content", usage: "about", execute: (ctx) => ({ lines: [ctx.vfs.readFile("/README.md")] }) },
  { name: "cv", category: "portfolio", summary: "Show CV summary", usage: "cv", execute: (ctx) => ({ lines: [ctx.vfs.readFile("/cv.txt")] }) },
  { name: "projects", category: "portfolio", summary: "List projects", usage: "projects", execute: (ctx) => ({ lines: listNamed(ctx, "/projects") }) },
  { name: "socials", category: "portfolio", summary: "List social profiles", usage: "socials", execute: (ctx) => ({ lines: listNamed(ctx, "/socials") }) },
  { name: "links", category: "portfolio", summary: "List quick links", usage: "links", execute: (ctx) => ({ lines: listNamed(ctx, "/quicklinks") }) },
  { name: "archive", category: "portfolio", summary: "List archive entries", usage: "archive", execute: (ctx) => ({ lines: listNamed(ctx, "/archive") }) },
];

export function createCommandRegistry(): CommandRegistry {
  const lookup = new Map<string, CommandDefinition>();
  for (const def of definitions) {
    lookup.set(def.name, def);
    def.aliases?.forEach((alias) => lookup.set(alias, def));
  }
  return {
    all: () => definitions,
    get: (name: string) => lookup.get(name.toLowerCase()),
    names: () => Array.from(lookup.keys()),
  };
}
