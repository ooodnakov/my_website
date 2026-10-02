import type { Terminal } from "@xterm/xterm";
import type { TerminalSessionInput } from "./session";

export function bindTerminalInput(
  terminal: Pick<Terminal, "onData" | "onBinary">,
  input: TerminalSessionInput,
): { dispose(): void } | null {
  if (input.owner === "legacy-shell-key-events") return null;
  let disposed = false;
  let dataListener: { dispose(): void } | null = null;
  let binaryListener: { dispose(): void } | null = null;

  const encoder = new TextEncoder();
  try {
    dataListener = terminal.onData((text) => {
      if (!disposed) input.sendBytes(encoder.encode(text));
    });
    binaryListener = terminal.onBinary((binary) => {
      if (disposed) return;
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index) & 0xff;
      input.sendBytes(bytes);
    });
  } catch (error) {
    disposed = true;
    try {
      dataListener?.dispose();
    } catch {
      // Preserve the listener-attachment error as the setup failure.
    }
    throw error;
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        dataListener?.dispose();
      } finally {
        binaryListener?.dispose();
      }
    },
  };
}
