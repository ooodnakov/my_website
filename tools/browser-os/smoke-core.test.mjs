import assert from "node:assert/strict";
import test from "node:test";
import { extractCommandOutput, findStandaloneMarker } from "./smoke-core.mjs";

test("an echoed result command cannot satisfy the result marker", () => {
  const marker = "__SMOKE_RESULT_0123456789abcdef__";
  const command = "printf value";
  const markerCommand = `printf '\\n${marker}\\n'`;
  const echoedInput = `${command}\r\n${markerCommand}\r\n`;

  assert.equal(findStandaloneMarker(echoedInput, marker), false);
  assert.equal(findStandaloneMarker(marker, marker), false);
  assert.equal(extractCommandOutput(echoedInput, 0, command, markerCommand, marker), null);
});

test("result parsing is restricted to the current command and excludes echoed input", () => {
  const marker = "__SMOKE_RESULT_0123456789abcdef__";
  const command = "printf actual-output";
  const markerCommand = `printf '\\n${marker}\\n'`;
  const previous = `${marker}\r\nold output\r\n`;
  const current = `${command}\r\nactual-output\r\n${markerCommand}\r\n${marker}\r\n`;
  const transcript = previous + current;

  assert.equal(findStandaloneMarker(transcript, marker), true);
  assert.equal(extractCommandOutput(transcript, previous.length, command, markerCommand, marker), "actual-output");
  assert.equal(extractCommandOutput(transcript, 0, command, markerCommand, marker), "");
});
