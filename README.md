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

- Use `docker compose up --build` from the repository root: `/root/website_main/unified-site`
- The compose file now builds from the unified repo and uses `apps/main/Dockerfile`

## Development

- Root shortcuts are available through `package.json` at the repo root.
- Run `npm run validate` from `/root/website_main/unified-site` to execute the current shared checks.
- Run `npm run build` from the repo root to build the unified production bundle through `apps/main`.
- App-specific commands still live in each app folder:
  - `apps/main`: `npm run dev`, `npm run check`, `npm run build`
  - `apps/cv-site`: `npm run dev`, `npm run lint`, `npm test`, `npm run build`
  - `apps/legacy_rewored`: `npm run dev`, `npm run build`


## Browser terminal listings

The main site's browser terminal includes `a`, a discoverable eza-style long listing preset equivalent to `eza -lah --git --color-scale all -g --smart-group --icons always --hyperlink auto`. It only reads the in-memory virtual filesystem. Optional owner, group, and Git status values are typed VFS metadata fixtures; missing values render as unavailable, and no host filesystem or repository state is read. URL-backed VFS entries use clickable OSC-8 links; entries without URLs remain unlinked. Native eza behavior that depends on a real filesystem, Git worktree, terminal capabilities, or installed icon fonts is not simulated.

## CI

- GitHub Actions now runs type-checking for `apps/main`, lint/tests for `apps/cv-site`, a build for `apps/legacy_rewored`, and a full unified build that verifies the cross-app integration path.

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
