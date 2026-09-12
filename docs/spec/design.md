# Quoth: YouTube Transcript Viewer Extension -- Design Spec

Date: 2026-04-04

## Overview

Quoth is a Chrome and Firefox browser extension that displays a formatted, searchable transcript in the browser's native side panel alongside YouTube videos. All processing happens client-side. No server component.

**Scope note:** The original design included an ML formatting pipeline (punctuation, paragraph segmentation, and generated section headers running in Transformers.js). That pipeline was dropped. Paragraph breaks come from caption timing (see `paragraph-segmentation.md`), headings come from YouTube's chapter markers, and the ML research is kept in `other-research.md`. For the header, copy menu, and tab picker as built, see `copy-transcript-and-tabs.md`; for the code layout as built, see `architecture.md`.

**Stack:** WXT framework + Svelte 5 + TypeScript + bun. Vitest for unit tests, Playwright for E2E.

**License:** MIT

---

## Architecture

### Hexagonal Core with Ports and Adapters

All browser-specific and external dependencies are pushed to the edges. Core logic has zero imports from adapters or browser APIs.

```
                         +--------------------------------------+
                         |            Quoth Core                 |
                         |                                       |
   PageDetector -------->|  - Parse captions into timed words    |<---- TranscriptSource
                         |  - Sync transcript with playback      |
   VideoPlayer <-------->|  - Search within transcript           |
                         |  - Export to markdown with timestamps  |
   SidebarHost <---------|  - Group words into paragraphs        |<---- TranscriptStore
                         |                                       |
                         +--------------------------------------+
```

### Extension Component Model

| Component | Context | Role |
|-----------|---------|------|
| Content script | YouTube page (isolated world) | Extracts captions via Innertube API (JSON3 format), observes video playback state, handles click-to-seek |
| Background service worker | Extension context | Routes messages between content script and side panel, manages extension lifecycle |
| Side panel (Svelte 5) | Extension context | Displays transcript, handles search, copies and exports the transcript, shows status |

### Adapter Table

| Port | Chrome MVP Adapter | Firefox Adapter (future) | Test Adapter |
|------|-------------------|-------------------------|-------------|
| `VideoPlayer` | Content script, YT player API, long-lived port | Same (content script is cross-browser) | `MockPlayerAdapter` (controllable time/events) |
| `TranscriptSource` | Content script, Innertube JSON3 parsing | Same | `FixtureTranscriptAdapter` (saved JSON files) |
| `TranscriptStore` | Extension local storage (`unlimitedStorage` permission) | Same | `InMemoryStoreAdapter` |
| `SidebarHost` | Chrome sidePanel API | Firefox sidebar_action API | Vitest + happy-dom |
| `PageDetector` | Content script, URL matching, `yt-navigate-finish` event | Same | `MockPageAdapter` |

### Data Flow

1. User clicks extension icon on a YouTube page -- side panel opens
2. `PageDetector` extracts video ID from URL
3. `TranscriptStore` checks for a cached transcript
4. If not cached, `TranscriptSource` parses `ytInitialPlayerResponse` from the page, extracts caption track URL, fetches with `&fmt=json3` to get word-level timed segments
5. Side panel immediately renders the raw transcript as word-level `<span>` elements (clickable, with start/end times)
6. Words are grouped into paragraphs from caption timing gaps, under YouTube chapter headings when the video has chapters
7. `VideoPlayer` adapter in the content script sends current playback time via `chrome.runtime.connect` (long-lived port for streaming updates); side panel highlights the current sentence and auto-scrolls
8. Transcript is cached in `TranscriptStore` for next visit
9. Status bar at the bottom of the side panel shows loading and error state

### Key Technical Choices

- **WXT framework** for build tooling, cross-browser manifests, dev HMR
- **Svelte 5** (~1.85KB gzipped) for the side panel UI -- compile-time reactivity, scoped styles, near-zero runtime overhead. The sidebar needs reactive updates for playback sync, tab switching, and search, making vanilla DOM impractical.
- **Extension local storage** for transcript caching, with the `unlimitedStorage` permission for a generous quota.
- **Chrome sidePanel API** and Firefox sidebar_action behind one `SidebarHost` port
- **bun** for package management and script execution
- **Justfiles** for all build, test, lint, format, and dev commands. No bare `bun run` or `npx` invocations -- everything goes through `just` recipes.
- **ESLint + Prettier** for linting and formatting (Biome lacks Svelte support)
- **Red/green test-driven development.** Every feature starts with a failing test. `just test` runs in under a second for tight feedback. `just check` runs the full suite (tests + lint + typecheck + format-check) and is used by CI and pre-commit hooks. Claude runs `just test` after every change.
- **Manifest V3** only, latest browser versions only

---

## Transcript Pipeline

### Caption Extraction (TranscriptSource)

The content script parses `ytInitialPlayerResponse` from the YouTube page HTML to get caption track metadata. It extracts the `baseUrl` for the desired language track (English for MVP) and fetches with `&fmt=json3`. The JSON3 response contains an `events` array:

```json
{
  "events": [{
    "tStartMs": 1040,
    "dDurationMs": 3360,
    "segs": [
      {"utf8": "welcome"},
      {"tOffsetMs": 320, "utf8": " to"},
      {"tOffsetMs": 560, "utf8": " super"},
      {"tOffsetMs": 799, "utf8": " mario"}
    ]
  }]
}
```

Auto-generated captions include word-level timing (`tOffsetMs`). Manually uploaded captions provide only segment-level timing -- we interpolate word-level times within each segment in that case.

This is approximately 20 lines of code. No library dependency needed for extraction.

### Data Model

```typescript
interface TimedWord {
  text: string;       // the word
  start: number;      // start time in ms
  end: number;        // end time in ms
}

interface ParagraphBreak {
  wordIndex: number;  // index into TimedWord[] where this paragraph starts
  startTime: number;  // timestamp of the first word in this paragraph
}

interface Chapter {
  title: string;           // YouTube chapter title
  startTime: number;       // chapter start in ms
}

interface TimedTranscript {
  videoId: string;
  words: TimedWord[];
  paragraphs: ParagraphBreak[];     // where paragraphs start
  chapters: Chapter[];              // from YouTube's chapter markers
}
```

### Paragraphs and Chapters

Paragraph breaks are derived from pauses in the caption timing; the heuristics and their tuning are described in `paragraph-segmentation.md`. Chapter headings come from the video's own chapter markers through `TranscriptSource.fetchChapters`. Videos without chapters render as paragraphs only.

---

## Side Panel UI

The side panel is a Svelte 5 app rendered in the browser's sidebar. It communicates with the content script via `chrome.runtime.connect` (long-lived port for streaming playback time) and `chrome.runtime.sendMessage` (one-time requests for captions, formatting triggers).

### Activation

Click-to-open: user clicks the extension icon in the toolbar to toggle the side panel. It stays closed by default. No auto-opening on YouTube pages.

### Layout (top to bottom)

1. **Header bar** -- pin toggle, video title (a menu of the open YouTube tabs), copy menu (plain text, with timestamps, markdown), auto-scroll toggle, highlight settings, popout
2. **Transcript body** -- scrollable area containing the formatted transcript
3. **Status bar** -- loading and error state

### Transcript Rendering

Each word is a `<span>` with `data-start` and `data-end` attributes. Words are grouped into paragraphs, and paragraphs sit under chapter headings when the video has chapters.

```svelte
{#each paragraphs as paragraph}
  {#if paragraph.header}
    <h3 class="section-header">{paragraph.header}</h3>
  {/if}
  <p class="paragraph"
     class:active={paragraph === activeParagraph}>
    <a class="timestamp" href={timestampUrl(paragraph.startTime)}>
      {formatTime(paragraph.startTime)}
    </a>
    {#each paragraph.sentences as sentence}
      <span class="sentence" class:highlighted={sentence === activeSentence}>
        {#each sentence.words as word}
          <span
            class="word"
            data-start={word.start}
            data-end={word.end}
            onclick={() => seekTo(word.start)}
          >{word.text}</span>
        {/each}
      </span>
    {/each}
  </p>
{/each}
```

### Playback Sync

- Content script sends current time every ~250ms via the long-lived port
- Side panel finds the current sentence by binary searching the sorted timestamp array
- Current sentence gets a subtle highlight class; the containing paragraph is the "active" paragraph
- Auto-scroll: the active sentence is scrolled into view with `scrollIntoView({ behavior: 'smooth', block: 'nearest' })`
- User can toggle auto-scroll off (persisted in extension storage)
- Future enhancement: lighter word-level highlight within the sentence highlight

### Search

- Text input in the header bar (toggled with a search icon or Ctrl+F)
- Filters the transcript in real-time as the user types
- Matching words get a highlight class; non-matching paragraphs get dimmed (not hidden -- preserves context)
- Result count shown ("3 of 12 matches")
- Up/down arrows to jump between matches
- Searching pauses auto-scroll; dismissing search resumes it

### Markdown Export

The copy menu copies the transcript as plain text, with timestamps, or as markdown. Markdown format:

```markdown
# Everything We Got Wrong About Research-Plan-Implement

[Video](https://youtube.com/watch?v=YwZR6tc7qYg) | Channel Name | 45:23

## Introduction

[0:00](https://youtube.com/watch?v=YwZR6tc7qYg&t=0) Welcome to today's talk.
So we're going to talk about what went wrong with the research
plan implement pattern.

[0:23](https://youtube.com/watch?v=YwZR6tc7qYg&t=23) The key insight is that
you need to validate your assumptions before committing to a plan.
This is something that I think a lot of teams get wrong.

## Validating Assumptions

[2:45](https://youtube.com/watch?v=YwZR6tc7qYg&t=165) The second thing we
learned was about iteration speed...
```

Each paragraph gets a timestamp link. YouTube chapters become `##` headings. Markdown is generated programmatically from the `TimedTranscript` data model.

### Settings (minimal for MVP)

- Auto-scroll toggle
- Timestamp visibility toggle

---

## Justfile and Testing Strategy

All commands go through `just`. No bare `bun run`, `npx`, or direct tool invocations.

### Standard Recipes (per just-bootstrap)

| Recipe | What it runs |
|--------|-------------|
| `just check` | All tests + lint + typecheck + format-check (used by CI and pre-commit hook) |
| `just test` | Vitest unit tests |
| `just lint` | ESLint |
| `just fmt` | Prettier format |
| `just build` | WXT build for Chrome |
| `just clean` | Remove `.output/`, `.wxt/`, `node_modules/` |
| `just bump` | Bump version, generate release notes, tag, push |
| `just retag` | Re-trigger release workflow for existing version |
| `just install-hooks` | Set up pre-commit hook that runs `just check` |

### Extension-Specific Recipes

| Recipe | What it runs |
|--------|-------------|
| `just dev` | WXT dev mode with HMR, launches Chrome with extension loaded |
| `just test-e2e` | Playwright E2E tests against built extension in headless Chromium |
| `just build-firefox` | WXT build targeting Firefox (future) |
| `just fixture-capture <url>` | Save a YouTube page + captions as test fixtures |

### Test Layers

**Layer 1: Unit tests (Vitest + WXT fakeBrowser)**

The bulk of test coverage. Runs in under a second with `just test`.

- Core logic tests: caption parsing, paragraph segmentation, playback sync, search filtering, markdown export generation. Pure functions, no browser APIs.
- Adapter tests: each adapter tested in isolation against mocks/fakes. `TranscriptSource` against saved JSON3 fixtures. `TranscriptStore` with `fakeBrowser` in-memory storage.
- Svelte component tests: side panel components rendered with `@testing-library/svelte` + happy-dom. Verify word spans have correct timestamps, sentence highlighting toggles, search filters correctly.
- Message passing tests: content script <-> background <-> side panel flows tested with `fakeBrowser`'s in-memory port/messaging implementation.

**Layer 2: E2E tests (Playwright + Chromium)**

A smaller set of integration tests. Run with `just test-e2e`.

- Load the built extension in Chromium via `launchPersistentContext` with `--load-extension`
- Test against saved YouTube HTML fixtures served from a local static server (not live YouTube -- fast, deterministic, no bot detection)
- Fixtures include representative pages with `ytInitialPlayerResponse` data intact
- Tests cover: side panel opens, caption extraction works, click-to-seek, search highlighting, markdown export
- Side panel pages also testable directly via `chrome-extension://` URL navigation
- Runs headless

### Claude's Test Loop

```
Code change -> just test (<1s) -> just check (~5s) -> green
```

For deeper integration testing: `just test-e2e` (~10s). For interactive debugging: `playwright-cli` skill (open browser, navigate, snapshot, inspect elements and console).

### CI

`.github/workflows/ci.yml`: installs bun and just, runs `just check`. No drift between local and CI.

### Fixture Management

Saved fixtures live in `tests/fixtures/`. New fixtures captured via `just fixture-capture <youtube-url>`. Fixtures are committed to the repo and used by both unit tests and E2E tests.

---

## Project Structure

```
quoth/
  CLAUDE.md
  justfile
  package.json
  wxt.config.ts
  tsconfig.json
  vitest.config.ts
  playwright.config.ts
  .github/
    workflows/
      ci.yml
      release.yml

  src/
    core/                            # The hexagon -- pure logic, no browser APIs
      search.ts                      # Transcript text search
      export.ts                      # Markdown export generation
      sync.ts                        # Playback time -> active sentence mapping
      types.ts                       # TimedWord, TimedTranscript, Chapter, etc.

    ports/                           # Port interfaces (TypeScript interfaces only)
      video-player.ts
      transcript-source.ts
      transcript-store.ts
      sidebar-host.ts
      page-detector.ts

    adapters/                        # Adapter implementations
      chrome/
        side-panel-host.ts           # Chrome sidePanel API adapter
      youtube/
        player-adapter.ts            # YouTube player API (content script)
        caption-adapter.ts           # Innertube JSON3 caption fetching
        page-detector-adapter.ts     # URL matching, yt-navigate-finish
      storage/
        indexeddb-adapter.ts         # IndexedDB/Cache API

    entrypoints/                     # WXT entrypoints (file-based routing)
      background.ts                  # Service worker: message routing, lifecycle
      content.ts                     # Content script: YouTube page interaction
      sidepanel/                     # Side panel Svelte app
        index.html
        App.svelte
        components/
          TranscriptView.svelte
          SentenceSpan.svelte
          SearchBar.svelte
          StatusBar.svelte
          ExportButton.svelte

  tests/
    unit/
      core/
        pipeline.test.ts
        search.test.ts
        export.test.ts
        sync.test.ts
      adapters/
        caption-adapter.test.ts
      components/
        TranscriptView.test.ts
        SearchBar.test.ts
    e2e/
      extension.test.ts
      fixtures/
        server.ts                    # Local static server for fixtures
    fixtures/
      youtube-pages/
        dexter-horthy.html
        mortal-shell-2.html
      captions/
        dexter-horthy.json
        mortal-shell-2.json

  tools/
    fixture-capture.ts

  docs/
    spec/
```

**Key conventions:**
- `src/core/` has zero imports from `src/adapters/` or browser APIs (enforced by lint rule)
- `src/ports/` are pure TypeScript interfaces, no implementations
- `src/adapters/` import ports and provide implementations
- `src/entrypoints/` wire adapters to ports and set up extension contexts
- WXT's file-based entrypoint system auto-generates the manifest from `src/entrypoints/`

---

## Phased Implementation Plan

### Phase 1: Project Skeleton and Hello World

Goal: A Chrome extension that opens a side panel with "Hello World", fully tested, with justfile and CI wired up. Claude can build, test, and interact with it.

- WXT project initialized with Svelte 5 template via `bun`
- Justfile with all standard recipes (`check`, `test`, `lint`, `fmt`, `build`, `clean`, `dev`, `install-hooks`)
- CI workflow running `just check`
- Side panel entrypoint with minimal Svelte app
- Background service worker (empty message router)
- Content script matching `*://*.youtube.com/watch*`
- Vitest configured with WxtVitest plugin and fakeBrowser
- Playwright configured to load built extension
- At least one unit test and one E2E test passing
- CLAUDE.md, `.gitignore`, MIT license
- `playwright-cli` skill verified working for Claude interactive debugging (open browser with extension, snapshot, inspect)

### Phase 2: Raw Transcript Display and Video Sync

Goal: Open the side panel on a YouTube video page and see the raw transcript. It follows the video and you can click to seek.

- `TranscriptSource` port + `YouTubeCaptionAdapter` (Innertube JSON3 parsing)
- `VideoPlayer` port + `YouTubePlayerAdapter` (playback time via long-lived port, seek commands)
- `PageDetector` port + `YouTubePageAdapter` (video ID extraction, SPA navigation handling)
- `TranscriptStore` port + `IndexedDBAdapter` (cache raw transcripts)
- Side panel renders word-level spans with timestamps
- Sentence-level highlighting synced with video playback (~250ms updates)
- Auto-scroll (toggleable)
- Click any word to seek
- Timestamp links at paragraph boundaries (YouTube's original caption segments)
- Saved YouTube page fixtures for E2E tests
- `FixtureTranscriptAdapter` and `MockPlayerAdapter` for unit tests
- `just fixture-capture` script working

### Phase 3: Search and Export

Goal: Search within the transcript and export to markdown.

- Search bar: real-time filtering, match highlighting, match count, prev/next
- Search pauses auto-scroll; dismissing resumes
- Markdown export with video title, URL, paragraphs with timestamp links
- Export copies markdown to clipboard
- Unit tests for search logic and markdown generation
- E2E tests for search and export

### Phase 4: Polish

Goal: Production-ready for Chrome Web Store and GitHub release.

- Extension icon and branding
- Error handling: no captions available, network failures, live streams
- Performance profiling for large transcripts (2+ hour videos)
- Release workflow: build, package `.zip`, GitHub release
- `just bump` and `just retag`
- README with install instructions
- Chrome Web Store submission preparation
- Firefox adapter exploration/spike

---

## Unresolved

- **`playwright-cli` extension loading:** The `playwright-cli` skill supports `--browser=chrome` but it's unclear if Chrome launch args (like `--load-extension`) can be passed to load our unpacked extension during interactive debugging. Needs verification during Phase 1. Workaround: use a persistent profile with the extension pre-installed.

---

## Reference Research

Research on WXT, the YouTube Innertube API, browser extension architecture, and the ML model options that were evaluated and dropped is available in `docs/spec/other-research.md`.
