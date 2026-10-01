import { Shell } from "../shell";
import { VirtualFileSystem } from "../vfs";
import type { Language } from "@/data/home";
import type { Terminal } from "@xterm/xterm";
import { CLEAR_TERMINAL_OUTPUT, type LegacyTerminalSessionOptions, type TerminalOutput, type TerminalSession, type TerminalSessionState, type VisitorCommand } from "./session";

const VISITOR_COMMANDS: Record<VisitorCommand, string> = {
  tour: "tour",
  plugins: "plugins",
  links: "links",
  "open cv.txt": "open cv.txt",
  projects: "projects",
  contact: "contact",
  "copy-contact": "copy-contact",
  github: "github",
  a: "a",
  ls: "ls",
  eza: "eza",
  clear: "clear",
};

export class LegacyTerminalSession implements TerminalSession {
  readonly inputOwner = "legacy-shell-key-events" as const;
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
      options.onOutput?.(output);
      this.outputs.forEach((listener) => listener(output));
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
    this.shell = new Shell(this.terminal, vfs, {
      onBusyChange: (busy) => this.setState({ status: busy ? "busy" : "ready" }),
    });
    this.setState({ status: "ready" });
  }

  setLanguage(language: Language): void {
    if (!this.vfs || this.state.status === "disposed") return;
    this.vfs.setLang(language);
    this.shell?.updateVfs(this.vfs);
  }

  subscribeOutput(listener: (output: TerminalOutput) => void): () => void {
    this.outputs.add(listener);
    return () => this.outputs.delete(listener);
  }

  getState(): TerminalSessionState {
    return this.state;
  }

  subscribeState(listener: (state: TerminalSessionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  resize(_columns: number, _rows: number): void {
    // FitAddon resizes the legacy xterm surface; no remote process needs a size update.
  }

  runVisitorCommand(command: VisitorCommand): boolean {
    const legacyCommand = VISITOR_COMMANDS[command];
    if (!legacyCommand || this.state.status !== "ready") return false;
    return this.shell?.submitCommand(legacyCommand) ?? false;
  }

  dispose(): void {
    if (this.state.status === "disposed") return;
    this.shell?.dispose();
    this.shell = null;
    this.vfs = null;
    this.outputs.clear();
    this.setState({ status: "disposed" });
    this.stateListeners.clear();
  }

  private setState(state: TerminalSessionState): void {
    if (this.state.status === "disposed") return;
    this.state = state;
    this.onStateChange?.(state);
    this.stateListeners.forEach((listener) => listener(state));
  }
}
