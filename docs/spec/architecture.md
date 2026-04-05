# Quoth Architecture

## Extension Component Model

The extension runs across four isolated JavaScript contexts that communicate
via message passing.

```mermaid
graph TB
    subgraph "YouTube Page"
        YT[YouTube Player]
        MW["youtube-player.content.ts<br/>(MAIN world)<br/>Has access to YouTube's<br/>player API + page cookies"]
        CS["content.ts<br/>(ISOLATED world)<br/>Fetches captions via Innertube<br/>Observes video playback time"]
    end

    subgraph "Extension Context"
        BG["background.ts<br/>(Service Worker)<br/>Routes messages<br/>Manages side panel lifecycle"]
        SP["sidepanel/<br/>(Svelte 5 App)<br/>Renders transcript<br/>Handles search + export"]
    end

    CS -- "browser.runtime.sendMessage" --> BG
    BG -- "browser.runtime.sendMessage" --> SP
    SP -- "browser.tabs.sendMessage" --> CS
    CS -- "window.postMessage" --> MW
    MW -- "player.seekTo()" --> YT
    CS -- "setInterval 250ms<br/>video.currentTime" --> YT
```

**Why two content scripts?** Chrome MV3 content scripts run in an "isolated
world" -- they can access the page DOM but not the page's JavaScript globals.
YouTube's player API (`player.seekTo()`, `player.playVideo()`) is only
available in the page's main world. So we have:

- `content.ts` (isolated world): handles extension messaging, fetches captions
  via the Innertube API, reads `video.currentTime` for playback sync
- `youtube-player.content.ts` (main world): receives seek commands via
  `window.postMessage` and calls YouTube's player API

---

## Flow 1: Loading the Transcript

When the user opens a YouTube video and clicks the Quoth extension icon.

```mermaid
sequenceDiagram
    participant User
    participant YT as YouTube Page
    participant CS as Content Script<br/>(isolated world)
    participant Innertube as YouTube<br/>Innertube API
    participant BG as Background SW
    participant SP as Side Panel

    User->>YT: Navigate to youtube.com/watch?v=abc
    Note over CS: Content script auto-loads<br/>(matches youtube.com/watch*)

    CS->>CS: Extract video ID from URL
    CS->>Innertube: POST /youtubei/v1/player<br/>(ANDROID client context)
    Innertube-->>CS: Player response<br/>(video info + caption track URLs)

    CS->>BG: {type: 'video-detected', videoInfo, captionTracks}
    BG->>SP: Forward message

    Note over CS: Find English caption track<br/>Replace fmt=srv3 with fmt=json3
    CS->>Innertube: GET caption baseUrl<br/>(&fmt=json3)
    Innertube-->>CS: JSON3 caption data<br/>(events[] with word-level timing)

    CS->>CS: parseJson3Captions(json3)<br/>produces TimedWord[]
    CS->>BG: {type: 'captions-loaded', words[]}
    BG->>SP: Forward message

    SP->>SP: groupWordsIntoSegments(words)<br/>Render word spans
    Note over SP: Transcript visible immediately
```

**Key detail:** The content script uses YouTube's Innertube API with an ANDROID
client context (`clientName: 'ANDROID'`). This returns caption URLs that work
without browser cookies, unlike the URLs embedded in the web page's
`ytInitialPlayerResponse` which require session cookies for the timedtext fetch.

---

## Flow 2: Playback Sync (Video Playing)

While the video plays, the transcript highlights the current sentence and
auto-scrolls.

```mermaid
sequenceDiagram
    participant YT as YouTube Player
    participant CS as Content Script
    participant BG as Background SW
    participant SP as Side Panel

    Note over CS: setInterval every 250ms

    loop Every 250ms
        CS->>YT: Read video.currentTime
        CS->>BG: {type: 'time-update', currentTimeMs, isPlaying}
        BG->>SP: Forward message
        SP->>SP: findActiveWordIndex(words, currentTimeMs)<br/>Binary search in sorted timestamps
        SP->>SP: findActiveSegmentIndex(segments, currentTimeMs)
        SP->>SP: Highlight active sentence<br/>Auto-scroll if enabled
    end
```

**Performance:** The binary search in `findActiveWordIndex` is O(log n) over
the sorted `TimedWord[]` array. For a 45-minute video with ~6000 words, this
is about 13 comparisons per update. The 250ms interval (4 updates/second) is
sufficient for smooth highlighting without excessive CPU usage.

---

## Flow 3: Click-to-Seek (User Clicks a Word)

When the user clicks a word in the transcript to jump the video to that time.

```mermaid
sequenceDiagram
    participant User
    participant SP as Side Panel
    participant CS as Content Script<br/>(isolated world)
    participant MW as Main World Script
    participant YT as YouTube Player

    User->>SP: Click word span<br/>(data-start="5600")
    SP->>CS: browser.tabs.sendMessage<br/>{type: 'seek-to', timeMs: 5600}
    CS->>MW: window.postMessage<br/>{type: 'quoth-seek', timeSeconds: 5.6}
    MW->>YT: player.seekTo(5.6, true)
    Note over YT: allowSeekAhead=true<br/>Handles buffering internally
    YT->>YT: Seeks to 5.6s

    Note over CS: Next 250ms tick picks up new time
    CS->>SP: {type: 'time-update', currentTimeMs: 5600}
    SP->>SP: Update highlight + scroll position
```

**Why `player.seekTo()` instead of `video.currentTime`?** YouTube's player API
handles buffering, ad state, and seek-ahead internally. Setting
`video.currentTime` directly can cause the player to crash when seeking to
unbuffered regions.

---

## Flow 4: YouTube Controls Seek (User Drags Progress Bar)

When the user seeks using YouTube's own progress bar or keyboard shortcuts.

```mermaid
sequenceDiagram
    participant User
    participant YT as YouTube Player
    participant CS as Content Script
    participant BG as Background SW
    participant SP as Side Panel

    User->>YT: Drag progress bar to 10:00

    Note over CS: Next 250ms tick detects<br/>time jumped from 1:00 to 10:00
    CS->>BG: {type: 'time-update', currentTimeMs: 600000}
    BG->>SP: Forward message
    SP->>SP: findActiveWordIndex(words, 600000)
    SP->>SP: Jump highlight to word at 10:00<br/>Auto-scroll to that position
```

No special handling needed -- the same 250ms polling loop that drives playback
sync also handles external seeks. The transcript catches up on the next tick.

---

## Data Model

```mermaid
graph LR
    subgraph "YouTube JSON3 Response"
        E["events[]"]
        S["segs[] with tOffsetMs"]
    end

    subgraph "Core Types"
        TW["TimedWord[]<br/>text, start, end, original"]
        WS["WordSegment[]<br/>startIndex, endIndex,<br/>startTime, endTime"]
    end

    subgraph "Svelte Components"
        TV["TranscriptView<br/>renders segments > words"]
    end

    E -->|parseJson3Captions| TW
    TW -->|groupWordsIntoSegments<br/>gap threshold 2s| WS
    WS --> TV
    TW --> TV
```

**TimedWord** is the atomic unit. Each word has millisecond-precision start/end
timestamps inherited from YouTube's caption data. Auto-generated captions
provide word-level timing directly. Manual captions are interpolated (even
distribution of segment duration across words).

**WordSegment** groups consecutive words with small gaps (<2 seconds) into
visual paragraphs. These map to YouTube's original caption event boundaries
and provide the paragraph-level timestamps shown in the transcript.

---

## Sidebar Mode vs Tab Mode

The side panel page (`sidepanel.html`) is a standalone Svelte app that works
in two modes. The same HTML/JS runs in both -- it discovers the YouTube tab
via `browser.tabs.query` and communicates via extension messaging regardless
of how it's rendered.

```mermaid
graph TB
    subgraph "Sidebar Mode (default)"
        direction LR
        YT1["YouTube Tab<br/>(active tab)"]
        SP1["Chrome Side Panel<br/>Docked alongside tab<br/>~350px wide"]
        YT1 --- SP1
    end

    subgraph "Tab Mode (pop-out)"
        direction LR
        YT2["YouTube Tab<br/>(Tab 1)"]
        SP2["Transcript Tab<br/>(Tab 2, full width)<br/>chrome-extension://&lt;id&gt;/sidepanel.html"]
    end

    SP1 -. "Same code,<br/>same messaging" .-> SP2
```

### How tab mode works

The side panel app finds the YouTube tab by querying for matching URLs:

```typescript
const [ytTab] = await browser.tabs.query({ url: '*://*.youtube.com/watch*' });
if (ytTab?.id) {
  browser.tabs.sendMessage(ytTab.id, { type: 'request-state' });
}
```

This works identically whether the app runs as a Chrome side panel or as a
standalone tab. The content script on the YouTube page doesn't know or care
which mode the side panel is in -- it receives the same messages and responds
the same way.

### Opening tab mode manually

1. Find the extension ID: go to `chrome://extensions`, find Quoth, copy the ID
2. Open a new tab to: `chrome-extension://<extension-id>/sidepanel.html`
3. Navigate to a YouTube video in another tab
4. The transcript loads and syncs automatically

### Opening tab mode programmatically

From any extension context (background script, side panel, popup):

```typescript
browser.tabs.create({
  url: browser.runtime.getURL('sidepanel.html'),
});
```

This is what the smoke test does via Playwright, and what a "pop out to tab"
button in the side panel header would do.

### What tab mode gives you

| Feature | Sidebar | Tab |
|---------|---------|-----|
| Video + transcript visible at once | Yes (side by side) | No (tab switch) |
| Transcript width | ~350px fixed | Full tab width |
| Native Ctrl+F search | No (panel) | Yes (browser search) |
| Text selection + copy | Awkward in narrow panel | Full browser support |
| Separate window | No | Yes (drag tab out) |
| Bookmarkable | No | Yes |
| Playwright testable | No (no API to open side panel) | Yes (full DOM access) |

### Automated testing uses tab mode

Playwright cannot programmatically open Chrome's side panel (no API exists).
The smoke test (`just smoke-test`) opens `sidepanel.html` as a regular tab,
which gives Playwright full DOM access for clicking words, reading transcript
content, and verifying seek behavior. This is functionally identical to sidebar
mode because the same code and messaging paths are used.
