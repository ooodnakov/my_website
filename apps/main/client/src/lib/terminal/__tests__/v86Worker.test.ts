import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const RELEASE = "alpine-3.24.2-v86-0.5.469";
const MANIFEST_URL = `https://example.test/browser-os/${RELEASE}/manifest.json`;
const RELEASE_BASE_URL = new URL("./", MANIFEST_URL).href;
const WASM_BYTES = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sourcePath = fileURLToPath(new URL("../v86.worker.ts", import.meta.url));
const protocolPath = fileURLToPath(new URL("../com2Protocol.ts", import.meta.url));
const transpile = (source: string) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const protocolExports: Record<string, unknown> = { exports: {} };
vm.runInNewContext(transpile(readFileSync(protocolPath, "utf8")), {
  exports: protocolExports.exports,
  module: protocolExports,
  require: () => { throw new Error("COM2 protocol has no runtime imports"); },
  TextDecoder,
  TextEncoder,
  Uint8Array,
  ArrayBuffer,
  Object,
  Map,
  Set,
  Number,
  String,
  JSON,
  Error,
  RegExp,
  Math,
});

interface FakeAssetResponse {
  ok: boolean;
  status: number;
  url: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

class FakeV86 {
  static instances: FakeV86[] = [];
  readonly options: Record<string, unknown>;
  readonly sentControlFrames: Uint8Array[] = [];
  private listeners = new Map<string, (value: never) => void>();

  constructor(options: Record<string, unknown>) {
    this.options = options;
    FakeV86.instances.push(this);
  }

  add_listener(name: string, listener: (value: never) => void): void {
    this.listeners.set(name, listener);
  }

  serial_send_bytes(port: number, bytes: Uint8Array): void {
    if (port === 1) this.sentControlFrames.push(new Uint8Array(bytes));
  }

  trigger(name: string, value: never): void {
    this.listeners.get(name)?.(value);
  }

  async destroy(): Promise<void> {}
}

class FakeXMLHttpRequest {
  private _responseType: XMLHttpRequestResponseType = "";
  private _response: unknown = null;
  private _responseURL = "";
  private nativeOnload: XMLHttpRequestEventHandler | null = null;
  private url = "";

  get responseType(): XMLHttpRequestResponseType { return this._responseType; }
  set responseType(value: XMLHttpRequestResponseType) { this._responseType = value; }
  get response(): unknown { return this._response; }
  get responseURL(): string { return this._responseURL; }
  get onload(): XMLHttpRequestEventHandler | null { return this.nativeOnload; }
  set onload(handler: XMLHttpRequestEventHandler | null) { this.nativeOnload = handler; }

  open(_method: string, url: string | URL): void { this.url = url.toString(); }

  send(): void {
    void (async () => {
      const response = await activeFetch(this.url);
      this._responseURL = response.url;
      const bytes = await response.arrayBuffer();
      this._response = this._responseType === "arraybuffer"
        ? bytes
        : this._responseType === "json"
          ? JSON.parse(new TextDecoder().decode(bytes)) as unknown
          : new TextDecoder().decode(bytes);
      this.nativeOnload?.call(this, { type: "load" } as ProgressEvent);
    })();
  }
}

let activeFetch: (url: string) => Promise<FakeAssetResponse> = async () => {
  throw new Error("test fetch not configured");
};

function responseFor(url: string, bytes: Uint8Array, contentType = "application/octet-stream"): FakeAssetResponse {
  const copy = new Uint8Array(bytes);
  return {
    ok: true,
    status: 200,
    url,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
    text: async () => new TextDecoder().decode(copy),
    arrayBuffer: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as ArrayBuffer,
  };
}

function makeAssets(overrides: Record<string, Uint8Array> = {}): Record<string, Uint8Array> {
  return {
    "alpine/vmlinuz": new Uint8Array([1, 2, 3]),
    "alpine/initramfs": new Uint8Array([4, 5, 6]),
    "alpine/9p/fs.json": new TextEncoder().encode('{"version":1}'),
    "alpine/9p/blob/root.bin": new Uint8Array([7, 8, 9]),
    "v86/seabios.bin": new Uint8Array([10, 11]),
    "v86/vgabios.bin": new Uint8Array([12, 13]),
    "v86/v86.wasm": WASM_BYTES,
    "v86/v86-fallback.wasm": WASM_BYTES,
    ...overrides,
  };
}

function guestFrame(sessionId: string, seq: number, fields: Record<string, unknown>): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify({ v: 1, sessionId, seq, ...fields }));
  const result = new Uint8Array(payload.byteLength + 6);
  result.set([0x42, 0x4f, 0x53, 0x31, payload.byteLength >>> 8, payload.byteLength & 0xff]);
  result.set(payload, 6);
  return result;
}

function framePayload(bytes: Uint8Array): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(bytes.subarray(6))) as Record<string, unknown>;
}

function createHarness(options: {
  assets?: Record<string, Uint8Array>;
  omit?: string[];
  pauseAsset?: string;
  corruptResponses?: Record<string, Uint8Array>;
} = {}) {
  FakeV86.instances = [];
  const files = makeAssets(options.assets);
  const manifestAssets = Object.fromEntries(Object.entries(files)
    .filter(([name]) => !options.omit?.includes(name))
    .map(([name, bytes]) => [name, { bytes: bytes.byteLength, sha256: sha256(bytes) }]));
  const manifest = {
    schemaVersion: 1,
    release: RELEASE,
    assets: manifestAssets,
    guest: {
      memoryBytes: 128 * 1024 * 1024,
      kernelCommandLine: "console=ttyS0,115200n8 root=host9p rootfstype=9p rootflags=trans=virtio,version=9p2000.L rw modules=virtio_pci",
      assetPaths: {
        kernel: "alpine/vmlinuz",
        initrd: "alpine/initramfs",
        filesystemJson: "alpine/9p/fs.json",
        filesystemBlobs: "alpine/9p/blob/",
      },
    },
    emulator: {
      version: "0.5.469",
      assetPaths: {
        bios: "v86/seabios.bin",
        vgaBios: "v86/vgabios.bin",
        wasm: "v86/v86.wasm",
        fallbackWasm: "v86/v86-fallback.wasm",
      },
    },
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const fetchLog: string[] = [];
  const messages: Array<Record<string, unknown>> = [];
  let releasePause: () => void = () => {};
  let markPauseStarted: () => void = () => {};
  const pauseStarted = new Promise<void>((resolve) => { markPauseStarted = resolve; });
  const pauseGate = new Promise<void>((resolve) => { releasePause = resolve; });
  activeFetch = async (urlValue) => {
    const url = new URL(urlValue, MANIFEST_URL);
    fetchLog.push(url.href);
    if (url.href === MANIFEST_URL) return responseFor(url.href, manifestBytes, "application/json");
    const name = url.pathname.slice(new URL("./", MANIFEST_URL).pathname.length);
    if (name === options.pauseAsset) {
      markPauseStarted();
      await pauseGate;
    }
    const bytes = options.corruptResponses?.[name] ?? files[name];
    if (!bytes) return {
      ok: false,
      status: 404,
      url: url.href,
      headers: { get: () => null },
      text: async () => "missing",
      arrayBuffer: async () => new ArrayBuffer(0),
    };
    const type = name.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
    return responseFor(url.href, bytes, type);
  };

  const workerListeners = new Map<string, (event: never) => void>();
  const moduleObject: { exports: Record<string, unknown> } = { exports: {} };
  const workerSource = transpile(readFileSync(sourcePath, "utf8"));
  const context = vm.createContext({
    exports: moduleObject.exports,
    module: moduleObject,
    require: (id: string) => {
      if (id === "v86") return { V86: FakeV86 };
      if (id === "./com2Protocol") return moduleObjectProtocol;
      throw new Error(`Unexpected worker import: ${id}`);
    },
    postMessage: (message: Record<string, unknown>) => messages.push(message),
    addEventListener: (type: string, listener: (event: never) => void) => workerListeners.set(type, listener),
    fetch: async (url: string, _init?: unknown) => activeFetch(url),
    location: new URL(MANIFEST_URL),
    XMLHttpRequest: FakeXMLHttpRequest,
    crypto: webcrypto,
    URL,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    ArrayBuffer,
    Object,
    Map,
    Set,
    Number,
    String,
    JSON,
    Error,
    RegExp,
    Math,
    Promise,
    WebAssembly,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    console,
  });
  vm.runInContext(workerSource, context, { filename: sourcePath });
  const message = workerListeners.get("message");
  assert.ok(message);
  const post = (data: Record<string, unknown>) => message({ data } as never);
  const waitFor = async (predicate: () => boolean) => {
    for (let attempt = 0; attempt < 40 && !predicate(); attempt += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    assert.ok(predicate(), "worker did not reach the expected state");
  };
  const requestStart = () => post({ type: "start", manifestUrl: MANIFEST_URL, cols: 80, rows: 24, locale: "en" });
  const start = async () => {
    requestStart();
    await waitFor(() => FakeV86.instances.length > 0 || messages.some((entry) => entry.type === "error"));
  };
  const injectGuestBytes = (bytes: Uint8Array) => {
    const instance = FakeV86.instances[0];
    assert.ok(instance);
    for (const byte of bytes) instance.trigger("serial1-output-byte", byte as never);
  };
  const injectGuestFrame = (sessionId: string, seq: number, fields: Record<string, unknown>) => {
    injectGuestBytes(guestFrame(sessionId, seq, fields));
  };
  const dispose = () => post({ type: "dispose" });
  return {
    files, manifest, manifestAssets, fetchLog, messages, post, start, requestStart, waitFor, injectGuestBytes, injectGuestFrame, dispose,
    pauseStarted, releasePause,
    newXMLHttpRequest: () => vm.runInContext("new XMLHttpRequest()", context),
  };
}

const moduleObjectProtocol = protocolExports.exports as Record<string, unknown>;

{
  const harness = createHarness();
  await harness.start();
  const emulator = FakeV86.instances[0];
  assert.ok(emulator, JSON.stringify(harness.messages));
  emulator.trigger("emulator-ready", undefined as never);
  const hello = framePayload(emulator.sentControlFrames[0]!);
  assert.equal(hello.op, "hello");
  assert.deepEqual({ cols: hello.cols, rows: hello.rows }, { cols: 80, rows: 24 });

  harness.post({ type: "resize", cols: 100, rows: 30 });
  harness.injectGuestFrame(String(hello.sessionId), 1, {
    op: "ready",
    guestBuildId: harness.manifestAssets["alpine/9p/fs.json"].sha256,
    cols: 80,
    rows: 24,
  });
  let controlOps = emulator.sentControlFrames.map(framePayload).map((frame) => frame.op);
  assert.deepEqual(controlOps, ["hello", "setLocale", "resize"]);
  assert.equal(harness.messages.some((entry) => entry.type === "control-ready"), false);

  harness.post({ type: "resize", cols: 120, rows: 40 });
  harness.injectGuestFrame(String(hello.sessionId), 2, { op: "resizeAck", cols: 100, rows: 30 });
  controlOps = emulator.sentControlFrames.map(framePayload).map((frame) => frame.op);
  assert.deepEqual(controlOps, ["hello", "setLocale", "resize", "resize"]);
  assert.deepEqual(
    { cols: framePayload(emulator.sentControlFrames[3]!).cols, rows: framePayload(emulator.sentControlFrames[3]!).rows },
    { cols: 120, rows: 40 },
  );
  assert.equal(harness.messages.some((entry) => entry.type === "control-ready"), false);
  harness.injectGuestFrame(String(hello.sessionId), 3, { op: "resizeAck", cols: 120, rows: 40 });
  assert.equal(harness.messages.filter((entry) => entry.type === "control-ready").length, 1);
  harness.dispose();
}

{
  const harness = createHarness({ pauseAsset: "alpine/vmlinuz" });
  harness.requestStart();
  await harness.pauseStarted;
  harness.post({ type: "resize", cols: 100, rows: 30 });
  harness.releasePause();
  await harness.waitFor(() => FakeV86.instances.length > 0 || harness.messages.some((entry) => entry.type === "error"));
  const emulator = FakeV86.instances[0];
  assert.ok(emulator, JSON.stringify(harness.messages));
  emulator.trigger("emulator-ready", undefined as never);
  const hello = framePayload(emulator.sentControlFrames[0]!);
  assert.deepEqual({ cols: hello.cols, rows: hello.rows }, { cols: 100, rows: 30 },
    "a resize during initial asset loading must survive until the guest hello");
  harness.injectGuestFrame(String(hello.sessionId), 1, {
    op: "ready",
    guestBuildId: harness.manifestAssets["alpine/9p/fs.json"].sha256,
    cols: 100,
    rows: 30,
  });
  assert.equal(harness.messages.filter((entry) => entry.type === "control-ready").length, 1);
  harness.dispose();
}

{
  const harness = createHarness({ omit: ["v86/v86-fallback.wasm"] });
  await harness.start();
  assert.equal(FakeV86.instances.length, 0, "an incomplete asset inventory must fail before emulator construction");
  assert.equal(harness.messages.some((entry) => entry.type === "error"), true);
}

{
  const harness = createHarness({ corruptResponses: { "alpine/vmlinuz": new Uint8Array([9, 9, 9]) } });
  await harness.start();
  assert.equal(FakeV86.instances.length, 0, "a mismatched kernel must not reach the emulator");
  assert.equal(harness.messages.some((entry) => entry.type === "error"), true);
}

{
  const malformedPrimary = new Uint8Array([0xff, 0x00, 0x01]);
  const harness = createHarness({ assets: { "v86/v86.wasm": malformedPrimary } });
  await harness.start();
  assert.equal(harness.fetchLog.some((url) => url.endsWith(".wasm")), false, "WASM remains lazy until v86 calls wasm_fn");
  const options = FakeV86.instances[0]!.options;
  const wasmFn = options.wasm_fn as (imports: WebAssembly.Imports) => Promise<WebAssembly.Exports>;
  const exports = await wasmFn({});
  assert.ok(exports);
  assert.equal(harness.fetchLog.some((url) => url.endsWith("/v86/v86-fallback.wasm")), true);
  assert.equal(harness.messages.some((entry) => entry.type === "fallback-wasm"), true);
  harness.dispose();
}

{
  const harness = createHarness({ corruptResponses: { "v86/v86.wasm": new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) } });
  await harness.start();
  const wasmFn = FakeV86.instances[0]!.options.wasm_fn as (imports: WebAssembly.Imports) => Promise<WebAssembly.Exports>;
  await assert.rejects(wasmFn({}), /digest mismatch/);
  assert.equal(harness.fetchLog.some((url) => url.endsWith("/v86/v86-fallback.wasm")), false,
    "a primary integrity failure must not be reclassified as a recoverable module compile failure");
  harness.dispose();
}

{
  const malformedPrimary = new Uint8Array([0xff, 0x00, 0x01]);
  const harness = createHarness({
    assets: { "v86/v86.wasm": malformedPrimary },
    corruptResponses: { "v86/v86-fallback.wasm": new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]) },
  });
  await harness.start();
  const wasmFn = FakeV86.instances[0]!.options.wasm_fn as (imports: WebAssembly.Imports) => Promise<WebAssembly.Exports>;
  await assert.rejects(wasmFn({}), /digest mismatch/);
  harness.dispose();
}
{
  const harness = createHarness();
  await harness.start();
  const filesystemXhr = harness.newXMLHttpRequest() as XMLHttpRequest;
  const fsLoaded = new Promise<void>((resolve) => { filesystemXhr.onload = () => resolve(); });
  filesystemXhr.open("GET", new URL("alpine/9p/fs.json", RELEASE_BASE_URL).href);
  filesystemXhr.responseType = "json";
  filesystemXhr.send();
  await fsLoaded;
  assert.deepEqual(filesystemXhr.response, { version: 1 }, "the pinned filesystem index is parsed only after its raw bytes verify");

  const blobXhr = harness.newXMLHttpRequest() as XMLHttpRequest;
  const blobLoaded = new Promise<void>((resolve) => { blobXhr.onload = () => resolve(); });
  blobXhr.open("GET", new URL("alpine/9p/blob/root.bin", RELEASE_BASE_URL).href);
  blobXhr.responseType = "arraybuffer";
  blobXhr.send();
  await blobLoaded;
  assert.deepEqual(Array.from(new Uint8Array(blobXhr.response as ArrayBuffer)), [7, 8, 9]);
  harness.dispose();
}

{
  const harness = createHarness({ corruptResponses: { "alpine/9p/blob/root.bin": new Uint8Array([9, 8, 7]) } });
  await harness.start();
  const blobXhr = harness.newXMLHttpRequest() as XMLHttpRequest;
  let loaded = false;
  blobXhr.onload = () => { loaded = true; };
  blobXhr.open("GET", new URL("alpine/9p/blob/root.bin", RELEASE_BASE_URL).href);
  blobXhr.responseType = "arraybuffer";
  blobXhr.send();
  await harness.waitFor(() => harness.messages.some((entry) => entry.type === "error"));
  assert.equal(loaded, false, "v86 must not receive a corrupt 9p blob");
  harness.dispose();
}

console.log("v86 worker integrity, WASM fallback, and resize transport tests passed");
