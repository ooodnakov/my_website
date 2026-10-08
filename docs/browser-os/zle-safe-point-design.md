# Pinned zsh ZLE safe-point design

Status: source-level design and proof plan only. No zsh source patch is implemented or approved. COM2 host quick-action dispatch remains disabled; the guest broker must continue to report every input fence as `unknown` and reject every `dispatchAction`.

## Pinned source and relevant state

The target is Alpine `zsh=5.9-r7`, built from the pinned 5.9 source archive recorded in the generated package inventory (`zsh-5.9.tar.xz`, SHA-512 `d9138b7f379ad942a5f46819d2dd52d31f3a1129f2a0d1b53d4c5cd43c318b60396da6d37c57c477b8e958fb750209aca0ae93f8c9dd42ac958de006a0ff067e`). The proposal must patch and test the actual Alpine package source/patch series, not a newer zsh tree.

The Alpine package recipe is pinned at [`alpinelinux/aports` commit `d5a34ef`](https://github.com/alpinelinux/aports/blob/d5a34efc88bbe8d18737fda28125071c4aef8517/main/zsh/APKBUILD): `zsh=5.9-r7`, source archive `zsh-5.9.tar.xz`, SHA-512 `d9138b7f379ad942a5f46819d2dd52d31f3a1129f2a0d1b53d4c5cd43c318b60396da6d37c57c477b8e958fb750209aca0ae93f8c9dd42ac958de006a0ff067e`. Its patch series is `skip-test-failing-on-musl.patch`, `zsh-newuser-install-alpine.patch`, `fix-gcc14-incompatible-pointer-types.patch`, `implicit.patch`, `0001-50278-use-man-w-in-preference-to-manpath-fix-caching.patch`, and `tests-user.patch`; inspection of every patch at that commit found no changes to `Src/Zle/zle_main.c` or `Src/Zle/zle_keymap.c`. The source trace below uses the [upstream 5.9 tag](https://github.com/zsh-users/zsh/tree/zsh-5.9), not current `master`.

- [`getbyte()` and `ungetbyte()`](https://github.com/zsh-users/zsh/blob/zsh-5.9/Src/Zle/zle_main.c#L348-L378) show that `getbyte()` drains the private LIFO `kungetbuf` before reading `SHTTY`; `ungetbytes()` can return already-read key suffix bytes to that stack. A PTY write counter or empty kernel queue is therefore not an editor-consumption watermark.
- [`getkeymapcmd()`](https://github.com/zsh-users/zsh/blob/zsh-5.9/Src/Zle/zle_keymap.c#L1590-L1690) reads through keymap prefixes, preserves the last matching binding, and pushes any read-ahead suffix back with `ungetbytes()`. Its multibyte resolver uses a separate `mbstate_t`; incomplete characters can trigger additional reads under `KEYTIMEOUT`.
- [`getrestchar()`](https://github.com/zsh-users/zsh/blob/zsh-5.9/Src/Zle/zle_main.c#L980-L1064) treats a timed-out partial multibyte character as `?` and resets decoder state. An idle wait or prompt hook cannot distinguish that transition from a complete character without observing the core decoder.
- [`zlecore()`](https://github.com/zsh-users/zsh/blob/zsh-5.9/Src/Zle/zle_main.c#L1105-L1200) executes the widget, prefix/undo handling, redraw hook, and then begins the next key read. That loop boundary is the only candidate for a core safe-point event; it still needs explicit top-level-editor, keymap, read-ahead, multibyte, pending-signal, and foreground-process checks.
- [`zleread()` and the context enum](https://github.com/zsh-users/zsh/blob/zsh-5.9/Src/Zle/zle_main.c#L1211-L1375) establish and tear down each edit, set `zlecontext`/`zleactive`, and distinguish `ZLCON_LINE_START` from continuation, select, and `vared` contexts ([`Src/zsh.h`](https://github.com/zsh-users/zsh/blob/zsh-5.9/Src/zsh.h#L3225-L3229)). Recursive edits also need exclusion through `zle_recursive`; prompt hooks do not prove the active editor context.

## Proposed safe-point event

Add one internal, fixed-record safe-point notification at the `zlecore()` loop boundary after a widget has returned and all its state changes have settled, before the next `getkeycmd()` begins. Report a clean state only when all predicates hold in the core at that instant:

1. This is the visitor's top-level interactive `ZLCON_LINE_START` editor, not `vared`, a recursive edit, completion, a local keymap prompt, or a foreground application.
2. The main keymap is active; `zleactive` is true; `zleline` is empty and the cursor/line state is coherent.
3. `kungetct == 0`, no unresolved `keybuf` prefix remains, and the key-sequence resolver has returned a complete binding. For multibyte builds, the decoder state is complete; do not infer this from `KEYS_QUEUED_COUNT` or `lastchar_wide_valid` alone.
4. No widget is still executing, no signal/interrupt/error is pending, no completion/listing/menu/vi operator or local keymap state is active, and no bytes remain in the broker's pre-fence or post-fence input queues.
5. The broker has forwarded every raw COM1 byte through the fence target to the PTY in order, with no Ctrl+C/reset, overflow, timeout, session change, or foreground-process transition invalidating the fence.

Use a broker-owned, nonblocking, close-on-exec status channel with a small fixed binary record (version, monotonically increasing editor generation, consumed byte watermark, state enum). No shell text, commands, paths, payloads, or arbitrary host data enter this channel. The record is advisory until the broker matches its generation and watermark to the one outstanding fence. If the channel is full, stale, unavailable, or sees an unknown state, drop the clean claim and reject the fence; never block ZLE on COM2 or broker scheduling.

A monotonically increasing count at `read(SHTTY)` or `getbyte()` is not this watermark: `getkeymapcmd()` may read a suffix past a complete binding and return those bytes through `ungetbytes()`. The minimal core patch must preserve raw input ordinals across `getbyte()`, `kungetbuf`, `keybuf`, multibyte resolution, and keymap suffix pushback, and advance the consumed watermark only when the resolver hands the complete input unit to the completed widget. Without that provenance, the boundary record cannot prove that the fence target was consumed.

Do not run a shell function/widget to declare cleanliness. Calling shell hooks from the middle of key resolution can re-enter ZLE, execute user code, change keymaps, or mutate `BUFFER`; a read-only C-side predicate avoids that reentrancy. Existing `zle-line-init`, `zle-line-finish`, `precmd`, and `zle-line-pre-redraw` hooks remain advisory only.

## Dispatch and interruption invariants

Even after a clean safe-point ACK, the broker must recheck the same one-use session/fence/generation and empty ZLE/input state immediately before launching one fixed guest action. Any byte arriving after the fence is held unchanged in FIFO order until the decision resolves. An incomplete or stale boundary, input overflow, frame error, COM2 revocation, one-second deadline, foreground ownership, or Ctrl+C/reset consumes/rejects the pending action and releases every held byte unchanged and in order. Ctrl+C remains native COM1 `0x03`/`ISIG`; it is never queued behind COM2 and never waits for a locale, fence, or dispatch response.

The C notification is not itself permission to act. It must not enqueue characters into `BUFFER`, call `ungetbyte()`, inject a marker, invoke a widget, or bypass the fixed `dispatchAction` allowlist. Quick actions remain disabled until the complete patch, broker bridge, exact frame race behavior, and tests below pass review.

## Patch staging after explicit approval

1. Keep the source change small and local to the pinned zsh 5.9 package patch series. Add a core safe-point predicate/event at the `zlecore()` loop boundary and explicit tracking for incomplete key-sequence / multibyte resolution; do not add a general widget executor or shell command interface.
2. Add the broker-side fixed-record reader and generation/watermark matching. Keep all COM2 parsing, action allowlisting, FIFO release, deadline, and Ctrl+C behavior in `browser-osd`.
3. Regenerate the package/source inventory and full guest assets, then verify the embedded descriptor and exact manifest build identity. Preserve both independent generated trees and all input/source records for review.
4. Keep host dispatch disabled until the positive and negative tests below are independently reviewed.

## Bounded generated-guest smoke evidence

Two cold starts of the independently built current guest ran the actual Alpine `zsh=5.9-r7` package: Node `22.23.3` using the matching Website `Com2Decoder`/`encodeHostControlFrame` source (commit `e0472d651004b29319c61eb7a7d38842eb99dfcb`, SHA-256 `4cb5e42b8674e437e134f311bd9f353d38493cc1635681ab1b2253febbf63cb4`), and real Chromium `154.0.8037.57` using the smoke runner's fallback framing parser. Both passed the generated-guest startup, locale, and shell-ready identity checks. The observed cold shell-ready times were 123,967 ms (Node) and 167,734 ms (Chromium); these are single-run samples, not latency targets or p95 evidence.

Both runs passed the bounded partial UTF-8/escape recovery, busy/unsent-input dispatch rejection, unknown-fence fail-closed behavior, Ctrl+C across the COM1/COM2 fence race, post-fence input recovery, and live `less`/`nano` resize checks. Ctrl+C returned to the prompt in 67 ms (Node) and 94 ms (Chromium). These guest-level results exercise the broker and real shell, but do not expose or prove zsh's private `kungetbuf`, keymap `keybuf`, or multibyte decoder watermark. The proposed ZLE safe-point remains unimplemented; every fence must remain `unknown` and quick-action dispatch disabled.

## Required proof matrix

- **Input boundary:** single byte, multi-byte UTF-8, combining characters, Cyrillic, incomplete UTF-8, invalid UTF-8, ESC alone, partial CSI, multi-key bindings, send-string bindings, bracketed paste, and backspace/delete. No clean ACK while a sequence or character is incomplete; correct recovery after timeout/invalid sequence.
- **Read-ahead:** bytes split across the PTY kernel queue, ZLE `keybuf`, `kungetbuf`, keymap suffix pushback, alias/send-string expansion, and bytes held by the broker. Clean ACK only when the matching target has actually passed a core safe point. A pending byte must never be lost, duplicated, or overwritten by an action.
- **Editor states:** empty prompt, non-empty unsent buffer, cursor movement, history navigation, completion menu/list, incremental search, vi insert/command/operator modes, recursive edit, `vared`, and foreground `less`/`nano`. Only the supported top-level empty prompt may report clean.
- **Races and bounds:** COM1 input concurrent with COM2 fence, bytes before/after fence, duplicate/stale sequence, repeated fence, event-generation rollover, broker queue saturation, COM2 loss, timeout, reset, action ACK loss, and Ctrl+C at each point. Every rejected path releases held input in byte-identical order; Ctrl+C/reset remains immediate and independent.
- **Platform behavior:** native terminal echo/editing, `stty size`, wrapping, editor/`less` geometry and SIGWINCH, locale changes preserving home, startup/reset, and real generated-guest Node plus Chromium execution against the exact pinned manifest.
- **Safety assertions:** no dispatch during busy/TUI/editing/unsynchronized state; no arbitrary command input through COM2; duplicate action requests never execute twice; accepted ACK means a single fixed action was launched, not completed.

A passing unit test or source inspection alone is insufficient. Keep the browser guest opt-in and dispatch disabled until a real Node/Chromium cold start, all negative/race tests, and independent review succeed.
