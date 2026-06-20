import type { VirtualFileSystem } from "../vfs";
import type { Language } from "../../data/home";

export interface ParsedCommand {
  raw: string;
  command: string;
  args: string[];
  tokens: string[];
}

export interface CommandResult {
  lines?: string[];
  clear?: boolean;
  prompt?: boolean;
  openUrl?: string;
  exitCode?: number;
}

export interface CommandRuntime {
  id: string;
  label: string;
}

export interface ShellState {
  history: string[];
  user: string;
  host: string;
  branch: string;
  shell: "zsh";
  theme: "powerlevel10k";
}

export interface CommandContext {
  raw: string;
  args: string[];
  vfs: VirtualFileSystem;
  state: ShellState;
  registry: CommandRegistry;
  lang: Language;
}

export interface CommandDefinition {
  name: string;
  aliases?: string[];
  category: "filesystem" | "text" | "session" | "portfolio" | "system";
  summary: string;
  usage: string;
  examples?: string[];
  description?: string;
  execute: (context: CommandContext) => CommandResult | Promise<CommandResult>;
}

export interface CommandRegistry {
  all: () => CommandDefinition[];
  get: (name: string) => CommandDefinition | undefined;
  names: () => string[];
}
