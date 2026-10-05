import assert from "node:assert/strict";

import { V86TerminalSession, type V86TerminalSessionOptions, type V86WorkerRequest, type V86WorkerResponse } from "../v86Session";

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  static active = 0;
  static maximumActive = 0;

  readonly messages: V86WorkerRequest[] = [];
  autoAcknowledgeDispose = true;
  terminated = false;

  constructor() {
    super();
    FakeWorker.instances.push(this);
    FakeWorker.active += 1;
    FakeWorker.maximumActive = Math.max(FakeWorker.maximumActive, FakeWorker.active);
  }

  postMessage(message: V86WorkerRequest): void {
    this.messages.push(message);
    if (message.type === "dispose" && this.autoAcknowledgeDispose) {
      this.emit({ type: "progress", loaded: 10, total: 20 });
      this.emit({ type: "output", bytes: new Uint8Array([65]) });
      queueMicrotask(() => this.emit({ type: "disposed" }));
    }
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    FakeWorker.active -= 1;
  }

  emit(data: V86WorkerResponse): void {
    this.dispatchEvent(new MessageEvent<V86WorkerResponse>("message", { data }));
  }
}

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    location: { href: "https://example.test/en" },
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  },
});
Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker });

function createSession(overrides: Partial<V86TerminalSessionOptions> = {}) {
  return new V86TerminalSession({ columns: 80, rows: 24, language: "en", ...overrides });
}

const outputs: Uint8Array[] = [];
let progressAfterDispose = 0;
let openCvCalls = 0;
let copyContactCalls = 0;
let shellStates: string[] = [];
let portfolioRequests = 0;
const session = createSession({
  onOutput: (output) => {
    if (output instanceof Uint8Array) outputs.push(output);
  },
  onProgress: () => { progressAfterDispose += 1; },
  onOpenCv: () => { openCvCalls += 1; return true; },
  onCopyContact: () => { copyContactCalls += 1; return true; },
  onShellStateChange: (state) => { shellStates.push(state); },
  onPortfolioActionRequest: () => { portfolioRequests += 1; return true; },
});
await session.start();
const firstWorker = FakeWorker.instances.at(-1)!;
firstWorker.emit({ type: "control-ready" });
assert.equal(session.getState().status, "busy");
session.input.sendBytes(new Uint8Array([0x41]));
assert.deepEqual(firstWorker.messages.filter((message) => message.type === "input"), [
  { type: "input", bytes: new Uint8Array([0x41]) },
]);
firstWorker.emit({ type: "shell-ready" });
assert.equal(session.getState().status, "ready");
assert.equal(session.runVisitorCommand("links"), false);
firstWorker.emit({ type: "shell-state", state: "cleanPrompt" });
assert.equal(session.runVisitorCommand("links"), false, "advisory shell state never authorizes quick actions");
firstWorker.emit({ type: "input-fence-ack", fenceId: 1, inputBytes: 1, state: "cleanPrompt" });
assert.equal(session.runVisitorCommand("links"), false, "even an input fence ACK cannot dispatch without genuine execution proof");
session.input.sendBytes(new Uint8Array([0x03]));
assert.equal(firstWorker.messages.filter((message) => message.type === "input").length, 2);
assert.equal(shellStates.at(-1), "unknown");
assert.deepEqual(firstWorker.messages.filter((message) => message.type === "dispatch-action"), []);
assert.equal(session.runVisitorCommand("open cv.txt"), true);
assert.equal(session.runVisitorCommand("copy-contact"), true);
assert.equal(openCvCalls, 1);
assert.equal(copyContactCalls, 1);
assert.equal(session.runVisitorCommand("toString" as never), false, "unknown runtime visitor commands are rejected");

firstWorker.emit({ type: "portfolio-action", guestSeq: 7, requestId: 1, action: "open", linkId: "quick-cv" });
firstWorker.emit({ type: "portfolio-action", guestSeq: 8, requestId: 1, action: "open", linkId: "quick-cv" });
assert.equal(portfolioRequests, 1, "a guest request ID is accepted once");
assert.deepEqual(firstWorker.messages.filter((message) => message.type === "portfolio-ack").slice(-2), [
  { type: "portfolio-ack", ackSeq: 7, status: "queued" },
  { type: "portfolio-ack", ackSeq: 8, status: "rejected" },
]);

session.dispose();
await session.whenDisposed();
firstWorker.emit({ type: "portfolio-action", guestSeq: 9, requestId: 2, action: "open", linkId: "quick-cv" });
assert.equal(portfolioRequests, 1, "retained Worker messages cannot invoke callbacks after disposal");
firstWorker.emit({ type: "progress", loaded: 20, total: 20 });
firstWorker.emit({ type: "output", bytes: new Uint8Array([66]) });
assert.equal(firstWorker.terminated, true);
assert.equal(progressAfterDispose, 0);
assert.deepEqual(outputs, []);

assert.equal(session.runVisitorCommand("open cv.txt"), false, "a retained native callback cannot run after disposal");
assert.equal(session.runVisitorCommand("copy-contact"), false, "retained copy callbacks cannot run after disposal");
assert.equal(openCvCalls, 1);
assert.equal(copyContactCalls, 1);

let pendingConfirmation = false;
let revokedMessage = "";
let allowCalls = 0;
const controlLossSession = createSession({
  onPortfolioActionRequest: () => { pendingConfirmation = true; return true; },
  onControlRevoked: (message) => {
    pendingConfirmation = false;
    revokedMessage = message;
  },
});
await controlLossSession.start();
const controlLossWorker = FakeWorker.instances.at(-1)!;
controlLossWorker.emit({ type: "control-ready" });
controlLossWorker.emit({ type: "shell-ready" });
controlLossWorker.emit({ type: "portfolio-action", guestSeq: 7, requestId: 1, action: "open", linkId: "quick-cv" });
assert.equal(pendingConfirmation, true, "a valid guest request queues host confirmation");
controlLossWorker.emit({ type: "control-error", message: "stale COM2 sequence" });
assert.equal(pendingConfirmation, false, "COM2 loss synchronously revokes pending confirmation");
assert.equal(revokedMessage, "stale COM2 sequence");
if (pendingConfirmation) allowCalls += 1;
assert.equal(allowCalls, 0, "Allow cannot execute a request after a stale/malformed control frame");
assert.equal(controlLossSession.getState().status, "ready", "COM2 loss does not disable raw guest input");
controlLossSession.input.sendBytes(new Uint8Array([0x03]));
assert.deepEqual(controlLossWorker.messages.filter((message) => message.type === "input").map((message) => message.type === "input" ? message.bytes[0] : -1), [0x03]);
controlLossSession.dispose();
await controlLossSession.whenDisposed();
const waitingSession = createSession({ onProgress: () => { progressAfterDispose += 1; } });
await waitingSession.start();
const waitingWorker = FakeWorker.instances.at(-1)!;
waitingWorker.autoAcknowledgeDispose = false;
waitingSession.dispose();
let waitingReleased = false;
void waitingSession.whenDisposed().then(() => { waitingReleased = true; });
const nextSession = createSession();
const nextStart = nextSession.start();
await Promise.resolve();
assert.equal(FakeWorker.instances.length, 3, "the next v86 Worker waits for the active Worker to acknowledge teardown");
for (let index = 0; index < 1000; index += 1) {
  waitingWorker.emit({ type: "progress", loaded: index, total: 1000 });
}
assert.equal(progressAfterDispose, 0, "queued progress cannot call subscribers after disposal starts");
assert.equal(waitingReleased, false, "non-ACK messages do not resolve disposal");
waitingWorker.emit({ type: "disposed" });
await Promise.all([waitingSession.whenDisposed(), nextStart]);
assert.equal(waitingWorker.terminated, true);
assert.equal(FakeWorker.instances.length, 4);
assert.equal(FakeWorker.active, 1);
assert.equal(FakeWorker.maximumActive, 1, "only one v86 Worker may own emulator resources at a time");
const nextWorker = FakeWorker.instances.at(-1)!;
nextSession.dispose();
await nextSession.whenDisposed();
assert.equal(nextWorker.terminated, true);
assert.equal(FakeWorker.active, 0);

let openAfterCrash = 0;
const crashedSession = createSession({ onOpenCv: () => { openAfterCrash += 1; return true; } });
await crashedSession.start();
const crashedWorker = FakeWorker.instances.at(-1)!;
crashedWorker.dispatchEvent(Object.assign(new Event("error"), { message: "fake worker crashed" }));
await crashedSession.whenDisposed();
assert.equal(crashedSession.getState().status, "failed");
assert.equal(crashedSession.runVisitorCommand("open cv.txt"), false, "failed sessions cannot invoke retained native callbacks");
assert.equal(openAfterCrash, 0);
assert.equal(crashedWorker.terminated, true, "a crashed Worker releases the single-emulator slot");
assert.equal(FakeWorker.active, 0);

const stuckSession = createSession();
await stuckSession.start();
const stuckWorker = FakeWorker.instances.at(-1)!;
stuckWorker.autoAcknowledgeDispose = false;
stuckSession.dispose();
await stuckSession.whenDisposed();
assert.equal(stuckWorker.terminated, true, "a missing disposal ACK is bounded by forced Worker termination");
assert.equal(FakeWorker.active, 0);

console.log("v86 session lifecycle tests passed");
