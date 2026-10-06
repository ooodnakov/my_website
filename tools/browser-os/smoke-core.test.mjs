import assert from "node:assert/strict";
import test from "node:test";
import { extractCommandOutput, findCommandOutputMarker, findStandaloneMarker, validateControlReadiness } from "./smoke-core.mjs";

test("COM2 identity and shellReady, not a serial marker, establish startup readiness", () => {
  const guestBuildId = "f".repeat(64);
  validateControlReadiness(
    { op: "ready", guestBuildId, cols: 80, rows: 24 },
    { op: "shellReady", guestBuildId },
    guestBuildId,
  );

  assert.throws(
    () => validateControlReadiness(
      { op: "ready", guestBuildId: "e".repeat(64), cols: 80, rows: 24 },
      { op: "shellReady", guestBuildId },
      guestBuildId,
    ),
    /COM2 ready identity\/size mismatch/,
  );
  assert.throws(
    () => validateControlReadiness(
      { op: "ready", guestBuildId, cols: 80, rows: 24 },
      { op: "shellReady", guestBuildId: "e".repeat(64) },
      guestBuildId,
    ),
    /COM2 shellReady identity mismatch/,
  );
  assert.throws(
    () => validateControlReadiness(
      { op: "ready", guestBuildId, cols: 1, rows: 24 },
      { op: "shellReady", guestBuildId },
      guestBuildId,
    ),
    /COM2 ready identity\/size mismatch/,
  );
});
test("an echoed result command cannot satisfy the result marker", () => {
  const marker = "__SMOKE_RESULT_0123456789abcdef__";
  const command = "printf value";
  const markerCommand = `printf '\\n${marker}\\n'`;
  const echoedInput = `${command}\r\n${markerCommand}\r\n`;

  assert.equal(findStandaloneMarker(echoedInput, marker), false);
  assert.equal(findStandaloneMarker(marker, marker), false);
  assert.equal(
    findStandaloneMarker(`\u001b[?2004h${marker}\u001b[?2004l\r\n`, marker),
    true,
  );
  assert.equal(findStandaloneMarker(`\r  ${marker}\u001b[?2004l\r\n`, marker), true);
  assert.equal(extractCommandOutput(echoedInput, 0, command, markerCommand, marker), null);
});

test("result parsing ignores ZLE echo and returns only current command output", () => {
  const marker = "__SMOKE_RESULT_0123456789abcdef__";
  const command = "printf actual-output";
  const markerCommand = `printf '\\n${marker}\\n'`;
  const previous = `${marker}\r\nold output\r\n`;
  const echoedZleMarker = `\u001b[?2004h${markerCommand}\r\n${marker}\r\n\u001b[?2004l\r\n`;
  const current = `\u001b[?2004h${command}\u001b[?2004l\r\nactual-output\r\n${echoedZleMarker}${marker}\r\n`;
  const transcript = previous + current;

  assert.equal(findStandaloneMarker(transcript, marker), true);
  assert.equal(findCommandOutputMarker(echoedZleMarker, marker), false);
  assert.equal(findCommandOutputMarker(transcript, marker, previous.length), true);
  assert.equal(extractCommandOutput(transcript, previous.length, command, markerCommand, marker), "actual-output");
  assert.equal(extractCommandOutput(transcript, 0, command, markerCommand, marker), "actual-output");
});
