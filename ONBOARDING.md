# Onboarding

Quoth is a YouTube transcript viewer browser extension for Chrome and Firefox.
It displays a searchable transcript in a docked sidebar alongside the YouTube
player. Everything runs client-side: no server, no accounts, no data leaves
the browser.

## Stack
- Language: TypeScript + Svelte 5
- Framework: WXT (cross-browser extension toolkit)
- Build: bun (lockfile: `bun.lock`)
- Task runner: `just` (authoritative -- see `justfile`)

## Common commands
- Check all: `just check` (tests + lint + typecheck + format check; used by CI)
- Test: `just test [pattern]`
- E2E: `just test-e2e` (Playwright on Chromium, builds Chrome extension first)
- Smoke: `just smoke-test [chrome|firefox]` (~15s, loads real extension end-to-end)
- Lint: `just lint [files]`
- Typecheck: `just typecheck`
- Format: `just fmt [files]` / `just fmt-check`
- Build: `just build [firefox|chrome]` (default: firefox)
- Dev mode (HMR): `just dev [firefox|chrome] '<url>'` (URL must be quoted)
- Debug Firefox logs: `just debug-firefox '<url>'`
- Release: `just bump [version]`, re-trigger via `just retag <version>`
- Install hooks: `just install-hooks` (pre-commit runs `just check`)

## Architecture

Hexagonal (ports and adapters). Pure core logic in `src/core/` has no browser
API imports. `src/ports/` declares TypeScript interfaces; adapters under
`src/adapters/{youtube,chrome,firefox,browser,mock}/` implement them per
runtime. WXT entry points in `src/entrypoints/` wire adapters to the Svelte
sidepanel, YouTube content scripts, and background worker.

## Key paths
- `src/core/` -- pure logic (caption parsing, playback sync, seek detection, settings)
- `src/ports/` -- interfaces (transcript source, cache store, tab connector, video player)
- `src/adapters/youtube/` -- Innertube API client and video player adapter
- `src/adapters/{chrome,firefox}/` -- browser-specific sidebar host
- `src/adapters/browser/` -- shared browser adapters (storage cache, tab connector)
- `src/entrypoints/sidepanel/` -- Svelte 5 side panel UI
- `src/entrypoints/content.ts` -- YouTube content script (isolated world)
- `src/entrypoints/youtube-player.content.ts` -- YouTube player control (main world)
- `src/entrypoints/background.ts` -- SidebarHost initialization
- `src/entrypoints/popout/` -- popout tab UI (right-click icon -> Open in new tab)
- `tests/unit/` -- Vitest unit tests
- `tests/e2e/` -- Playwright E2E tests
- `tools/` -- smoke-test, debug-firefox, fixture-capture, transcript CLI, model-bench
- `wxt.config.ts` -- manifest, permissions, persistent dev profiles under `.wxt/profiles/`
- `.github/workflows/ci.yml` -- runs `just check` and E2E on push/PR
- `.github/workflows/release.yml` -- triggered by `just bump` pushing a tag

## How to run

Three ways to verify the extension works, in increasing order of realism:

1. `just smoke-test` -- automated Chromium via Playwright. Fastest feedback
   (~15s). Proves the extension loads, the transcript populates, and
   click-to-seek works. Also: `just smoke-test firefox` for the Gecko path.
2. `just dev chrome '<url>'` / `just dev firefox '<url>'` -- interactive dev
   mode with HMR and a persistent profile at `.wxt/profiles/`. URL must be
   quoted because of `?` and `&`.
3. Production build: `just build chrome`, then load `.output/chrome-mv3/` as
   an unpacked extension at `chrome://extensions`. Closest to production.

For Firefox console logging during interactive debug:
`just debug-firefox '<url>'` forwards all `[quoth]` messages to stdout.

## Dig deeper
- `README.md` -- install instructions and permission rationale
- `docs/spec/design.md` -- product and UX design
- `docs/spec/architecture.md` -- ports/adapters structure in detail
- `docs/spec/testing-strategy.md` -- unit, E2E, and smoke-test approach
- `docs/spec/known-issues.md` -- current issues and workarounds
- `docs/spec/release-and-ci.md` -- release pipeline and CI
- `docs/spec/firefox-support.md` -- Firefox-specific notes
- `docs/spec/paragraph-segmentation.md` -- ML formatting research (not yet shipped)
