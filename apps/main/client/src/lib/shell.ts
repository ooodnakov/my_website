import { Terminal } from "@xterm/xterm";
import { VirtualFileSystem } from "./vfs";
import { parseCommand } from "./terminal/parser";
import { completeInput } from "./terminal/completion";
import { builtinCommandDefinitions, createCommandRegistry } from "./terminal/commands";
import { BuiltinCommandProvider, type TerminalCommandProvider } from "./terminal/providers";
import { WasmCommandProvider } from "./terminal/wasmCommands";
import type { CommandRegistry, CommandResult, ShellState } from "./terminal/types";

export class Shell {
  private term: Terminal;
  private vfs: VirtualFileSystem;
  private registry: CommandRegistry;
  private providers: TerminalCommandProvider[];
  private currentInput = "";
  private cursor = 0;
  private historyIndex = -1;
  private reverseSearch = false;
  private reverseSearchQuery = "";
  private reverseSearchInitialInput = "";
  private isProcessing = false;
  private state: ShellState = { history: [], user: "user", host: "main", branch: "main", shell: "zsh", theme: "powerlevel10k" };

  constructor(term: Terminal, vfs: VirtualFileSystem) {
    this.term = term;
    this.vfs = vfs;
    this.providers = [new BuiltinCommandProvider(builtinCommandDefinitions), new WasmCommandProvider()];
    this.registry = createCommandRegistry(this.providers.flatMap((provider) => provider.commands).filter((definition) => !builtinCommandDefinitions.includes(definition)));
    this.state.history = this.loadHistory();

    this.writeWelcome();
    this.prompt();
    this.setupEventHandlers();
  }

  public updateVfs(vfs: VirtualFileSystem) {
    this.vfs = vfs;
    if (!this.isProcessing) this.redrawInput();
  }

  private writeWelcome() {
    const isRu = this.vfs.lang === "ru";
    const lines = isRu
      ? [
          "\x1b[1;32mДобро пожаловать в интерактивный zsh terminal hub.\x1b[0m",
          "\x1b[38;5;246mOh My Zsh: git, autosuggest, syntax highlighting, history-substring-search, fzf, zoxide, eza.\x1b[0m",
          "\x1b[38;5;246mБыстрый старт: tour, links, cv, projects, contact. Tab — автодополнение. Ctrl+R — поиск по истории.\x1b[0m",
          "\x1b[38;5;246mПодсказка: open cv.txt откроет интерактивное CV.\x1b[0m",
        ]
      : [
          "\x1b[1;32mWelcome to the interactive zsh terminal hub.\x1b[0m",
          "\x1b[38;5;246mOh My Zsh: git, autosuggest, syntax highlighting, history-substring-search, fzf, zoxide, eza.\x1b[0m",
          "\x1b[38;5;246mQuick start: tour, links, cv, projects, contact. Tab completes. Ctrl+R searches history.\x1b[0m",
          "\x1b[38;5;246mTip: open cv.txt opens the interactive CV.\x1b[0m",
        ];
    lines.forEach((line) => this.term.writeln(line));
    this.term.writeln("");
  }

  private loadHistory(): string[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("terminal.history");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(-100) : [];
    } catch {
      return [];
    }
  }

  private saveHistory() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("terminal.history", JSON.stringify(this.state.history.slice(-100)));
    } catch {
      // Ignore storage quota/security failures; terminal history is an enhancement.
    }
  }

  private promptText() {
    const shell = `\x1b[38;5;220m${this.state.shell}\x1b[0m`;
    const userHost = `\x1b[1;36m${this.state.user}@${this.state.host}\x1b[0m`;
    const path = `\x1b[1;34m${this.vfs.getPwd()}\x1b[0m`;
    const git = `\x1b[1;32m ${this.state.branch}\x1b[0m`;
    const plugins = `\x1b[38;5;246m[omz:p10k]\x1b[0m`;
    const symbol = `\x1b[1;32m❯\x1b[0m`;
    return `${shell} ${userHost} ${path} ${git} ${plugins} ${symbol} `;
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
    this.saveHistory();
  }

  public submitCommand(input: string): boolean {
    if (this.isProcessing) return false;
    if (this.reverseSearch) {
      this.finishReverseSearch(false);
    }
    const submitted = input.trim();
    this.setInput(submitted);
    this.term.write("\r\n");
    this.currentInput = "";
    this.cursor = 0;
    this.runCommand(submitted);
    this.term.focus();
    return true;
  }

  private setupEventHandlers() {
    this.term.onKey(({ key, domEvent }) => {
      if (this.isProcessing) return;
      const printable = !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey && domEvent.key.length === 1;

      if (this.reverseSearch) return this.handleReverseSearchKey(key, domEvent);

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
        if (ctrl === "r") return this.startReverseSearch();
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

  private startReverseSearch() {
    if (!this.state.history.length) return;
    this.reverseSearch = true;
    this.reverseSearchQuery = "";
    this.reverseSearchInitialInput = this.currentInput;
    this.term.write("\r\x1b[K(reverse-i-search) `': ");
  }

  private finishReverseSearch(restoreInitialInput = false) {
    this.reverseSearch = false;
    this.reverseSearchQuery = "";
    if (restoreInitialInput) this.currentInput = this.reverseSearchInitialInput;
    this.cursor = this.currentInput.length;
  }

  private renderReverseSearch(match: string) {
    this.term.write(`\r\x1b[K(reverse-i-search) \`${this.reverseSearchQuery}': ${match}`);
  }

  private handleReverseSearchKey(key: string, domEvent: KeyboardEvent) {
    if (domEvent.key === "Escape") {
      this.finishReverseSearch(true);
      this.redrawInput();
      return;
    }

    if (domEvent.ctrlKey && domEvent.key.toLowerCase() === "c") {
      this.finishReverseSearch();
      this.currentInput = "";
      this.cursor = 0;
      this.term.write("^C\r\n");
      this.prompt();
      return;
    }

    if (domEvent.key === "Enter") {
      const submitted = this.currentInput.trim();
      this.finishReverseSearch();
      this.term.write("\r\n");
      this.currentInput = "";
      this.cursor = 0;
      this.runCommand(submitted);
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(domEvent.key)) {
      this.finishReverseSearch();
      this.redrawInput();
      return;
    }

    if (domEvent.key === "Backspace") this.reverseSearchQuery = this.reverseSearchQuery.slice(0, -1);
    else if (!domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey && domEvent.key.length === 1) this.reverseSearchQuery += key;
    else return;

    const match = [...this.state.history].reverse().find((item) => item.includes(this.reverseSearchQuery)) ?? "";
    this.renderReverseSearch(match);
    if (match) {
      this.currentInput = match;
      this.cursor = match.length;
    } else {
      this.currentInput = "";
      this.cursor = 0;
    }
  }

  private suggestCommand(command: string): string | null {
    const distance = (a: string, b: string) => {
      const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
      for (let j = 1; j <= b.length; j++) dp[0][j] = j;
      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
          );
        }
      }
      return dp[a.length][b.length];
    };
    const ranked = this.registry.names().map((name) => ({ name, score: distance(command, name) })).sort((a, b) => a.score - b.score);
    return ranked[0] && ranked[0].score <= 2 ? ranked[0].name : null;
  }

  private applyCommandResult(result: CommandResult) {
    if (result.clear) this.term.clear();
    result.lines?.forEach((line) => this.term.writeln(line.replace(/\n/g, "\r\n")));
    if (result.openUrl && typeof window !== "undefined") window.open(result.openUrl, "_blank", "noopener,noreferrer");
  }

  private async runCommand(input: string) {
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
      const provider = this.providers.find((candidate) => candidate.has(parsed.command));
      if (!provider) {
        this.term.writeln(`\x1b[31m${parsed.command}: command not found\x1b[0m`);
        const suggestion = this.suggestCommand(parsed.command);
        if (suggestion) this.term.writeln(`\x1b[38;5;246mDid you mean '${suggestion}'?\x1b[0m`);
        return;
      }
      const result = await provider.execute({ raw: commandLine, parsed, vfs: this.vfs, state: this.state, registry: this.registry });
      this.applyCommandResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      this.term.writeln(`\x1b[31mError: ${message}\x1b[0m`);
    } finally {
      this.isProcessing = false;
      this.prompt();
    }
  }
}
