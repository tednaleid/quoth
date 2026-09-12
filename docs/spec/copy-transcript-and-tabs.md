# Copy Transcript & YouTube Tab Selector

User-facing features for note-taking workflows: transcript text that can be
selected like normal text without triggering a seek, a Copy Transcript
button with format options, a way to choose which open YouTube tab the
sidebar shows, and an in-memory replay cache that makes switching tabs instant.

## 1. Selecting text without seeking

Every word, timestamp, and chapter title is a click-to-seek target, so a
plain click must seek while a drag-select must not. There is no separate
"copy mode": auto-scroll has its own toggle, and the highlight never blocks
selection.

- `src/core/click-guard.ts` — pure `shouldSeekOnClick(down, up,
  selectionCollapsed)`: a click seeks only if the pointer moved 5px or less
  and no text is selected. The component records the `mousedown` position and
  reads `window.getSelection()` at click time; only the boolean crosses into
  core so `core/` stays free of browser APIs. This covers the one case where
  a drag fires a click event: mousedown and mouseup landing inside the same
  word. A drag across words fires the click on their common ancestor, which
  has no seek handler.
- CSS: `.transcript` and `.word` set `user-select: text` (plus
  `-moz-user-select` for Gecko).

## 2. Copy Transcript button

Header controls: a format `<select>` (MD links / Timestamps / Plain) plus a
Copy button, disabled while no transcript is loaded. On success a toast shows
"Transcript copied to clipboard!" (~2.5s); on failure it suggests manual
selection. Copy of an empty transcript toasts "Nothing to copy yet".

Formats (paragraphs joined by blank lines), all pure functions in
`src/core/transcript-export.ts`:

- **Markdown** (default) — the document format from `docs/spec/design.md`:
  a `#` title, a `[Video](url) | channel | duration` line, chapters as `##`
  headings, and each paragraph prefixed with a clickable timestamp link:
  `[1:01](https://youtube.com/watch?v=abc123&t=61) Second para.` Paragraphs
  are not hard-wrapped, since Obsidian renders single newlines as breaks.
  Chapter placement uses the same `assignChaptersToSegments` helper as the
  sidebar, so the export and the view agree on where a chapter begins.
- **Timestamps** — plain `[1:01] Second para.` (also `[h:mm:ss]` past an hour).
- **Plain** — paragraph text only, no timestamps.

Clipboard path (`src/adapters/browser/clipboard.ts`, keeping browser APIs in
adapters per the hexagonal layout):

1. `navigator.clipboard.writeText()` (works on sidebar user gesture).
2. Fallback: hidden `textarea` + `document.execCommand('copy')` for older
   Firefox contexts.
3. Throws if both fail → error toast.

Manifest: no new permissions. The copy runs inside a click handler, so
`navigator.clipboard.writeText()` works without `clipboardWrite` in both
browsers, and adding a permission would prompt existing Firefox users on
update. No new host permissions; everything stays on youtube.com.

## 3. YouTube tab selector

Previously the sidebar auto-followed the last-activated YouTube tab with no
way to choose. Now a dropdown under the header lists all open
`youtube.com/watch` tabs (`●` marks the connected one; "No YouTube tabs open"
when empty).

- **Follow-active (default, 🔓):** current behavior — activating/navigating a
  YouTube tab switches the sidebar to it.
- **Pinned (📌):** picking a tab from the dropdown pins the sidebar to it;
  background tab activity no longer switches. Clicking 🔓 resumes following
  and reconnects to the active tab.
- Duplicate titles are disambiguated by video ID via `core/youtube.ts`.

Wiring:

- `src/ports/tab-connector.ts` — `YouTubeTabInfo { id, title, url, active }`,
  optional `onTabsChanged(tabs)` and `onDisconnect(reason)` callbacks, and a
  `TabConnection` handle (`pin(tabId)`, `follow()`, `cleanup()`) returned by
  `setupTabConnector`.
- `src/adapters/browser/tab-connector.ts` — the connector is the single owner
  of which tab is connected and whether it is following the active tab.
  `listYouTubeTabs()` queries all tabs and filters by the watch-URL regex (no
  new permissions needed since `tabs` + youtube host permissions already
  expose url/title). The connector emits the list on startup, activation,
  update, and removal. `pin(tabId)` connects to that tab and stops following;
  `follow()` resumes following and reconnects to the active YouTube tab if
  there is one, otherwise stays put. When the connected tab closes or leaves
  YouTube, a following connector moves to the active (else first) remaining
  YouTube tab or reports `no-tabs`; a pinned connector reports
  `pinned-tab-closed` and waits. Every connection goes through the same
  `onConnect` + `request-state` path, so the content script refetches (or
  replays — see §4).
- `src/entrypoints/sidepanel/components/TabSelector.svelte` — dropdown +
  follow/pin toggle. `App.svelte` mirrors `availableTabs` and `youtubeTabId`
  from the connector callbacks, keeps `followActive` only for rendering the
  toggle, and maps `onDisconnect` reasons to the "Pinned tab closed" and "No
  YouTube tabs open" statuses.

## 4. Fast tab switching (replay cache)

**Problem:** every switch sent `request-state`, and the content script answered
by resetting `currentVideoId` and refetching all three network calls
(metadata POST, transcript GET, chapters POST) — even when returning to a tab
loaded seconds earlier.

**Fix (`src/entrypoints/content.ts`):** the content script keeps its last
successfully loaded result in memory (videoInfo, captionTracks, words,
chapters). Failures are never cached, so a transient caption error retries on
the next `request-state` instead of replaying forever. On `request-state`:

- Same video as the cache → replays `video-detected` and `captions-loaded`
  immediately. Zero network; the Loading flash shrinks to two message hops.
- Different video, nothing cached, or no video → fetches as before.

The replay decision is the pure `shouldReplayCached()` helper in
`src/core/replay.ts` (unit-tested). First visit to a tab still costs the three
requests — unavoidable — but every return visit is instant. Time-update polling
is untouched and keeps running across replays.

**Not done:** the dormant `CacheStore` port + `ChromeStorageLocalCache`
adapter (parsed transcripts keyed by videoId, never wired in) could persist
transcripts across tabs for stale-while-revalidate on fresh tabs. Left out
deliberately — caption track URLs expire, so it needs staleness handling — but
it is the natural next step.

## 5. Testing

- **Unit (Vitest):** `transcript-export` (all three formats,
  hour timestamps, empty input), `click-guard` (plain click seeks; selection
  or drag does not), `replay` (replay/refetch matrix), `tab-connector`
  (`listYouTubeTabs` filtering, `onTabsChanged` emission, pin/follow cycles,
  connected tab closing while following or pinned),
  settings + settings-storage migration (old saves gain `mode`/`copyFormat`
  defaults).
- **Smoke:** `just smoke-test firefox` (sidepanel + popout mount in Gecko;
  required a harness fix — the browser-API stub lacked `storage`, so the app
  never mounted; stub added in `tools/smoke-test-firefox.ts`) and
  `just smoke-test` / `test-e2e` on Chromium (real extension, transcript load,
  exact-ms click-to-seek, popout).
- **Manual checklist:** drag-select (no seek, Ctrl+C works);
  all three copy formats paste
  correctly; dropdown switches transcripts; pin survives background tab
  activity; closing the pinned tab degrades gracefully; no-captions video
  disables copy.

## 6. Incidental: ML dependency removal

`@huggingface/transformers`, `punctuation-restore`, `sentencepiece-js`, and
`diff` were removed from `package.json` (plus onnx-only `trustedDependencies`).
Nothing in `src/` imported them; the sole consumer was the unshipped
`tools/model-bench/` research harness, which was deleted along with its `just`
recipe. `bun install` no longer stalls on `onnxruntime-web` (69 packages).
