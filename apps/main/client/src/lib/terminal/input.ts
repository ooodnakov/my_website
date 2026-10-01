import type { Terminal } from "@xterm/xterm";
import type { TerminalSessionInput } from "./session";

export function bindTerminalInput(
  terminal: Pick<Terminal, "onData" | "onBinary">,
  input: TerminalSessionInput,
): { dispose(): void } | null {
  if (input.owner === "legacy-shell-key-events") return null;
  let disposed = false;

  const encoder = new TextEncoder();
  const dataListener = terminal.onData((text) => input.sendBytes(encoder.encode(text)));
  const binaryListener = terminal.onBinary((binary) => {
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) & 0xff;
    input.sendBytes(bytes);
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      dataListener.dispose();
      binaryListener.dispose();
    },
  };
}
