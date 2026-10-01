import { Shell } from "../shell";
import { VirtualFileSystem } from "../vfs";
import type { Language } from "@/data/home";
import type { Terminal } from "@xterm/xterm";
import { CLEAR_TERMINAL_OUTPUT, type LegacyTerminalSessionOptions, type TerminalOutput, type TerminalSession, type TerminalSessionInput, type TerminalSessionState, type VisitorCommand, type VisitorCommandOptions } from "./session";

const VISITOR_COMMANDS = new Map<string, string>([
  ["tour", "tour"],
  ["plugins", "plugins"],
  ["links", "links"],
  ["open cv.txt", "open cv.txt"],
  ["projects", "projects"],
  ["contact", "contact"],
  ["copy-contact", "copy-contact"],
  ["github", "github"],
  ["a", "a"],
  ["ls", "ls"],
  ["eza", "eza"],
  ["clear", "clear"],
]);

export class LegacyTerminalSession implements TerminalSession {
  readonly input: TerminalSessionInput = { owner: "legacy-shell-key-events" };
  private readonly terminal: Terminal;
  private readonly outputs = new Set<(output: TerminalOutput) => void>();
  private readonly stateListeners = new Set<(state: TerminalSessionState) => void>();
  private readonly onStateChange?: LegacyTerminalSessionOptions["onStateChange"];
  private state: TerminalSessionState = { status: "idle" };
  private shell: Shell | null = null;
  private vfs: VirtualFileSystem | null = null;


  constructor(private readonly options: LegacyTerminalSessionOptions) {
    this.onStateChange = options.onStateChange;
    const publish = (output: TerminalOutput) => {
      if (this.isDisposed()) return;
      options.onOutput?.(output);
      if (this.isDisposed()) return;
      this.outputs.forEach((listener) => {
        if (!this.isDisposed()) listener(output);
      });
    };
    this.terminal = new Proxy(options.terminal, {
      get(target, property, receiver) {
        if (property === "write") return (data: string | Uint8Array) => publish(data);
        if (property === "writeln") return (data: string | Uint8Array) => publish(typeof data === "string" ? `${data}\r\n` : data);
        if (property === "clear") return () => publish(CLEAR_TERMINAL_OUTPUT);
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  async start(): Promise<void> {
    if (this.state.status !== "idle") return;
    const vfs = new VirtualFileSystem(this.options.language);
    this.vfs = vfs;
    try {
      const shell = new Shell(this.terminal, vfs, {
        isSessionActive: () => !this.isDisposed(),
        onBusyChange: (busy) => this.setState({ status: busy ? "busy" : "ready" }),
      });
      this.shell = shell;
      if (this.isDisposed()) {
        shell.dispose();
        this.shell = null;
        this.vfs = null;
        return;
      }
      this.setState({ status: "ready" });
    } catch (cause) {
      this.shell?.dispose();
      this.shell = null;
      this.vfs = null;
      if (!this.isDisposed()) {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        this.setState({ status: "failed", error });
      }
      throw cause;
    }
  }

  setLanguage(language: Language): void {
    if (!this.vfs || (this.state.status !== "ready" && this.state.status !== "busy")) return;
    this.vfs.setLang(language);
    this.shell?.updateVfs(this.vfs);
  }

  subscribeOutput(listener: (output: TerminalOutput) => void): () => void {
    if (this.isDisposed()) return () => undefined;
    this.outputs.add(listener);
    return () => this.outputs.delete(listener);
  }

  getState(): TerminalSessionState {
    return this.state;
  }

  subscribeState(listener: (state: TerminalSessionState) => void): () => void {
    if (this.isDisposed()) return () => undefined;
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  resize(_columns: number, _rows: number): void {
    // FitAddon resizes the legacy xterm surface; no remote process needs a size update.
  }

  runVisitorCommand(command: VisitorCommand, options?: VisitorCommandOptions): boolean {
    if (typeof command !== "string" || this.state.status !== "ready") return false;
    const legacyCommand = VISITOR_COMMANDS.get(command);
    if (!legacyCommand) return false;
    return this.shell?.submitCommand(legacyCommand, options?.focus ?? true) ?? false;
  }

  dispose(): void {
    if (this.isDisposed()) return;
    const state: TerminalSessionState = { status: "disposed" };
    const shell = this.shell;
    this.state = state;
    this.shell = null;
    this.vfs = null;
    this.outputs.clear();
    try {
      shell?.dispose();
      this.onStateChange?.(state);
      this.stateListeners.forEach((listener) => listener(state));
    } finally {
      this.stateListeners.clear();
    }
  }

  private isDisposed(): boolean {
    return this.state.status === "disposed";
  }

  private setState(state: TerminalSessionState): void {
    if (this.isDisposed()) return;
    this.state = state;
    this.onStateChange?.(state);
    if (this.state !== state) return;
    this.stateListeners.forEach((listener) => {
      if (this.state === state) listener(state);
    });
  }
}
