# Quoth

YouTube transcript viewer browser extension with client-side ML formatting.

## Build and Test

- `just check` -- run all tests, linting, type checking, and format checking (used by CI)
- `just test [pattern]` -- run unit tests (optional pattern, e.g. `just test caption-parser`)
- `just lint [files]` -- run ESLint (optional specific files)
- `just fmt [files]` -- format code with Prettier (optional specific files)
- `just typecheck` -- run TypeScript type checker
- `just build [browser]` -- build extension (default: firefox, or `just build chrome`)
- `just dev [browser] [url]` -- start dev mode (default: firefox, optionally open a URL)
- `just smoke-test [url]` -- Chromium end-to-end test of the watch page (loads real extension, visits YouTube)
- `just smoke-test-firefox-watch [url]` -- Firefox watch page test (Gecko engine)
- `just debug-firefox [url]` -- Debug Firefox extension with console logging
- `just clean` -- remove build artifacts, caches, and dev browser profiles
- `just clean-profiles` -- clear just the dev browser profiles (cookies/consent)
- `just install-hooks` -- install pre-commit hook that runs `just check`

Red/green testing: write a failing test before implementing, then make it pass.
All commits should pass `just check`. After refactoring browser integration
code, also run `just smoke-test` -- unit tests can miss cross-browser bugs
(e.g., fetch binding issues caught only by the Chromium smoke test).

See `docs/spec/testing-strategy.md` for what each test layer covers, which
bug classes each one catches, and when to run which.

## Architecture

Hexagonal (ports and adapters). See `docs/spec/design.md` and `docs/spec/architecture.md`.

- `src/core/` -- pure logic, no browser API imports
- `src/ports/` -- TypeScript interfaces
- `src/adapters/` -- adapter implementations (youtube/, chrome/, firefox/, browser/, mock/)
- `src/components/` -- shared Svelte UI components
- `src/entrypoints/` -- WXT extension entry points
- `tests/unit/` -- Vitest unit tests
- `tools/` -- build-time and debug scripts (smoke-test, debug-firefox, fixture-capture)

## Extension entry points

- `src/entrypoints/watch/` -- Svelte 5 watch page UI (sole UI; embeds YouTube, displays synced transcript)
- `src/entrypoints/embed.content.ts` -- content script injected into youtube.com/embed/* iframes (polls video.currentTime, handles seek commands)
- `src/entrypoints/background.ts` -- icon click handler (navigates tab to watch page) and Firefox Innertube header fix

## Testing the extension

Three ways to verify the extension works, in increasing order of realism:

1. **`just smoke-test`** -- Automated Chromium via Playwright. Fastest feedback
   (~15s). Proves extension loads, watch page renders transcript, click-to-seek works.
2. **`just dev chrome '<url>'`** or **`just dev firefox '<url>'`** -- Interactive
   dev mode with persistent profile at `.wxt/profiles/`. URL must be quoted
   because of `?` and `&`.
3. **Production build in regular browser profile:** `just build chrome`, then
   load `.output/chrome-mv3/` as unpacked extension in `chrome://extensions`.
   Closest to production behavior.

## Known issues

See `docs/spec/known-issues.md` for current issues and workarounds.

## Interactive debugging

- **Firefox:** `just debug-firefox '<url>'` loads the Firefox extension via
  `playwright-webextext` and forwards all `[quoth]` console messages to stdout.
- **Chrome:** `just smoke-test` forwards `[quoth]` console logs, takes a
  screenshot on failure, and dumps watch page HTML for debugging.
- **Interactive browser devtools:** `just dev firefox` or `just dev chrome`,
  then open the browser's devtools as usual (Firefox: Browser Console
  Cmd+Shift+J shows all extension logs across contexts).
