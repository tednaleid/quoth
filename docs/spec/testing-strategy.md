# Testing Strategy

Three layers of verification, each catching a different class of bug. Cheap fast layers first; expensive end-to-end layers only when you need them.

## Layer 1: Unit tests (Vitest)

**Command:** `just test [pattern]`
**Speed:** ~1-2s for the full suite
**What they cover:**
- Pure logic in `src/core/` (transcript parsing, word segmentation, active-word binary search, URL parsing)
- Adapters in `src/adapters/` exercised through dependency-injected mocks (fake fetch, fake storage)

**What they cannot catch:**
- Browser API binding bugs (like `this`-binding issues with stored function references)
- Cross-origin policy failures (CSP, postMessage origin blocks, CORS)
- Extension-context wiring (manifest permissions, host_permissions, content script injection patterns)
- Real YouTube API response changes

**When to run:** constantly during development and always before committing via `just check`.

## Layer 2: Smoke tests (Playwright + real browser)

**Command:** `just smoke-test [browser]` (default: chrome)

**Speed:** ~15-30s. Builds the extension, launches a browser, hits real
YouTube, and asserts on actual DOM + network behavior.

### Chrome smoke test (`just smoke-test` or `just smoke-test chrome`)

Full integration test. Playwright loads the real Chrome extension via
`--load-extension`, navigates to YouTube, and opens extension pages
(`chrome-extension://<id>/sidepanel.html`, `popout.html`) as regular tabs.

**Verifies:**
1. Extension loads and manifest is valid
2. Content script injects on YouTube and extracts captions via Innertube
3. Sidepanel (opened as tab) receives transcript and renders 6000+ words
4. Click-to-seek: clicking a word in the transcript seeks the YouTube video
5. Popout tab: loads pinned to the YouTube tab, receives the same transcript

### Firefox smoke test (`just smoke-test firefox`)

Rendering-only test. Serves the built extension pages via a local HTTP
server with stubbed browser APIs, opens them in Playwright Firefox.

**Verifies:**
1. Sidepanel Svelte app mounts in the Gecko engine (`<main>` present)
2. Popout Svelte app mounts in the Gecko engine (`<main>` present)
3. Status bar and placeholder text render correctly

**Does NOT verify:** real extension loading, YouTube interaction, transcript
loading, click-to-seek, or cross-context messaging. See the Playwright
Firefox limitation section below.

### Playwright Firefox limitation

Playwright controls Firefox through Juggler, a custom protocol patched into
Firefox's source. Juggler cannot inject its runtime scripts into privileged
`moz-extension://` browsing contexts. This means `page.goto('moz-extension://...')`
times out and `page.evaluate()` / `page.click()` throw protocol errors on
extension pages. This is a hard security boundary in Firefox, not a config issue.

**Approaches that do not work:**
- `waitUntil: 'domcontentloaded'` or `'commit'` -- still times out
- `launchPersistentContext` -- same result
- UUID pre-seeding via `extensions.webextensions.uuids` pref -- UUID is
  assigned correctly but navigation still blocked
- `about:debugging` -- also inaccessible from Playwright
- Content script relay (`postMessage` -> `browser.runtime.sendMessage` ->
  background -> `browser.tabs.create`) -- even if the background creates
  the tab, Playwright cannot interact with the resulting extension page

**What does work in Firefox Playwright:**
- `playwright-webextext` installs the extension via remote debugging protocol
- Content scripts execute on YouTube pages (verified via DOM attributes)
- Extension effects on web pages are observable

**Path to full Firefox integration testing:** Selenium with GeckoDriver
uses Mozilla's Marionette protocol, which operates at a higher privilege
level and can navigate to and interact with `moz-extension://` pages.
UUID pre-seeding works with Selenium. This would be added when CI parity
is needed; for now, `just dev firefox` and `just debug-firefox` provide
interactive Firefox verification.

### Why smoke tests matter

They catch integration-layer bugs that unit tests cannot.

Examples of bugs previously caught only by smoke tests:
- **"Illegal invocation" fetch binding**: `this.fetchFn = fetch` stored
  as a class property loses `this === window` in Chrome
- **Origin-header block on Innertube**: YouTube returns 403 when
  `Origin: chrome-extension://...` is present
- **postMessage origin restriction**: YouTube's IFrame Player API refuses
  events to `chrome-extension://` parent origins

**When to run:** after any change to adapters, entrypoints, manifest, or
messaging. Always before claiming a feature works.

## Layer 3: Interactive / manual verification

**Commands:**
- `just dev firefox '<url>'` or `just dev chrome '<url>'` -- dev mode with persistent profile
- `just dev-popout firefox '<url>'` -- dev mode focused on popout tab workflow
- `just debug-firefox '<url>'` -- Firefox with console logging forwarded to stdout

**When to use:**
- Verifying UI/UX feel (visual spacing, animation smoothness, transitions)
- Cross-browser behaviors that smoke tests don't cover (Firefox embed behavior, Chrome vs Firefox extension chrome)
- Reproducing user-reported issues with a real profile + cookies
- Final manual sanity check before shipping

Prefer automated tests. Fall back to manual when a behavior genuinely cannot be automated.

## Ordering / workflow

```
unit (fast) → smoke (slow) → manual (slowest)
```

**Standard pre-commit flow:** `just check` (runs unit tests + lint + typecheck + fmt). The pre-commit hook runs this automatically.

**Before claiming a browser-integration change works:** also run the relevant smoke test(s). Unit tests passing does not mean the feature works in a browser.

**Before handing a feature to a reviewer:** verify end-to-end with Playwright yourself. Don't ask the reviewer to manually exercise something you can automate.

## Why this matters

Unit tests move fast but live in a mock universe. They validate the code's internal logic against your assumptions. They cannot validate the assumptions themselves.

Smoke tests live in the real world. They are slower and more brittle, but they are the only place bugs caused by wrong assumptions about the browser, YouTube, or the extension runtime will surface.

The combination is load-bearing: unit tests catch regressions quickly during development, smoke tests catch integration drift before it reaches users.
