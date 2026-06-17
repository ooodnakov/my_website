import { Terminal } from "@xterm/xterm";
import { VirtualFileSystem } from "./vfs";
import { parseCommand } from "./terminal/parser";
import { completeInput } from "./terminal/completion";
import { createCommandRegistry } from "./terminal/commands";
import type { CommandRegistry, ShellState } from "./terminal/types";

export class Shell {
  private term: Terminal;
  private vfs: VirtualFileSystem;
  private registry: CommandRegistry;
  private currentInput = "";
  private cursor = 0;
  private historyIndex = -1;
  private isProcessing = false;
  private state: ShellState = { history: [], user: "user", host: "main", branch: "main" };

  constructor(term: Terminal, vfs: VirtualFileSystem) {
    this.term = term;
    this.vfs = vfs;
    this.registry = createCommandRegistry();

    this.term.writeln("\x1b[1;32mWelcome to the interactive terminal hub.\x1b[0m");
    this.term.writeln("\x1b[38;5;246mType 'help' to see available commands. Use Tab for completion.\x1b[0m\n");
    this.prompt();
    this.setupEventHandlers();
  }

  public updateVfs(vfs: VirtualFileSystem) {
    this.vfs = vfs;
    if (!this.isProcessing) this.redrawInput();
  }

  private promptText() {
    const userHost = `\x1b[1;36m${this.state.user}@${this.state.host}\x1b[0m`;
    const path = `\x1b[1;34m${this.vfs.getPwd()}\x1b[0m`;
    const git = `\x1b[1;32m${this.state.branch}\x1b[0m`;
    const symbol = `\x1b[1;32m❯\x1b[0m`;
    return `${userHost}:${path} git:(${git}) ${symbol} `;
  }

  private prompt() {
    this.term.write(this.promptText());
  }

  private redrawInput() {
    this.term.write("\r\x1b[K");
    this.prompt();
    this.term.write(this.currentInput);
    const back = this.currentInput.length - this.cursor;
    if (back > 0) this.term.write(`\x1b[${back}D`);
  }

  private setInput(value: string, cursor = value.length) {
    this.currentInput = value;
    this.cursor = Math.max(0, Math.min(cursor, value.length));
    this.redrawInput();
  }

  private insertText(value: string) {
    this.currentInput = this.currentInput.slice(0, this.cursor) + value + this.currentInput.slice(this.cursor);
    this.cursor += value.length;
    this.redrawInput();
  }

  private addHistory(input: string) {
    if (!input || this.state.history[this.state.history.length - 1] === input) return;
    this.state.history.push(input);
    if (this.state.history.length > 100) this.state.history.shift();
  }

  private setupEventHandlers() {
    this.term.onKey(({ key, domEvent }) => {
      if (this.isProcessing) return;
      const printable = !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey && domEvent.key.length === 1;

      if (domEvent.ctrlKey) {
        const ctrl = domEvent.key.toLowerCase();
        if (ctrl === "c") {
          this.term.write("^C\r\n");
          this.currentInput = "";
          this.cursor = 0;
          this.prompt();
          return;
        }
        if (ctrl === "a") return this.setInput(this.currentInput, 0);
        if (ctrl === "e") return this.setInput(this.currentInput, this.currentInput.length);
        if (ctrl === "u") return this.setInput(this.currentInput.slice(this.cursor), 0);
        if (ctrl === "k") return this.setInput(this.currentInput.slice(0, this.cursor), this.cursor);
        if (ctrl === "l") {
          this.term.clear();
          return this.redrawInput();
        }
      }

      if (domEvent.key === "Enter") {
        this.term.write("\r\n");
        const submitted = this.currentInput.trim();
        this.currentInput = "";
        this.cursor = 0;
        this.runCommand(submitted);
        return;
      }
      if (domEvent.key === "Backspace") {
        if (this.cursor > 0) {
          this.currentInput = this.currentInput.slice(0, this.cursor - 1) + this.currentInput.slice(this.cursor);
          this.cursor--;
          this.redrawInput();
        }
        return;
      }
      if (domEvent.key === "Delete") {
        if (this.cursor < this.currentInput.length) {
          this.currentInput = this.currentInput.slice(0, this.cursor) + this.currentInput.slice(this.cursor + 1);
          this.redrawInput();
        }
        return;
      }
      if (domEvent.key === "ArrowLeft") return this.setInput(this.currentInput, this.cursor - 1);
      if (domEvent.key === "ArrowRight") return this.setInput(this.currentInput, this.cursor + 1);
      if (domEvent.key === "Home") return this.setInput(this.currentInput, 0);
      if (domEvent.key === "End") return this.setInput(this.currentInput, this.currentInput.length);
      if (domEvent.key === "ArrowUp") {
        if (this.historyIndex > 0) this.historyIndex--;
        else if (this.historyIndex === -1 && this.state.history.length) this.historyIndex = this.state.history.length - 1;
        if (this.historyIndex >= 0) this.setInput(this.state.history[this.historyIndex]);
        return;
      }
      if (domEvent.key === "ArrowDown") {
        if (this.historyIndex >= 0 && this.historyIndex < this.state.history.length - 1) {
          this.historyIndex++;
          this.setInput(this.state.history[this.historyIndex]);
        } else {
          this.historyIndex = -1;
          this.setInput("");
        }
        return;
      }
      if (domEvent.key === "Tab") {
        domEvent.preventDefault();
        const result = completeInput(this.currentInput, this.registry, this.vfs);
        if (result.replacement) this.setInput(result.replacement);
        else if (result.candidates.length) {
          this.term.write("\r\n" + result.candidates.join("  ") + "\r\n");
          this.redrawInput();
        }
        return;
      }
      if (printable) this.insertText(key);
    });
  }

  private runCommand(input: string) {
    if (!input) {
      this.prompt();
      return;
    }

    let commandLine = input;
    if (commandLine === "!!") {
      commandLine = this.state.history[this.state.history.length - 1];
      if (!commandLine) {
        this.term.writeln("\x1b[31m!!: event not found\x1b[0m");
        this.prompt();
        return;
      }
      this.term.writeln(commandLine);
    }

    this.addHistory(commandLine);
    this.historyIndex = -1;
    this.isProcessing = true;

    try {
      const parsed = parseCommand(commandLine);
      if (!parsed.command) return;
      const definition = this.registry.get(parsed.command);
      if (!definition) {
        this.term.writeln(`\x1b[31m${parsed.command}: command not found\x1b[0m`);
        return;
      }
      const result = definition.execute({ raw: commandLine, args: parsed.args, vfs: this.vfs, state: this.state, registry: this.registry });
      if (result.clear) this.term.clear();
      result.lines?.forEach((line) => this.term.writeln(line.replace(/\n/g, "\r\n")));
      if (result.openUrl) window.open(result.openUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      this.term.writeln(`\x1b[31mError: ${message}\x1b[0m`);
    } finally {
      this.isProcessing = false;
      this.prompt();
    }
  }
}
