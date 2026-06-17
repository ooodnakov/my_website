import type { CommandRegistry } from "./types";
import type { VirtualFileSystem } from "../vfs";
import { parseCommand } from "./parser";

export interface CompletionResult {
  replacement?: string;
  candidates: string[];
}

function lastToken(input: string): string {
  const match = input.match(/(?:^|\s)(\S*)$/);
  return match ? match[1] : "";
}

function commonPrefix(values: string[]): string {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    while (!value.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

export function completeInput(input: string, registry: CommandRegistry, vfs: VirtualFileSystem): CompletionResult {
  let parsed;
  try {
    parsed = parseCommand(input);
  } catch {
    return { candidates: [] };
  }

  const token = lastToken(input);
  const tokenStart = input.length - token.length;
  const completingCommand = parsed.tokens.length <= 1 && !input.endsWith(" ");

  if (completingCommand) {
    const candidates = registry.names().filter((name) => name.startsWith(token)).sort();
    const prefix = commonPrefix(candidates);
    return { replacement: prefix && prefix !== token ? input.slice(0, tokenStart) + prefix : undefined, candidates };
  }

  const candidates = vfs.completePath(token).sort();
  const prefix = commonPrefix(candidates);
  return { replacement: prefix && prefix !== token ? input.slice(0, tokenStart) + prefix : undefined, candidates };
}
