# Quoth: YouTube Transcript Viewer Extension -- Design Spec

Date: 2026-04-04

## Overview

Quoth is a Chrome browser extension (Firefox next) that displays a formatted, searchable transcript in the browser's native side panel alongside YouTube videos. All processing happens client-side using ML models running via Transformers.js v4 in Web Workers. No server component.

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
   PageDetector -------->|  - Orchestrate progressive pipeline   |<---- TranscriptSource
                         |  - Sync transcript with playback      |
   VideoPlayer <-------->|  - Search within transcript           |<---- TranscriptFormatter
                         |  - Export to markdown with timestamps  |
   SidebarHost <---------|  - Manage formatting state/progress   |<---- TranscriptStore
                         |                                       |
                         +--------------------------------------+
```

### Extension Component Model

| Component | Context | Role |
|-----------|---------|------|
| Content script | YouTube page (isolated world) | Extracts captions via Innertube API (JSON3 format), observes video playback state, handles click-to-seek |
| Background service worker | Extension context | Routes messages between content script and side panel, manages extension lifecycle |
| Side panel (Svelte 5) | Extension context | Displays transcript, handles search, manages export, shows processing status |
| ML inference worker | Inside offscreen document (Chrome) | Runs Transformers.js v4 models via ONNX Runtime. Offscreen document required because Chrome MV3 service workers cannot access WebGPU or spawn persistent workers |

### Adapter Table

| Port | Chrome MVP Adapter | Firefox Adapter (future) | Test Adapter |
|------|-------------------|-------------------------|-------------|
| `VideoPlayer` | Content script, YT player API, long-lived port | Same (content script is cross-browser) | `MockPlayerAdapter` (controllable time/events) |
| `TranscriptSource` | Content script, Innertube JSON3 parsing | Same | `FixtureTranscriptAdapter` (saved JSON files) |
| `TranscriptFormatter` | Offscreen document + Web Worker + Transformers.js v4 | Web Worker from sidebar/background page (no offscreen needed) | `PassthroughAdapter` / `MockFormatterAdapter` |
| `TranscriptStore` | IndexedDB for transcripts, Cache API for models (`unlimitedStorage` permission) | Same | `InMemoryStoreAdapter` |
| `SidebarHost` | Chrome sidePanel API | Firefox sidebar_action API | Vitest + happy-dom |
| `PageDetector` | Content script, URL matching, `yt-navigate-finish` event | Same | `MockPageAdapter` |

### Data Flow

1. User clicks extension icon on a YouTube page -- side panel opens
2. `PageDetector` extracts video ID from URL
3. `TranscriptStore` checks for cached formatted transcript in IndexedDB
4. If not cached, `TranscriptSource` parses `ytInitialPlayerResponse` from the page, extracts caption track URL, fetches with `&fmt=json3` to get word-level timed segments
5. Side panel immediately renders the raw transcript as word-level `<span>` elements (clickable, with start/end times)
6. `TranscriptFormatter` progressively applies formatting tiers in the ML worker:
   - Tier 1: Punctuation + true-casing + sentence boundary detection
   - Tier 2: Paragraph segmentation (embedding similarity + timestamp gaps)
   - Tier 3: Section header generation
7. As each tier completes, `jsdiff` aligns the formatted text back to original word timestamps, and the side panel updates in-place (preserving scroll position and playback sync)
8. `VideoPlayer` adapter in the content script sends current playback time via `chrome.runtime.connect` (long-lived port for streaming updates); side panel highlights the current sentence and auto-scrolls
9. Formatted result is cached in `TranscriptStore` for next visit
10. Status indicator at the bottom of the side panel shows current state (downloading models / processing tier N / done)

### Key Technical Choices

- **WXT framework** for build tooling, cross-browser manifests, dev HMR
- **Svelte 5** (~1.85KB gzipped) for the side panel UI -- compile-time reactivity, scoped styles, near-zero runtime overhead. The sidebar needs reactive updates for progressive formatting, playback sync, and search, making vanilla DOM impractical.
- **Transformers.js v4** for ONNX model inference in Web Workers
- **Cache API** for ML model file caching (Transformers.js default); **IndexedDB** for formatted transcript caching. Both use the `unlimitedStorage` permission for generous quotas.
- **Chrome sidePanel API** (MVP), Firefox sidebar_action (future adapter)
- **bun** for package management and script execution
- **Manifest V3** only, latest browser versions only

---

## Transcript Formatting Pipeline

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
  text: string;       // the word (possibly with punctuation after formatting)
  start: number;      // start time in ms
  end: number;        // end time in ms
  original: string;   // original unpunctuated text (for diff alignment)
}

interface ParagraphBreak {
  wordIndex: number;  // index into TimedWord[] where this paragraph starts
  startTime: number;  // timestamp of the first word in this paragraph
}

interface Section {
  title: string;           // generated section header text
  paragraphIndex: number;  // index into paragraphs[] where this section starts
  startTime: number;       // timestamp of the first word in this section
}

interface TimedTranscript {
  videoId: string;
  words: TimedWord[];
  formattingTier: 0 | 1 | 2 | 3;  // current formatting level
  paragraphs: ParagraphBreak[];     // where paragraphs start
  sections: Section[];              // generated section headers
}
```

### Progressive Formatting Tiers

Each tier takes the output of the previous tier and enriches it. The side panel re-renders after each tier completes.

**Tier 0 (immediate, no model):** Raw transcript words joined with spaces. Word-level spans in the DOM with timestamps. Displayed instantly while models download.

**Tier 1 -- Punctuation + true-casing + sentence boundaries:** A token-classification model processes the raw word sequence. Output: punctuation inserted, capitalization fixed, sentence boundaries marked. `jsdiff` aligns the punctuated text back to the original `TimedWord` timestamps (see Timestamp Alignment section). Model candidates for spike: `1-800-BAD-CODE/punctuation_fullstop_truecase_english` (~45MB ONNX), `sherpa-onnx Edge-Punct-Casing` (~7MB int8).

**Tier 2 -- Paragraph segmentation:** Two signals combined:
1. Timestamp gaps: pauses >2s in the original caption data suggest topic shifts
2. Embedding similarity: compute sentence embeddings via `all-MiniLM-L6-v2` (~23MB), detect cosine similarity drops between consecutive sentences (TextTiling approach)

A threshold-based heuristic combines both signals. Output: paragraph break indices added to `TimedTranscript.paragraphs`.

**Tier 3 -- Section header generation:** A generative model receives clusters of paragraphs and produces a concise heading for each cluster. Paragraphs are grouped by embedding similarity into sections. Model candidates for spike: `Xenova/t5-small` (~120MB q8), `Qwen2.5-0.5B-Instruct` (~350MB q4).

### Model Selection

The specific models for each tier are intentionally not locked in. The `TranscriptFormatter` port interface and adapter pattern make swapping models trivial. A model comparison harness (see Testing Strategy) will be used during Phase 4 to A/B compare candidates on real transcripts and select based on quality, size, and speed tradeoffs.

Candidate models will include both multi-model specialist pipelines (separate models per tier) and single-model approaches (one small LLM handling all tiers via prompting). The harness will compare both strategies.

### Timestamp Alignment via jsdiff

The key challenge: models change the text (add punctuation, fix casing), but we need to preserve word-level timestamps.

**jsdiff** is the `diff` npm package (v8.0.4, ~8,500 dependents). It implements the Myers diff algorithm -- the same core algorithm behind `git diff` -- at configurable granularities. The `diffWords()` function compares two strings word-by-word:

```typescript
import { diffWords } from 'diff';

const original = "welcome to super mario brothers";
const formatted = "Welcome to Super Mario Brothers.";

const changes = diffWords(original, formatted);
// [
//   { value: "welcome",  removed: true },
//   { value: "Welcome",  added: true },
//   { value: " to ",     added: false, removed: false },
//   { value: "super",    removed: true },
//   { value: "Super",    added: true },
//   ...
// ]
```

Each change is `{value, added, removed}`. The alignment algorithm:

1. Maintain a cursor into the original `TimedWord[]` array
2. For each diff chunk:
   - Unchanged: emit words with original timestamps, advance cursor
   - Removed+added pair (e.g., "welcome" -> "Welcome"): emit added text with removed text's timestamps, advance cursor
   - Added only (inserted punctuation like "."): append to previous word's text, keep its timestamp
   - Removed only (word dropped by model): advance cursor, skip

This produces a new `TimedWord[]` with formatted text and original timestamps. It runs after Tier 1, is deterministic, fast, and the diff library is battle-tested.

### ML Worker Architecture (Chrome)

```
Side Panel <--messages--> Background SW <--messages--> Offscreen Document
                                                            |
                                                       Web Worker
                                                       (Transformers.js v4)
                                                            |
                                                       ONNX Runtime
                                                       (WebGPU or WASM)
```

The offscreen document is created once on first use and persists. The Web Worker inside it loads models from Cache API (Transformers.js default caching). Processing progress is streamed back via `chrome.runtime.connect` long-lived port, updating the status indicator in real-time.

**Model caching:** Transformers.js v4 uses the Cache API by default. First download is slow (seconds to tens of seconds depending on model size and connection); all subsequent loads are near-instant from cache. The `unlimitedStorage` permission ensures browser quota is not an issue.

---

## Side Panel UI

The side panel is a Svelte 5 app rendered in Chrome's sidePanel context. It communicates with the content script via `chrome.runtime.connect` (long-lived port for streaming playback time) and `chrome.runtime.sendMessage` (one-time requests for captions, formatting triggers).

### Activation

Click-to-open: user clicks the extension icon in the toolbar to toggle the side panel. It stays closed by default. No auto-opening on YouTube pages.

### Layout (top to bottom)

1. **Header bar** -- video title (truncated), search toggle, export button, settings gear
2. **Transcript body** -- scrollable area containing the formatted transcript
3. **Status bar** -- current processing tier, model download progress, "done" state

### Transcript Rendering

Each word is a `<span>` with `data-start` and `data-end` attributes. Words are grouped into sentences (after Tier 1), sentences into paragraphs (after Tier 2), paragraphs under section headers (after Tier 3).

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

Export button copies markdown to clipboard. Format:

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

Each paragraph gets a timestamp link. Section headers (from Tier 3) become `##` headings. Markdown is generated programmatically from the `TimedTranscript` data model. Export uses the current formatting tier -- if only Tier 1 is done, output has punctuation but no section headers.

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
| `just lint` | ESLint (or Biome -- TBD during setup) |
| `just fmt` | Prettier/Biome format |
| `just build` | WXT build for Chrome |
| `just clean` | Remove `.output/`, `.wxt/`, `node_modules/`, model caches |
| `just bump` | Bump version, generate release notes, tag, push |
| `just retag` | Re-trigger release workflow for existing version |
| `just install-hooks` | Set up pre-commit hook that runs `just check` |

### Extension-Specific Recipes

| Recipe | What it runs |
|--------|-------------|
| `just dev` | WXT dev mode with HMR, launches Chrome with extension loaded |
| `just test-e2e` | Playwright E2E tests against built extension in headless Chromium |
| `just build-firefox` | WXT build targeting Firefox (future) |
| `just model-bench` | Run model comparison harness, output markdown reports |
| `just fixture-capture <url>` | Save a YouTube page + captions as test fixtures |

### Test Layers

**Layer 1: Unit tests (Vitest + WXT fakeBrowser)**

The bulk of test coverage. Runs in under a second with `just test`.

- Core logic tests: progressive pipeline orchestration, timestamp alignment (jsdiff), search filtering, markdown export generation. Pure functions, no browser APIs.
- Adapter tests: each adapter tested in isolation against mocks/fakes. `TranscriptSource` against saved JSON3 fixtures. `TranscriptFormatter` with mock model outputs. `TranscriptStore` with `fakeBrowser` in-memory storage.
- Svelte component tests: side panel components rendered with `@testing-library/svelte` + happy-dom. Verify word spans have correct timestamps, sentence highlighting toggles, search filters correctly, progressive re-rendering preserves scroll position.
- Message passing tests: content script <-> background <-> side panel flows tested with `fakeBrowser`'s in-memory port/messaging implementation.

**Layer 2: E2E tests (Playwright + Chromium)**

A smaller set of integration tests. Run with `just test-e2e`.

- Load the built extension in Chromium via `launchPersistentContext` with `--load-extension`
- Test against saved YouTube HTML fixtures served from a local static server (not live YouTube -- fast, deterministic, no bot detection)
- Fixtures include representative pages with `ytInitialPlayerResponse` data intact
- Tests cover: side panel opens, caption extraction works, click-to-seek, search highlighting, markdown export, progressive formatting updates
- Side panel pages also testable directly via `chrome-extension://` URL navigation
- Runs headless

**Layer 3: Model comparison harness (bun scripts)**

Not part of CI. Run manually during spike phases via `just model-bench`. Lives in `tools/model-bench/`.

- Runs Transformers.js in bun against saved transcript fixtures
- Same `TranscriptFormatter` port interface as the extension -- adapters tested here are directly deployable
- Outputs markdown comparison reports to `docs/spec/model-comparisons/`
- Reports include: sample output for each model, processing time, model size
- Supports running all fixtures against all adapters, or targeted runs

### Claude's Test Loop

```
Code change -> just test (<1s) -> just check (~5s) -> green
```

For deeper integration testing: `just test-e2e` (~10s). For interactive debugging: Playwright MCP server (`@playwright/mcp`).

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
      pipeline.ts                    # Orchestrates progressive formatting tiers
      search.ts                      # Transcript text search
      export.ts                      # Markdown export generation
      sync.ts                        # Playback time -> active sentence mapping
      types.ts                       # TimedWord, TimedTranscript, Section, etc.

    ports/                           # Port interfaces (TypeScript interfaces only)
      video-player.ts
      transcript-source.ts
      transcript-formatter.ts
      transcript-store.ts
      sidebar-host.ts
      page-detector.ts

    adapters/                        # Adapter implementations
      chrome/
        side-panel-host.ts           # Chrome sidePanel API adapter
        offscreen-inference.ts       # Offscreen document for ML worker
      youtube/
        player-adapter.ts            # YouTube player API (content script)
        caption-adapter.ts           # Innertube JSON3 caption fetching
        page-detector-adapter.ts     # URL matching, yt-navigate-finish
      ml/
        worker.ts                    # Web Worker running Transformers.js
        punctuation-adapter.ts       # Token classification model adapter
        paragraph-adapter.ts         # Embedding similarity adapter
        heading-adapter.ts           # Generative model adapter
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
      offscreen.html                 # Offscreen document for ML inference
      offscreen.ts

  tests/
    unit/
      core/
        pipeline.test.ts
        search.test.ts
        export.test.ts
        sync.test.ts
      adapters/
        caption-adapter.test.ts
        punctuation-adapter.test.ts
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
      formatted/
        dexter-horthy-tier1.json
        dexter-horthy-tier2.json

  tools/
    model-bench/
      bench.ts
      report.ts
      adapters/
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
- Playwright MCP verified working for Claude interaction

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

### Phase 4: ML Formatting Pipeline -- Spike and Tier 1

Goal: Determine which models to use, then ship Tier 1 (punctuation + true-casing).

- `TranscriptFormatter` port interface finalized
- Offscreen document + Web Worker infrastructure for Transformers.js v4
- Model comparison harness operational (`tools/model-bench/`, `just model-bench`)
- At least 2 punctuation model adapters compared
- `jsdiff` timestamp alignment working
- Spike report written to `docs/spec/model-comparisons/`
- Tier 1 integrated: raw transcript -> punctuated transcript, progressive update
- Status bar showing model download progress and processing state
- Model cached via Cache API + `unlimitedStorage`

### Phase 5: Tier 2 and Tier 3 Formatting

Goal: Paragraph segmentation and section header generation.

- Tier 2: sentence embeddings, cosine similarity + timestamp gap heuristics
- Paragraphs rendered with spacing and timestamp links
- Spike and compare models for Tier 3 via the harness
- Tier 3: generative model produces section headers
- Section headers in side panel and markdown export
- Progressive rendering: each tier updates UI as it completes
- All tiers cached for instant reload on revisit

### Phase 6: Polish

Goal: Production-ready for Chrome Web Store and GitHub release.

- Extension icon and branding
- Error handling: no captions available, network failures, model download failures, live streams
- Performance profiling for large transcripts (2+ hour videos)
- Release workflow: build, package `.zip`, GitHub release
- `just bump` and `just retag`
- README with install instructions
- Chrome Web Store submission preparation
- Firefox adapter exploration/spike

---

## Unresolved

- **WebGPU in Firefox:** caniuse.com and other research disagree on whether Firefox 141+ has stable WebGPU support. Needs verification before the Firefox adapter phase. Affects which models are viable for Tier 3 (section headers) on Firefox. WASM fallback works regardless.
- **Specific ML models for each tier:** Intentionally deferred to Phase 4 spike. The adapter pattern makes swapping trivial.
- **Linter/formatter choice:** ESLint vs Biome. TBD during Phase 1 setup.

---

## Reference Research

Additional research on WXT, Transformers.js, YouTube Innertube API, browser extension architecture, and ML model options is available in `docs/spec/other-research.md`.
