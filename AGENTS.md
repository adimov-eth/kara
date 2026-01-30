# Repository Guidelines

## Project Structure & Module Organization
This is a pnpm workspace with shared TypeScript packages and a Cloudflare Worker deployment.
- `packages/domain/`: core business logic and queue rules.
- `packages/types/`: shared types consumed by worker/UI/extension.
- `packages/ui/`: SvelteKit UI (routes under `src/routes/`).
- `packages/extension/`: browser extension sources.
- `worker/`: Cloudflare Worker source (`worker/src`) and Wrangler config.
- `worker/src/views/generated/`: **auto-generated** HTML bundles from `packages/ui/scripts/inline.js` — do not edit by hand.

## Build, Test, and Development Commands
Use pnpm from the repo root (Node >= 18).
- `pnpm build`: build all workspaces.
- `pnpm dev`: run the Worker locally via Wrangler.
- `pnpm --filter @karaoke/ui dev`: run the UI in dev mode.
- `pnpm --filter @karaoke/ui build:inline`: rebuild UI and inline HTML into `worker/src/views/generated`.
- `pnpm typecheck`: TypeScript checks across workspaces.
- `pnpm test`, `pnpm test:coverage`: run Vitest (coverage included in CI config).
- `pnpm deploy`: build + deploy the Worker.

## Coding Style & Naming Conventions
- Indentation is 2 spaces; keep formatting consistent with surrounding files.
- ESM modules (`"type": "module"`) and strict TypeScript settings (see `tsconfig.base.json`).
- Names: `camelCase` for values/functions, `PascalCase` for components/types; Svelte components are `PascalCase.svelte`.
- Avoid editing generated output in `packages/ui/dist/` or `worker/src/views/generated/`.

## Testing Guidelines
- Framework: Vitest (`vitest.config.ts`).
- Coverage targets apply to `packages/domain/src/**` (lines 95%, functions 90%, branches 85%).
- New tests should live alongside code or in `__tests__` and use `*.test.ts`/`*.spec.ts` naming.

## Commit & Pull Request Guidelines
- Commit messages in this repo are short, sentence‑case, imperative (e.g., “Add staging env”, “Refactor to monorepo”).
- Prefer a concise PR description, linked issue (if any), and notes on testing.
- Include screenshots/GIFs for UI changes and mention any Worker config or migration updates.

## Security & Configuration Tips
- Secrets like `GITHUB_TOKEN` are defined in `worker/src/env.ts` — set them with Wrangler secrets, never commit them.
- Worker bindings and environments live in `worker/wrangler.toml` (and root `wrangler.toml` for legacy config).
