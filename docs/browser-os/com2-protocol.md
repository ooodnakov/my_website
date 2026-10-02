# Browser OS COM2 control protocol

Status: proposed v1 contract only. No COM2 daemon, shell-state reporter, or session-adapter behavior is implemented by this guest-build task. This protocol is separate from the xterm byte stream on COM1/`ttyS0`; never render COM2 bytes in xterm.

## Transport and framing

- The v86 host enables UART1 (`uart1: true`) and listens to `serial1-output-byte`. UART index 1 is COM2 / guest `/dev/ttyS1`.
- Host input uses `serial_send_bytes(1, Uint8Array)`. Do not use `serial0_send` or UTF-16 string transport. The proposed guest control process opens `/dev/ttyS1` in raw, no-echo mode at 115200 baud, 8 data bits, no parity, 1 stop bit.
- A frame is `BOS1` (four ASCII bytes), a 16-bit unsigned big-endian payload length, then that many UTF-8 JSON bytes. Length is 1–4096 bytes. The JSON root is one flat object; arrays, nested objects, and free-form strings are not accepted. Parsers accept arbitrary chunk boundaries, reject oversized or malformed payloads, and resynchronize at the next `BOS1` marker without treating COM1/user serial output as control data.
- Every object has exactly `v: 1`, `sessionId`, `seq`, and `op`, plus only the operation's listed fields. `sessionId` is exactly 32 lowercase hexadecimal characters (128-bit host-generated value). `seq` is an integer in `[1, 2^31-1]`, strictly increasing per direction and session. Unknown keys, operations, versions, stale session IDs, duplicate/out-of-order sequence numbers, wrong types, and out-of-range values are rejected. A payload has at most seven fields. No command text, shell fragments, URLs, HTML, clipboard payloads, or arbitrary data are accepted.

Example wire payload (header omitted):

```json
{"v":1,"sessionId":"0123456789abcdef0123456789abcdef","seq":1,"op":"hello","cols":80,"rows":24}
```

## Operations

| Direction | `op` | Required operation fields and bounds | Meaning |
|---|---|---|---|
| host → guest | `hello` | `cols`: integer 2–300; `rows`: integer 2–120 | Starts a new session; guest discards state from every previous session ID. |
| guest → host | `ready` | `guestBuildId`: 1–64 ASCII bytes matching `[a-z0-9][a-z0-9.-]*`; `cols`, `rows` use the `hello` bounds | Control daemon is initialized and ttyS0 dimensions are applied. Does not mean zsh startup is complete or that the shell is at a clean prompt. |
| guest → host | `shellReady` | `guestBuildId` as above | The nonroot visitor zsh startup hook completed. This startup event is independent of shell prompt/input state and does not imply a clean prompt. |
| guest → host | `shellState` | `state`: `cleanPrompt`, `editing`, `busy`, or `unknown` | Reports shell state without command text. `cleanPrompt` means ZLE is active with an empty buffer; `editing` means ZLE is active with a nonempty buffer; `busy` means a command is executing; `unknown` is the initial or unsynchronized state. Shell state remains `unknown` until reported after startup and returns to `unknown` if the reporter loses synchronization. |
| host → guest | `resize` | `cols`: integer 2–300; `rows`: integer 2–120 | Applies validated dimensions to ttyS0 with `TIOCSWINSZ`; signal the ttyS0 foreground process group with `SIGWINCH`. Never construct a shell command from dimensions. |
| guest → host | `resizeAck` | `cols`, `rows` use the `hello` bounds | Confirms the applied size. |
| host → guest | `setLocale` | `locale`: exactly `en` or `ru` | Switches the selected generated portfolio view without recreating the guest or changing writable home state. |
| guest → host | `localeAck` | `locale`: exactly `en` or `ru` | Confirms the selected view. |
| guest → host | `portfolioAction` | `action`: `open` or `copyContact`; `linkId`: 1–32 ASCII bytes matching `[a-z0-9][a-z0-9-]*` | Requests a host action using an ID from the pinned generated manifest. The host independently checks the ID against its own allowlist and requires an explicit user gesture for open/copy. |
| host → guest | `ack` | `ackSeq`: integer `[1, 2^31-1]`; `status`: `ok` or `rejected` | Acknowledges or rejects an accepted request. Rejections do not disclose shell text or arbitrary URLs. |
| guest → host | `error` | `code`: `badFrame`, `badSession`, `badSequence`, `badOperation`, `badValue`, or `internal` | Reports a bounded error code; never sends raw exception text. |

## Readiness and interactive state

`emulator-ready` means only that v86 initialized. Guest `ready` means only that the control daemon and tty sizing are initialized. `shellReady` means only that the zsh startup hook completed. Neither event means the prompt is clean or input editing is idle.

The proposed shell reporter sends `shellState` from fixed zsh/ZLE hooks: `busy` on command execution, `cleanPrompt` when ZLE becomes active with an empty buffer, and `editing` when the active buffer is nonempty. The state may be `unknown` before the first trustworthy ZLE report or after reporter loss. The host must not infer shell readiness or prompt state from terminal text, the presence of a prompt string, or COM1 output. A UI that needs safe idle-only actions must wait for `cleanPrompt`; normal COM1 bytes and Ctrl+C continue to behave as native tty input.

`guestBuildId` is the exact guest release string from `manifest.json`. The ttyS0 shell-ready marker remains independently observable by the session adapter; it does not replace `shellReady` or `shellState`. Control traffic is never injected into a foreground TUI.

## Guest implementation constraints

- One small root-owned control process owns ttyS1 and ttyS0 resize ioctls. It grants only the listed operations; it does not expose a generic RPC, root shell, filesystem path, arbitrary process execution, or network access.
- The visitor zsh startup hook signals only `shellReady` through a fixed local IPC endpoint. It does not send user-entered shell content. Separate fixed ZLE hooks report only the bounded `shellState` enum.
- `portfolioAction.linkId` must resolve to a generated ID such as `cv`, `projects`, or a contact key; it is never interpreted as a URL. Clipboard/open prompts are rendered by the host, not automatically triggered by guest text.
- Repeated `hello` with a new session ID resets sequence tracking, pending requests, startup readiness, and shell state to `unknown`. A malformed frame is dropped; parser buffers are bounded to one maximum-size frame plus its header.
- COM1 remains the existing xterm 6 byte stream: input is UTF-8 encoded bytes, output is the serial byte stream, and guest echo/editing/signals are native tty behavior.
