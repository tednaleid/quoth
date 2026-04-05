# Testing Strategy

Three layers of verification, each catching a different class of bug. Cheap fast layers first; expensive end-to-end layers only when you need them.

## Layer 1: Unit tests (Vitest)

**Command:** `just test [pattern]`
**Speed:** ~1-2s for the full suite
**What they cover:**
- Pure logic in `src/core/` (transcript parsing, word segmentation, active-word binary search, URL parsing)
- Adapters in `src/adapters/` exercised through dependency-injected mocks (fake fetch, fake storage, fake iframe deps)
- The `TranscriptState` state machine in `src/core/message-handler.ts`

**What they cannot catch:**
- Browser API binding bugs (like `this`-binding issues with stored function references)
- Cross-origin policy failures (CSP, postMessage origin blocks, CORS)
- Extension-context wiring (manifest permissions, host_permissions, content script injection patterns)
- Real YouTube API response changes

**When to run:** constantly during development and always before committing via `just check`.

## Layer 2: Smoke tests (Playwright + real Chromium)

**Commands:**
- `just smoke-test` — sidebar path
- `just smoke-test-watch` — watch-page path
- `just smoke-test-firefox` — Firefox tab-mode rendering check

**Speed:** ~15-30s each. They build the extension, launch Chromium with the extension loaded, hit real YouTube, and assert on actual DOM + network behavior.

### `just smoke-test` verifies

1. Extension loads and manifest is valid
2. Content script injects on youtube.com/watch, fetches captions via Innertube ANDROID API, produces a populated transcript
3. Sidebar (opened as a regular tab since Playwright cannot open native sidebars) renders words
4. Clicking a word sends a `seek-to` message → content script → main-world bridge → YouTube player's `seekTo()` → `video.currentTime` actually advances to the target

### `just smoke-test-watch` verifies

1. Watch page loads at `chrome-extension://<id>/watch.html?v=...&t=...`
2. DNR rules correctly rewrite the `Origin` and `Referer` headers so YouTube's Innertube API and embed player accept requests from the `chrome-extension://` origin
3. Embed iframe loads and the YouTube video plays
4. The `youtube.com/embed/*` content script injects into the iframe (`allFrames: true`) and polls the `<video>` element's `currentTime` every 250ms
5. Time updates flow via `browser.runtime.sendMessage` from content script → watch page, driving active-word highlighting
6. Clicking a transcript word → `browser.tabs.sendMessage({frameId})` → content script → `video.currentTime = X` (verified by the active-word highlight jumping to the clicked timestamp)
7. Live playback tracking works: after a click + 1.5s wait, the active-word highlight has **advanced** further than the clicked position
8. `ChromeStorageLocalCache` works: reloading the page re-renders the transcript in <500ms (implicit cache hit)

**Why smoke tests matter:** they catch integration-layer bugs that unit tests cannot.

Examples of bugs previously caught only by smoke tests:
- **"Illegal invocation" fetch binding**: `this.fetchFn = fetch` stored as a class property loses `this === window` in Chrome. Fixed with arrow-function wrapping.
- **Origin-header block on Innertube from extension contexts**: YouTube returns 403 "Sorry..." abuse pages when `Origin: chrome-extension://...` is present. Fixed with a DNR rule stripping the header.
- **Embed referrer requirement**: YouTube's embed player rejects playback with "Error 153" when Referer is missing (extension pages don't send one). Fixed with a DNR rule setting a synthetic referer.
- **postMessage origin restriction**: YouTube's IFrame Player API refuses to send `infoDelivery` events back to `chrome-extension://` parent origins. Worked around with a content script polling the iframe's `<video>` element directly.

**When to run:** after any change to adapters, entrypoints, manifest, or messaging. Always before claiming a feature works.

## Layer 3: Interactive / manual verification

**Commands:**
- `just dev firefox '<url>'` or `just dev chrome '<url>'` — dev mode with persistent profile
- `just debug-firefox '<url>'` — Firefox with console logging forwarded to stdout

**When to use:**
- Verifying UI/UX feel (visual spacing, animation smoothness, transitions)
- Cross-browser behaviors that smoke tests don't cover (Firefox sidebar docking, Chrome vs Firefox extension chrome)
- Reproducing user-reported issues with a real profile + cookies
- Final manual sanity check before shipping

Prefer automated tests. Fall back to manual when a behavior genuinely cannot be automated.

## Ordering / workflow

```
unit (fast) → smoke (slow) → manual (slowest)
```

**Standard pre-commit flow:** `just check` (runs unit tests + lint + typecheck + fmt). The pre-commit hook runs this automatically.

**Before claiming a browser-integration change works:** also run the relevant smoke test(s). Unit tests passing ≠ feature works in a browser.

**Before handing a feature to a reviewer:** verify end-to-end with Playwright yourself. Don't ask the reviewer to manually exercise something you can automate.

## Why this matters

Unit tests move fast but live in a mock universe. They validate the code's internal logic against your assumptions. They cannot validate the assumptions themselves.

Smoke tests live in the real world. They are slower and more brittle, but they are the only place bugs caused by wrong assumptions about the browser, YouTube, or the extension runtime will surface.

The combination is load-bearing: unit tests catch regressions quickly during development, smoke tests catch integration drift before it reaches users.
