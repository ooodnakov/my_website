function randomHex(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function findStandaloneMarker(text, marker, fromIndex = 0) {
  const lines = text.slice(fromIndex).split("\n");
  return lines.some((line, index) => {
    const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
    return normalized === marker && (index < lines.length - 1 || text.endsWith("\n"));
  });
}

export function extractCommandOutput(transcript, offset, commandText, markerCommand, marker) {
  const localText = transcript.slice(offset);
  const lines = localText.split("\n");
  const markerIndex = lines.findIndex(line => (line.endsWith("\r") ? line.slice(0, -1) : line) === marker);
  if (markerIndex === -1 || (markerIndex === lines.length - 1 && !localText.endsWith("\n"))) return null;
  return lines.slice(0, markerIndex)
    .map(line => line.endsWith("\r") ? line.slice(0, -1) : line)
    .filter(line => line !== commandText && line !== markerCommand)
    .join("\n")
    .trim();
}

export async function runGuestSmoke(emulator, bootStartedAt, timeoutMs = 180000, onShellReady = () => {}) {
  const serial = [];
  const decoder = new TextDecoder();
  const start = bootStartedAt;
  const listener = byte => serial.push(byte);
  emulator.add_listener("serial0-output-byte", listener);

  const output = () => decoder.decode(Uint8Array.from(serial));
  const waitFor = async (marker, fromIndex = 0, timeout = timeoutMs) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const text = output();
      if (findStandaloneMarker(text, marker, fromIndex)) return text;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`guest timed out waiting for ${marker}; serial output: ${output().slice(-4000)}`);
  };
  const send = text => emulator.serial_send_bytes(0, new TextEncoder().encode(text));
  const assertions = [];
  const requireMatch = (name, text, regex) => {
    if (!regex.test(text)) throw new Error(`${name} failed; command-local output: ${text.slice(-4000)}`);
    assertions.push(name);
  };
  const command = async (name, shell, matcher, timeout = timeoutMs) => {
    const marker = `__SMOKE_RESULT_${randomHex(8)}__`;
    const markerCommand = `printf '\\n${marker}\\n'`;
    const before = output().length;
    send(`${shell}\n${markerCommand}\n`);
    const transcript = await waitFor(marker, before, timeout);
    const result = extractCommandOutput(transcript, before, shell, markerCommand, marker);
    if (result === null) throw new Error(`${name} result marker was not a complete standalone line`);
    requireMatch(name, result, matcher);
    return result;
  };

  try {
    const ready = await waitFor("__GUEST_READY__");
    const bootMs = Date.now() - start;
    await onShellReady({ bootMs, guestOutputBytes: serial.length });
    const noEchoMarker = `__SMOKE_ECHO_DISABLED_${randomHex(8)}__`;
    const echoSetup = `stty -echo; printf '\\n${noEchoMarker}\\n'`;
    const echoSetupStart = output().length;
    send(`${echoSetup}\n`);
    await waitFor(noEchoMarker, echoSetupStart);


    const identity = await command("IDENTITY", 'printf "__USER__:%s\\n" "$(id -un)"; printf "__ARCH__:%s\\n" "$(uname -m)"; mount', /__USER__:visitor[\s\S]*__ARCH__:i686[\s\S]*9p/);
    const writable = await command("WRITABLE", 'test -w /home/visitor -a -w /tmp && printf "__WRITE_OK__\\n"; printf "first\\nsecond\\n" > /tmp/browser-os-smoke; wc -l < /tmp/browser-os-smoke; chmod 640 /tmp/browser-os-smoke; stat -c "__MODE__:%a" /tmp/browser-os-smoke; false; printf "__EXIT__:%s\\n" "$?"', /__WRITE_OK__[\s\S]*2[\s\S]*__MODE__:640[\s\S]*__EXIT__:1/);
    const unicode = await command("UNICODE", 'printf "{\\"title\\":\\"Привет\\"}" | jq -r .title; printf "__UTF8__:Живой гостевой Linux\\n"', /Привет[\s\S]*__UTF8__:Живой гостевой Linux/);
    const tools = await command("TOOLS", `zsh --version; printf '[{"name":"Guest shell"},{"name":"Живой Linux"}]\\n' | jq -r '.[] | .name'; eza --color=never -1 /tmp/browser-os-smoke; git -C /tmp init -q browser-os-git-smoke && git -C /tmp/browser-os-git-smoke config user.name smoke && git -C /tmp/browser-os-git-smoke config user.email smoke@example.invalid && touch /tmp/browser-os-git-smoke/tracked && git -C /tmp/browser-os-git-smoke add tracked && git -C /tmp/browser-os-git-smoke commit -qm smoke && test -z "$(git -C /tmp/browser-os-git-smoke status --porcelain)" && printf "__GIT_COMMIT_OK__\\n"; printf "needle\\nother\\n" | fzf --filter=needle; XDG_DATA_HOME=/tmp/browser-os-zoxide zoxide add /tmp/browser-os-git-smoke && XDG_DATA_HOME=/tmp/browser-os-zoxide zoxide query --list`, /zsh 5\.9[\s\S]*Guest shell[\s\S]*Живой Linux[\s\S]*browser-os-smoke[\s\S]*__GIT_COMMIT_OK__[\s\S]*needle[\s\S]*browser-os-git-smoke/);
    const interruptStarted = Date.now();
    send("sleep 15\n");
    await new Promise(resolve => setTimeout(resolve, 300));
    emulator.serial_send_bytes(0, Uint8Array.of(3));
    const interrupt = await command("INTERRUPT", 'printf "__INTERRUPT_RECOVERED__\\n"', /__INTERRUPT_RECOVERED__/, 3000);
    if (Date.now() - interruptStarted > 3000) throw new Error("Ctrl+C did not return promptly to the guest shell");
    assertions.push("ctrl-c-interrupt");

    return {
      ready: true,
      bootMs,
      assertions,
      configuredMemoryBytes: 128 * 1024 * 1024,
      outputBytes: serial.length,
      evidence: {
        identity: identity.slice(-1500),
        writable: writable.slice(-1500),
        unicode: unicode.slice(-1000),
        nativeTools: tools.slice(-2000),
        interrupt: interrupt.slice(-1000),
        readyMarker: ready.slice(-500),
      },
    };
  } finally {
    emulator.remove_listener("serial0-output-byte", listener);
  }
}
