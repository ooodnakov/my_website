# Pinned zsh ZLE safe-point design

Status: source-level design and proof plan only. No zsh source patch is implemented or approved. COM2 host quick-action dispatch remains disabled; the guest broker must continue to report every input fence as `unknown` and reject every `dispatchAction`.

## Pinned source and relevant state

The target is Alpine `zsh=5.9-r7`, built from the pinned 5.9 source archive recorded in the generated package inventory (`zsh-5.9.tar.xz`, SHA-512 `d9138b7f379ad942a5f46819d2dd52d31f3a1129f2a0d1b53d4c5cd43c318b60396da6d37c57c477b8e958fb750209aca0ae93f8c9dd42ac958de006a0ff067e`). The proposal must patch and test the actual Alpine package source/patch series, not a newer zsh tree.

Source trace:

- `Src/Zle/zle_main.c`: `getbyte()` drains the private `kungetbuf`/`kungetct` stack before reading more bytes; `ungetbyte()`, `ungetbytes()`, and `ungetbytes_unmeta()` can move already-read bytes back into that stack. Therefore a broker PTY write count or empty kernel queue is not an editor-consumption watermark.
- `Src/Zle/zle_keymap.c`: `getkeymapcmd()` accumulates key sequences in `keybuf`/`keybuflen`, probes keymap prefixes, and can push unused suffix bytes back through `ungetbytes()`. With multibyte support, `getrestchar_keybuf()` may read additional bytes while a wide character is incomplete. Escape-prefix timeout and multibyte continuation are distinct incomplete states.
- `Src/Zle/zle_main.c`: `zlecore()` repeatedly obtains a complete binding with `getkeycmd()`, executes it with `execzlefunc()`, processes prefixes/undo, runs redraw hooks, and then starts the next read. This loop—not a prompt hook, PTY queue observation, or shell-state callback—is the candidate point to report editor consumption.
- `Src/Zle/zle_main.c`: `zleread()` initializes and tears down an editing invocation around `zlecore()`. A line-finish hook is not proof that the next top-level prompt is active; nested/recursive edits and completion paths must not be mistaken for the visitor's main prompt.

## Proposed safe-point event

Add one internal, fixed-record safe-point notification at the `zlecore()` loop boundary after a widget has returned and all its state changes have settled, before the next `getkeycmd()` begins. Report a clean state only when all predicates hold in the core at that instant:

1. This is the visitor's top-level interactive `ZLCON_LINE_START` editor, not `vared`, a recursive edit, completion, a local keymap prompt, or a foreground application.
2. The main keymap is active; `zleactive` is true; `zleline` is empty and the cursor/line state is coherent.
3. `kungetct == 0`, no unresolved `keybuf` prefix remains, and the key-sequence resolver has returned a complete binding. For multibyte builds, the decoder state is complete; do not infer this from `KEYS_QUEUED_COUNT` or `lastchar_wide_valid` alone.
4. No widget is still executing, no signal/interrupt/error is pending, no completion/listing/menu/vi operator or local keymap state is active, and no bytes remain in the broker's pre-fence or post-fence input queues.
5. The broker has forwarded every raw COM1 byte through the fence target to the PTY in order, with no Ctrl+C/reset, overflow, timeout, session change, or foreground-process transition invalidating the fence.

Use a broker-owned, nonblocking, close-on-exec status channel with a small fixed binary record (version, monotonically increasing editor generation, consumed byte watermark, state enum). No shell text, commands, paths, payloads, or arbitrary host data enter this channel. The record is advisory until the broker matches its generation and watermark to the one outstanding fence. If the channel is full, stale, unavailable, or sees an unknown state, drop the clean claim and reject the fence; never block ZLE on COM2 or broker scheduling.

Do not run a shell function/widget to declare cleanliness. Calling shell hooks from the middle of key resolution can re-enter ZLE, execute user code, change keymaps, or mutate `BUFFER`; a read-only C-side predicate avoids that reentrancy. Existing `zle-line-init`, `zle-line-finish`, `precmd`, and `zle-line-pre-redraw` hooks remain advisory only.

## Dispatch and interruption invariants

Even after a clean safe-point ACK, the broker must recheck the same one-use session/fence/generation and empty ZLE/input state immediately before launching one fixed guest action. Any byte arriving after the fence is held unchanged in FIFO order until the decision resolves. An incomplete or stale boundary, input overflow, frame error, COM2 revocation, one-second deadline, foreground ownership, or Ctrl+C/reset consumes/rejects the pending action and releases every held byte unchanged and in order. Ctrl+C remains native COM1 `0x03`/`ISIG`; it is never queued behind COM2 and never waits for a locale, fence, or dispatch response.

The C notification is not itself permission to act. It must not enqueue characters into `BUFFER`, call `ungetbyte()`, inject a marker, invoke a widget, or bypass the fixed `dispatchAction` allowlist. Quick actions remain disabled until the complete patch, broker bridge, exact frame race behavior, and tests below pass review.

## Patch staging after explicit approval

1. Keep the source change small and local to the pinned zsh 5.9 package patch series. Add a core safe-point predicate/event at the `zlecore()` loop boundary and explicit tracking for incomplete key-sequence / multibyte resolution; do not add a general widget executor or shell command interface.
2. Add the broker-side fixed-record reader and generation/watermark matching. Keep all COM2 parsing, action allowlisting, FIFO release, deadline, and Ctrl+C behavior in `browser-osd`.
3. Regenerate the package/source inventory and full guest assets, then verify the embedded descriptor and exact manifest build identity. Preserve both independent generated trees and all input/source records for review.
4. Keep host dispatch disabled until the positive and negative tests below are independently reviewed.

## Required proof matrix

- **Input boundary:** single byte, multi-byte UTF-8, combining characters, Cyrillic, incomplete UTF-8, invalid UTF-8, ESC alone, partial CSI, multi-key bindings, send-string bindings, bracketed paste, and backspace/delete. No clean ACK while a sequence or character is incomplete; correct recovery after timeout/invalid sequence.
- **Read-ahead:** bytes split across the PTY kernel queue, ZLE `keybuf`, `kungetbuf`, keymap suffix pushback, alias/send-string expansion, and bytes held by the broker. Clean ACK only when the matching target has actually passed a core safe point. A pending byte must never be lost, duplicated, or overwritten by an action.
- **Editor states:** empty prompt, non-empty unsent buffer, cursor movement, history navigation, completion menu/list, incremental search, vi insert/command/operator modes, recursive edit, `vared`, and foreground `less`/`nano`. Only the supported top-level empty prompt may report clean.
- **Races and bounds:** COM1 input concurrent with COM2 fence, bytes before/after fence, duplicate/stale sequence, repeated fence, event-generation rollover, broker queue saturation, COM2 loss, timeout, reset, action ACK loss, and Ctrl+C at each point. Every rejected path releases held input in byte-identical order; Ctrl+C/reset remains immediate and independent.
- **Platform behavior:** native terminal echo/editing, `stty size`, wrapping, editor/`less` geometry and SIGWINCH, locale changes preserving home, startup/reset, and real generated-guest Node plus Chromium execution against the exact pinned manifest.
- **Safety assertions:** no dispatch during busy/TUI/editing/unsynchronized state; no arbitrary command input through COM2; duplicate action requests never execute twice; accepted ACK means a single fixed action was launched, not completed.

A passing unit test or source inspection alone is insufficient. Keep the browser guest opt-in and dispatch disabled until a real Node/Chromium cold start, all negative/race tests, and independent review succeed.
