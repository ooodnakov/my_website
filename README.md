# Unified Site Workspace

This repository groups the current website-related sources into one place.

## Layout

- `apps/future-media-hub`: main React/Tailwind site shell that serves `/`, `/en`, and `/ru`
- `apps/cv-site`: separate CV-focused frontend
- `apps/legacy-links-site`: earlier Vite rebuild plus preserved legacy assets

## Notes

- Original source directories were left in place outside this repo.
- Generated folders such as `node_modules` and `dist` are intentionally excluded here.
- The main homepage refactor should happen in `apps/future-media-hub`.
