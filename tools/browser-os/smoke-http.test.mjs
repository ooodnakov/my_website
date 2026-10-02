import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { pipeTrackedResponse } from "./smoke-http.mjs";

test("response byte counts advance with streamed chunks", async () => {
  const source = new PassThrough();
  const response = new PassThrough();
  const request = { bytes: 0 };
  const received = [];
  response.on("data", chunk => received.push(chunk));

  pipeTrackedResponse(source, response, request);
  source.write(Buffer.from("first"));
  assert.equal(request.bytes, 5);
  source.write(Buffer.from(" second"));
  assert.equal(request.bytes, 12);
  source.end();
  await new Promise(resolve => response.on("finish", resolve));

  assert.equal(Buffer.concat(received).toString(), "first second");
  assert.equal(request.bytes, 12);
});
