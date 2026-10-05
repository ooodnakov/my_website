import type { Language } from "@/data/home";
import { MAX_CONTROL_SEQUENCE, PORTFOLIO_LINK_IDS, type GuestAction, type PortfolioLinkId, type ShellState } from "./com2Protocol";
import type { TerminalSession, TerminalSessionInput, TerminalSessionState, TerminalOutput, VisitorCommand } from "./session";

const visitorCommands = new Set<string>([
  "tour", "plugins", "links", "open cv.txt", "projects", "contact", "copy-contact",
  "github", "a", "ls", "eza", "clear",
]);

function isVisitorCommand(value: unknown): value is VisitorCommand {
  return typeof value === "string" && visitorCommands.has(value);
}

export type V86WorkerRequest =
  | { type: "start"; manifestUrl: string; cols: number; rows: number; locale: Language }
  | { type: "input"; bytes: Uint8Array }
  | { type: "resize"; cols: number; rows: number }
  | { type: "set-language"; locale: Language }
  | { type: "dispatch-action"; action: GuestAction; requestId: number; fenceId: number; inputBytes: number }
  | { type: "portfolio-ack"; ackSeq: number; status: "queued" | "rejected" }
  | { type: "dispose" };

export type V86WorkerResponse =
  | { type: "progress"; loaded: number; total: number }
  | { type: "output"; bytes: Uint8Array }
  | { type: "control-ready" }
  | { type: "shell-ready" }
  | { type: "shell-state"; state: ShellState }
  | { type: "input-fence-ack"; fenceId: number; inputBytes: number; state: ShellState }
  | { type: "portfolio-action"; guestSeq: number; requestId: number; action: "open" | "copyContact"; linkId: PortfolioLinkId }
  | { type: "control-error"; message: string }
  | { type: "error"; message: string }
  | { type: "fallback-wasm" }
  | { type: "disposed" };

export interface V86TerminalSessionOptions {
  columns: number;
  rows: number;
  language: Language;
  onProgress?: (loaded: number, total: number) => void;
  onStateChange?: (state: TerminalSessionState) => void;
  onOutput?: (output: TerminalOutput) => void;
  onDisposed?: () => void;
  onOpenCv?: () => boolean;
  onCopyContact?: () => boolean;
  onShellStateChange?: (state: ShellState) => void;
  onPortfolioActionRequest?: (action: "open" | "copyContact", linkId: PortfolioLinkId, requestId: number) => boolean;
  onControlRevoked?: (message: string) => void;
  onRuntimeWarning?: (message: string) => void;
}

export class V86TerminalSession implements TerminalSession {
  private static workerTail: Promise<void> = Promise.resolve();

  readonly input: TerminalSessionInput = {
    owner: "session-byte-stream",
    sendBytes: (bytes) => {
      if (!this.inputReady || this.disposed || !this.worker) return;
      this.options.onShellStateChange?.("unknown");
      try {
        this.worker.postMessage({ type: "input", bytes }, [bytes.buffer]);
      } catch {
        this.inputReady = false;
        this.controlAvailable = false;
        this.setState({ status: "failed", error: new Error("Unable to send guest input") });
        this.shutdownWorker();
      }
    },
  };

  private readonly listeners = new Set<(output: TerminalOutput) => void>();
  private readonly stateListeners = new Set<(state: TerminalSessionState) => void>();
  private readonly disposalPromise: Promise<void>;
  private readonly previousWorker: Promise<void>;
  private resolveDisposal!: () => void;
  private worker: Worker | null = null;
  private state: TerminalSessionState = { status: "idle" };
  private startPromise: Promise<void> | null = null;
  private disposed = false;
  private shutdownRequested = false;
  private workerFinished = false;
  private inputReady = false;
  private controlAvailable = false;
  private lastPortfolioRequestId = 0;
  private columns: number;
  private rows: number;
  private language: Language;
  private disposalTimer: number | null = null;
  private bootTimer: number | null = null;
  private readonly handleMessage: (event: MessageEvent<V86WorkerResponse>) => void;
  private readonly handleError: (event: ErrorEvent | MessageEvent) => void;

  constructor(private readonly options: V86TerminalSessionOptions) {
    this.columns = options.columns;
    this.rows = options.rows;
    this.language = options.language;
    this.disposalPromise = new Promise<void>((resolve) => {
      this.resolveDisposal = resolve;
    });
    this.previousWorker = V86TerminalSession.workerTail;
    V86TerminalSession.workerTail = this.disposalPromise;
    this.handleMessage = ({ data }) => {
      if (data.type === "disposed") {
        this.finishWorker();
        return;
      }
      if (this.disposed || this.state.status === "failed") return;
      else if (data.type === "fallback-wasm") this.options.onRuntimeWarning?.("Verified fallback WASM selected after primary initialization failed.");
      else if (data.type === "progress") this.options.onProgress?.(data.loaded, data.total);
      else if (data.type === "output") this.emit(data.bytes);
      else if (data.type === "control-ready") {
        this.inputReady = true;
        this.controlAvailable = true;
        this.worker?.postMessage({ type: "resize", cols: this.columns, rows: this.rows });
        this.worker?.postMessage({ type: "set-language", locale: this.language });
      }
      else if (data.type === "shell-ready") {
        this.clearBootTimer();
        this.setState({ status: "ready" });
      } else if (data.type === "shell-state" || data.type === "input-fence-ack") {
        // Shell state is advisory; neither message authorizes host-side command dispatch.
        this.options.onShellStateChange?.(data.state);
      } else if (data.type === "portfolio-action") {
        let accepted = false;
        const validAction = data.action === "open" || data.action === "copyContact";
        const validLink = PORTFOLIO_LINK_IDS.includes(data.linkId);
        const validPair = data.action !== "copyContact" || data.linkId === "quick-mail";
        if (this.state.status === "ready"
          && this.inputReady
          && this.controlAvailable
          && validAction
          && validLink
          && validPair
          && Number.isInteger(data.requestId)
          && data.requestId > this.lastPortfolioRequestId
          && data.requestId <= MAX_CONTROL_SEQUENCE) {
          this.lastPortfolioRequestId = data.requestId;
          try {
            accepted = this.options.onPortfolioActionRequest?.(data.action, data.linkId, data.requestId) ?? false;
          } catch {
            accepted = false;
          }
        }
        this.worker?.postMessage({
          type: "portfolio-ack",
          ackSeq: data.guestSeq,
          status: accepted ? "queued" : "rejected",
        } satisfies V86WorkerRequest);
      } else if (data.type === "control-error") {
        this.controlAvailable = false;
        this.options.onControlRevoked?.(data.message);
        this.options.onShellStateChange?.("unknown");
      } else if (data.type === "error") {
        this.inputReady = false;
        this.controlAvailable = false;
        this.setState({ status: "failed", error: new Error(data.message) });
        this.shutdownWorker();
      }
    };
    this.handleError = (event) => {
      if (!this.disposed) {
        const message = "data" in event ? "The OS worker sent an invalid message" : event.message;
        this.inputReady = false;
        this.controlAvailable = false;
        this.setState({ status: "failed", error: new Error(message || "The OS worker failed") });
      }
      this.finishWorker();
    };
  }

  start(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("Terminal session is disposed"));
    if (this.startPromise) return this.startPromise;
    this.setState({ status: "busy" });
    this.startPromise = this.startWorker();
    return this.startPromise;
  }

  private async startWorker(): Promise<void> {
    await Promise.race([this.previousWorker, this.disposalPromise]);
    if (this.disposed) return;
    try {
      const worker = new Worker(new URL("./v86.worker.ts", import.meta.url), { type: "module", name: "portfolio-v86" });
      this.worker = worker;
      worker.addEventListener("message", this.handleMessage);
      worker.addEventListener("error", this.handleError);
      worker.addEventListener("messageerror", this.handleError);
      this.bootTimer = window.setTimeout(() => {
        if (this.state.status === "busy") {
          this.inputReady = false;
          this.setState({ status: "failed", error: new Error("Guest shell startup timed out") });
          this.shutdownWorker();
        }
      }, 180_000);
      worker.postMessage({
        type: "start",
        manifestUrl: new URL("/browser-os/alpine-3.24.2-v86-0.5.469/manifest.json", window.location.href).href,
        cols: this.columns,
        rows: this.rows,
        locale: this.language,
      } satisfies V86WorkerRequest);
    } catch (error) {
      this.inputReady = false;
      this.setState({ status: "failed", error: error instanceof Error ? error : new Error("Unable to start the OS worker") });
      this.finishWorker();
      throw error;
    }
  }

  subscribeOutput(listener: (output: TerminalOutput) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): TerminalSessionState {
    return this.state;
  }

  subscribeState(listener: (state: TerminalSessionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  resize(columns: number, rows: number): void {
    if (!Number.isInteger(columns) || columns < 2 || columns > 300 || !Number.isInteger(rows) || rows < 2 || rows > 120) return;
    this.columns = columns;
    this.rows = rows;
    if (this.inputReady) this.worker?.postMessage({ type: "resize", cols: columns, rows });
  }

  setLanguage(language: Language): void {
    this.language = language;
    if (this.inputReady) this.worker?.postMessage({ type: "set-language", locale: language });
  }

  runVisitorCommand(command: VisitorCommand): boolean {
    if (this.disposed
      || this.state.status !== "ready"
      || !this.inputReady
      || !this.worker
      || !isVisitorCommand(command)) return false;
    if (command === "open cv.txt") return this.options.onOpenCv?.() ?? false;
    if (command === "copy-contact") return this.options.onCopyContact?.() ?? false;
    // COM2 quick actions remain disabled until host verification includes real guest consumption and execution proof.
    return false;
  }

  whenDisposed(): Promise<void> {
    return this.disposalPromise;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.inputReady = false;
    this.setState({ status: "disposed" });
    this.listeners.clear();
    this.stateListeners.clear();
    this.clearBootTimer();
    this.shutdownWorker();
  }

  private shutdownWorker(): void {
    if (!this.worker || this.shutdownRequested) {
      if (!this.worker) this.finishWorker();
      return;
    }
    this.shutdownRequested = true;
    this.disposalTimer = window.setTimeout(() => this.finishWorker(), 2_000);
    try {
      this.worker.postMessage({ type: "dispose" } satisfies V86WorkerRequest);
    } catch {
      this.finishWorker();
    }
  }

  private finishWorker(): void {
    if (this.workerFinished) return;
    this.workerFinished = true;
    this.inputReady = false;
    this.clearBootTimer();
    if (this.disposalTimer !== null) window.clearTimeout(this.disposalTimer);
    this.disposalTimer = null;
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.removeEventListener("message", this.handleMessage);
      worker.removeEventListener("error", this.handleError);
      worker.removeEventListener("messageerror", this.handleError);
      worker.terminate();
    }
    this.resolveDisposal();
    this.options.onDisposed?.();
  }

  private clearBootTimer(): void {
    if (this.bootTimer !== null) window.clearTimeout(this.bootTimer);
    this.bootTimer = null;
  }

  private emit(output: TerminalOutput): void {
    if (this.disposed) return;
    this.options.onOutput?.(output);
    this.listeners.forEach((listener) => listener(output));
  }

  private setState(state: TerminalSessionState): void {
    if (this.disposed && state.status !== "disposed") return;
    this.state = state;
    this.options.onStateChange?.(state);
    this.stateListeners.forEach((listener) => listener(state));
  }
}
