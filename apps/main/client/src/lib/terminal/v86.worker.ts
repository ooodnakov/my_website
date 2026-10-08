import { V86 } from "v86";
import type { V86Options } from "v86";
import { Com2Decoder, MAX_CONTROL_SEQUENCE, encodeHostControlFrame, matchesDispatchAck, type GuestControlFrame, type HostControlFrame } from "./com2Protocol";
import type { V86WorkerRequest as WorkerRequest, V86WorkerResponse as WorkerResponse } from "./v86Session";

interface ManifestAsset {
  bytes: number;
  sha256: string;
}

interface GuestManifest {
  assets: Record<string, ManifestAsset>;
  schemaVersion: number;
  release: string;
  guest: {
    memoryBytes: number;
    kernelCommandLine: string;
    buildIdentityPath: string;
    buildId: string;
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
interface TerminalDimensions {
  cols: number;
  rows: number;
}

const MAX_MANIFEST_BYTES = 2_000_000;
const MAX_MANIFEST_ASSETS = 4096;
const MAX_INVENTORY_BYTES = 128 * 1024 * 1024;
let manifestAssets = new Map<string, ManifestAsset>();
let helloDimensions: TerminalDimensions | null = null;
let appliedDimensions: TerminalDimensions | null = null;
let resizeInFlight: TerminalDimensions | null = null;
let controlReadySent = false;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let localeTimer: ReturnType<typeof setTimeout> | null = null;
let emulator: V86 | null = null;
let outputBuffer = new Uint8Array(MAX_SERIAL_BATCH);
let outputLength = 0;
let controlByte = new Uint8Array(1);
let controlDecoder: Com2Decoder | null = null;
let sessionId: string | null = null;
let hostSequence = 0;
let pendingDispatchAck: { ackSeq: number; requestId: number } | null = null;
let guestBuildId = "";
let latestInputBytes = 0;
let latestFenceId = 0;
let currentFence: { fenceId: number; inputBytes: number } | null = null;
let currentColumns = 80;
let currentRows = 24;
let currentLocale: "en" | "ru" = "en";
let appliedLocale: "en" | "ru" | null = null;
let pendingLocaleAck: { locale: "en" | "ru" } | null = null;
let startupPhase: "await-bootstrap" | "await-ready" | "await-initial-locale-ack" | "syncing" | "ready" = "await-bootstrap";
let guestReady = false;
let shellReady = false;
let shellReadySent = false;
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
  pendingDispatchAck = null;
  if (resizeTimer !== null) clearTimeout(resizeTimer);
  resizeTimer = null;
  if (localeTimer !== null) clearTimeout(localeTimer);
  localeTimer = null;
  pendingLocaleAck = null;
  send({ type: "error", message });
}

function failControl(message: string) {
  if (disposed || failed || controlFailed) return;
  if (startupPhase !== "ready") {
    fail(message);
    return;
  }
  controlFailed = true;
  currentFence = null;
  pendingDispatchAck = null;
  send({ type: "control-error", message });
}

function isSafeAssetName(value: string, allowTrailingSlash = false): boolean {
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("%")
    || value.includes("?") || value.includes("#") || value.includes(":") || /[\u0000-\u0020\u007f]/.test(value)) return false;
  const path = allowTrailingSlash && value.endsWith("/") ? value.slice(0, -1) : value;
  const parts = path.split("/");
  return parts.length > 0 && parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

function assetPath(base: URL, value: string, allowTrailingSlash = false): string {
  if (!isSafeAssetName(value, allowTrailingSlash)) throw new Error("Guest manifest contains an unsafe asset path");
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
  const assets = manifest.assets as unknown;
  if (assets === null || typeof assets !== "object" || Array.isArray(assets)) return false;
  const entries = Object.entries(assets as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_MANIFEST_ASSETS) return false;
  let inventoryBytes = 0;
  let blobCount = 0;
  for (const [name, value] of entries) {
    if (!isSafeAssetName(name) || value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const asset = value as Record<string, unknown>;
    if (Object.keys(asset).length !== 2 || !Object.hasOwn(asset, "bytes") || !Object.hasOwn(asset, "sha256")
      || !Number.isSafeInteger(asset.bytes) || (asset.bytes as number) <= 0
      || (asset.bytes as number) > MAX_INVENTORY_BYTES
      || typeof asset.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(asset.sha256)) return false;
    inventoryBytes += asset.bytes as number;
    if (!Number.isSafeInteger(inventoryBytes) || inventoryBytes > MAX_INVENTORY_BYTES) return false;
    if (guestPaths?.filesystemBlobs && name.startsWith(guestPaths.filesystemBlobs)) blobCount += 1;
  }
  if (blobCount === 0) return false;
  const requiredPaths = [
    manifest.guest?.buildIdentityPath,
    guestPaths?.kernel,
    guestPaths?.initrd,
    guestPaths?.filesystemJson,
    emulatorPaths?.bios,
    emulatorPaths?.vgaBios,
    emulatorPaths?.wasm,
    emulatorPaths?.fallbackWasm,
  ];
  if (!requiredPaths.every((path) => typeof path === "string" && Object.hasOwn(assets as object, path))) return false;
  return manifest.schemaVersion === 1
    && manifest.release === EXPECTED_RELEASE
    && manifest.guest?.memoryBytes === 128 * 1024 * 1024
    && manifest.guest.kernelCommandLine === EXPECTED_KERNEL_COMMAND_LINE
    && manifest.guest?.buildIdentityPath === "alpine/guest-build.json"
    && typeof manifest.guest.buildId === "string"
    && /^[0-9a-f]{64}$/.test(manifest.guest.buildId)
    && (assets as Record<string, ManifestAsset>)[manifest.guest.buildIdentityPath]?.sha256 === manifest.guest.buildId
    && guestPaths?.kernel === "alpine/vmlinuz"
    && guestPaths?.initrd === "alpine/initramfs"
    && guestPaths?.filesystemJson === "alpine/9p/fs.json"
    && guestPaths?.filesystemBlobs === "alpine/9p/blob/"
    && manifest.emulator?.version === "0.5.469"
    && emulatorPaths?.bios === "v86/seabios.bin"
    && emulatorPaths.vgaBios === "v86/vgabios.bin"
    && emulatorPaths.wasm === "v86/v86.wasm"
    && emulatorPaths.fallbackWasm === "v86/v86-fallback.wasm";
}

async function verifyAssetBytes(name: string, bytes: ArrayBuffer, asset: ManifestAsset): Promise<void> {
  if (bytes.byteLength !== asset.bytes) throw new Error(`Pinned guest asset size mismatch: ${name}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== asset.sha256) throw new Error(`Pinned guest asset digest mismatch: ${name}`);
}

async function fetchVerifiedAsset(base: URL, name: string, asset: ManifestAsset, requireWasmMime = false): Promise<ArrayBuffer> {
  const url = new URL(assetPath(base, name));
  const response = await fetch(url.href, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Pinned guest asset request failed (${response.status}): ${name}`);
  const responseUrl = new URL(response.url);
  if (responseUrl.origin !== url.origin || responseUrl.pathname !== url.pathname || responseUrl.search || responseUrl.hash) {
    throw new Error(`Pinned guest asset redirected outside its path: ${name}`);
  }
  if (requireWasmMime && !response.headers.get("content-type")?.toLowerCase().includes("application/wasm")) {
    throw new Error(`Pinned WASM asset has an invalid MIME type: ${name}`);
  }
  const bytes = await response.arrayBuffer();
  await verifyAssetBytes(name, bytes, asset);
  return bytes;
}

function installAssetIntegrityXHR(base: URL, assets: ReadonlyMap<string, ManifestAsset>): void {
  const NativeXMLHttpRequest = globalThis.XMLHttpRequest;
  const findDescriptor = (property: string): PropertyDescriptor | undefined => {
    let prototype: object | null = NativeXMLHttpRequest.prototype;
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
      if (descriptor) return descriptor;
      prototype = Object.getPrototypeOf(prototype) as object | null;
    }
    return undefined;
  };
  const responseTypeDescriptor = findDescriptor("responseType");
  const responseDescriptor = findDescriptor("response");
  const onloadDescriptor = findDescriptor("onload");
  if (!responseTypeDescriptor?.set || !responseDescriptor?.get || !onloadDescriptor?.set) {
    throw new Error("Guest asset integrity checks require XHR response accessors");
  }

  class VerifiedAssetXMLHttpRequest extends NativeXMLHttpRequest {
    private requestedAsset: string | null = null;
    private requestedUrl: URL | null = null;
    private requestedResponseType: XMLHttpRequestResponseType = "";
    private responseOverride: unknown;
    private loadHandler: XMLHttpRequest["onload"] = null;

    override open(method: string, url: string | URL, async = true, username?: string | null, password?: string | null): void {
      this.requestedAsset = "";
      this.requestedUrl = null;
      try {
        const target = new URL(url.toString(), base);
        if (target.origin === base.origin && target.pathname.startsWith(base.pathname) && !target.search && !target.hash) {
          this.requestedUrl = target;
          const encodedName = target.pathname.slice(base.pathname.length);
          try {
            this.requestedAsset = decodeURIComponent(encodedName);
          } catch {
            this.requestedAsset = "";
          }
        }
      } catch {
        this.requestedAsset = "";
      }
      super.open(method, url, async, username, password);
    }

    override get responseType(): XMLHttpRequestResponseType {
      return this.requestedResponseType;
    }

    override set responseType(value: XMLHttpRequestResponseType) {
      this.requestedResponseType = value;
      responseTypeDescriptor!.set!.call(this, this.requestedAsset !== null && value === "json" ? "arraybuffer" : value);
    }

    override get response(): unknown {
      return this.responseOverride === undefined ? responseDescriptor!.get!.call(this) as unknown : this.responseOverride;
    }

    override get onload(): XMLHttpRequest["onload"] {
      return this.loadHandler;
    }

    override set onload(handler: XMLHttpRequest["onload"]) {
      this.loadHandler = handler;
    }

    override send(body?: Document | XMLHttpRequestBodyInit | null): void {
      if (this.requestedAsset === null || this.requestedAsset === "" || !assets.has(this.requestedAsset)) {
        fail("Guest runtime requested an unpinned asset");
        return;
      }
      onloadDescriptor!.set!.call(this, (event: ProgressEvent<EventTarget>) => {
        void this.verifyAndDispatchLoad(event);
      });
      super.send(body);
    }

    private async verifyAndDispatchLoad(event: ProgressEvent<EventTarget>): Promise<void> {
      const name = this.requestedAsset;
      const url = this.requestedUrl;
      const entry = name ? assets.get(name) : undefined;
      if (!name || !url || !entry || url.search || url.hash || (this.responseURL && this.responseURL !== url.href)) {
        fail("Guest runtime requested an unpinned or redirected asset");
        return;
      }
      const bytes = responseDescriptor!.get!.call(this) as unknown;
      if (!(bytes instanceof ArrayBuffer)) {
        fail(`Guest asset did not return binary bytes: ${name}`);
        return;
      }
      try {
        await verifyAssetBytes(name, bytes, entry);
        this.responseOverride = this.requestedResponseType === "json"
          ? JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
          : bytes;
      } catch (error) {
        fail(error instanceof Error ? error.message : `Guest asset verification failed: ${name}`);
        return;
      }
      this.loadHandler?.call(this, event);
    }
  }

  globalThis.XMLHttpRequest = VerifiedAssetXMLHttpRequest;
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
    const sequence = ++hostSequence;
    const bytes = encodeHostControlFrame(sessionId, sequence, frame);
    emulator.serial_send_bytes(1, bytes);
    if (frame.op === "dispatchAction") pendingDispatchAck = { ackSeq: sequence, requestId: frame.requestId };
    return true;
  } catch {
    failControl("Unable to send a guest control frame");
    return false;
  }
}

function matchesDimensions(left: TerminalDimensions | null, right: TerminalDimensions): boolean {
  return left !== null && left.cols === right.cols && left.rows === right.rows;
}

function signalControlReadyWhenSized(): void {
  if (startupPhase !== "ready" || !guestReady || controlReadySent || resizeInFlight
    || !matchesDimensions(appliedDimensions, { cols: currentColumns, rows: currentRows })
    || appliedLocale !== currentLocale) return;
  controlReadySent = true;
  send({ type: "control-ready" });
  signalShellReadyWhenSized();
}

function signalShellReadyWhenSized(): void {
  if (!shellReady || shellReadySent || !controlReadySent || controlFailed || failed || disposed) return;
  shellReadySent = true;
  send({ type: "shell-ready" });
}

function sendResize(dimensions: TerminalDimensions): void {
  resizeInFlight = dimensions;
  if (!sendControl({ op: "resize", ...dimensions })) {
    resizeInFlight = null;
    return;
  }
  if (resizeTimer !== null) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (resizeInFlight === dimensions) failControl("Guest resize acknowledgement timed out");
  }, 10_000);
}

function advanceStartupSynchronization(): void {
  if (startupPhase !== "syncing" || controlFailed || failed || disposed
    || pendingLocaleAck || resizeInFlight) return;
  if (appliedLocale !== currentLocale) {
    const locale = currentLocale;
    if (!sendControl({ op: "setLocale", locale })) return;
    const pending = { locale };
    pendingLocaleAck = pending;
    localeTimer = setTimeout(() => {
      if (pendingLocaleAck === pending) failControl("Guest locale acknowledgement timed out");
    }, 10_000);
    return;
  }
  const dimensions = { cols: currentColumns, rows: currentRows };
  if (!matchesDimensions(appliedDimensions, dimensions)) {
    sendResize(dimensions);
    return;
  }
  startupPhase = "ready";
  signalControlReadyWhenSized();
}

function sendDesiredResize(): void {
  if (!guestReady || controlFailed) return;
  if (startupPhase === "await-initial-locale-ack" || startupPhase === "await-ready") return;
  if (startupPhase === "syncing") {
    advanceStartupSynchronization();
    return;
  }
  if (resizeInFlight || matchesDimensions(appliedDimensions, { cols: currentColumns, rows: currentRows })) {
    signalControlReadyWhenSized();
    return;
  }
  sendResize({ cols: currentColumns, rows: currentRows });
}

function handleControlFrame(frame: GuestControlFrame, sequence: number | null) {
  if (frame.op === "bootstrap") {
    if (sequence !== null || sessionId !== null || startupPhase !== "await-bootstrap") {
      failControl("Guest bootstrap is not the first control frame");
      return;
    }
    if (frame.guestBuildId !== guestBuildId) {
      failControl("Guest bootstrap identity does not match the pinned build");
      return;
    }
    const adoptedSessionId = createSessionId();
    try {
      controlDecoder?.adoptSession(adoptedSessionId);
    } catch (error) {
      failControl(error instanceof Error ? error.message : "Guest control session could not be adopted");
      return;
    }
    sessionId = adoptedSessionId;
    hostSequence = 0;
    helloDimensions = { cols: currentColumns, rows: currentRows };
    appliedDimensions = null;
    appliedLocale = null;
    resizeInFlight = null;
    controlReadySent = false;
    pendingLocaleAck = null;
    startupPhase = "await-ready";
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = null;
    if (localeTimer !== null) clearTimeout(localeTimer);
    localeTimer = null;
    sendControl({ op: "hello", ...helloDimensions });
    return;
  }
  if (sequence === null) {
    failControl("Guest session frame arrived before session adoption");
    return;
  }
  if (startupPhase === "await-ready") {
    if (frame.op !== "ready" || sequence !== 1 || !helloDimensions
      || frame.guestBuildId !== guestBuildId || frame.cols !== helloDimensions.cols || frame.rows !== helloDimensions.rows) {
      failControl("Guest ready must be sequence one and match the pinned identity and hello dimensions");
      return;
    }
    guestReady = true;
    appliedDimensions = helloDimensions;
    startupPhase = "await-initial-locale-ack";
    const locale = currentLocale;
    const pending = { locale };
    pendingLocaleAck = pending;
    if (!sendControl({ op: "setLocale", locale })) {
      pendingLocaleAck = null;
      return;
    }
    localeTimer = setTimeout(() => {
      if (pendingLocaleAck === pending) failControl("Initial guest locale acknowledgement timed out");
    }, 10_000);
    return;
  }
  if (startupPhase === "await-initial-locale-ack") {
    const pending = pendingLocaleAck;
    if (sequence !== 2 || frame.op !== "localeAck" || !pending || frame.locale !== pending.locale) {
      failControl("Guest locale acknowledgement must be the matching sequence-two response");
      return;
    }
    if (localeTimer !== null) clearTimeout(localeTimer);
    localeTimer = null;
    appliedLocale = pending.locale;
    pendingLocaleAck = null;
    startupPhase = "syncing";
    advanceStartupSynchronization();
    return;
  }
  if (startupPhase === "syncing" && frame.op === "localeAck") {
    const pending = pendingLocaleAck;
    if (!pending || frame.locale !== pending.locale) {
      failControl("Guest sent an unexpected or mismatched locale acknowledgement during startup");
      return;
    }
    if (localeTimer !== null) clearTimeout(localeTimer);
    localeTimer = null;
    appliedLocale = pending.locale;
    pendingLocaleAck = null;
    advanceStartupSynchronization();
    return;
  }
  if (startupPhase === "syncing" && pendingLocaleAck
    && frame.op !== "shellReady" && frame.op !== "shellState") {
    failControl("Guest sent an unexpected frame while the startup locale acknowledgement was pending");
    return;
  }
  if (frame.op === "ready") {
    failControl("Guest sent a duplicate ready frame");
  } else if (frame.op === "resizeAck") {
    if (!resizeInFlight || frame.cols !== resizeInFlight.cols || frame.rows !== resizeInFlight.rows) {
      failControl("Guest resize acknowledgement does not match the in-flight resize");
      return;
    }
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = null;
    appliedDimensions = resizeInFlight;
    resizeInFlight = null;
    if (startupPhase === "syncing") advanceStartupSynchronization();
    else sendDesiredResize();
  } else if (frame.op === "shellReady") {
    if (!guestReady || shellReady || frame.guestBuildId !== guestBuildId) {
      failControl("Guest shell startup identity is invalid");
      return;
    }
    shellReady = true;
    signalShellReadyWhenSized();
  } else if (frame.op === "shellState") {
    send({ type: "shell-state", state: frame.state });
  } else if (frame.op === "inputFenceAck") {
    if (frame.fenceId < latestFenceId) return;
    if (!currentFence || frame.fenceId !== currentFence.fenceId || frame.inputBytes !== currentFence.inputBytes) {
      failControl("Guest input fence acknowledgement is stale or mismatched");
      return;
    }
    currentFence = null;
    send({ type: "input-fence-ack", fenceId: frame.fenceId, inputBytes: frame.inputBytes, state: frame.state });
  } else if (frame.op === "portfolioAction") {
    if (startupPhase !== "ready" || !controlReadySent) {
      failControl("Guest portfolio action arrived before startup completed");
      return;
    }
    send({
      type: "portfolio-action",
      guestSeq: sequence,
      requestId: frame.requestId,
      action: frame.action,
      linkId: frame.linkId,
    });
  } else if (frame.op === "ack") {
    if (!matchesDispatchAck(frame, pendingDispatchAck)) {
      failControl("Guest action acknowledgement does not match an outstanding dispatch");
      return;
    }
    pendingDispatchAck = null;
  } else if (frame.op === "localeAck") {
    failControl("Guest sent a duplicate or unexpected locale acknowledgement");
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
  const instance = new V86({ ...options, autostart: false, fastboot: true });
  emulator = instance;
  controlDecoder = new Com2Decoder();
  instance.add_listener("download-progress", ({ loaded, total }) => send({ type: "progress", loaded, total }));
  instance.add_listener("download-error", () => fail("A pinned guest asset could not be loaded"));
  instance.add_listener("emulator-ready", () => {
    if (disposed || failed) return;
    void instance.run().catch(() => fail("Unable to start the guest"));
  });
  instance.add_listener("serial0-output-byte", queueOutput);
  instance.add_listener("serial1-output-byte", queueControlOutput);
  return instance;
}

async function start(manifestUrl: string) {
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
    if (Number.isFinite(contentLength) && contentLength > MAX_MANIFEST_BYTES) throw new Error("Guest manifest exceeds the size limit");
    const manifestText = await response.text();
    if (manifestText.length > MAX_MANIFEST_BYTES) throw new Error("Guest manifest exceeds the size limit");
    const value: unknown = JSON.parse(manifestText);
    if (!isGuestManifest(value)) throw new Error("Guest manifest is invalid or not the pinned v86 release");
    if (disposed) return;
    const base = new URL("./", response.url);
    const paths = value.emulator.assetPaths;
    const guest = value.guest;
    await fetchVerifiedAsset(base, guest.buildIdentityPath, value.assets[guest.buildIdentityPath]);
    const [bios, vgaBios, kernel, initrd] = await Promise.all([
      fetchVerifiedAsset(base, paths.bios, value.assets[paths.bios]),
      fetchVerifiedAsset(base, paths.vgaBios, value.assets[paths.vgaBios]),
      fetchVerifiedAsset(base, guest.assetPaths.kernel, value.assets[guest.assetPaths.kernel]),
      fetchVerifiedAsset(base, guest.assetPaths.initrd, value.assets[guest.assetPaths.initrd]),
    ]);
    if (disposed) return;
    guestBuildId = guest.buildId;
    manifestAssets = new Map(Object.entries(value.assets));
    installAssetIntegrityXHR(base, manifestAssets);
    const wasmFn: NonNullable<V86Options["wasm_fn"]> = async (imports) => {
      const primary = await fetchVerifiedAsset(base, paths.wasm, value.assets[paths.wasm], true);
      try {
        return (await WebAssembly.instantiate(primary, imports)).instance.exports;
      } catch (primaryError) {
        const fallback = await fetchVerifiedAsset(base, paths.fallbackWasm, value.assets[paths.fallbackWasm], true);
        try {
          const result = await WebAssembly.instantiate(fallback, imports);
          send({ type: "fallback-wasm" });
          return result.instance.exports;
        } catch (fallbackError) {
          const primaryMessage = primaryError instanceof Error ? primaryError.message : "unknown primary WASM error";
          const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : "unknown fallback WASM error";
          throw new Error(`Pinned primary and fallback WASM failed: ${primaryMessage}; ${fallbackMessage}`);
        }
      }
    };
    const options: V86Options = {
      wasm_fn: wasmFn,
      bios: { buffer: bios },
      vga_bios: { buffer: vgaBios },
      bzimage: { buffer: kernel },
      initrd: { buffer: initrd },
      filesystem: {
        basefs: assetPath(base, guest.assetPaths.filesystemJson),
        baseurl: assetPath(base, guest.assetPaths.filesystemBlobs, true),
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
      currentColumns = request.cols;
      currentRows = request.rows;
      currentLocale = request.locale;
      startRequested = true;
      void start(manifestUrl.href);
    } catch {
      fail("Guest manifest URL is invalid");
    }
  } else if (request.type === "input") {
    if (!(request.bytes instanceof Uint8Array) || !emulator || !controlReadySent) {
      failControl("Guest serial input arrived before the control daemon and initial state were ready");
      return;
    }
    if (request.bytes.byteLength === 0) return;
    try {
      emulator.serial_send_bytes(0, request.bytes);
      latestInputBytes += request.bytes.byteLength;
      if (!Number.isSafeInteger(latestInputBytes) || latestInputBytes > MAX_CONTROL_SEQUENCE) {
        failControl("Guest input byte count exceeded the control protocol limit");
        return;
      }
      if (latestFenceId >= MAX_CONTROL_SEQUENCE) {
        failControl("Guest input fence sequence limit reached");
        return;
      }
      const fence = { fenceId: ++latestFenceId, inputBytes: latestInputBytes };
      currentFence = fence;
      sendControl({ op: "inputFence", ...fence });
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
    sendDesiredResize();
  } else if (request.type === "set-language") {
    if (request.locale !== "en" && request.locale !== "ru") {
      fail("Guest locale is invalid");
      return;
    }
    currentLocale = request.locale;
    if (startupPhase === "syncing") advanceStartupSynchronization();
    else if (startupPhase === "ready" && guestReady) sendControl({ op: "setLocale", locale: currentLocale });
  } else if (request.type === "dispatch-action") {
    failControl("Host quick actions remain disabled until genuine guest consumption and execution proof is available");
  } else if (request.type === "portfolio-ack") {
    if (!Number.isInteger(request.ackSeq) || request.ackSeq < 1 || request.ackSeq > MAX_CONTROL_SEQUENCE
      || (request.status !== "queued" && request.status !== "rejected")) {
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
  pendingDispatchAck = null;
  if (resizeTimer !== null) clearTimeout(resizeTimer);
  resizeTimer = null;
  if (localeTimer !== null) clearTimeout(localeTimer);
  localeTimer = null;
  disposalPromise = (async () => {
    const current = emulator;
    emulator = null;
    if (current) await current.destroy().catch(() => undefined);
    outputBuffer = new Uint8Array(0);
    outputLength = 0;
    controlDecoder = null;
    manifestAssets.clear();
    send({ type: "disposed" });
  })();
  return disposalPromise;
}

scope.addEventListener("unhandledrejection", (event) => {
  fail(event.reason instanceof Error ? event.reason.message : "The guest emulator failed");
});
scope.addEventListener("message", ({ data }) => handleRequest(data));
