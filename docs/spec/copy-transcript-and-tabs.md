# Copy Transcript & YouTube Tab Selector

User-facing features for note-taking workflows: an explicit seek/copy mode so
transcript text can be selected like normal text, a one-click Copy Transcript
button with format options, a dropdown to choose which open YouTube tab the
sidebar shows, and an in-memory replay cache that makes switching tabs instant.

## 1. Seek mode vs copy mode

The header toggle (🔍 seek / 📋 copy) switches how the transcript behaves.
Persisted in `HighlightSettings.mode`, so the choice survives reloads.

| Behavior | Seek mode (default) | Copy mode |
|---|---|---|
| Click word / timestamp / chapter | Seeks the video, snaps scroll to the word | Nothing (inert text) |
| Drag-select text | Selects without seeking (click-vs-drag guard) | Selects normally |
| Auto-scroll snap on playback | On | Off (scroll stays where you put it) |
| Horizon / current-word highlight | On | Off (plain text) |
| Timestamps | Clickable YouTube links (`watch?v=…&t=…`) | Plain text |
| Clipboard | Manual Ctrl+C works | Manual Ctrl+C works |

Implementation:

- `src/core/settings.ts` — `TranscriptMode = 'seek' | 'copy'`,
  `CopyFormat = 'markdown' | 'timestamps' | 'plain'`; both persisted with
  merge-over-defaults migration for old saves.
- `src/entrypoints/sidepanel/components/TranscriptView.svelte` — takes
  `mode` (default `'seek'`, so the popout is unaffected). In copy mode words
  render without `role=button`/`onclick`, intensity is forced to 0, the
  `current-word` class is suppressed, both auto-scroll `$effect`s early-return,
  and timestamps/chapters render as spans instead of links.
- `src/core/click-guard.ts` — pure `shouldSeekOnClick(down, up,
  selectionCollapsed)`: a click seeks only if the pointer moved ≤ 5px and no
  text is selected. The component records `mousedown` position and reads
  `window.getSelection()` at click time; the boolean crosses into core so
  `core/` stays free of browser APIs. Fixes two bugs at once: clicking text no
  longer yanks scroll to the top, and drag-selecting no longer triggers a seek.
- `src/entrypoints/sidepanel/App.svelte:handleSeek` also guards against copy
  mode as defense in depth.
- CSS: `.transcript` and `.word` set `user-select: text` (plus
  `-moz-user-select` for Gecko); copy mode switches the cursor to `text` and
  disables hover highlighting.

## 2. Copy Transcript button

Header controls: a format `<select>` (MD links / Timestamps / Plain) plus a
Copy button, disabled while no transcript is loaded. On success a toast shows
"Transcript copied to clipboard!" (~2.5s); on failure it suggests manual
selection. Copy of an empty transcript toasts "Nothing to copy yet".

Formats (paragraphs joined by blank lines), all pure functions in
`src/core/transcript-export.ts`:

- **Markdown links** (default) — each paragraph keeps a clickable timestamp,
  so pasted notes stay navigable:
  `[[1:01](https://youtube.com/watch?v=abc123&t=61)] Second para.`
- **Timestamps** — plain `[1:01] Second para.` (also `[h:mm:ss]` past an hour).
- **Plain** — paragraph text only, no timestamps.

Clipboard path (`src/adapters/browser/clipboard.ts`, keeping browser APIs in
adapters per the hexagonal layout):

1. `navigator.clipboard.writeText()` (works on sidebar user gesture).
2. Fallback: hidden `textarea` + `document.execCommand('copy')` for older
   Firefox contexts.
3. Throws if both fail → error toast.

Manifest: `clipboardWrite` was added to `wxt.config.ts` permissions (Firefox-safe,
harmless on Chrome). No new host permissions; everything stays on youtube.com.

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

- `src/ports/tab-connector.ts` — new `YouTubeTabInfo { id, title, url, active }`,
  optional `onTabsChanged(tabs)` and `isPinned()` callbacks (both optional, so
  existing callers are unaffected).
- `src/adapters/browser/tab-connector.ts` — new `listYouTubeTabs()` (queries
  all tabs, filters by the watch-URL regex; no new permissions needed since
  `tabs` + youtube host permissions already expose url/title). `setupTabConnector`
  emits the list on startup, activation, update, and removal, and suppresses
  auto-switch while `isPinned()`. Manual selection reuses the existing
  `onConnect` + `request-state` path, so the content script refetches (or
  replays — see §4).
- `src/entrypoints/sidepanel/components/TabSelector.svelte` — dropdown +
  follow/pin toggle. `App.svelte` owns `availableTabs`, `followActive`, and
  `youtubeTabId`; if the connected tab closes or navigates away while pinned
  it shows "Pinned tab closed", while following it falls through to another
  tab or "No YouTube tabs open".

## 4. Fast tab switching (replay cache)

**Problem:** every switch sent `request-state`, and the content script answered
by resetting `currentVideoId` and refetching all three network calls
(metadata POST, transcript GET, chapters POST) — even when returning to a tab
loaded seconds earlier.

**Fix (`src/entrypoints/content.ts`):** the content script keeps its last
fully-loaded result in memory (videoInfo, captionTracks, words, chapters, or
the fetch error). On `request-state`:

- Same video + completed payload → replays `video-detected` and
  `captions-loaded`/`captions-error` immediately. Zero network; the Loading
  flash shrinks to two message hops.
- Different video, unfinished fetch, or no video → fetches as before.

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

- **Unit (Vitest, 180 passing):** `transcript-export` (all three formats,
  hour timestamps, empty input), `click-guard` (plain click seeks; selection
  or drag does not), `replay` (replay/refetch matrix), `tab-connector`
  (`listYouTubeTabs` filtering, `onTabsChanged` emission, pin suppression),
  settings + settings-storage migration (old saves gain `mode`/`copyFormat`
  defaults).
- **Smoke:** `just smoke-test firefox` (sidepanel + popout mount in Gecko;
  required a harness fix — the browser-API stub lacked `storage`, so the app
  never mounted; stub added in `tools/smoke-test-firefox.ts`) and
  `just smoke-test` / `test-e2e` on Chromium (real extension, transcript load,
  exact-ms click-to-seek, popout).
- **Manual checklist:** drag-select in seek mode (no seek, Ctrl+C works);
  copy-mode toggle freezes highlight/scroll; all three copy formats paste
  correctly; dropdown switches transcripts; pin survives background tab
  activity; closing the pinned tab degrades gracefully; no-captions video
  disables copy.

## 6. Incidental: ML dependency removal

`@huggingface/transformers`, `punctuation-restore`, `sentencepiece-js`, and
`diff` were removed from `package.json` (plus onnx-only `trustedDependencies`).
Nothing in `src/` imported them; the sole consumer was the unshipped
`tools/model-bench/` research harness, which was deleted along with its `just`
recipe. `bun install` no longer stalls on `onnxruntime-web` (69 packages).
