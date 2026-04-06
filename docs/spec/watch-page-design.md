# Dedicated Watch Page (Quoth hybrid spike alongside sidebar)

Date: 2026-04-05
Status: implemented on feature/watch-page branch

## Context

Quoth renders transcripts in a browser sidebar today. That approach has real drawbacks:

- Sidebar steals ~350px from the video width
- `cmd-F` does not search sidebar content
- Chrome `sidePanel` and Firefox `sidebarAction` APIs differ; Safari has no equivalent
- Playwright cannot programmatically open the browser's native sidebar, so the sidebar path is not testable end-to-end
- Four isolated JS contexts (content-isolated, content-main-world, background, sidebar) make the architecture heavier than needed

This work adds a second entry point: a standalone extension page (`chrome-extension://<id>/watch.html`) that embeds the video via the official YouTube IFrame Player API and renders the transcript in the same page. Both sidebar and watch-page ship in parallel. If the watch page wins after we live with it, we collapse to it and delete the sidebar path. If it doesn't, we delete the watch page and lose little.

**Embed feasibility verified**: 11/11 of Ted's typical videos (tech, news, music video, Short, trailer) pass the oEmbed embed-allowed check.

## Design

### URL

```
chrome-extension://<id>/watch.html?v=<videoId>&t=<seconds>
```

Uses YouTube's own `t=` timestamp format. Bookmarkable. Stable URL on Chrome Web Store; Firefox's per-user UUID makes it non-shareable across Firefox users (shared YouTube URLs remain the canonical share format).

### Layout (single stacked layout, no toggle)

- Video iframe at top, 16:9, `max-width ~90vw`
- Transcript below, fills remaining viewport height, scrollable
- Video stays the same size regardless of scroll position
- Header with controls (follow toggle, word count)

### Transcript behavior

- All words rendered in DOM so `cmd-F` works natively
- **Follow (autoscroll on, default)**: scrolls so active word stays at line 1-2 (with slight just-played context visible above)
- **Browse (autoscroll off)**: activated when user scrolls transcript manually; user can scroll freely
- Click any word: seeks video; autoscroll state unchanged
- "Follow" button: re-enables autoscroll and jumps to current word

### Architecture additions

Hexagonal ports-and-adapters:

- New port: `CacheStore`
- Embed content script: `src/entrypoints/embed.content.ts` -- content script matching `youtube.com/embed/*` that polls `<video>.currentTime` directly (YouTube's IFrame Player API refuses to send `infoDelivery` postMessage events to `chrome-extension://` parent origins, so the IFramePlayer adapter approach was attempted and replaced)
- DNR rules: `public/dnr-rules.json` -- declarativeNetRequest rules that strip Origin header and set Referer on YouTube requests from the extension context
- New adapter: `ChromeStorageLocalCache` (implements `CacheStore` via `browser.storage.local`)

Reused unchanged from `core/`:
- `parseJson3Captions`
- `groupWordsIntoSegments`
- `findActiveWordIndex`
- `findActiveSegmentIndex`
- `TranscriptView.svelte`

Caption-fetching (`TranscriptSource`) already exists as an adapter but must be callable from a non-content-script context. Refactor if needed (verify host_permissions and fetch binding).

### Entry points after this work

- `src/entrypoints/watch/` (NEW standalone page)
- `src/entrypoints/sidepanel/` (unchanged, with a "Pop out" button added)
- `src/entrypoints/content.ts`, `youtube-player.content.ts`, `background.ts` (unchanged)

### Sidebar pop-out button

Button added to the existing sidebar:

```ts
browser.tabs.create({
  url: browser.runtime.getURL(`watch.html?v=${videoId}&t=${Math.floor(currentTimeMs / 1000)}`)
});
```

### Per-video cache

- Read cache keyed by `transcript:${videoId}` before Innertube fetch
- Write cache after parsing captions
- No TTL (user's own disk, transcripts rarely change)

## Critical files

### New

- `src/entrypoints/watch/index.html`
- `src/entrypoints/watch/main.ts`
- `src/entrypoints/watch/App.svelte`
- `src/entrypoints/embed.content.ts` (content script for `youtube.com/embed/*` iframes, polls `<video>.currentTime`)
- `public/dnr-rules.json` (declarativeNetRequest rules for YouTube request headers)
- `src/ports/CacheStore.ts`
- `src/adapters/browser/ChromeStorageLocalCache.ts`
- `tests/unit/adapters/chrome-storage-local-cache.test.ts`
- `tools/smoke-test-watch.ts` (Playwright script for watch page)
- `justfile` recipe: `smoke-test-watch`

### Modified

- `wxt.config.ts` (register `watch` entrypoint, confirm `host_permissions` for `*://*.youtube.com/*`, add `storage` permission if missing)
- `src/entrypoints/sidepanel/App.svelte` (add "Pop out" button)
- `src/adapters/youtube/TranscriptSource.ts` (verify/refactor to work from extension-page context; fetch binding already fixed)
- `src/ports/VideoPlayer.ts` (verify interface is iframe-API-compatible)

### Untouched

- `src/entrypoints/content.ts`
- `src/entrypoints/youtube-player.content.ts`
- `src/entrypoints/background.ts`
- All existing `core/` modules

## Scope

**In:** standalone watch page (video iframe + transcript), autoscroll follow/browse, click-to-seek, time sync polling, per-video local-storage cache, sidebar "Pop out" button, Playwright smoke test for watch page, both paths shipping in parallel.

**Out (deferred):** layout toggle (horizontal split), "Open in Quoth" button injected on youtube.com, auto-redirect from youtube.com, search (phase 3), markdown export (phase 3), ML formatting (phase 4+), embed-failure fallback UX (noted as known issue).

## Verification

Red/green TDD throughout. Drive Playwright directly before handing off.

1. `just check`: all unit tests pass (existing 89 + new tests for adapters and entry logic), lint, typecheck, fmt
2. `just smoke-test-watch` (new Playwright script):
   - Build Chrome extension
   - Launch Chromium with extension
   - Open `chrome-extension://<id>/watch.html?v=YwZR6tc7qYg&t=147` directly
   - Wait for iframe `onReady`
   - Assert transcript populated (word count > 0)
   - Assert video seeked to `t=147`
   - Click a word, assert video time updates to that word's start
   - Wait 300ms, assert active-word highlight advanced
   - Assert cache hit on second load (same URL)
3. `just smoke-test`: existing sidebar smoke test still passes (no regression)
4. `just smoke-test-firefox`: Firefox tab-mode still works (no regression)
5. Manual: open a YouTube video with sidebar open, click "Pop out", confirm watch page opens in new tab with video, transcript, and correct timestamp

## Known risks and open questions

- **Embed-disabled videos** (expected <5% for Ted's content): watch page will fail to load video. v1 shows a plain error message; nicer fallback is deferred.
- **IFrame Player API time precision**: confirm `player.getCurrentTime()` gives millisecond-level precision comparable to `video.currentTime`. Test during implementation.
- **host_permissions for Innertube fetch from extension page**: current content script has implicit access. Extension page needs explicit `host_permissions` in manifest.
