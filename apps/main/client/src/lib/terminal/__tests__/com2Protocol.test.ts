import assert from "node:assert/strict";

import { Com2Decoder, matchesDispatchAck, MAX_CONTROL_SEQUENCE, encodeHostControlFrame, type GuestControlFrame } from "../com2Protocol";

const sessionId = "0123456789abcdef0123456789abcdef";
const guestBuildId = "a".repeat(64);

function guestFrame(seq: number, fields: Record<string, unknown>, id = sessionId): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify({ v: 1, sessionId: id, seq, ...fields }));
  const frame = new Uint8Array(payload.byteLength + 6);
  frame.set([0x42, 0x4f, 0x53, 0x31, payload.byteLength >>> 8, payload.byteLength & 0xff]);
  frame.set(payload, 6);
  return frame;
}

function bootstrapFrame(fields: Record<string, unknown> = {}): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify({ v: 1, op: "bootstrap", guestBuildId, cols: 80, rows: 24, ...fields }));
  const frame = new Uint8Array(payload.byteLength + 6);
  frame.set([0x42, 0x4f, 0x53, 0x31, payload.byteLength >>> 8, payload.byteLength & 0xff]);
  frame.set(payload, 6);
  return frame;
}

function join(...chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

const decoder = new Com2Decoder(sessionId);
const decoded: Array<{ frame: GuestControlFrame; seq: number }> = [];
const stream = join(
  guestFrame(1, { op: "ready", guestBuildId, cols: 80, rows: 24 }),
  guestFrame(2, { op: "inputFenceAck", fenceId: 1, inputBytes: 0, state: "cleanPrompt" }),
  guestFrame(3, { op: "ack", ackSeq: 7, requestId: 19, status: "accepted" }),
);
for (let offset = 0; offset < stream.byteLength; offset += 1) {
  decoder.push(stream.subarray(offset, offset + 1), (frame, seq) => {
    if (seq === null) throw new Error("session decoder received an unexpected bootstrap");
    decoded.push({ frame, seq });
  });
}
assert.deepEqual(decoded, [
  { seq: 1, frame: { op: "ready", guestBuildId, cols: 80, rows: 24 } },
  { seq: 2, frame: { op: "inputFenceAck", fenceId: 1, inputBytes: 0, state: "cleanPrompt" } },
  { seq: 3, frame: { op: "ack", ackSeq: 7, requestId: 19, status: "accepted" } },
]);

const bootstrapDecoder = new Com2Decoder();
let acceptedBootstrap = false;
bootstrapDecoder.push(bootstrapFrame(), (frame, sequence) => {
  assert.equal(sequence, null);
  assert.deepEqual(frame, { op: "bootstrap", guestBuildId, cols: 80, rows: 24 });
  acceptedBootstrap = true;
  bootstrapDecoder.adoptSession(sessionId);
});
assert.equal(acceptedBootstrap, true, "the first sessionless frame is accepted as bootstrap");
const postBootstrapFrames: Array<{ frame: GuestControlFrame; seq: number | null }> = [];
bootstrapDecoder.push(
  guestFrame(1, { op: "ready", guestBuildId, cols: 80, rows: 24 }),
  (frame, seq) => postBootstrapFrames.push({ frame, seq }),
);
assert.deepEqual(postBootstrapFrames, [
  { frame: { op: "ready", guestBuildId, cols: 80, rows: 24 }, seq: 1 },
], "session sequence numbering begins at one after adoption");
assert.throws(() => bootstrapDecoder.adoptSession(sessionId), /session cannot be adopted/,
  "a session can only be adopted once");

const unboundDecoder = new Com2Decoder();
unboundDecoder.push(bootstrapFrame(), () => undefined);
assert.throws(
  () => unboundDecoder.push(guestFrame(1, { op: "ready", guestBuildId, cols: 80, rows: 24 }), () => undefined),
  /session has not been adopted/,
  "a session frame cannot follow bootstrap until the host adopts its session",
);
assert.throws(
  () => new Com2Decoder().push(guestFrame(1, { op: "ready", guestBuildId, cols: 80, rows: 24 }), () => undefined),
  /first frame is not a valid bootstrap/,
  "session-bound frames cannot precede bootstrap",
);
for (const fields of [
  { guestBuildId: "A".repeat(64) },
  { guestBuildId: "a".repeat(63) },
  { cols: 1 },
  { rows: 121 },
  { sessionId, seq: 1 },
  { extra: true },
  { v: 2 },
]) {
  assert.throws(
    () => new Com2Decoder().push(bootstrapFrame(fields), () => undefined),
    /first frame is not a valid bootstrap/,
    `invalid bootstrap ${JSON.stringify(fields)} is rejected`,
  );
}
assert.throws(
  () => new Com2Decoder(sessionId).push(bootstrapFrame(), () => undefined),
  /frame session, version, operation, fields, or values are invalid/,
  "a pre-session bootstrap is not accepted by a session-bound decoder",
);

const decodedAck = decoded[2]?.frame;
assert.ok(decodedAck?.op === "ack");
assert.equal(matchesDispatchAck(decodedAck, { ackSeq: 7, requestId: 19 }), true);
assert.equal(matchesDispatchAck(decodedAck, { ackSeq: 8, requestId: 19 }), false, "a stale host sequence cannot match");
assert.equal(matchesDispatchAck(decodedAck, { ackSeq: 7, requestId: 20 }), false, "a different request ID cannot match");
assert.equal(matchesDispatchAck(decodedAck, null), false, "an ACK cannot match without an outstanding dispatch");

const postCleanDecoder = new Com2Decoder(sessionId);
const postCleanFrames: Array<{ frame: GuestControlFrame; seq: number | null }> = [];
postCleanDecoder.push(join(
  guestFrame(1, { op: "ready", guestBuildId, cols: 80, rows: 24 }),
  guestFrame(2, { op: "inputFenceAck", fenceId: 1, inputBytes: 0, state: "cleanPrompt" }),
), (frame, seq) => postCleanFrames.push({ frame, seq }));
assert.throws(
  () => postCleanDecoder.push(guestFrame(3, { op: "shellState", state: "cleanPrompt", stale: true }), () => undefined),
  /Invalid COM2 stream/,
);
assert.throws(
  () => postCleanDecoder.push(guestFrame(3, { op: "shellState", state: "cleanPrompt" }), () => undefined),
  /Invalid COM2 stream/,
  "a malformed post-clean frame latches the decoder closed instead of resynchronizing",
);
assert.equal(postCleanFrames.length, 2);

const gapDecoder = new Com2Decoder(sessionId);
gapDecoder.push(guestFrame(1, { op: "ready", guestBuildId, cols: 80, rows: 24 }), () => undefined);
assert.throws(
  () => gapDecoder.push(guestFrame(3, { op: "shellReady", guestBuildId }), () => undefined),
  /sequence is not contiguous/,
);

const duplicateDecoder = new Com2Decoder(sessionId);
duplicateDecoder.push(guestFrame(1, { op: "ready", guestBuildId, cols: 80, rows: 24 }), () => undefined);
assert.throws(
  () => duplicateDecoder.push(guestFrame(1, { op: "shellReady", guestBuildId }), () => undefined),
  /sequence is not contiguous/,
);

const wrongSessionDecoder = new Com2Decoder(sessionId);
assert.throws(
  () => wrongSessionDecoder.push(guestFrame(1, { op: "ready", guestBuildId, cols: 80, rows: 24 }, "ffffffffffffffffffffffffffffffff"), () => undefined),
  /session, version, operation, fields, or values are invalid/,
);

const unknownOperationDecoder = new Com2Decoder(sessionId);
assert.throws(
  () => unknownOperationDecoder.push(guestFrame(1, { op: "unknown" }), () => undefined),
  /session, version, operation, fields, or values are invalid/,
);
const legacyEpochDecoder = new Com2Decoder(sessionId);
assert.throws(
  () => legacyEpochDecoder.push(guestFrame(1, { op: "inputEpochAck", inputEpoch: 1, state: "cleanPrompt" }), () => undefined),
  /session, version, operation, fields, or values are invalid/,
  "legacy input epochs are not accepted by the fence protocol",
);

const advisoryDecoder = new Com2Decoder(sessionId);
const advisoryFrames: GuestControlFrame[] = [];
advisoryDecoder.push(guestFrame(1, { op: "shellState", state: "cleanPrompt" }), (frame) => advisoryFrames.push(frame));
assert.deepEqual(advisoryFrames, [{ op: "shellState", state: "cleanPrompt" }]);

const oversizedFenceDecoder = new Com2Decoder(sessionId);
assert.throws(
  () => oversizedFenceDecoder.push(
    guestFrame(1, { op: "inputFenceAck", fenceId: 1, inputBytes: MAX_CONTROL_SEQUENCE + 1, state: "cleanPrompt" }),
    () => undefined,
  ),
  /session, version, operation, fields, or values are invalid/,
);

const badIdentityDecoder = new Com2Decoder(sessionId);
assert.throws(
  () => badIdentityDecoder.push(guestFrame(1, { op: "ready", guestBuildId: "alpine-3.24.2-v86-0.5.469", cols: 80, rows: 24 }), () => undefined),
  /session, version, operation, fields, or values are invalid/,
);

const badActionDecoder = new Com2Decoder(sessionId);
assert.throws(
  () => badActionDecoder.push(guestFrame(1, { op: "portfolioAction", requestId: 1, action: "copyContact", linkId: "social-gh" }), () => undefined),
  /session, version, operation, fields, or values are invalid/,
);
const missingAckRequestIdDecoder = new Com2Decoder(sessionId);
assert.throws(
  () => missingAckRequestIdDecoder.push(guestFrame(1, { op: "ack", ackSeq: 1, status: "accepted" }), () => undefined),
  /session, version, operation, fields, or values are invalid/,
  "the contract requires requestId even when status is accepted",
);
for (const requestId of [0, MAX_CONTROL_SEQUENCE + 1, "19"]) {
  const invalidAckRequestIdDecoder = new Com2Decoder(sessionId);
  assert.throws(
    () => invalidAckRequestIdDecoder.push(guestFrame(1, { op: "ack", ackSeq: 1, requestId, status: "accepted" }), () => undefined),
    /session, version, operation, fields, or values are invalid/,
    `invalid dispatch ACK requestId ${String(requestId)} is rejected`,
  );
}

const duplicatePayload = new TextEncoder().encode(
  `{"v":1,"sessionId":"${sessionId}","seq":1,"op":"error","op":"error","code":"guest"}`,
);
const duplicateFrame = new Uint8Array(duplicatePayload.byteLength + 6);
duplicateFrame.set([0x42, 0x4f, 0x53, 0x31, duplicatePayload.byteLength >>> 8, duplicatePayload.byteLength & 0xff]);
duplicateFrame.set(duplicatePayload, 6);
assert.throws(
  () => new Com2Decoder(sessionId).push(duplicateFrame, () => undefined),
  /duplicate JSON keys/,
);

const outOfBoundsDecoder = new Com2Decoder(sessionId);
assert.throws(
  () => outOfBoundsDecoder.push(guestFrame(MAX_CONTROL_SEQUENCE + 1, { op: "ready", guestBuildId, cols: 80, rows: 24 }), () => undefined),
  /session, version, operation, fields, or values are invalid/,
);

const badMagicDecoder = new Com2Decoder(sessionId);
assert.throws(
  () => badMagicDecoder.push(new Uint8Array([0x42, 0x00, 0x4f, 0x31]), () => undefined),
  /frame magic is invalid/,
);

const badLengthDecoder = new Com2Decoder(sessionId);
const oversizedHeader = new Uint8Array([0x42, 0x4f, 0x53, 0x31, 0x10, 0x01]);
assert.throws(
  () => badLengthDecoder.push(join(oversizedHeader, guestFrame(1, { op: "ready", guestBuildId, cols: 80, rows: 24 })), () => undefined),
  /frame length is invalid/,
);

const encoded = encodeHostControlFrame(sessionId, 1, { op: "inputFence", fenceId: 3, inputBytes: 42 });
assert.deepEqual(Array.from(encoded.subarray(0, 4)), [0x42, 0x4f, 0x53, 0x31]);
assert.equal(((encoded[4] << 8) | encoded[5]), encoded.byteLength - 6);
assert.deepEqual(JSON.parse(new TextDecoder().decode(encoded.subarray(6))), {
  v: 1,
  sessionId,
  seq: 1,
  op: "inputFence",
  fenceId: 3,
  inputBytes: 42,
});
assert.throws(() => encodeHostControlFrame(sessionId, 0, { op: "hello", cols: 80, rows: 24 }));
assert.deepEqual(
  JSON.parse(new TextDecoder().decode(encodeHostControlFrame(sessionId, 2, { op: "ack", ackSeq: 1, status: "queued" }).subarray(6))),
  { v: 1, sessionId, seq: 2, op: "ack", ackSeq: 1, status: "queued" },
);
assert.throws(
  () => encodeHostControlFrame(sessionId, 2, { op: "inputFence", fenceId: 0, inputBytes: 0 } as never),
  /Invalid host COM2 control frame/,
);

console.log("COM2 fail-closed framing and sequence tests passed");
