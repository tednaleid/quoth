# Quoth

YouTube transcript viewer browser extension with client-side ML formatting.

## Build and Test

- `just check` -- run all tests, linting, type checking, and format checking (used by CI)
- `just test` -- run unit tests only
- `just test-e2e` -- run Playwright E2E tests (builds extension first)
- `just lint` -- run ESLint
- `just fmt` -- format code with Prettier
- `just typecheck` -- run TypeScript type checker
- `just build` -- build Chrome extension to .output/chrome-mv3/
- `just dev` -- start dev mode with HMR
- `just clean` -- remove build artifacts and caches
- `just install-hooks` -- install pre-commit hook that runs `just check`

Red/green testing: write a failing test before implementing, then make it pass.
All commits should pass `just check`.

## Architecture

Hexagonal (ports and adapters). See `docs/spec/design.md` for full spec.

- `src/core/` -- pure logic, no browser API imports
- `src/ports/` -- TypeScript interfaces (Phase 2+)
- `src/adapters/` -- adapter implementations (Phase 2+)
- `src/entrypoints/` -- WXT extension entry points
- `tests/unit/` -- Vitest unit tests
- `tests/e2e/` -- Playwright E2E tests

## Extension entry points

- `src/entrypoints/sidepanel/` -- Svelte 5 side panel UI
- `src/entrypoints/content.ts` -- YouTube content script
- `src/entrypoints/background.ts` -- Service worker message router
