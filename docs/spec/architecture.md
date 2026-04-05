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
