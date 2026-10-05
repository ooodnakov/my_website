const MAGIC = [0x42, 0x4f, 0x53, 0x31] as const;
const HEADER_BYTES = 6;
const MAX_PAYLOAD_BYTES = 4096;
export const MAX_CONTROL_SEQUENCE = 0x7fffffff;
const MAX_SEQUENCE = MAX_CONTROL_SEQUENCE;
const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/;
const BUILD_ID_PATTERN = /^[0-9a-f]{64}$/;

export const PORTFOLIO_LINK_IDS = [
  "quick-cv",
  "quick-pdf-en",
  "quick-pdf-ru",
  "quick-archive",
  "quick-vcard",
  "quick-mail",
  "social-discord",
  "social-reddit",
  "social-x",
  "social-twitch",
  "social-yt",
  "social-ig",
  "social-tg",
  "social-mastodon",
  "social-li",
  "social-gh",
  "social-tt",
  "project-cover-doc",
  "project-myspace-exp",
  "project-lemma",
  "project-articles",
  "archive-projects",
  "archive-events",
  "archive-gallery",
  "archive-video",
] as const;
export type PortfolioLinkId = typeof PORTFOLIO_LINK_IDS[number];
const portfolioLinkIdSet = new Set<string>(PORTFOLIO_LINK_IDS);

export type ShellState = "cleanPrompt" | "editing" | "busy" | "unknown";
export type GuestAction = "tour" | "plugins" | "links" | "projects" | "contact" | "github" | "a" | "ls" | "eza" | "clear";
export type GuestControlFrame =
  | { op: "ready"; guestBuildId: string; cols: number; rows: number }
  | { op: "shellReady"; guestBuildId: string }
  | { op: "shellState"; state: ShellState }
  | { op: "inputFenceAck"; fenceId: number; inputBytes: number; state: ShellState }
  | { op: "resizeAck"; cols: number; rows: number }
  | { op: "localeAck"; locale: "en" | "ru" }
  | { op: "portfolioAction"; requestId: number; action: "open" | "copyContact"; linkId: PortfolioLinkId }
  | { op: "ack"; ackSeq: number; requestId: number; status: "accepted" | "rejected" }
  | { op: "error"; code: "badFrame" | "badSession" | "badSequence" | "badOperation" | "badValue" | "internal" };

export function matchesDispatchAck(
  frame: Extract<GuestControlFrame, { op: "ack" }>,
  pending: { ackSeq: number; requestId: number } | null,
): boolean {
  return pending !== null && frame.ackSeq === pending.ackSeq && frame.requestId === pending.requestId;
}

export type HostControlFrame =
  | { op: "hello"; cols: number; rows: number }
  | { op: "inputFence"; fenceId: number; inputBytes: number }
  | { op: "resize"; cols: number; rows: number }
  | { op: "setLocale"; locale: "en" | "ru" }
  | { op: "dispatchAction"; action: GuestAction; requestId: number; fenceId: number; inputBytes: number }
  | { op: "ack"; ackSeq: number; status: "queued" | "rejected" };

const guestActionSet = new Set<string>(["tour", "plugins", "links", "projects", "contact", "github", "a", "ls", "eza", "clear"]);


function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

function hasExactFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key));
}
function isHostControlFrame(value: unknown): value is HostControlFrame {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const frame = value as Record<string, unknown>;
  switch (frame.op) {
    case "hello":
    case "resize":
      return hasExactFields(frame, ["op", "cols", "rows"])
        && isIntegerInRange(frame.cols, 2, 300) && isIntegerInRange(frame.rows, 2, 120);
    case "inputFence":
      return hasExactFields(frame, ["op", "fenceId", "inputBytes"])
        && isIntegerInRange(frame.fenceId, 1, MAX_SEQUENCE)
        && isIntegerInRange(frame.inputBytes, 0, MAX_SEQUENCE);
    case "setLocale":
      return hasExactFields(frame, ["op", "locale"]) && (frame.locale === "en" || frame.locale === "ru");
    case "dispatchAction":
      return hasExactFields(frame, ["op", "action", "requestId", "fenceId", "inputBytes"])
        && typeof frame.action === "string" && guestActionSet.has(frame.action)
        && isIntegerInRange(frame.requestId, 1, MAX_SEQUENCE)
        && isIntegerInRange(frame.fenceId, 1, MAX_SEQUENCE)
        && isIntegerInRange(frame.inputBytes, 0, MAX_SEQUENCE);
    case "ack":
      return hasExactFields(frame, ["op", "ackSeq", "status"])
        && isIntegerInRange(frame.ackSeq, 1, MAX_SEQUENCE)
        && (frame.status === "queued" || frame.status === "rejected");
    default:
      return false;
  }
}

function isShellState(value: unknown): value is ShellState {
  return value === "cleanPrompt" || value === "editing" || value === "busy" || value === "unknown";
}

function skipJsonString(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length) {
    if (text[index] === "\\") index += 2;
    else if (text[index++] === "\"") return index;
  }
  return text.length;
}

function skipJsonValue(text: string, start: number): number {
  const first = text[start];
  if (first === "\"") return skipJsonString(text, start);
  if (first !== "{" && first !== "[") {
    let index = start;
    while (index < text.length && /[\s,}]/.test(text[index]) === false) index += 1;
    return index;
  }
  const closing: string[] = [first === "{" ? "}" : "]"];
  let index = start + 1;
  while (index < text.length && closing.length > 0) {
    const current = text[index];
    if (current === "\"") {
      index = skipJsonString(text, index);
      continue;
    }
    if (current === "{") closing.push("}");
    else if (current === "[") closing.push("]");
    else if (current === "}" || current === "]") {
      if (closing.pop() !== current) return text.length;
      if (closing.length === 0) return index + 1;
    }
    index += 1;
  }
  return text.length;
}

function hasDuplicateTopLevelKeys(text: string): boolean {
  let index = 0;
  const skipWhitespace = () => {
    while (/\s/.test(text[index] ?? "")) index += 1;
  };
  skipWhitespace();
  if (text[index++] !== "{") return false;
  const keys = new Set<string>();
  while (index < text.length) {
    skipWhitespace();
    if (text[index] === "}") return false;
    if (text[index] !== "\"") return false;
    const keyStart = index;
    index = skipJsonString(text, index);
    let value: unknown;
    try {
      value = JSON.parse(text.slice(keyStart, index));
    } catch {
      return false;
    }
    if (typeof value !== "string") return false;
    if (keys.has(value)) return true;
    keys.add(value);
    skipWhitespace();
    if (text[index++] !== ":") return false;
    skipWhitespace();
    index = skipJsonValue(text, index);
    skipWhitespace();
    if (text[index] === ",") {
      index += 1;
      continue;
    }
    return false;
  }
  return false;
}

function parseGuestFrame(value: unknown, sessionId: string): { seq: number; frame: GuestControlFrame } | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const frame = value as Record<string, unknown>;
  if (frame.v !== 1
    || frame.sessionId !== sessionId
    || !isIntegerInRange(frame.seq, 1, MAX_SEQUENCE)
    || typeof frame.op !== "string") return null;
  switch (frame.op) {
    case "ready":
      if (!hasExactFields(frame, ["v", "sessionId", "seq", "op", "guestBuildId", "cols", "rows"])
        || typeof frame.guestBuildId !== "string" || !BUILD_ID_PATTERN.test(frame.guestBuildId)
        || !isIntegerInRange(frame.cols, 2, 300) || !isIntegerInRange(frame.rows, 2, 120)) return null;
      return { seq: frame.seq, frame: { op: "ready", guestBuildId: frame.guestBuildId, cols: frame.cols, rows: frame.rows } };
    case "shellReady":
      if (!hasExactFields(frame, ["v", "sessionId", "seq", "op", "guestBuildId"])
        || typeof frame.guestBuildId !== "string" || !BUILD_ID_PATTERN.test(frame.guestBuildId)) return null;
      return { seq: frame.seq, frame: { op: "shellReady", guestBuildId: frame.guestBuildId } };
    case "shellState":
      if (!hasExactFields(frame, ["v", "sessionId", "seq", "op", "state"]) || !isShellState(frame.state)) return null;
      return { seq: frame.seq, frame: { op: "shellState", state: frame.state } };
    case "inputFenceAck":
      if (!hasExactFields(frame, ["v", "sessionId", "seq", "op", "fenceId", "inputBytes", "state"])
        || !isIntegerInRange(frame.fenceId, 1, MAX_SEQUENCE)
        || !isIntegerInRange(frame.inputBytes, 0, MAX_SEQUENCE) || !isShellState(frame.state)) return null;
      return { seq: frame.seq, frame: { op: "inputFenceAck", fenceId: frame.fenceId, inputBytes: frame.inputBytes, state: frame.state } };
    case "resizeAck":
      if (!hasExactFields(frame, ["v", "sessionId", "seq", "op", "cols", "rows"])
        || !isIntegerInRange(frame.cols, 2, 300) || !isIntegerInRange(frame.rows, 2, 120)) return null;
      return { seq: frame.seq, frame: { op: "resizeAck", cols: frame.cols, rows: frame.rows } };
    case "localeAck":
      if (!hasExactFields(frame, ["v", "sessionId", "seq", "op", "locale"]) || (frame.locale !== "en" && frame.locale !== "ru")) return null;
      return { seq: frame.seq, frame: { op: "localeAck", locale: frame.locale } };
    case "portfolioAction":
      if (!hasExactFields(frame, ["v", "sessionId", "seq", "op", "requestId", "action", "linkId"])
        || !isIntegerInRange(frame.requestId, 1, MAX_SEQUENCE)
        || (frame.action !== "open" && frame.action !== "copyContact")
        || typeof frame.linkId !== "string" || !portfolioLinkIdSet.has(frame.linkId)
        || (frame.action === "copyContact" && frame.linkId !== "quick-mail")) return null;
      return { seq: frame.seq, frame: { op: "portfolioAction", requestId: frame.requestId, action: frame.action, linkId: frame.linkId as PortfolioLinkId } };
    case "ack":
      if (!hasExactFields(frame, ["v", "sessionId", "seq", "op", "ackSeq", "requestId", "status"])
        || !isIntegerInRange(frame.ackSeq, 1, MAX_SEQUENCE)
        || !isIntegerInRange(frame.requestId, 1, MAX_SEQUENCE)
        || (frame.status !== "accepted" && frame.status !== "rejected")) return null;
      return { seq: frame.seq, frame: { op: "ack", ackSeq: frame.ackSeq, requestId: frame.requestId, status: frame.status } };
    case "error":
      if (!hasExactFields(frame, ["v", "sessionId", "seq", "op", "code"])
        || !["badFrame", "badSession", "badSequence", "badOperation", "badValue", "internal"].includes(String(frame.code))) return null;
      return { seq: frame.seq, frame: { op: "error", code: frame.code as Extract<GuestControlFrame, { op: "error" }>["code"] } };
    default:
      return null;
  }
}

export function encodeHostControlFrame(sessionId: string, seq: number, frame: HostControlFrame): Uint8Array {
  if (!SESSION_ID_PATTERN.test(sessionId) || !isIntegerInRange(seq, 1, MAX_SEQUENCE)) {
    throw new Error("Invalid COM2 session identity or sequence");
  }
  if (!isHostControlFrame(frame)) throw new Error("Invalid host COM2 control frame");
  const payload = new TextEncoder().encode(JSON.stringify({ v: 1, sessionId, seq, ...frame }));
  if (payload.byteLength === 0 || payload.byteLength > MAX_PAYLOAD_BYTES) throw new Error("COM2 control frame exceeds the payload limit");
  const result = new Uint8Array(HEADER_BYTES + payload.byteLength);
  result.set(MAGIC, 0);
  result[4] = payload.byteLength >>> 8;
  result[5] = payload.byteLength & 0xff;
  result.set(payload, HEADER_BYTES);
  return result;
}

/** Incremental, bounded decoder for the guest-to-host UART1 stream. */
export class Com2Decoder {
  private readonly buffer = new Uint8Array(HEADER_BYTES + MAX_PAYLOAD_BYTES);
  private readonly textDecoder = new TextDecoder("utf-8", { fatal: true });
  private length = 0;
  private lastSequence = 0;
  private failure: Error | null = null;

  constructor(private readonly sessionId: string) {
    if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("Invalid COM2 session identity");
  }

  push(bytes: Uint8Array, onFrame: (frame: GuestControlFrame, sequence: number) => void): void {
    if (this.failure) throw this.failure;
    for (let index = 0; index < bytes.length; index += 1) {
      if (this.length === this.buffer.length) this.reject("frame exceeds the bounded buffer");
      this.buffer[this.length++] = bytes[index];
      this.consume(onFrame);
    }
  }

  private consume(onFrame: (frame: GuestControlFrame, sequence: number) => void): void {
    while (this.length >= MAGIC.length) {
      if (MAGIC.some((byte, index) => this.buffer[index] !== byte)) this.reject("frame magic is invalid");
      if (this.length < HEADER_BYTES) return;
      const payloadLength = (this.buffer[4] << 8) | this.buffer[5];
      if (payloadLength < 1 || payloadLength > MAX_PAYLOAD_BYTES) this.reject("frame length is invalid");
      const frameLength = HEADER_BYTES + payloadLength;
      if (this.length < frameLength) return;
      let payloadText: string;
      try {
        payloadText = this.textDecoder.decode(this.buffer.subarray(HEADER_BYTES, frameLength));
      } catch {
        this.reject("frame is not valid UTF-8 JSON");
      }
      if (hasDuplicateTopLevelKeys(payloadText)) this.reject("frame contains duplicate JSON keys");
      let value: unknown;
      try {
        value = JSON.parse(payloadText);
      } catch {
        this.reject("frame is not valid UTF-8 JSON");
      }
      const parsed = parseGuestFrame(value, this.sessionId);
      if (!parsed) this.reject("frame session, version, operation, fields, or values are invalid");
      if (parsed.seq !== this.lastSequence + 1) this.reject("frame sequence is not contiguous");
      this.lastSequence = parsed.seq;
      onFrame(parsed.frame, parsed.seq);
      this.drop(frameLength);
    }
  }

  private reject(message: string): never {
    this.failure = new Error(`Invalid COM2 stream: ${message}`);
    throw this.failure;
  }

  private drop(count: number): void {
    this.length -= count;
    this.buffer.copyWithin(0, count, count + this.length);
  }
}

