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
