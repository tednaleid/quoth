# Hexagonal Architecture Refactoring Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the entrypoint code to use the hexagonal port interfaces that already exist but are unused, making the browser-API-dependent code testable.

**Spec reference:** `docs/spec/design.md` -- Architecture section

---

## Context: Where We Are

### Project summary

Quoth is a Chrome browser extension that displays YouTube video transcripts in a side panel. It fetches captions via YouTube's Innertube ANDROID API, parses JSON3 caption data into word-level timed segments, renders them in a Svelte 5 side panel, syncs with video playback, and supports click-to-seek.

### What's been built (Phases 1-2)

- **Phase 1:** WXT + Svelte 5 + TypeScript project scaffold. Justfile, ESLint + Prettier, Vitest, Playwright E2E, CI workflow. Side panel hello world, YouTube content script, background service worker.
- **Phase 2:** Caption fetching via Innertube ANDROID API, JSON3 parsing, playback sync (250ms polling with binary search), click-to-seek via YouTube player API (main-world content script), auto-scroll toggle, multi-tab support.

### What works

- 38 unit tests passing, 1 E2E test, smoke test with real YouTube
- Core logic (`src/core/`) is pure, well-tested, no browser APIs
- Adapter for Innertube response parsing is tested
- Transcript loads, displays, highlights, click-to-seek works
- Tab mode (side panel as standalone tab) works for Playwright testing

### What's wrong: architecture gap

Port interfaces exist in `src/ports/` but nothing implements or uses them. All entrypoint code calls browser APIs directly:

| File | Lines | Browser API calls | Testable? |
|------|-------|-------------------|-----------|
| `content.ts` | 132 | fetch, browser.runtime, window.postMessage, DOM | No |
| `App.svelte` | 131 | browser.tabs, browser.runtime, browser.tabs.onActivated | Partially (handleMessage is pure) |
| `background.ts` | 35 | chrome.sidePanel, browser.runtime, browser.tabs | No |
| `youtube-player.content.ts` | 22 | window.addEventListener, document.querySelector | No (but trivial) |

The 40% of code that touches browser APIs has zero test coverage. The ports were designed to fix this but were never wired in.

### Phases still ahead

- **This refactoring** (between Phase 2 and Phase 3)
- **Firefox support:** Dedicated phase immediately after refactoring. Firefox is the primary target browser. Covers sidebarAction API, manifest differences, cross-browser smoke testing.
- **Phase 3:** Search and markdown export (pure logic, straightforward)
- **Phase 4:** ML formatting pipeline with model comparison harness
- **Phase 5:** Paragraph segmentation and section headers
- **Phase 6:** Polish, error handling, release workflow

---

## What This Refactoring Achieves

1. **Testable message handling:** Extract the message handler from App.svelte so the state machine (video-detected -> captions-loaded -> time-update) can be unit tested
2. **Testable caption fetching:** Wrap Innertube + JSON3 fetching in a TranscriptSource adapter that can be swapped for a FixtureTranscriptAdapter in tests
3. **Testable tab management:** Extract the tab discovery/switching logic from App.svelte
4. **Mock-friendly entrypoints:** Content script and side panel consume port interfaces, tests inject mocks

### What this does NOT do (intentionally)

- Full dependency injection framework -- overkill for an extension
- SidebarHost port implementation -- the Svelte component IS the view layer, abstracting it adds no value
- Refactoring youtube-player.content.ts -- it's 22 lines of main-world glue code that just receives postMessage and calls player.seekTo(). The VideoPlayer port/adapter wraps the *content.ts side* of this interaction (polling, seeking via postMessage), not the main-world script itself.
- Refactoring background.ts -- it's a simple message router, testable enough as-is with fakeBrowser
- Implementing PageDetector port -- `extractVideoId()` is already pure/tested in core, the remaining page detection is 3 lines of DOM event wiring (`yt-navigate-finish` listener). Delete the dead port file.

### Cleanup included

- Delete `src/ports/page-detector.ts` (dead code, not worth implementing)
- Delete `src/ports/video-player.ts` after the adapter is created (interface moves to the adapter file or stays if preferred)
- Remove unused `request-captions` variant from `SidePanelMessage` in `src/messages.ts`

### Convention note for implementers

All source files in this project use a 2-line `ABOUTME:` comment header. Every new file must include this. Example:
```typescript
/**
 * ABOUTME: Pure state machine for handling ContentMessages in the side panel.
 * ABOUTME: No browser APIs -- maps messages to TranscriptState transitions.
 */
```

---

## File Map

### New files

```
src/
  core/
    message-handler.ts              # Pure state machine for handling ContentMessages
    tab-connector.ts                # Tab discovery/switching logic

  adapters/
    youtube/
      transcript-source.ts          # Implements TranscriptSource port (Innertube + JSON3)
      video-player.ts               # Implements VideoPlayer port (DOM polling + postMessage seek)
    mock/
      mock-transcript-source.ts     # Test adapter with fixture data

tests/
  unit/
    core/
      message-handler.test.ts       # Message state machine tests
      tab-connector.test.ts         # Tab management tests
    adapters/
      transcript-source.test.ts     # Innertube adapter tests
      video-player.test.ts          # Video player adapter tests
```

### Modified files

```
src/
  entrypoints/
    content.ts                      # Slim: instantiate adapters, wire to messaging
    sidepanel/
      App.svelte                    # Slim: import message handler, minimal browser glue
  ports/
    transcript-source.ts            # May need minor interface adjustments
  messages.ts                       # Remove unused request-captions variant
```

### Deleted files

```
src/
  ports/
    page-detector.ts                # Dead code -- extractVideoId is already pure in core
```

---

## Task 1: Extract Message Handler from App.svelte

The highest-value refactoring. The `handleMessage()` switch statement in
App.svelte is pure logic that updates state based on message type. Extract it
into a testable module.

**Files:**
- Create: `src/core/message-handler.ts`
- Create: `tests/unit/core/message-handler.test.ts`
- Modify: `src/entrypoints/sidepanel/App.svelte`

- [ ] **Step 1: Write failing tests for message handler**

Test each message type produces the expected state changes:
- `video-detected` -> sets videoInfo, status = 'Loading captions...'
- `captions-loaded` -> sets words, computes segments, status = 'N words loaded'
- `captions-error` -> sets error status
- `video-left` -> resets all state
- `time-update` -> updates activeWordIndex and activeSegmentIndex via binary search

The message handler should be a pure function:
```typescript
function handleMessage(state: TranscriptState, message: ContentMessage): TranscriptState
```

- [ ] **Step 2: Run tests, verify they fail**
- [ ] **Step 3: Implement message-handler.ts**

```typescript
import type { TimedWord, VideoInfo } from './types';
import type { WordSegment } from './playback-sync';
import { findActiveWordIndex, findActiveSegmentIndex, groupWordsIntoSegments } from './playback-sync';
import type { ContentMessage } from '../messages';

const SEGMENT_GAP_MS = 2000;

export interface TranscriptState {
  videoInfo: VideoInfo | null;
  words: TimedWord[];
  segments: WordSegment[];
  activeWordIndex: number;
  activeSegmentIndex: number;
  status: string;
}

export function createInitialState(): TranscriptState {
  return {
    videoInfo: null,
    words: [],
    segments: [],
    activeWordIndex: -1,
    activeSegmentIndex: -1,
    status: 'Open a YouTube video to see its transcript.',
  };
}

export function handleMessage(state: TranscriptState, message: ContentMessage): TranscriptState {
  // Pure function: returns new state based on message type
  // No browser APIs, no side effects
}
```

- [ ] **Step 4: Run tests, verify they pass**
- [ ] **Step 5: Update App.svelte to use the extracted handler**

Replace inline state management with:
```svelte
import { createInitialState, handleMessage, type TranscriptState } from '../../core/message-handler';
let state: TranscriptState = $state(createInitialState());
// In message listener:
state = handleMessage(state, message);
```

**Important:** Also remove the `$effect` block (current lines 24-30) that computes
segments from words. The message handler now computes segments inside
`handleMessage` when processing `captions-loaded`, so the reactive `$effect` is
redundant and must be deleted to avoid duplicate computation.

- [ ] **Step 6: Run `just check` and `just smoke-test`**
- [ ] **Step 7: Commit**

---

## Task 2: Create TranscriptSource Adapter

Extract the Innertube API call + JSON3 caption fetch from content.ts into an
adapter that implements the TranscriptSource port.

**Files:**
- Create: `src/adapters/youtube/transcript-source.ts`
- Create: `tests/unit/adapters/transcript-source.test.ts`
- Modify: `src/entrypoints/content.ts`
- Modify: `src/ports/transcript-source.ts` (if interface needs adjustment)

- [ ] **Step 1: Write failing tests**

Test that the adapter:
- Calls Innertube ANDROID API with correct params
- Parses video info from response
- Extracts caption tracks with fmt=json3
- Fetches and parses JSON3 captions into TimedWord[]
- Returns null/empty for missing data

Use dependency injection for `fetch` so tests can provide mock responses
without hitting the network.

- [ ] **Step 2: Implement the adapter**

```typescript
export class YouTubeTranscriptSource implements TranscriptSource {
  constructor(private fetchFn: typeof fetch = fetch) {}

  async getVideoMetadata(videoId: string): Promise<VideoMetadata> { ... }
  async fetchTranscript(captionTrack: CaptionTrack): Promise<TimedWord[]> { ... }
}
```

`getVideoMetadata` makes a single Innertube API call and returns both
`videoInfo` and `captionTracks` from the same player response. This avoids
the double-fetch that would occur if they were separate methods.

The existing `extractVideoInfo`, `extractCaptionTracks`, and
`parseJson3Captions` functions are reused inside the adapter.

- [ ] **Step 3: Run tests, verify they pass**
- [ ] **Step 4: Update content.ts to use the adapter**

Content script becomes slim:
```typescript
const source = new YouTubeTranscriptSource();
const { videoInfo, captionTracks } = await source.getVideoMetadata(videoId);
const words = await source.fetchTranscript(captionTracks[0]);
```

- [ ] **Step 5: Run `just check` and `just smoke-test`**
- [ ] **Step 6: Commit**

---

## Task 3: Create Mock TranscriptSource for Tests

**Files:**
- Create: `src/adapters/mock/mock-transcript-source.ts`

- [ ] **Step 1: Implement FixtureTranscriptSource**

```typescript
export class FixtureTranscriptSource implements TranscriptSource {
  constructor(
    private videoInfo: VideoInfo,
    private words: TimedWord[],
  ) {}
  // Returns fixture data, no network calls
}
```

- [ ] **Step 2: Verify existing tests still pass**
- [ ] **Step 3: Commit**

---

## Task 4: Create VideoPlayer Adapter

Extract the video player interaction code from content.ts (~48 lines) into an
adapter that implements the VideoPlayer port. This wraps DOM polling for
`video.currentTime`, seeking via `window.postMessage`, and the 250ms time-update
interval.

Note: this does NOT touch `youtube-player.content.ts` (the 22-line main-world
script). That stays as-is. This adapter wraps the *content.ts side* of the
interaction -- the isolated-world code that reads the DOM and sends postMessage.

**Files:**
- Create: `src/adapters/youtube/video-player.ts`
- Create: `tests/unit/adapters/video-player.test.ts`
- Modify: `src/entrypoints/content.ts`
- Modify: `src/ports/video-player.ts` (if interface needs adjustment)

- [ ] **Step 1: Write failing tests**

Test with injected dependencies (no real DOM needed):
- `getState()` reads from the provided video element getter
- `seekTo(timeMs)` calls the injected postMessage sender with correct seconds conversion
- `onTimeUpdate(callback)` sets up interval, calls callback with state, returns cleanup function
- `onTimeUpdate` cleanup function clears the interval

Use dependency injection for the DOM access:
```typescript
interface VideoPlayerDeps {
  getVideoElement: () => HTMLVideoElement | null;
  postSeek: (timeSeconds: number) => void;
}
```

- [ ] **Step 2: Run tests, verify they fail**
- [ ] **Step 3: Implement the adapter**

```typescript
export class YouTubeVideoPlayer implements VideoPlayer {
  constructor(private deps: VideoPlayerDeps) {}

  getState(): VideoPlayerState {
    const video = this.deps.getVideoElement();
    if (!video) return { currentTimeMs: 0, isPlaying: false, durationMs: 0 };
    return {
      currentTimeMs: Math.round(video.currentTime * 1000),
      isPlaying: !video.paused,
      durationMs: Math.round(video.duration * 1000),
    };
  }

  seekTo(timeMs: number): void {
    this.deps.postSeek(timeMs / 1000);
  }

  onTimeUpdate(callback: (state: VideoPlayerState) => void): () => void {
    const interval = setInterval(() => {
      const state = this.getState();
      callback(state);
    }, 250);
    return () => clearInterval(interval);
  }
}
```

Default deps for production use in content.ts:
```typescript
const player = new YouTubeVideoPlayer({
  getVideoElement: () => document.querySelector('video.html5-main-video') as HTMLVideoElement | null,
  postSeek: (timeSeconds) => window.postMessage({ type: 'quoth-seek', timeSeconds }, '*'),
});
```

- [ ] **Step 4: Run tests, verify they pass**
- [ ] **Step 5: Run `just check`**
- [ ] **Step 6: Commit**

---

## Task 5: Extract Tab Management from App.svelte

The tab discovery and switching logic (`findYouTubeTab`,
`browser.tabs.onActivated`, `connectToYouTubeTab`) is currently inline in
App.svelte. Extract it into a module that can be tested with fakeBrowser.

**Files:**
- Create: `src/core/tab-connector.ts`
- Create: `tests/unit/core/tab-connector.test.ts`
- Modify: `src/entrypoints/sidepanel/App.svelte`

- [ ] **Step 1: Write failing tests with fakeBrowser**

Test:
- `connectToYouTubeTab` finds active YouTube tab first, falls back to any
- `onTabActivated` switches to new YouTube tab, ignores non-YouTube tabs
- Calls `sendMessage` callback when connected

- [ ] **Step 2: Implement tab-connector.ts**
- [ ] **Step 3: Update App.svelte to use tab-connector**
- [ ] **Step 4: Run `just check` and `just smoke-test`**
- [ ] **Step 5: Commit**

---

## Task 6: Slim Down content.ts and Clean Up Dead Code

After Tasks 2 and 4, content.ts should be mostly adapter instantiation + message
wiring. Review and ensure it's as thin as possible. Also clean up dead code
identified during planning.

**Files:**
- Modify: `src/entrypoints/content.ts`
- Modify: `src/messages.ts` (remove unused `request-captions` variant)
- Delete: `src/ports/page-detector.ts`

- [ ] **Step 1: Review content.ts**

The content script should do only:
1. Instantiate `YouTubeTranscriptSource` and `YouTubeVideoPlayer`
2. Listen for `yt-navigate-finish` events
3. On video page: fetch transcript via adapter, send messages
4. Start time-update polling via `YouTubeVideoPlayer.onTimeUpdate()`
5. Handle `seek-to` via `YouTubeVideoPlayer.seekTo()` and `request-state` messages

- [ ] **Step 2: Remove any remaining inline logic that belongs in core/adapters**
- [ ] **Step 3: Remove unused `request-captions` variant from SidePanelMessage in messages.ts**
- [ ] **Step 4: Delete `src/ports/page-detector.ts`**
- [ ] **Step 5: Run `just check` and `just smoke-test`**
- [ ] **Step 6: Commit**

---

## Task 7: Final Verification

- [ ] **Step 1: `just clean && bun install && just check`**
- [ ] **Step 2: `just test-e2e`**
- [ ] **Step 3: `just smoke-test`**
- [ ] **Step 4: Review test count -- should be significantly higher than 38**
- [ ] **Step 5: Verify no browser API imports in `src/core/`**

```bash
grep -r "browser\." src/core/ || echo "Clean"
grep -r "chrome\." src/core/ || echo "Clean"
grep -r "window\." src/core/ || echo "Clean"
grep -r "document\." src/core/ || echo "Clean"
```

- [ ] **Step 6: Commit final state**

---

## Verification

After this refactoring:
- `just test` should have 50+ tests (up from 38)
- `just smoke-test` should still pass (no behavior changes)
- `just test-e2e` should still pass
- `src/core/` should have zero browser API imports
- `src/entrypoints/` should be thin wiring code
- Message handling should be fully unit-tested
- TranscriptSource adapter should be testable with injected fetch
- VideoPlayer adapter should be testable with injected deps
- No dead port interfaces remaining

## What Comes Next

After this refactoring, the next priority is **Firefox support** -- not a polish
item, but a dedicated phase. Firefox is the primary target browser. Our test
infrastructure (Playwright tab mode) is browser-agnostic, so the dev/test loop
translates directly. The main work is:
- `browser.sidebarAction` (Firefox) vs `chrome.sidePanel` (Chrome) in background.ts
- Manifest differences (WXT handles most of this via `just build-firefox`)
- Smoke testing in Firefox via Playwright

The hexagonal architecture from this refactoring makes Firefox support
straightforward -- browser-specific code is isolated in thin entrypoints.
