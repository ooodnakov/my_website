export function pipeTrackedResponse(source, response, request) {
  const write = response.write;
  response.write = function (chunk, encoding, callback) {
    const accepted = write.call(this, chunk, encoding, callback);
    request.bytes += chunk.byteLength;
    return accepted;
  };
  return source.pipe(response);
}
