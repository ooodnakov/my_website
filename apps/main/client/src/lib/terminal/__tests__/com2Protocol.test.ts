import assert from "node:assert/strict";

import { Com2Decoder, MAX_CONTROL_SEQUENCE, encodeHostControlFrame, type GuestControlFrame } from "../com2Protocol";

const sessionId = "0123456789abcdef0123456789abcdef";
const guestBuildId = "a".repeat(64);

function guestFrame(seq: number, fields: Record<string, unknown>, id = sessionId): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify({ v: 1, sessionId: id, seq, ...fields }));
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
  guestFrame(2, { op: "inputEpochAck", inputEpoch: 1, state: "cleanPrompt" }),
);
for (let offset = 0; offset < stream.byteLength; offset += 1) {
  decoder.push(stream.subarray(offset, offset + 1), (frame, seq) => decoded.push({ frame, seq }));
}
assert.deepEqual(decoded, [
  { seq: 1, frame: { op: "ready", guestBuildId, cols: 80, rows: 24 } },
  { seq: 2, frame: { op: "inputEpochAck", inputEpoch: 1, state: "cleanPrompt" } },
]);

const postCleanDecoder = new Com2Decoder(sessionId);
const postCleanFrames: Array<{ frame: GuestControlFrame; seq: number }> = [];
postCleanDecoder.push(join(
  guestFrame(1, { op: "ready", guestBuildId, cols: 80, rows: 24 }),
  guestFrame(2, { op: "inputEpochAck", inputEpoch: 1, state: "cleanPrompt" }),
), (frame, seq) => postCleanFrames.push({ frame, seq }));
assert.throws(
  () => postCleanDecoder.push(guestFrame(3, { op: "shellState", inputEpoch: 1, state: "cleanPrompt", stale: true }), () => undefined),
  /Invalid COM2 stream/,
);
assert.throws(
  () => postCleanDecoder.push(guestFrame(3, { op: "shellState", inputEpoch: 1, state: "cleanPrompt" }), () => undefined),
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

const encoded = encodeHostControlFrame(sessionId, 1, { op: "inputEpoch", inputEpoch: 3 });
assert.deepEqual(Array.from(encoded.subarray(0, 4)), [0x42, 0x4f, 0x53, 0x31]);
assert.equal(((encoded[4] << 8) | encoded[5]), encoded.byteLength - 6);
assert.deepEqual(JSON.parse(new TextDecoder().decode(encoded.subarray(6))), {
  v: 1,
  sessionId,
  seq: 1,
  op: "inputEpoch",
  inputEpoch: 3,
});
assert.throws(() => encodeHostControlFrame(sessionId, 0, { op: "hello", cols: 80, rows: 24 }));

console.log("COM2 fail-closed framing and sequence tests passed");
