# Terminal implementation task list

## Acceptance criteria

- [x] Terminal work is tracked in this file with a complete command-focused task list.
- [x] Shell command parsing supports quoted arguments, escaped characters, comments, and malformed quote errors.
- [x] Command execution is data-driven through a registry with aliases, help text, usage, and examples.
- [x] Existing commands keep working: `help`, `clear`, `pwd`, `ls`, `eza`, `ll`, `cd`, `cat`, `bat`, `echo`, and `sudo`.
- [x] Expanded Unix-like commands are available: `la`, `tree`, `find`, `head`, `tail`, `less`, `wc`, `grep`, `sort`, `uniq`, `history`, `man`, `date`, `whoami`, `hostname`, and `open`.
- [x] Portfolio commands are available: `about`, `cv`, `projects`, `socials`, `links`, and `archive`.
- [x] Virtual filesystem exposes metadata/stat helpers, recursive walking, path normalization, and URL lookup for openable entries.
- [x] Help and manual output are generated from registry metadata so command docs stay synchronized.
- [x] Shell input supports cursor movement, Home/End, Delete, Ctrl+A/E/U/K/L/C, history navigation, `!!`, and tab completion.
- [x] Command and path completion provide inline completion or candidate lists.
- [x] Implementation passes TypeScript checking for the main app.
- [x] A production build succeeds for the unified site.
- [x] Docker build preflight mirrors the Dockerfile package-manager version, frozen installs, and app build steps.
- [x] A root `docker:build` script documents and standardizes the production Docker image command.

## Completed tasks

1. Reviewed latest git history and existing xterm migration.
2. Created a persistent terminal task and acceptance criteria file.
3. Extracted shell parsing, command registry, command metadata, and completion into dedicated modules.
4. Enhanced the virtual filesystem with node metadata and traversal helpers.
5. Implemented expanded Unix-like and portfolio command set.
6. Refactored `Shell` to use the command registry, readline editing, history, and completion.
7. Added root Docker build/preflight scripts so Docker validation is repeatable.
8. Ran validation commands and committed the completed work.
