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

## CI

- GitHub Actions now runs type-checking for `apps/main`, lint/tests for `apps/cv-site`, a build for `apps/legacy_rewored`, and a full unified build that verifies the cross-app integration path.
