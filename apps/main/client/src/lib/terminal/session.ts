import type { Language } from "@/data/home";
import type { Terminal } from "@xterm/xterm";

export type TerminalSessionStatus = "idle" | "ready" | "busy" | "failed" | "disposed";
export type VisitorCommand = "tour" | "plugins" | "links" | "open cv.txt" | "projects" | "contact" | "copy-contact" | "github" | "a" | "ls" | "eza" | "clear";
export type TerminalOutput = string | Uint8Array | { type: "clear" };
export const CLEAR_TERMINAL_OUTPUT = { type: "clear" } as const;

export interface TerminalSessionState {
  status: TerminalSessionStatus;
  error?: Error;
}

/** Owns terminal input, output, command readiness, and teardown for one terminal instance. */
export interface TerminalSession {
  readonly inputOwner: "legacy-shell-key-events" | "session-byte-stream";
  start(): Promise<void>;
  subscribeOutput(listener: (output: TerminalOutput) => void): () => void;
  getState(): TerminalSessionState;
  subscribeState(listener: (state: TerminalSessionState) => void): () => void;
  resize(columns: number, rows: number): void;
  setLanguage(language: Language): void;
  runVisitorCommand(command: VisitorCommand): boolean;
  dispose(): void;
}

export interface LegacyTerminalSessionOptions {
  terminal: Terminal;
  language: Language;
  onStateChange?: (state: TerminalSessionState) => void;
  onOutput?: (output: TerminalOutput) => void;
}
