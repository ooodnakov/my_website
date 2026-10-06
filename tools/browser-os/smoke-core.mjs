function randomHex(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeMarkerLine(line) {
  return line
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "")
    .trim();
}

export function findStandaloneMarker(text, marker, fromIndex = 0) {
  const lines = text.slice(fromIndex).split("\n");
  return lines.some((line, index) => {
    const normalized = normalizeMarkerLine(line);
    return normalized === marker && (index < lines.length - 1 || text.endsWith("\n"));
  });
}

function lastStandaloneMarkerIndex(text, marker) {
  const lines = text.split("\n");
  let offset = 0;
  let found = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalized = normalizeMarkerLine(line);
    if (normalized === marker && (index < lines.length - 1 || text.endsWith("\n"))) found = offset;
    offset += line.length + 1;
  }
  return found;
}

export function findCommandOutputMarker(text, marker, fromIndex = 0) {
  const localText = text.slice(fromIndex);
  const markerIndex = lastStandaloneMarkerIndex(localText, marker);
  if (markerIndex === -1) return false;
  const commandEnd = localText.lastIndexOf("\x1b[?2004l", markerIndex);
  if (commandEnd === -1) return false;
  const outputStart = localText.indexOf("\n", commandEnd);
  return outputStart !== -1 && outputStart < markerIndex;
}

export function extractCommandOutput(transcript, offset, commandText, markerCommand, marker) {
  const localText = transcript.slice(offset);
  const markerIndex = lastStandaloneMarkerIndex(localText, marker);
  if (markerIndex === -1) return null;
  const commandEnd = localText.indexOf("\x1b[?2004l");
  if (commandEnd === -1) return null;
  const outputStart = localText.indexOf("\n", commandEnd);
  if (outputStart === -1 || outputStart >= markerIndex) return null;
  const nextEditor = localText.indexOf("\x1b[?2004h", outputStart);
  const outputEnd = nextEditor !== -1 && nextEditor < markerIndex ? nextEditor : markerIndex;
  return localText.slice(outputStart + 1, outputEnd)
    .split("\n")
    .map(line => line.endsWith("\r") ? line.slice(0, -1) : line)
    .filter(line => line !== commandText && line !== markerCommand)
    .join("\n")
    .trim();
}

export function validateControlReadiness(ready, shellReady, expectedBuildId) {
  if (typeof expectedBuildId !== "string" || !/^[a-f0-9]{64}$/.test(expectedBuildId)) {
    throw new Error("guest smoke requires the manifest-derived guest build ID");
  }
  if (ready?.op !== "ready" || ready.guestBuildId !== expectedBuildId || ready.cols !== 80 || ready.rows !== 24) {
    throw new Error(`COM2 ready identity/size mismatch: ${JSON.stringify(ready)}`);
  }
  if (shellReady?.op !== "shellReady" || shellReady.guestBuildId !== expectedBuildId) {
    throw new Error(`COM2 shellReady identity mismatch: ${JSON.stringify(shellReady)}`);
  }
}

export async function runGuestSmoke(emulator, bootStartedAt, timeoutMs = 900000, onShellReady = () => {}, expectedBuildId = null) {
  const serial = [];
  const decoder = new TextDecoder();
  const start = bootStartedAt;
  const controlBytes = [];
  const controlFrames = [];
  const controlHistory = [];
  let controlError = null;
  let ctrlCToPromptMs = null;
  let controlSequence = 1;
  let controlSessionId = randomHex(16);
  let inputBytes = 0;
  const listener = byte => serial.push(byte);
  const controlListener = byte => {
    if (controlError) return;
    controlBytes.push(byte);
    while (controlBytes.length >= 6) {
      if (controlBytes[0] !== 0x42 || controlBytes[1] !== 0x4f || controlBytes[2] !== 0x53 || controlBytes[3] !== 0x31) {
        controlError = `invalid COM2 frame magic: ${Array.from(controlBytes.slice(0, 12), value => value.toString(16).padStart(2, "0")).join(" ")}`;
        return;
      }
      const length = (controlBytes[4] << 8) | controlBytes[5];
      if (length < 1 || length > 4096) {
        controlError = `invalid COM2 frame length ${length}`;
        return;
      }
      if (controlBytes.length < 6 + length) break;
      const payload = Uint8Array.from(controlBytes.splice(6, length));
      controlBytes.splice(0, 6);
      try {
        const frame = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
        if (controlHistory.length >= 8192) {
          controlError = "guest emitted more than 8192 control frames";
          return;
        }
        controlHistory.push(frame);
        controlFrames.push(frame);
      } catch (error) {
        controlError = `invalid COM2 JSON: ${error.message}`;
        return;
      }
      if (controlFrames.length > 64) controlFrames.shift();
    }
  };
  emulator.add_listener("serial0-output-byte", listener);
  emulator.add_listener("serial1-output-byte", controlListener);

  const output = () => decoder.decode(Uint8Array.from(serial));
  const waitForGuestStartupSignal = async (timeout = timeoutMs) => {
    const marker = "__GUEST_READY__";
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const text = output();
      if (text.includes(marker)) {
        const markerIndex = text.indexOf(marker);
        return text.slice(Math.max(0, markerIndex - 100), markerIndex + marker.length + 100);
      }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`guest timed out waiting for ${marker}; serial output: ${output().slice(-4000)}`);
  };
  const waitForText = async (textFragment, fromIndex, timeout = timeoutMs) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const text = output();
      if (text.slice(fromIndex).includes(textFragment)) return text;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`guest timed out waiting for text ${textFragment}; serial output: ${output().slice(-4000)}`);
  };
  const waitForCommandMarker = async (marker, fromIndex, timeout = timeoutMs) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const text = output();
      if (findCommandOutputMarker(text, marker, fromIndex)) return text;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`guest timed out waiting for command output ${marker}; serial output: ${output().slice(-4000)}`);
  };
  const sendBytes = bytes => {
    inputBytes += bytes.length;
    emulator.serial_send_bytes(0, bytes);
  };
  const sendPaced = async text => {
    const bytes = new TextEncoder().encode(text);
    for (const byte of bytes) {
      sendBytes(Uint8Array.of(byte));
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  };
  const sendRawControl = value => {
    const payload = new TextEncoder().encode(JSON.stringify(value));
    const frame = new Uint8Array(6 + payload.length);
    frame.set([0x42, 0x4f, 0x53, 0x31, payload.length >> 8, payload.length & 0xff]);
    frame.set(payload, 6);
    emulator.serial_send_bytes(1, frame);
  };
  const sendControl = (op, fields = {}) => {
    const frame = { v: 1, sessionId: controlSessionId, seq: controlSequence++, op, ...fields };
    sendRawControl(frame);
    return frame;
  };
  const waitForControl = async (predicate, timeout = 5000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (controlError) throw new Error(controlError);
      const index = controlFrames.findIndex(predicate);
      if (index !== -1) return controlFrames.splice(index, 1)[0];
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`guest timed out waiting for COM2 frame; received ${JSON.stringify(controlFrames)}; COM1 tail=${JSON.stringify(output().slice(-2000))}`);
  };
  const assertions = [];
  const requireMatch = (name, text, regex) => {
    if (!regex.test(text)) throw new Error(`${name} failed; command-local output: ${text.slice(-4000)}`);
    assertions.push(name);
  };
  const command = async (name, shell, matcher, timeout = timeoutMs) => {
    const marker = `__SMOKE_RESULT_${randomHex(8)}__`;
    const markerCommand = `printf '\\n${marker}\\n'`;
    const before = output().length;
    await sendPaced(`${shell}\n${markerCommand}\n`);
    const transcript = await waitForCommandMarker(marker, before, timeout);
    const result = extractCommandOutput(transcript, before, shell, markerCommand, marker);
    if (result === null) throw new Error(`${name} result marker was not a complete standalone line`);
    requireMatch(name, result, matcher);
    return result;
  };

  try {
    if (typeof expectedBuildId !== "string" || !/^[a-f0-9]{64}$/.test(expectedBuildId)) {
      throw new Error("guest smoke requires the manifest-derived guest build ID");
    }
    const ready = await waitForGuestStartupSignal();
    sendControl("hello", { cols: 80, rows: 24 });
    const controlReady = await waitForControl(frame => frame.op === "ready", timeoutMs);
    const shellReady = await waitForControl(frame => frame.op === "shellReady", timeoutMs);
    validateControlReadiness(controlReady, shellReady, expectedBuildId);
    const bootMs = Date.now() - start;
    await onShellReady({ bootMs, guestOutputBytes: serial.length });
    assertions.push("com2-session-and-content-build-identity");

    sendControl("resize", { cols: 100, rows: 40 });
    const resizeAck = await waitForControl(frame => frame.op === "resizeAck" && frame.cols === 100 && frame.rows === 40);
    if (resizeAck.rows !== 40) throw new Error("COM2 resize acknowledgment mismatched the requested PTY size");
    assertions.push("com2-resize-ack");
    sendControl("setLocale", { locale: "ru" });
    const localeAck = await waitForControl(frame => frame.op === "localeAck" && frame.locale === "ru");
    if (localeAck.locale !== "ru") throw new Error("COM2 locale acknowledgment mismatched");
    assertions.push("com2-locale-ack");
    const startupFile = await command(
      "STARTUP FILE OWNERSHIP AND MODE",
      'test "$(stat -c "%u:%g:%a" /home/visitor/.zshrc)" = "1000:1000:600" && ! grep -Eq "chown 1000:1000|chmod 0600" /home/visitor/.zshrc && printf "__STARTUP_FILE_OK__\\n"',
      /__STARTUP_FILE_OK__/,
    );
    const homeBeforeLocale = await command(
      "WRITABLE HOME BEFORE LOCALE",
      'printf "home-survives-locale\\n" > "$HOME/.locale-smoke" && printf "__HOME_SAVED__\\n"',
      /__HOME_SAVED__/,
    );

    const hostSize = await command("PTY RESIZE", "stty size", /40 100/);
    const embeddedIdentity = await command("EMBEDDED BUILD ID", "sha256sum /etc/browser-os/guest-build.json", new RegExp(expectedBuildId));
    const hostLocale = await command("HOST LOCALE VIEW", "readlink /portfolio/current; test ! -w /portfolio/ru/site.json && printf '__PORTFOLIO_READ_ONLY__\\n'", /ru[\s\S]*__PORTFOLIO_READ_ONLY__/);
    const russianReader = await command("RUSSIAN PORTFOLIO CONTENT", "cat /portfolio/current/README.md", /Аналитика, риски, эксперименты, архивы\./);
    const russianCompatibility = await command("RUSSIAN SITE COMPATIBILITY", "jq -r '.hero.desc' /site.json", /Terminal-ready хаб\. Ссылки сначала, контекст потом\./);
    const guestLocale = await command("GUEST LOCALE TOOL", "set-locale en; readlink /portfolio/current", /locale en[\s\S]*en/);
    const englishCompatibility = await command("ENGLISH SITE COMPATIBILITY", "jq -r '.hero.desc' /site.json", /Terminal-ready hub\. Links first, context second\./);
    const homeAfterLocale = await command(
      "HOME SURVIVES LOCALE CHANGE",
      'test "$(cat "$HOME/.locale-smoke")" = home-survives-locale && printf "__HOME_RETAINED__\\n"',
      /__HOME_RETAINED__/,
    );

    const about = await command("ABOUT READER", "about", /Analytics, risk, experiments, archives\./);
    const links = await command("LINKS READER", "links", /quick-cv\tInteractive CV\t\/cv\/en/);
    const projects = await command("PROJECTS READER", "projects", /cover-doc/);
    const cv = await command("CV READER", "cv", /T-Bank\s+risk analyst/);
    const contact = await command("CONTACT READER", "contact", /mailto:ooodnakov@yandex\.ru/);
    const alias = await command("EZA ALIAS", "touch /tmp/browser-os-smoke; a /tmp", /browser-os-smoke/);

    const openMarker = `__SMOKE_RESULT_${randomHex(8)}__`;
    const openCommand = "open quick-cv";
    const openMarkerCommand = `printf '\\n${openMarker}\\n'`;
    const openBefore = output().length;
    await sendPaced(`${openCommand}\n${openMarkerCommand}\n`);
    const openRequest = await waitForControl(frame => frame.op === "portfolioAction" && frame.action === "open" && frame.linkId === "quick-cv");
    if (!Number.isInteger(openRequest.requestId) || openRequest.requestId < 1) {
      throw new Error(`guest portfolioAction requestId is invalid: ${JSON.stringify(openRequest)}`);
    }
    sendControl("ack", { ackSeq: openRequest.seq, status: "queued" });
    const openTranscript = await waitForCommandMarker(openMarker, openBefore, 10000);
    const openResult = extractCommandOutput(openTranscript, openBefore, openCommand, openMarkerCommand, openMarker);
    if (openResult === null) throw new Error("guest open CLI result marker was incomplete");
    requireMatch("GUEST PORTFOLIO REQUEST", openResult, /queued/);
    const invalidLink = await command("INVALID PORTFOLIO ID", "guestctl open not-a-portfolio-id", /guestctl: invalid-link/);
    assertions.push("guest-cli-rejects-noncanonical-link-id");
    const copyMarker = `__SMOKE_RESULT_${randomHex(8)}__`;
    const copyCommand = "copy-contact";
    const copyMarkerCommand = `printf '\\n${copyMarker}\\n'`;
    const copyBefore = output().length;
    await sendPaced(`${copyCommand}\n${copyMarkerCommand}\n`);
    const copyRequest = await waitForControl(frame => frame.op === "portfolioAction" && frame.action === "copyContact" && frame.linkId === "quick-mail");
    if (!Number.isInteger(copyRequest.requestId) || copyRequest.requestId <= openRequest.requestId) {
      throw new Error(`guest portfolioAction requestId is not strictly increasing: ${JSON.stringify(copyRequest)}`);
    }
    sendControl("ack", { ackSeq: copyRequest.seq, status: "queued" });
    const copyTranscript = await waitForCommandMarker(copyMarker, copyBefore, 10000);
    const copyResult = extractCommandOutput(copyTranscript, copyBefore, copyCommand, copyMarkerCommand, copyMarker);
    if (copyResult === null) throw new Error("guest copy-contact result marker was incomplete");
    requireMatch("GUEST COPY CONTACT REQUEST", copyResult, /queued/);

    sendBytes(Uint8Array.of(0x78));
    const fenceBytes = inputBytes;
    sendControl("inputFence", { fenceId: 1, inputBytes: fenceBytes });
    sendBytes(Uint8Array.of(0x79));
    const fenceAck = await waitForControl(frame => frame.op === "inputFenceAck" && frame.fenceId === 1 && frame.inputBytes === fenceBytes);
    if (fenceAck.state !== "unknown") throw new Error(`guest claimed an unproven editor boundary: ${JSON.stringify(fenceAck)}`);
    const dispatch = sendControl("dispatchAction", { action: "tour", requestId: 1, fenceId: 1, inputBytes: fenceBytes });
    const dispatchAck = await waitForControl(frame => frame.op === "ack" && frame.ackSeq === dispatch.seq && frame.requestId === 1);
    if (dispatchAck.status !== "rejected") throw new Error(`unsafe dispatch was not rejected: ${JSON.stringify(dispatchAck)}`);
    assertions.push("unproven-fence-rejects-dispatch");
    const recoveryPromptStart = output().length;
    sendBytes(Uint8Array.of(3));
    await waitForText("localhost:~%", recoveryPromptStart, 5000);
    const boundaryRecovery = await command("FENCE INPUT RECOVERY", 'printf "__FENCE_RECOVERED__\\n"', /__FENCE_RECOVERED__/, 5000);
    const busyStart = output().length;
    const busyMarker = `__SMOKE_BUSY_${randomHex(8)}__`;
    await sendPaced(`printf '\\n${busyMarker}\\n'; sleep 15\n`);
    await waitForCommandMarker(busyMarker, busyStart, 5000);
    await new Promise(resolve => setTimeout(resolve, 300));
    const unsentFenceBytes = inputBytes + 1;
    sendControl("inputFence", { fenceId: 2, inputBytes: unsentFenceBytes });
    const busyDispatch = sendControl("dispatchAction", {
      action: "tour",
      requestId: 2,
      fenceId: 2,
      inputBytes: unsentFenceBytes,
    });
    const busyDispatchAck = await waitForControl(
      frame => frame.op === "ack" && frame.ackSeq === busyDispatch.seq && frame.requestId === 2,
    );
    if (busyDispatchAck.status !== "rejected") {
      throw new Error(`dispatch was not rejected while busy input was unsent: ${JSON.stringify(busyDispatchAck)}`);
    }
    const racedInput = new TextEncoder().encode('printf "__FENCE_RACE_PREFIX__\\n"\n');
    sendBytes(racedInput);
    const racedInputBytes = inputBytes;
    sendControl("inputFence", { fenceId: 3, inputBytes: racedInputBytes });
    const fenceInterruptStarted = Date.now();
    const interruptPromptStart = output().length;
    sendBytes(Uint8Array.of(3));
    await waitForText("localhost:~%", interruptPromptStart, 900);
    if (Date.now() - fenceInterruptStarted >= 1000) {
      throw new Error("Ctrl+C waited for the COM2 fence deadline instead of cancelling it");
    }
    const fenceInterruptRecovery = await command(
      "CROSS-UART FENCE INTERRUPT",
      'printf "__CROSS_UART_INTERRUPT_RECOVERED__\\n"',
      /__CROSS_UART_INTERRUPT_RECOVERED__/,
      5000,
    );

    const longTuiLine = `LESS_WRAP_START_${"W".repeat(160)}_END`;
    const tuiFixture = await command(
      "TUI RESIZE FIXTURE",
      `i=0; : > /tmp/browser-os-less-smoke; while [ "$i" -lt 80 ]; do printf "LESS_ROW_%03d ${longTuiLine}\\n" "$i" >> /tmp/browser-os-less-smoke; i=$((i + 1)); done; printf "LESS_END_MARKER\\n" >> /tmp/browser-os-less-smoke; printf "__TUI_FILE_READY__\\n"`,
      /__TUI_FILE_READY__/,
    );
    const lessStart = output().length;
    await sendPaced("less /tmp/browser-os-less-smoke\n");
    await waitForText("LESS_ROW_000", lessStart, 5000);
    sendControl("resize", { cols: 60, rows: 18 });
    const lessResizeAck = await waitForControl(frame => frame.op === "resizeAck" && frame.cols === 60 && frame.rows === 18);
    sendBytes(new TextEncoder().encode("G"));
    await waitForText("LESS_END_MARKER", lessStart, 5000);
    sendBytes(new TextEncoder().encode("q"));
    const lessExit = await command("LESS RESIZE EXIT", 'printf "__LESS_RESIZE_EXIT__\\n"', /__LESS_RESIZE_EXIT__/);
    assertions.push("less-live-resize-and-wrapping");

    const nanoStart = output().length;
    await sendPaced("nano /tmp/browser-os-less-smoke\n");
    await waitForText("GNU nano", nanoStart, 5000);
    const nanoExitStart = output().length;
    sendControl("resize", { cols: 90, rows: 25 });
    const nanoResizeAck = await waitForControl(frame => frame.op === "resizeAck" && frame.cols === 90 && frame.rows === 25);
    await new Promise(resolve => setTimeout(resolve, 100));
    sendBytes(Uint8Array.of(0x18));
    await waitForText("localhost:~%", nanoExitStart, 10000);
    const nanoExit = await command("NANO RESIZE EXIT", 'printf "__NANO_RESIZE_EXIT__\\n"; stty size', /__NANO_RESIZE_EXIT__[\s\S]*25 90/);
    assertions.push("nano-live-resize");
    const stale = { v: 1, sessionId: controlSessionId, seq: controlSequence - 1, op: "resize", cols: 80, rows: 24 };
    sendRawControl(stale);
    const protocolError = await waitForControl(frame => frame.op === "error", 5000);
    if (protocolError.code !== "badFrame") throw new Error(`stale COM2 frame had unexpected error: ${JSON.stringify(protocolError)}`);
    assertions.push("stale-com2-sequence-revokes-session");
    const revokedControl = await command("REVOKED CONTROL KEEPS COM1", 'printf "__COM1_STILL_LIVE__\\n"', /__COM1_STILL_LIVE__/);
    const noEchoMarker = `__SMOKE_ECHO_DISABLED_${randomHex(8)}__`;
    const echoSetup = `stty -echo; printf '\\n${noEchoMarker}\\n'`;
    const echoSetupStart = output().length;
    await sendPaced(`${echoSetup}\n`);
    await waitForCommandMarker(noEchoMarker, echoSetupStart);


    const identity = await command("IDENTITY", 'printf "__USER__:%s\\n" "$(id -un)"; printf "__ARCH__:%s\\n" "$(uname -m)"; mount', /__USER__:visitor[\s\S]*__ARCH__:i686[\s\S]*9p/);
    const account = await command("ACCOUNT", `awk -F: '$1 == "visitor" && $3 == 1000 && $4 == 1000 && $6 == "/home/visitor" && $7 == "/bin/zsh" { print "__PASSWD__:" $3 ":" $4 ":" $6 ":" $7; found = 1 } END { exit !found }' /etc/passwd; awk -F: '$1 == "visitor" && $3 == 1000 { print "__GROUP__:" $1 ":" $3; found = 1 } END { exit !found }' /etc/group; test "$(id -u)" = 1000 -a "$(id -g)" = 1000 -a "$HOME" = /home/visitor && printf "__LOGIN__:%s:%s\\n" "$(id -un)" "$(id -u)"; stat -c "__HOME__:%u:%g" /home/visitor`, /__PASSWD__:1000:1000:\/home\/visitor:\/bin\/zsh[\s\S]*__GROUP__:visitor:1000[\s\S]*__LOGIN__:visitor:1000[\s\S]*__HOME__:1000:1000/);
    const tour = await command("TOUR", "tour", /Commands: about, links, projects, cv, contact/);
    const commands = tour.split("\n").find(line => line.startsWith("Commands:"));
    if (commands !== "Commands: about, links, projects, cv, contact") throw new Error("tour advertises unsupported guest commands");
    assertions.push("tour-lists-installed-readers");
    const writable = await command("WRITABLE", 'test -w /home/visitor -a -w /tmp && printf "__WRITE_OK__\\n"; printf "first\\nsecond\\n" > /tmp/browser-os-smoke; wc -l < /tmp/browser-os-smoke; chmod 640 /tmp/browser-os-smoke; stat -c "__MODE__:%a" /tmp/browser-os-smoke; false; printf "__EXIT__:%s\\n" "$?"', /__WRITE_OK__[\s\S]*2[\s\S]*__MODE__:640[\s\S]*__EXIT__:1/);
    const unicode = await command("UNICODE", 'printf "{\\"title\\":\\"Привет\\"}" | jq -r .title; printf "__UTF8__:Живой гостевой Linux\\n"', /Привет[\s\S]*__UTF8__:Живой гостевой Linux/);
    const partialUtf8 = await command(
      "PARTIAL UTF-8 INPUT",
      'printf "__PARTIAL_UTF8__:Живой Linux\\n"',
      /__PARTIAL_UTF8__:Живой Linux/,
    );
    const tools = await command("TOOLS", `zsh --version; printf '[{"name":"Guest shell"},{"name":"Живой Linux"}]\\n' | jq -r '.[] | .name'; eza --color=never -1 /tmp/browser-os-smoke; git -C /tmp init -q browser-os-git-smoke && git -C /tmp/browser-os-git-smoke config user.name smoke && git -C /tmp/browser-os-git-smoke config user.email smoke@example.invalid && touch /tmp/browser-os-git-smoke/tracked && git -C /tmp/browser-os-git-smoke add tracked && git -C /tmp/browser-os-git-smoke commit -qm smoke && test -z "$(git -C /tmp/browser-os-git-smoke status --porcelain)" && printf "__GIT_COMMIT_OK__\\n"; printf "needle\\nother\\n" | fzf --filter=needle; XDG_DATA_HOME=/tmp/browser-os-zoxide zoxide add /tmp/browser-os-git-smoke && XDG_DATA_HOME=/tmp/browser-os-zoxide zoxide query --list`, /zsh 5\.9[\s\S]*Guest shell[\s\S]*Живой Linux[\s\S]*browser-os-smoke[\s\S]*__GIT_COMMIT_OK__[\s\S]*needle[\s\S]*browser-os-git-smoke/);
    await sendPaced("sleep 15\n");
    await new Promise(resolve => setTimeout(resolve, 300));
    const interruptRecoveryStart = output().length;
    const interruptStarted = Date.now();
    sendBytes(Uint8Array.of(3));
    await waitForText("localhost:~%", interruptRecoveryStart, 10000);
    ctrlCToPromptMs = Date.now() - interruptStarted;
    if (ctrlCToPromptMs > 3000) throw new Error("Ctrl+C did not return promptly to the guest shell");
    await new Promise(resolve => setTimeout(resolve, 100));
    const interruptShellPromptStart = output().length;
    const interrupt = await command("INTERRUPT", 'printf "__INTERRUPT_RECOVERED__\\n"', /__INTERRUPT_RECOVERED__/, 3000);
    await waitForText("localhost:~%", interruptShellPromptStart, 10000);
    await new Promise(resolve => setTimeout(resolve, 100));
    const escapeStart = output().length;
    for (const byte of [0x1b, 0x5b, 0x41]) {
      sendBytes(Uint8Array.of(byte));
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    const escapePromptStart = output().length;
    sendBytes(Uint8Array.of(3));
    await waitForText("localhost:~%", escapePromptStart, 10000);
    await new Promise(resolve => setTimeout(resolve, 100));
    const escapeRecovery = await command(
      "PARTIAL ESCAPE INPUT RECOVERY",
      'printf "__ESCAPE_RECOVERED__\\n"',
      /__ESCAPE_RECOVERED__/,
    );
    if (!output().slice(escapeStart).includes("__ESCAPE_RECOVERED__")) {
      throw new Error("partial escape sequence prevented native COM1 recovery");
    }
    assertions.push("ctrl-c-interrupt");

    if (controlError) throw new Error(controlError);
    return {
      ready: true,
      bootMs,
      ctrlCToPromptMs,
      assertions,
      configuredMemoryBytes: 128 * 1024 * 1024,
      outputBytes: serial.length,
      control: {
        ready: controlReady,
        frames: controlHistory,
        resizeAck,
        lessResizeAck,
        nanoResizeAck,
        localeAck,
        portfolioAction: openRequest,
        copyContactAction: copyRequest,
        fenceAck,
        dispatchAck,
        protocolError,
        busyDispatchAck,
      },
      evidence: {
        identity: identity.slice(-1500),
        writable: writable.slice(-1500),
        unicode: unicode.slice(-1000),
        account: account.slice(-1000),
        tour: tour.slice(-1000),
        tuiFixture: tuiFixture.slice(-500),
        lessExit: lessExit.slice(-500),
        nanoExit: nanoExit.slice(-500),
        nativeTools: tools.slice(-2000),
        interrupt: interrupt.slice(-1000),
        embeddedIdentity: embeddedIdentity.slice(-500),
        terminalSize: hostSize.slice(-500),
        localeView: hostLocale.slice(-500),
        localeTool: guestLocale.slice(-500),
        partialUtf8: partialUtf8.slice(-500),
        russianPortfolio: russianReader.slice(-500),
        russianCompatibility: russianCompatibility.slice(-500),
        englishCompatibility: englishCompatibility.slice(-500),
        portfolioCli: openResult.slice(-500),
        readers: [about, links, projects, cv, contact].map(result => result.slice(-500)),
        ezaAlias: alias.slice(-500),
        invalidPortfolioId: invalidLink.slice(-500),
        copyContactCli: copyResult.slice(-500),
        startupFile: startupFile.slice(-500),
        homeBeforeLocale: homeBeforeLocale.slice(-500),
        homeAfterLocale: homeAfterLocale.slice(-500),
        fenceInterrupt: fenceInterruptRecovery.slice(-500),
        fenceRecovery: boundaryRecovery.slice(-500),
        escapeRecovery: escapeRecovery.slice(-500),
        controlRevokedCom1: revokedControl.slice(-500),
        readyMarker: ready.slice(-500),
      },
    };
  } finally {
    emulator.remove_listener("serial0-output-byte", listener);
    emulator.remove_listener("serial1-output-byte", controlListener);
  }
}
