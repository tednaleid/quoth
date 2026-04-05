# Quoth

YouTube transcript viewer browser extension with client-side ML formatting.

## Build and Test

- `just check` -- run all tests, linting, type checking, and format checking (used by CI)
- `just test [pattern]` -- run unit tests (optional pattern, e.g. `just test message-handler`)
- `just test-e2e` -- run Playwright E2E tests (builds Chrome extension first)
- `just lint [files]` -- run ESLint (optional specific files)
- `just fmt [files]` -- format code with Prettier (optional specific files)
- `just typecheck` -- run TypeScript type checker
- `just build [browser]` -- build extension (default: firefox, or `just build chrome`)
- `just dev [browser] [url]` -- start dev mode (default: firefox, optionally open a URL)
- `just smoke-test [url]` -- Chromium end-to-end test (loads real extension, visits YouTube)
- `just smoke-test-firefox` -- Firefox tab-mode rendering test (Gecko engine)
- `just debug-firefox [url]` -- Debug Firefox extension with console logging
- `just clean` -- remove build artifacts, caches, and dev browser profiles
- `just clean-profiles` -- clear just the dev browser profiles (cookies/consent)
- `just install-hooks` -- install pre-commit hook that runs `just check`

Red/green testing: write a failing test before implementing, then make it pass.
All commits should pass `just check`. After refactoring browser integration
code, also run `just smoke-test` -- unit tests can miss cross-browser bugs
(e.g., fetch binding issues caught only by the Chromium smoke test).

## Architecture

Hexagonal (ports and adapters). See `docs/spec/design.md` and `docs/spec/architecture.md`.

- `src/core/` -- pure logic, no browser API imports
- `src/ports/` -- TypeScript interfaces
- `src/adapters/` -- adapter implementations (youtube/, chrome/, firefox/, browser/, mock/)
- `src/entrypoints/` -- WXT extension entry points
- `tests/unit/` -- Vitest unit tests
- `tests/e2e/` -- Playwright E2E tests
- `tools/` -- build-time and debug scripts (smoke-test, debug-firefox, fixture-capture)

## Extension entry points

- `src/entrypoints/sidepanel/` -- Svelte 5 side panel UI
- `src/entrypoints/content.ts` -- YouTube content script (isolated world)
- `src/entrypoints/youtube-player.content.ts` -- YouTube player control (main world)
- `src/entrypoints/background.ts` -- SidebarHost initialization (minimal)

## Testing the extension

Three ways to verify the extension works, in increasing order of realism:

1. **`just smoke-test`** -- Automated Chromium via Playwright. Fastest feedback
   (~15s). Proves extension loads, transcript populates, click-to-seek works.
2. **`just dev chrome '<url>'`** or **`just dev firefox '<url>'`** -- Interactive
   dev mode with persistent profile at `.wxt/profiles/`. URL must be quoted
   because of `?` and `&`.
3. **Production build in regular browser profile:** `just build chrome`, then
   load `.output/chrome-mv3/` as unpacked extension in `chrome://extensions`.
   Closest to production behavior.

## Known issues

- **`just dev chrome` seeking:** YouTube's player cannot seek past unbuffered
  regions when running in WXT's dev mode Chrome profile, showing "Something
  went wrong" around the 1-2 minute mark. This is a YouTube/profile issue,
  not a Quoth bug. Use `just smoke-test` (Playwright profile) or production
  builds loaded in a regular Chrome profile for seeking verification.
  **Workaround:** use Firefox (`just dev`) which doesn't have this issue.

## Interactive debugging

- **Firefox:** `just debug-firefox '<url>'` loads the Firefox extension via
  `playwright-webextext` and forwards all `[quoth]` console messages to stdout.
- **Chrome:** `just smoke-test` forwards `[quoth]` console logs, takes a
  screenshot on failure, and dumps sidepanel HTML for debugging.
- **Interactive browser devtools:** `just dev firefox` or `just dev chrome`,
  then open the browser's devtools as usual (Firefox: Browser Console
  Cmd+Shift+J shows all extension logs across contexts).
