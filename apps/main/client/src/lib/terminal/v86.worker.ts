import { V86 } from "v86";
import type { V86Options } from "v86";
import { Com2Decoder, MAX_CONTROL_SEQUENCE, encodeHostControlFrame, type GuestControlFrame, type HostControlFrame } from "./com2Protocol";
import type { V86WorkerRequest as WorkerRequest, V86WorkerResponse as WorkerResponse } from "./v86Session";

interface GuestManifest {
  assets: Record<string, { bytes: number; sha256: string }>;
  schemaVersion: number;
  release: string;
  guest: {
    memoryBytes: number;
    kernelCommandLine: string;
    assetPaths: { kernel: string; initrd: string; filesystemJson: string; filesystemBlobs: string };
  };
  emulator: {
    version: string;
    assetPaths: { bios: string; vgaBios: string; wasm: string; fallbackWasm: string };
  };
}

const scope = globalThis as typeof globalThis & {
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerRequest>) => void): void;
  addEventListener(type: "unhandledrejection", listener: (event: PromiseRejectionEvent) => void): void;
};
const MAX_SERIAL_BATCH = 64 * 1024;
const EXPECTED_RELEASE = "alpine-3.24.2-v86-0.5.469";
const EXPECTED_KERNEL_COMMAND_LINE = "console=ttyS0,115200n8 root=host9p rootfstype=9p rootflags=trans=virtio,version=9p2000.L rw modules=virtio_pci";
let emulator: V86 | null = null;
let outputBuffer = new Uint8Array(MAX_SERIAL_BATCH);
let outputLength = 0;
let controlByte = new Uint8Array(1);
let controlDecoder: Com2Decoder | null = null;
let sessionId: string | null = null;
let hostSequence = 0;
let guestBuildId = "";
let latestInputEpoch = 0;
let acknowledgedInputEpoch = 0;
let latestShellState: "cleanPrompt" | "editing" | "busy" | "unknown" = "unknown";
let currentColumns = 80;
let currentRows = 24;
let currentLocale: "en" | "ru" = "en";
let guestReady = false;
let shellReady = false;
let disposed = false;
let failed = false;
let controlFailed = false;
let flushScheduled = false;
let disposalPromise: Promise<void> | null = null;
let startRequested = false;

function send(message: WorkerResponse, transfer?: Transferable[]) {
  scope.postMessage(message, transfer);
}

function fail(message: string) {
  if (disposed || failed) return;
  failed = true;
  send({ type: "error", message });
}

function failControl(message: string) {
  if (disposed || failed || controlFailed) return;
  if (!guestReady) {
    fail(message);
    return;
  }
  controlFailed = true;
  controlDecoder = null;
  latestShellState = "unknown";
  acknowledgedInputEpoch = 0;
  send({ type: "control-error", message });
}

function assetPath(base: URL, value: string): string {
  if (!value || value.startsWith("/") || value.includes("?") || value.includes("#")) {
    throw new Error("Guest manifest contains an unsafe asset path");
  }
  const parts = value.split("/");
  if (parts[parts.length - 1] === "") parts.pop();
  if (parts.length === 0 || parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Guest manifest contains an unsafe asset path");
  }
  const resolved = new URL(value, base);
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
    throw new Error("Guest manifest asset escaped its release directory");
  }
  return resolved.href;
}

function isGuestManifest(value: unknown): value is GuestManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value as Partial<GuestManifest>;
  const guestPaths = manifest.guest?.assetPaths;
  const emulatorPaths = manifest.emulator?.assetPaths;
  const filesystemJson = guestPaths && manifest.assets?.[guestPaths.filesystemJson];
  return manifest.schemaVersion === 1
    && manifest.release === EXPECTED_RELEASE
    && manifest.guest?.memoryBytes === 128 * 1024 * 1024
    && manifest.guest.kernelCommandLine === EXPECTED_KERNEL_COMMAND_LINE
    && guestPaths?.kernel === "alpine/vmlinuz"
    && guestPaths.initrd === "alpine/initramfs"
    && guestPaths.filesystemJson === "alpine/9p/fs.json"
    && guestPaths.filesystemBlobs === "alpine/9p/blob/"
    && Number.isSafeInteger(filesystemJson?.bytes)
    && (filesystemJson?.bytes ?? 0) > 0
    && typeof filesystemJson?.sha256 === "string"
    && /^[0-9a-f]{64}$/.test(filesystemJson.sha256)
    && manifest.emulator?.version === "0.5.469"
    && emulatorPaths?.bios === "v86/seabios.bin"
    && emulatorPaths.vgaBios === "v86/vgabios.bin"
    && emulatorPaths.wasm === "v86/v86.wasm"
    && emulatorPaths.fallbackWasm === "v86/v86-fallback.wasm";
}

function createSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sendControl(frame: HostControlFrame): boolean {
  if (!emulator || !sessionId || disposed || failed || controlFailed) return false;
  if (hostSequence >= MAX_CONTROL_SEQUENCE) {
    failControl("Guest control sequence limit reached");
    return false;
  }
  try {
    const bytes = encodeHostControlFrame(sessionId, ++hostSequence, frame);
    emulator.serial_send_bytes(1, bytes);
    return true;
  } catch {
    failControl("Unable to send a guest control frame");
    return false;
  }
}

function handleControlFrame(frame: GuestControlFrame, sequence: number) {
  if (frame.op === "ready") {
    if (guestReady || frame.guestBuildId !== guestBuildId || frame.cols !== currentColumns || frame.rows !== currentRows) {
      failControl("Guest control daemon identity or initial dimensions do not match");
      return;
    }
    guestReady = true;
    send({ type: "control-ready" });
  } else if (frame.op === "shellReady") {
    if (!guestReady || shellReady || frame.guestBuildId !== guestBuildId) {
      failControl("Guest shell startup identity is invalid");
      return;
    }
    shellReady = true;
    send({ type: "shell-ready" });
  } else if (frame.op === "shellState") {
    if (frame.inputEpoch !== latestInputEpoch || frame.inputEpoch !== acknowledgedInputEpoch) {
      failControl("Guest shell state is not tied to the latest input epoch");
      return;
    }
    latestShellState = frame.state;
    send({ type: "shell-state", inputEpoch: frame.inputEpoch, state: frame.state, acknowledged: false });
  } else if (frame.op === "inputEpochAck") {
    if (frame.inputEpoch !== latestInputEpoch) {
      failControl("Guest input acknowledgement is stale");
      return;
    }
    acknowledgedInputEpoch = frame.inputEpoch;
    latestShellState = frame.state;
    send({ type: "shell-state", inputEpoch: frame.inputEpoch, state: frame.state, acknowledged: true });
  } else if (frame.op === "portfolioAction") {
    send({
      type: "portfolio-action",
      guestSeq: sequence,
      requestId: frame.requestId,
      action: frame.action,
      linkId: frame.linkId,
    });
  } else if (frame.op === "error") {
    failControl(`Guest control protocol error: ${frame.code}`);
  }
}

function queueOutput(byte: number) {
  if (disposed || failed) return;
  if (outputLength === outputBuffer.length) {
    fail("Guest serial output exceeded the bounded buffer");
    return;
  }
  outputBuffer[outputLength++] = byte & 0xff;
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    if (disposed || outputLength === 0) return;
    const bytes = outputBuffer.subarray(0, outputLength);
    outputBuffer = new Uint8Array(MAX_SERIAL_BATCH);
    outputLength = 0;
    send({ type: "output", bytes }, [bytes.buffer]);
  });
}

function queueControlOutput(byte: number) {
  if (disposed || failed || controlFailed || !controlDecoder) return;
  controlByte[0] = byte & 0xff;
  try {
    controlDecoder.push(controlByte, (frame, sequence) => handleControlFrame(frame, sequence));
  } catch (error) {
    failControl(error instanceof Error ? error.message : "Guest control stream could not be decoded");
  }
}

function createEmulator(options: V86Options): V86 {
  const instance = new V86({ ...options, autostart: true, fastboot: true });
  emulator = instance;
  instance.add_listener("download-progress", ({ loaded, total }) => send({ type: "progress", loaded, total }));
  instance.add_listener("download-error", () => fail("A pinned guest asset could not be loaded"));
  instance.add_listener("emulator-ready", () => {
    if (disposed || failed) return;
    sessionId = createSessionId();
    controlDecoder = new Com2Decoder(sessionId);
    if (!sendControl({ op: "hello", cols: currentColumns, rows: currentRows })) return;
    sendControl({ op: "setLocale", locale: currentLocale });
  });
  instance.add_listener("serial0-output-byte", queueOutput);
  instance.add_listener("serial1-output-byte", queueControlOutput);
  return instance;
}

async function start(manifestUrl: string, cols: number, rows: number, locale: "en" | "ru") {
  try {
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Guest manifest request failed (${response.status})`);
    const requestedUrl = new URL(manifestUrl);
    const responseUrl = new URL(response.url);
    if (responseUrl.origin !== requestedUrl.origin || responseUrl.pathname !== requestedUrl.pathname
      || responseUrl.search || responseUrl.hash) throw new Error("Guest manifest redirected outside the pinned URL");
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      throw new Error("Guest manifest response is not JSON");
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 2_000_000) throw new Error("Guest manifest exceeds the size limit");
    const manifestText = await response.text();
    if (manifestText.length > 2_000_000) throw new Error("Guest manifest exceeds the size limit");
    const value: unknown = JSON.parse(manifestText);
    if (!isGuestManifest(value)) throw new Error("Guest manifest is invalid or not the pinned v86 release");
    if (disposed) return;
    currentColumns = cols;
    currentRows = rows;
    currentLocale = locale;
    guestBuildId = value.assets[value.guest.assetPaths.filesystemJson].sha256;
    const base = new URL("./", response.url);
    const paths = value.emulator.assetPaths;
    const guest = value.guest;
    const options: V86Options = {
      wasm_path: assetPath(base, paths.wasm),
      bios: { url: assetPath(base, paths.bios) },
      vga_bios: { url: assetPath(base, paths.vgaBios) },
      bzimage: { url: assetPath(base, guest.assetPaths.kernel) },
      initrd: { url: assetPath(base, guest.assetPaths.initrd) },
      filesystem: {
        basefs: assetPath(base, guest.assetPaths.filesystemJson),
        baseurl: assetPath(base, guest.assetPaths.filesystemBlobs),
      },
      memory_size: guest.memoryBytes,
      cmdline: guest.kernelCommandLine,
      uart1: true,
    };
    createEmulator(options);
  } catch (error) {
    if (!disposed) fail(error instanceof Error ? error.message : "Unable to start the guest");
  }
}


function handleRequest(data: unknown) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    fail("Worker request is malformed");
    return;
  }
  const request = data as WorkerRequest;
  if (request.type === "dispose") {
    void dispose();
    return;
  }
  if (disposed || failed) return;
  if (request.type === "start") {
    if (startRequested || typeof request.manifestUrl !== "string"
      || !Number.isInteger(request.cols) || request.cols < 2 || request.cols > 300
      || !Number.isInteger(request.rows) || request.rows < 2 || request.rows > 120
      || (request.locale !== "en" && request.locale !== "ru")) {
      fail("Worker start request is invalid or duplicated");
      return;
    }
    try {
      const manifestUrl = new URL(request.manifestUrl, globalThis.location.href);
      if (manifestUrl.origin !== globalThis.location.origin
        || manifestUrl.pathname !== `/browser-os/${EXPECTED_RELEASE}/manifest.json`
        || manifestUrl.search || manifestUrl.hash) {
        fail("Guest manifest URL is outside the pinned release");
        return;
      }
      startRequested = true;
      void start(manifestUrl.href, request.cols, request.rows, request.locale);
    } catch {
      fail("Guest manifest URL is invalid");
    }
  } else if (request.type === "input") {
    if (!(request.bytes instanceof Uint8Array) || !emulator || !guestReady) {
      fail("Guest serial input arrived before the control daemon was ready");
      return;
    }
    if (request.bytes.byteLength === 0) return;
    if (!Number.isInteger(request.inputEpoch)
      || request.inputEpoch !== latestInputEpoch + 1
      || request.inputEpoch > MAX_CONTROL_SEQUENCE) {
      fail("Host input epoch is stale or out of order");
      return;
    }
    try {
      emulator.serial_send_bytes(0, request.bytes);
      latestInputEpoch = request.inputEpoch;
      latestShellState = "unknown";
      sendControl({ op: "inputEpoch", inputEpoch: request.inputEpoch });
    } catch {
      fail("Unable to send guest serial input");
    }
  } else if (request.type === "resize") {
    if (!Number.isInteger(request.cols) || request.cols < 2 || request.cols > 300
      || !Number.isInteger(request.rows) || request.rows < 2 || request.rows > 120) {
      fail("Guest terminal dimensions are invalid");
      return;
    }
    currentColumns = request.cols;
    currentRows = request.rows;
    if (guestReady) sendControl({ op: "resize", cols: currentColumns, rows: currentRows });
  } else if (request.type === "set-language") {
    if (request.locale !== "en" && request.locale !== "ru") {
      fail("Guest locale is invalid");
      return;
    }
    currentLocale = request.locale;
    if (guestReady) sendControl({ op: "setLocale", locale: currentLocale });
  } else if (request.type === "dispatch-action") {
    failControl("Host quick actions are disabled until Systems agrees and implements a guest-enforced input fence");
  } else if (request.type === "portfolio-ack") {
    if (!Number.isInteger(request.ackSeq) || request.ackSeq < 1 || request.ackSeq > MAX_CONTROL_SEQUENCE
      || (request.status !== "ok" && request.status !== "rejected")) {
      fail("Portfolio action acknowledgement is invalid");
      return;
    }
    sendControl({ op: "ack", ackSeq: request.ackSeq, status: request.status });
  } else {
    fail("Worker request operation is unknown");
  }
}

async function dispose(): Promise<void> {
  if (disposalPromise) return disposalPromise;
  disposed = true;
  disposalPromise = (async () => {
    const current = emulator;
    emulator = null;
    if (current) await current.destroy().catch(() => undefined);
    outputBuffer = new Uint8Array(0);
    outputLength = 0;
    controlDecoder = null;
    send({ type: "disposed" });
  })();
  return disposalPromise;
}

scope.addEventListener("unhandledrejection", (event) => {
  fail(event.reason instanceof Error ? event.reason.message : "The guest emulator failed");
});
scope.addEventListener("message", ({ data }) => handleRequest(data));
