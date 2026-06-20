# Repository Guidelines

## Project Structure & Module Organization

This repository groups three frontend applications under `apps/`.

- `apps/main`: primary React/Tailwind site shell. Client code lives in `client/src`, server code in `server`, shared types/helpers in `shared`, E2E tests in `client/e2e`, and static assets in `client/public` plus `attached_assets`.
- `apps/cv-site`: standalone CV frontend. Source is in `src`, reusable UI in `src/components`, pages in `src/pages`, hooks in `src/hooks`, tests in `src/test`, and public assets in `public`.
- `apps/legacy_rewored`: legacy Vite rebuild. Current source is in `src`; preserved old static files are in `legacy_old`.

The root `package.json` provides shortcuts, but this is not currently a pnpm workspace. Each app keeps its own `pnpm-lock.yaml`.

## Build, Test, and Development Commands

Install dependencies per app:

```sh
pnpm --dir apps/main install
pnpm --dir apps/cv-site install
pnpm --dir apps/legacy_rewored install
```

Useful root shortcuts:

- `pnpm build`: builds `apps/main`.
- `pnpm build:cv`: builds `apps/cv-site`.
- `pnpm build:legacy`: builds `apps/legacy_rewored`.
- `pnpm check`: runs TypeScript checks for `apps/main`.
- `pnpm lint`: runs ESLint for `apps/cv-site`.
- `pnpm test`: runs Vitest for `apps/cv-site`.
- `pnpm validate`: runs check, lint, tests, and the main build.

For local development, run `pnpm --dir <app> dev`. Docker deployment uses `docker compose up --build` from the repo root.

## Coding Style & Naming Conventions

Use TypeScript and React patterns already present in each app. Prefer functional components, named exports for shared utilities, and descriptive file names such as `CommandPalette.tsx` or `terminal.spec.ts`. Keep indentation at two spaces for JSON, TS, TSX, CSS, and config files. `apps/cv-site` uses ESLint via `eslint.config.js`; run `pnpm lint` before changing CV-site code.

## Testing Guidelines

`apps/cv-site` uses Vitest; place tests in `src/test` or next to the code with `*.test.ts` / `*.test.tsx`. `apps/main` uses Playwright for E2E coverage in `client/e2e` with `*.spec.ts` naming. Run focused app commands when possible:

```sh
pnpm --dir apps/cv-site test
pnpm --dir apps/main test:e2e
```

## Commit & Pull Request Guidelines

Recent commits use concise, imperative subjects, for example `Fix palette feedback and zsh terminal polish`. Keep subjects specific and under roughly 72 characters. PRs should describe the user-facing change, list verification commands, link issues when applicable, and include screenshots for visual changes.

## Security & Configuration Tips

Do not commit generated folders such as `node_modules` or `dist`. If pnpm fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, run with the system CA bundle:

```sh
NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt pnpm --dir apps/main install
```
