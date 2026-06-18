# Terminal Site Improvements TODO

## Acceptance criteria

- [x] Welcome banner gives first-time users a clear happy path.
  - Acceptance: opening the terminal shows commands for `tour`, `links`, `cv`, `projects`, and `contact`.
- [x] Guided `tour` / `start` experience exists.
  - Acceptance: `tour` prints a step-by-step route through the portfolio; `start` prints quick suggestions.
- [x] Important links are discoverable without terminal knowledge.
  - Acceptance: homepage renders a shortcut strip for quick links below the terminal.
- [x] URL-backed command output explains how to open targets.
  - Acceptance: list commands include an `open <file>` hint for URL-backed virtual files.
- [x] Portfolio aliases exist.
  - Acceptance: `resume`, `contact`, `email`, `github`, and `gh` resolve through the command registry.
- [x] Command history persists locally.
  - Acceptance: submitted commands are saved to `localStorage` and restored on terminal construction.
- [x] Terminal viewport is more responsive.
  - Acceptance: terminal uses viewport-bound height instead of a fixed 600px height and has a mobile-safe minimum.
- [x] Terminal click focuses the xterm instance.
  - Acceptance: clicking the terminal wrapper calls `focus()` on the active terminal.
- [x] Reverse history search exists.
  - Acceptance: `Ctrl+R` opens a reverse-search prompt against command history.
- [x] README content in the VFS is clean text.
  - Acceptance: `/README.md` excludes decorative `bat` borders from rendered homepage content.
- [x] Project virtual files include richer metadata.
  - Acceptance: files in `/projects` include type, context, URL, and an open hint.
- [x] Contact directory and command exist.
  - Acceptance: `/contact` contains high-signal contact routes; `contact` lists them.
- [x] Terminal onboarding and tour are localized for EN/RU.
  - Acceptance: welcome and `tour` copy use the active VFS language.
- [x] Language switch preserves the current virtual directory when possible.
  - Acceptance: switching language while in an existing directory keeps `cwd` at that path.
- [x] Terminal theme is centralized.
  - Acceptance: xterm colors are imported from `terminal/theme.ts`.
- [x] Unit coverage exists for parser, completion, VFS, and command registry behavior.
  - Acceptance: `pnpm --dir apps/main test:terminal` passes.
- [x] Unknown commands suggest close matches.
  - Acceptance: mistyped commands with edit distance <= 2 print a “Did you mean …?” hint.

## Follow-ups

- [x] Add end-to-end browser tests for keyboard interactions such as `Ctrl+R`, click-to-focus, and URL opening.
  - Acceptance: `pnpm --dir apps/main test:e2e` launches the homepage and checks the shortcut strip, command palette, and reverse-search prompt.
- [x] Consider a richer command palette overlay if analytics show non-terminal users miss the shortcut strip.
  - Acceptance: the shortcut strip includes a palette button that opens a keyboard-dismissable command/link panel.
- [x] Add per-project custom descriptions instead of generated metadata once final copy is available.
  - Acceptance: project entries carry curated year, tech, and description metadata that the VFS writes into project files.

## Future ideas

- [ ] Add analytics around shortcut-strip and command-palette usage before expanding the palette into a full fuzzy launcher.
- [ ] Add URL-opening assertions once the browser test harness can safely intercept every external destination.
