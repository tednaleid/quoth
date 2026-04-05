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
- `src/entrypoints/content.ts` -- YouTube content script (isolated world)
- `src/entrypoints/youtube-player.content.ts` -- YouTube player control (main world)
- `src/entrypoints/background.ts` -- Service worker message router

## Known issues

- `just dev` opens Chrome with a fresh WXT profile where YouTube's video player
  cannot seek to unbuffered regions (shows "Something went wrong"). This is a
  YouTube/fresh-profile issue, not a Quoth bug. Production builds loaded via
  `chrome://extensions` in a regular Chrome profile work correctly. Automated
  Playwright tests also work (seeking confirmed to 25+ minutes).
- To test in a regular profile: `just build`, then load `.output/chrome-mv3/`
  as an unpacked extension in `chrome://extensions`.

## Interactive debugging

- `playwright-cli` can open browsers for interactive inspection but cannot load
  unpacked extensions directly. Use `just dev` to launch Chrome with the extension
  loaded via WXT's dev mode, then use Chrome DevTools for debugging.
- For automated E2E testing of the extension, use `just test-e2e` (Playwright
  programmatic API with `launchPersistentContext` and `--load-extension` args).
