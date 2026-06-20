import type { ParsedCommand, CommandContext, CommandDefinition, CommandRegistry, CommandResult } from "./types";
import type { VirtualFileSystem } from "../vfs";

export interface TerminalCommandRequest {
  raw: string;
  parsed: ParsedCommand;
  vfs: VirtualFileSystem;
  state: CommandContext["state"];
  registry: CommandRegistry;
}

export interface TerminalCommandProvider {
  readonly id: string;
  readonly commands: CommandDefinition[];
  has(command: string): boolean;
  execute(request: TerminalCommandRequest): CommandResult | Promise<CommandResult>;
}

export function createDefinitionLookup(definitions: CommandDefinition[]) {
  const lookup = new Map<string, CommandDefinition>();
  for (const definition of definitions) {
    lookup.set(definition.name, definition);
    definition.aliases?.forEach((alias) => lookup.set(alias, definition));
  }
  return lookup;
}

export class BuiltinCommandProvider implements TerminalCommandProvider {
  readonly id = "builtin";
  readonly commands: CommandDefinition[];
  private readonly lookup: Map<string, CommandDefinition>;

  constructor(commands: CommandDefinition[]) {
    this.commands = commands;
    this.lookup = createDefinitionLookup(commands);
  }

  has(command: string) {
    return this.lookup.has(command.toLowerCase());
  }

  execute(request: TerminalCommandRequest) {
    const definition = this.lookup.get(request.parsed.command);
    if (!definition) return { lines: [`\x1b[31m${request.parsed.command}: command not found\x1b[0m`], exitCode: 127 };
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
