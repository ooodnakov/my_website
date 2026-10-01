# Unified Site Workspace

This repository groups the current website-related sources into one place.

## Layout

- `apps/main`: main React/Tailwind site shell that serves `/`, `/en`, and `/ru`
- `apps/cv-site`: separate CV-focused frontend
- `apps/legacy_rewored`: earlier Vite rebuild plus preserved legacy assets
- `apps/legacy_rewored/legacy_old`: old preserved static site tree
- `docker-compose.yaml`: repo-level compose entrypoint for the unified deployment

## Notes

- Original source directories were left in place outside this repo.
- Generated folders such as `node_modules` and `dist` are intentionally excluded here.
- The main homepage refactor should happen in `apps/main`.

## Running

- Use `docker compose up --build` from the repository root.
- The compose file now builds from the unified repo and uses `apps/main/Dockerfile`

## Development

Use Node 22 (matching CI; `.nvmrc` is provided) and the pinned pnpm 10.18.3.
This is not a pnpm workspace: dependencies must be installed in all three apps.
From the repository root:

```sh
nvm use                         # if using nvm; otherwise select Node 22
corepack enable pnpm            # once, if no pnpm shim is available
pnpm run deps:install            # all app installs, with frozen lockfiles
pnpm run setup:browser          # install Playwright's matching ARM64/x64 Chromium
pnpm run validate              # typecheck, CV lint/tests, terminal tests, unified build
pnpm run test:e2e               # real browser tests against the main Vite client
pnpm run test:e2e:production    # rebuild, then test Express plus CV/legacy routes
```

Corepack reads the root `packageManager` pin. Without Corepack, use
`npx --yes pnpm@10.18.3 run <script>` instead. Do not run `pnpm setup`:
that is pnpm's shell-configuration command, not this repository's installer.
For a read-only Node installation, Corepack shims can be placed in a user-writable
directory with `corepack enable pnpm --install-directory <directory>` and added
to `PATH` for the current shell only.

Playwright runs two workers, starts/stops its own server on `127.0.0.1:5000`, and
refuses to reuse another process on that port. Production tests require the
unified build; Vite alone cannot verify `/cv/` and `/legacy/` integration.
On a minimal Linux host, browser launch errors naming missing libraries require
`pnpm --dir apps/main exec playwright install-deps chromium` (administrator
approval may be needed). Do not replace the browser with a Snap wrapper or skip
failing tests. On this ARM64 runtime, the bundled Chromium works without a
system browser override.

If installs fail with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, set
`NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt` on Linux and retry;
never disable certificate verification. Earlier issue runs reported Vite exit
139 on Node 24 ARM64; Node 22.22.3 was verified here without that crash, but the
earlier crash's root cause is not established.

App-specific commands remain under `pnpm --dir apps/<app> run <script>`.


## Browser terminal listings

The main site's browser terminal includes `a`, a discoverable eza-style long listing preset equivalent to `eza -lah --git --color-scale all -g --smart-group --icons always --hyperlink auto`. It only reads the in-memory virtual filesystem. Optional owner, group, and Git status values are typed VFS metadata fixtures; missing values render as unavailable, and no host filesystem or repository state is read. URL-backed VFS entries use clickable OSC-8 links; entries without URLs remain unlinked. Native eza behavior that depends on a real filesystem, Git worktree, terminal capabilities, or installed icon fonts is not simulated.

## CI

- GitHub Actions runs main TypeScript and terminal tests, CV lint/tests, a
  legacy build, and a unified build. The browser job installs Chromium and its
  Linux dependencies, then exercises the production server and localized
  main/CV/legacy routes. Remote CI is only exercised after these local changes
  are accepted and pushed.

## Dockhand deployment

Deploy this repository as a Git-managed Docker Compose stack.

- **Compose file:** `docker-compose.yaml` at the repository root (context directory: repo root).
- **Quick start:**

  ```sh
  git clone <repo> && cd <repo>
  cp .env.example .env   # adjust values (no secrets required)
  docker compose config  # validate
  docker compose up -d --build
  ```

  Updates work with `docker compose pull && docker compose up -d --build`; no `down` needed.

- **Environment variables** (see `.env.example`; all are optional with defaults, none are secrets):
  - `WEBSITE_BIND` (default `127.0.0.1`) — host address for the published port.
  - `HOST_PORT` (default `8082`) — host port mapped to the container's `5000`.
  - `TZ` (default `UTC`).
  - `SITE_URL` (default empty) — optional build-time base URL for `og:image`/`twitter:image` meta tags.
- **Secrets:** none required. Runtime state is in-memory; the app reads no credential variables. Never commit real `.env` values — `.env*` is gitignored, `compose.override.yaml` too.
- **Persistent volumes:** none. The container is stateless (no database, in-memory state), so recreations and updates lose nothing.
- **External network:** the `website` service joins an external Docker network named `proxy`, assumed to host the reverse proxy. Create it once per Docker host if it does not exist:

  ```sh
  docker network create proxy
  ```

  Dockhand will not create it automatically.
- **Ports:** the container publishes `127.0.0.1:8082 -> 5000` by default (loopback-only, fronted by the reverse proxy on the `proxy` network).
- **Build images on deploy:** yes (the image is built from this repo via `apps/main/Dockerfile`; there is no registry image to pull).
- **Migrations/init:** none. No database is provisioned or migrated; no manual setup commands are needed.
- Note: `apps/legacy_rewored/docker-compose.yaml` is a separate legacy-only stack (Apache serving `legacy_old`) and is not part of this deployment.
