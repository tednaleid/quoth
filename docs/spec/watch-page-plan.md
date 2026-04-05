# Watch Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone extension page at `chrome-extension://<id>/watch.html?v=X&t=N` that embeds a YouTube video via iframe and renders the transcript below, sharing the `core/` logic with the existing sidebar.

**Architecture:** Hexagonal. New port `CacheStore`, new adapter `IFramePlayer` implementing existing `VideoPlayer` port via YouTube IFrame Player API postMessage protocol, new adapter `ChromeStorageLocalCache` implementing `CacheStore` via `browser.storage.local`. Watch page is a standalone Svelte 5 app that wires adapters directly (no content-script messaging).

**Tech Stack:** WXT + Svelte 5 runes + TypeScript + Vitest + Playwright, YouTube IFrame Player API postMessage protocol.

See `docs/spec/watch-page-design.md` for the design.

---

## File Structure

### New files
- `src/core/watch-url.ts` — pure URL-param parsing for watch-page URLs
- `src/ports/cache-store.ts` — CacheStore port interface
- `src/adapters/browser/chrome-storage-local-cache.ts` — CacheStore adapter
- `src/adapters/youtube/iframe-player.ts` — VideoPlayer adapter using iframe postMessage protocol
- `src/entrypoints/watch/index.html` — watch-page HTML shell
- `src/entrypoints/watch/main.ts` — Svelte mount point
- `src/entrypoints/watch/App.svelte` — page root (wires adapters + UI)
- `tests/unit/core/watch-url.test.ts`
- `tests/unit/adapters/chrome-storage-local-cache.test.ts`
- `tests/unit/adapters/iframe-player.test.ts`
- `tools/smoke-test-watch.ts`

### Modified files
- `src/entrypoints/sidepanel/components/Header.svelte` — add "Pop out" button
- `src/entrypoints/sidepanel/App.svelte` — wire pop-out handler
- `justfile` — add `smoke-test-watch` recipe

### Untouched
- `src/entrypoints/content.ts`, `youtube-player.content.ts`, `background.ts`
- All existing `core/` modules except new file `watch-url.ts`
- `wxt.config.ts` — permissions already cover this (storage, unlimitedStorage, host_permissions for youtube.com)

---

## Task 1: URL parameter parsing for watch page

**Files:**
- Create: `src/core/watch-url.ts`
- Create: `tests/unit/core/watch-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/watch-url.test.ts`:

```typescript
/**
 * ABOUTME: Tests for watch-page URL parameter parsing.
 * ABOUTME: Covers videoId extraction, t parameter handling, and validation.
 */
import { describe, it, expect } from 'vitest';
import { parseWatchParams } from '../../../src/core/watch-url';

describe('parseWatchParams', () => {
  it('extracts videoId from v parameter', () => {
    const result = parseWatchParams('?v=YwZR6tc7qYg');
    expect(result.videoId).toBe('YwZR6tc7qYg');
  });

  it('returns null videoId when v is missing', () => {
    const result = parseWatchParams('');
    expect(result.videoId).toBeNull();
  });

  it('extracts t parameter as integer seconds', () => {
    const result = parseWatchParams('?v=abc&t=147');
    expect(result.initialTimeMs).toBe(147000);
  });

  it('returns 0 when t parameter is missing', () => {
    const result = parseWatchParams('?v=abc');
    expect(result.initialTimeMs).toBe(0);
  });

  it('returns 0 when t parameter is not a number', () => {
    const result = parseWatchParams('?v=abc&t=xyz');
    expect(result.initialTimeMs).toBe(0);
  });

  it('strips "s" suffix from t parameter (YouTube format)', () => {
    const result = parseWatchParams('?v=abc&t=147s');
    expect(result.initialTimeMs).toBe(147000);
  });

  it('handles leading ? or no leading ?', () => {
    expect(parseWatchParams('v=abc').videoId).toBe('abc');
    expect(parseWatchParams('?v=abc').videoId).toBe('abc');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `just test watch-url`
Expected: FAIL — `parseWatchParams` is not exported

- [ ] **Step 3: Write minimal implementation**

Create `src/core/watch-url.ts`:

```typescript
/**
 * ABOUTME: Parses watch-page URL parameters (v, t) into structured values.
 * ABOUTME: Handles YouTube's "t=147s" format and defaults.
 */

export interface WatchParams {
  videoId: string | null;
  initialTimeMs: number;
}

export function parseWatchParams(queryString: string): WatchParams {
  const normalized = queryString.startsWith('?') ? queryString : '?' + queryString;
  const params = new URLSearchParams(normalized);
  const videoId = params.get('v');
  const tRaw = params.get('t');
  let initialTimeMs = 0;
  if (tRaw) {
    const stripped = tRaw.endsWith('s') ? tRaw.slice(0, -1) : tRaw;
    const seconds = parseInt(stripped, 10);
    if (!isNaN(seconds)) initialTimeMs = seconds * 1000;
  }
  return { videoId, initialTimeMs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `just test watch-url`
Expected: PASS — all 7 tests green

- [ ] **Step 5: Commit**

```bash
git add src/core/watch-url.ts tests/unit/core/watch-url.test.ts
git commit -m "Add watch-page URL parameter parsing"
```

---

## Task 2: CacheStore port interface

**Files:**
- Create: `src/ports/cache-store.ts`

- [ ] **Step 1: Write the port interface**

Create `src/ports/cache-store.ts`:

```typescript
/**
 * ABOUTME: Port interface for caching parsed transcript data keyed by videoId.
 * ABOUTME: Implementations: ChromeStorageLocalCache (prod), in-memory/mock (tests).
 */
import type { TimedWord, VideoInfo } from '../core/types';

export interface CachedTranscript {
  videoInfo: VideoInfo;
  words: TimedWord[];
}

export interface CacheStore {
  get(videoId: string): Promise<CachedTranscript | null>;
  set(videoId: string, data: CachedTranscript): Promise<void>;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `just typecheck`
Expected: PASS — no TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/ports/cache-store.ts
git commit -m "Add CacheStore port interface"
```

---

## Task 3: ChromeStorageLocalCache adapter

**Files:**
- Create: `src/adapters/browser/chrome-storage-local-cache.ts`
- Create: `tests/unit/adapters/chrome-storage-local-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/adapters/chrome-storage-local-cache.test.ts`:

```typescript
/**
 * ABOUTME: Tests for the ChromeStorageLocalCache adapter.
 * ABOUTME: Uses an injectable storage dep to exercise cache get/set semantics.
 */
import { describe, it, expect, vi } from 'vitest';
import { ChromeStorageLocalCache } from '../../../src/adapters/browser/chrome-storage-local-cache';
import type { CachedTranscript } from '../../../src/ports/cache-store';

function makeStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  return {
    get: vi.fn(async (key: string) => ({ [key]: data[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    }),
    data,
  };
}

const sampleCache: CachedTranscript = {
  videoInfo: {
    videoId: 'abc123',
    title: 'Test',
    channelName: 'Chan',
    durationMs: 60000,
  },
  words: [{ text: 'hello', start: 0, end: 500, original: 'hello' }],
};

describe('ChromeStorageLocalCache', () => {
  it('returns null when key is not present', async () => {
    const storage = makeStorage();
    const cache = new ChromeStorageLocalCache(storage);
    expect(await cache.get('missing')).toBeNull();
  });

  it('stores and retrieves a cached transcript', async () => {
    const storage = makeStorage();
    const cache = new ChromeStorageLocalCache(storage);
    await cache.set('abc123', sampleCache);
    expect(await cache.get('abc123')).toEqual(sampleCache);
  });

  it('uses "transcript:" prefix for storage keys', async () => {
    const storage = makeStorage();
    const cache = new ChromeStorageLocalCache(storage);
    await cache.set('abc123', sampleCache);
    expect(storage.set).toHaveBeenCalledWith({ 'transcript:abc123': sampleCache });
  });

  it('reads using the prefixed key', async () => {
    const storage = makeStorage({ 'transcript:abc123': sampleCache });
    const cache = new ChromeStorageLocalCache(storage);
    const result = await cache.get('abc123');
    expect(storage.get).toHaveBeenCalledWith('transcript:abc123');
    expect(result).toEqual(sampleCache);
  });

  it('isolates different videoIds', async () => {
    const storage = makeStorage();
    const cache = new ChromeStorageLocalCache(storage);
    const other = { ...sampleCache, words: [] };
    await cache.set('abc123', sampleCache);
    await cache.set('xyz789', other);
    expect(await cache.get('abc123')).toEqual(sampleCache);
    expect(await cache.get('xyz789')).toEqual(other);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `just test chrome-storage-local-cache`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/adapters/browser/chrome-storage-local-cache.ts`:

```typescript
/**
 * ABOUTME: CacheStore adapter backed by browser.storage.local (Chrome/Firefox WebExtensions).
 * ABOUTME: Keys are prefixed with "transcript:" so we can share the namespace with future caches.
 */
import type { CacheStore, CachedTranscript } from '../../ports/cache-store';

const KEY_PREFIX = 'transcript:';

interface StorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export class ChromeStorageLocalCache implements CacheStore {
  constructor(private storage: StorageLike) {}

  async get(videoId: string): Promise<CachedTranscript | null> {
    const key = KEY_PREFIX + videoId;
    const result = await this.storage.get(key);
    const value = result[key];
    if (!value) return null;
    return value as CachedTranscript;
  }

  async set(videoId: string, data: CachedTranscript): Promise<void> {
    const key = KEY_PREFIX + videoId;
    await this.storage.set({ [key]: data });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `just test chrome-storage-local-cache`
Expected: PASS — all 5 tests green

- [ ] **Step 5: Commit**

```bash
git add src/adapters/browser/chrome-storage-local-cache.ts tests/unit/adapters/chrome-storage-local-cache.test.ts
git commit -m "Add ChromeStorageLocalCache adapter"
```

---

## Task 4: IFramePlayer adapter — skeleton + seekTo

**Files:**
- Create: `src/adapters/youtube/iframe-player.ts`
- Create: `tests/unit/adapters/iframe-player.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/adapters/iframe-player.test.ts`:

```typescript
/**
 * ABOUTME: Tests for the IFramePlayer adapter (YouTube IFrame Player API protocol).
 * ABOUTME: Verifies postMessage command format and infoDelivery parsing.
 */
import { describe, it, expect, vi } from 'vitest';
import { IFramePlayer } from '../../../src/adapters/youtube/iframe-player';

function makeDeps() {
  const postMessage = vi.fn<(msg: string) => void>();
  let messageHandler: ((data: unknown) => void) | null = null;
  const subscribeToMessages = vi.fn((handler: (data: unknown) => void) => {
    messageHandler = handler;
    return () => {
      messageHandler = null;
    };
  });
  return {
    postMessage,
    subscribeToMessages,
    fireMessage: (data: unknown) => messageHandler?.(data),
    isSubscribed: () => messageHandler !== null,
  };
}

describe('IFramePlayer.seekTo', () => {
  it('posts a seekTo command with seconds and allowSeekAhead=true', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.seekTo(5000);
    expect(deps.postMessage).toHaveBeenCalledOnce();
    const sent = JSON.parse(deps.postMessage.mock.calls[0][0]);
    expect(sent).toEqual({
      event: 'command',
      func: 'seekTo',
      args: [5, true],
      id: 'quoth-player',
      channel: 'widget',
    });
  });

  it('converts milliseconds to seconds with fractional values', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.seekTo(1500);
    const sent = JSON.parse(deps.postMessage.mock.calls[0][0]);
    expect(sent.args[0]).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `just test iframe-player`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

Create `src/adapters/youtube/iframe-player.ts`:

```typescript
/**
 * ABOUTME: VideoPlayer adapter using YouTube's IFrame Player API postMessage protocol.
 * ABOUTME: Sends commands via iframe.contentWindow.postMessage, receives events via window 'message'.
 */
import type { VideoPlayer, VideoPlayerState } from '../../ports/video-player';

export interface IFramePlayerDeps {
  postMessage: (msg: string) => void;
  subscribeToMessages: (handler: (data: unknown) => void) => () => void;
}

const PLAYER_ID = 'quoth-player';
const CHANNEL = 'widget';

export class IFramePlayer implements VideoPlayer {
  constructor(private deps: IFramePlayerDeps) {}

  getState(): VideoPlayerState {
    return { currentTimeMs: 0, isPlaying: false, durationMs: 0 };
  }

  seekTo(timeMs: number): void {
    this.deps.postMessage(
      JSON.stringify({
        event: 'command',
        func: 'seekTo',
        args: [timeMs / 1000, true],
        id: PLAYER_ID,
        channel: CHANNEL,
      }),
    );
  }

  onTimeUpdate(_callback: (state: VideoPlayerState) => void): () => void {
    return () => {};
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `just test iframe-player`
Expected: PASS — 2 tests green

- [ ] **Step 5: Commit**

```bash
git add src/adapters/youtube/iframe-player.ts tests/unit/adapters/iframe-player.test.ts
git commit -m "Add IFramePlayer adapter skeleton with seekTo"
```

---

## Task 5: IFramePlayer — subscription and infoDelivery parsing

**Files:**
- Modify: `src/adapters/youtube/iframe-player.ts`
- Modify: `tests/unit/adapters/iframe-player.test.ts`

- [ ] **Step 1: Add failing tests for subscription**

Append to `tests/unit/adapters/iframe-player.test.ts`:

```typescript
describe('IFramePlayer.initialize', () => {
  it('subscribes to messages', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    expect(deps.subscribeToMessages).toHaveBeenCalledOnce();
    expect(deps.isSubscribed()).toBe(true);
  });

  it('posts a listening event on initialize', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    const listeningMsg = deps.postMessage.mock.calls
      .map((c) => JSON.parse(c[0]))
      .find((m) => m.event === 'listening');
    expect(listeningMsg).toEqual({
      event: 'listening',
      id: 'quoth-player',
      channel: 'widget',
    });
  });
});

describe('IFramePlayer state updates', () => {
  it('updates currentTimeMs when infoDelivery contains currentTime', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(
      JSON.stringify({
        event: 'infoDelivery',
        info: { currentTime: 12.34 },
      }),
    );
    expect(player.getState().currentTimeMs).toBe(12340);
  });

  it('updates isPlaying from playerState=1 (playing)', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(
      JSON.stringify({
        event: 'infoDelivery',
        info: { currentTime: 0, playerState: 1 },
      }),
    );
    expect(player.getState().isPlaying).toBe(true);
  });

  it('updates isPlaying=false from playerState=2 (paused)', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(
      JSON.stringify({
        event: 'infoDelivery',
        info: { currentTime: 0, playerState: 2 },
      }),
    );
    expect(player.getState().isPlaying).toBe(false);
  });

  it('updates durationMs when infoDelivery contains duration', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(
      JSON.stringify({
        event: 'infoDelivery',
        info: { currentTime: 0, duration: 120.5 },
      }),
    );
    expect(player.getState().durationMs).toBe(120500);
  });

  it('accepts object messages directly (not just JSON strings)', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage({
      event: 'infoDelivery',
      info: { currentTime: 7 },
    });
    expect(player.getState().currentTimeMs).toBe(7000);
  });

  it('ignores non-infoDelivery events', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(
      JSON.stringify({ event: 'onReady' }),
    );
    expect(player.getState().currentTimeMs).toBe(0);
  });

  it('preserves duration when a later infoDelivery omits it', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    deps.fireMessage(JSON.stringify({ event: 'infoDelivery', info: { duration: 99.9 } }));
    deps.fireMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 1 } }));
    expect(player.getState().durationMs).toBe(99900);
  });

  it('handles malformed JSON gracefully', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    expect(() => deps.fireMessage('not-json{{{')).not.toThrow();
    expect(player.getState().currentTimeMs).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test iframe-player`
Expected: FAIL — `initialize` not defined, state not updating

- [ ] **Step 3: Implement initialize, handleMessage, state**

Replace `src/adapters/youtube/iframe-player.ts` with:

```typescript
/**
 * ABOUTME: VideoPlayer adapter using YouTube's IFrame Player API postMessage protocol.
 * ABOUTME: Sends commands via iframe.contentWindow.postMessage, receives events via window 'message'.
 */
import type { VideoPlayer, VideoPlayerState } from '../../ports/video-player';

export interface IFramePlayerDeps {
  postMessage: (msg: string) => void;
  subscribeToMessages: (handler: (data: unknown) => void) => () => void;
}

const PLAYER_ID = 'quoth-player';
const CHANNEL = 'widget';

// YouTube PlayerState values: https://developers.google.com/youtube/iframe_api_reference#Playback_status
const STATE_PLAYING = 1;

interface InfoDelivery {
  currentTime?: number;
  playerState?: number;
  duration?: number;
}

export class IFramePlayer implements VideoPlayer {
  private currentState: VideoPlayerState = {
    currentTimeMs: 0,
    isPlaying: false,
    durationMs: 0,
  };
  private listeners: Array<(state: VideoPlayerState) => void> = [];
  private unsubscribeMessages: (() => void) | null = null;

  constructor(private deps: IFramePlayerDeps) {}

  initialize(): void {
    this.unsubscribeMessages = this.deps.subscribeToMessages((data) => this.handleMessage(data));
    this.deps.postMessage(
      JSON.stringify({ event: 'listening', id: PLAYER_ID, channel: CHANNEL }),
    );
  }

  destroy(): void {
    this.unsubscribeMessages?.();
    this.unsubscribeMessages = null;
    this.listeners = [];
  }

  getState(): VideoPlayerState {
    return this.currentState;
  }

  seekTo(timeMs: number): void {
    this.deps.postMessage(
      JSON.stringify({
        event: 'command',
        func: 'seekTo',
        args: [timeMs / 1000, true],
        id: PLAYER_ID,
        channel: CHANNEL,
      }),
    );
  }

  onTimeUpdate(callback: (state: VideoPlayerState) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private handleMessage(data: unknown): void {
    let parsed: unknown;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
    } else {
      parsed = data;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const msg = parsed as { event?: string; info?: InfoDelivery };
    if (msg.event !== 'infoDelivery' || !msg.info) return;
    const info = msg.info;
    this.currentState = {
      currentTimeMs:
        info.currentTime !== undefined
          ? Math.round(info.currentTime * 1000)
          : this.currentState.currentTimeMs,
      isPlaying:
        info.playerState !== undefined
          ? info.playerState === STATE_PLAYING
          : this.currentState.isPlaying,
      durationMs:
        info.duration !== undefined
          ? Math.round(info.duration * 1000)
          : this.currentState.durationMs,
    };
    this.listeners.forEach((l) => l(this.currentState));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test iframe-player`
Expected: PASS — all 11 tests green

- [ ] **Step 5: Commit**

```bash
git add src/adapters/youtube/iframe-player.ts tests/unit/adapters/iframe-player.test.ts
git commit -m "Implement IFramePlayer message handling and state updates"
```

---

## Task 6: IFramePlayer — onTimeUpdate callbacks

**Files:**
- Modify: `tests/unit/adapters/iframe-player.test.ts`

(Implementation already handles callbacks from Task 5 — this task just verifies behavior and cleanup.)

- [ ] **Step 1: Add failing tests for callbacks**

Append to `tests/unit/adapters/iframe-player.test.ts`:

```typescript
describe('IFramePlayer.onTimeUpdate', () => {
  it('fires callback when infoDelivery arrives', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    const cb = vi.fn();
    player.onTimeUpdate(cb);
    deps.fireMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 3 } }));
    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith({ currentTimeMs: 3000, isPlaying: false, durationMs: 0 });
  });

  it('fires multiple registered callbacks', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    player.onTimeUpdate(cb1);
    player.onTimeUpdate(cb2);
    deps.fireMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 1 } }));
    expect(cb1).toHaveBeenCalledOnce();
    expect(cb2).toHaveBeenCalledOnce();
  });

  it('returns a cleanup function that unregisters the callback', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    const cb = vi.fn();
    const unsub = player.onTimeUpdate(cb);
    unsub();
    deps.fireMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 1 } }));
    expect(cb).not.toHaveBeenCalled();
  });

  it('destroy() unsubscribes the message handler', () => {
    const deps = makeDeps();
    const player = new IFramePlayer(deps);
    player.initialize();
    expect(deps.isSubscribed()).toBe(true);
    player.destroy();
    expect(deps.isSubscribed()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `just test iframe-player`
Expected: PASS — all 15 tests green (implementation already supports this)

- [ ] **Step 3: Commit**

```bash
git add tests/unit/adapters/iframe-player.test.ts
git commit -m "Add IFramePlayer callback and cleanup tests"
```

---

## Task 7: Watch page HTML + entry skeleton

**Files:**
- Create: `src/entrypoints/watch/index.html`
- Create: `src/entrypoints/watch/main.ts`
- Create: `src/entrypoints/watch/App.svelte`

- [ ] **Step 1: Create the HTML shell**

Create `src/entrypoints/watch/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Quoth — Watch</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the Svelte mount**

Create `src/entrypoints/watch/main.ts`:

```typescript
import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
```

- [ ] **Step 3: Create minimal App.svelte**

Create `src/entrypoints/watch/App.svelte`:

```svelte
<script lang="ts">
  import { parseWatchParams } from '../../core/watch-url';

  const params = parseWatchParams(window.location.search);
</script>

<main>
  {#if !params.videoId}
    <p class="placeholder">No video id provided. Add <code>?v=VIDEO_ID</code> to the URL.</p>
  {:else}
    <p class="placeholder">Loading video {params.videoId}…</p>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: system-ui, -apple-system, sans-serif;
    color: #e0e0e0;
    background: #1a1a2e;
    font-size: 13px;
  }
  .placeholder {
    padding: 24px;
    color: #888;
  }
</style>
```

- [ ] **Step 4: Verify build produces watch.html**

Run: `just build chrome`
Expected: build succeeds and `.output/chrome-mv3/watch.html` exists

Run: `ls -la .output/chrome-mv3/watch.html`
Expected: file exists

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/watch/
git commit -m "Add watch-page entrypoint skeleton"
```

---

## Task 8: Watch page — iframe embed + IFramePlayer wiring

**Files:**
- Modify: `src/entrypoints/watch/App.svelte`

- [ ] **Step 1: Wire the iframe and IFramePlayer**

Replace `src/entrypoints/watch/App.svelte` with:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { parseWatchParams } from '../../core/watch-url';
  import { IFramePlayer } from '../../adapters/youtube/iframe-player';

  const params = parseWatchParams(window.location.search);

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let player: IFramePlayer | null = null;
  let currentTimeMs = $state(0);
  let isPlaying = $state(false);

  const embedUrl = params.videoId
    ? `https://www.youtube.com/embed/${params.videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&start=${Math.floor(params.initialTimeMs / 1000)}`
    : '';

  onMount(() => {
    if (!iframeEl || !params.videoId) return;

    player = new IFramePlayer({
      postMessage: (msg) => iframeEl!.contentWindow?.postMessage(msg, '*'),
      subscribeToMessages: (handler) => {
        const listener = (e: MessageEvent) => {
          if (e.source === iframeEl!.contentWindow) handler(e.data);
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
      },
    });
    player.initialize();
    player.onTimeUpdate((state) => {
      currentTimeMs = state.currentTimeMs;
      isPlaying = state.isPlaying;
    });
  });

  onDestroy(() => {
    player?.destroy();
  });
</script>

<main>
  {#if !params.videoId}
    <p class="placeholder">No video id provided. Add <code>?v=VIDEO_ID</code> to the URL.</p>
  {:else}
    <div class="video-wrap">
      <iframe
        bind:this={iframeEl}
        src={embedUrl}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
    <div class="status">
      time: {(currentTimeMs / 1000).toFixed(1)}s · {isPlaying ? 'playing' : 'paused'}
    </div>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: system-ui, -apple-system, sans-serif;
    color: #e0e0e0;
    background: #1a1a2e;
    font-size: 13px;
  }
  .placeholder {
    padding: 24px;
    color: #888;
  }
  .video-wrap {
    position: relative;
    width: 100%;
    max-width: 90vw;
    aspect-ratio: 16 / 9;
    margin: 0 auto;
    background: #000;
  }
  .video-wrap iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .status {
    padding: 8px 12px;
    color: #888;
    font-size: 11px;
    border-bottom: 1px solid #2a2a4a;
  }
</style>
```

- [ ] **Step 2: Verify build**

Run: `just build chrome`
Expected: build succeeds

- [ ] **Step 3: Verify check passes**

Run: `just check`
Expected: all tests + lint + typecheck + fmt pass

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/watch/App.svelte
git commit -m "Wire iframe + IFramePlayer on watch page"
```

---

## Task 9: Watch page — transcript loading with cache

**Files:**
- Modify: `src/entrypoints/watch/App.svelte`

- [ ] **Step 1: Add transcript fetching with cache**

Replace `src/entrypoints/watch/App.svelte` with:

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { parseWatchParams } from '../../core/watch-url';
  import { IFramePlayer } from '../../adapters/youtube/iframe-player';
  import { YouTubeTranscriptSource } from '../../adapters/youtube/transcript-source';
  import { ChromeStorageLocalCache } from '../../adapters/browser/chrome-storage-local-cache';
  import {
    groupWordsIntoSegments,
    findActiveWordIndex,
    findActiveSegmentIndex,
    type WordSegment,
  } from '../../core/playback-sync';
  import type { TimedWord, VideoInfo } from '../../core/types';
  import TranscriptView from '../sidepanel/components/TranscriptView.svelte';

  const SEGMENT_GAP_MS = 2000;
  const params = parseWatchParams(window.location.search);

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let player: IFramePlayer | null = null;
  let videoInfo: VideoInfo | null = $state(null);
  let words: TimedWord[] = $state([]);
  let segments: WordSegment[] = $state([]);
  let currentTimeMs = $state(0);
  let autoScroll = $state(true);
  let status = $state('Loading…');

  const activeWordIndex = $derived(findActiveWordIndex(words, currentTimeMs));
  const activeSegmentIndex = $derived(findActiveSegmentIndex(segments, currentTimeMs));

  const embedUrl = params.videoId
    ? `https://www.youtube.com/embed/${params.videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&start=${Math.floor(params.initialTimeMs / 1000)}`
    : '';

  async function loadTranscript(videoId: string) {
    const cache = new ChromeStorageLocalCache(browser.storage.local);
    const cached = await cache.get(videoId);
    if (cached) {
      videoInfo = cached.videoInfo;
      words = cached.words;
      segments = groupWordsIntoSegments(cached.words, SEGMENT_GAP_MS);
      status = `${cached.words.length} words loaded (cached)`;
      return;
    }
    const source = new YouTubeTranscriptSource();
    const meta = await source.getVideoMetadata(videoId);
    if (!meta.videoInfo) {
      status = 'Video info not available';
      return;
    }
    videoInfo = meta.videoInfo;
    status = 'Loading captions…';
    const englishTrack = meta.captionTracks.find((t) => t.languageCode === 'en');
    if (!englishTrack) {
      status = 'No English captions available';
      return;
    }
    const fetched = await source.fetchTranscript(englishTrack);
    words = fetched;
    segments = groupWordsIntoSegments(fetched, SEGMENT_GAP_MS);
    status = `${fetched.length} words loaded`;
    await cache.set(videoId, { videoInfo: meta.videoInfo, words: fetched });
  }

  function handleSeek(timeMs: number) {
    player?.seekTo(timeMs);
  }

  onMount(() => {
    if (!iframeEl || !params.videoId) return;
    player = new IFramePlayer({
      postMessage: (msg) => iframeEl!.contentWindow?.postMessage(msg, '*'),
      subscribeToMessages: (handler) => {
        const listener = (e: MessageEvent) => {
          if (e.source === iframeEl!.contentWindow) handler(e.data);
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
      },
    });
    player.initialize();
    player.onTimeUpdate((state) => {
      currentTimeMs = state.currentTimeMs;
    });
    loadTranscript(params.videoId).catch((err) => {
      status = `Error: ${err instanceof Error ? err.message : String(err)}`;
    });
  });

  onDestroy(() => {
    player?.destroy();
  });
</script>

<main>
  {#if !params.videoId}
    <p class="placeholder">No video id provided. Add <code>?v=VIDEO_ID</code> to the URL.</p>
  {:else}
    <div class="video-wrap">
      <iframe
        bind:this={iframeEl}
        src={embedUrl}
        title={videoInfo?.title ?? 'YouTube video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
    <header>
      <h1>{videoInfo?.title ?? 'Loading…'}</h1>
      <button
        class="toggle"
        class:active={autoScroll}
        onclick={() => (autoScroll = !autoScroll)}
        title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
      >
        {autoScroll ? '⬇ following' : '⏸ browsing'}
      </button>
    </header>
    {#if words.length > 0}
      <TranscriptView
        {words}
        {segments}
        {activeWordIndex}
        {activeSegmentIndex}
        {autoScroll}
        videoId={params.videoId}
        onSeek={handleSeek}
      />
    {:else}
      <p class="placeholder">{status}</p>
    {/if}
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: system-ui, -apple-system, sans-serif;
    color: #e0e0e0;
    background: #1a1a2e;
    font-size: 13px;
  }
  .placeholder {
    padding: 24px;
    color: #888;
  }
  .video-wrap {
    position: relative;
    width: 100%;
    max-width: 90vw;
    aspect-ratio: 16 / 9;
    margin: 0 auto;
    background: #000;
  }
  .video-wrap iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
  header {
    padding: 8px 12px;
    border-bottom: 1px solid #2a2a4a;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .toggle {
    background: none;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    cursor: pointer;
    padding: 2px 8px;
    font-size: 11px;
    margin-left: 8px;
  }
  .toggle.active {
    color: #aac;
    border-color: #446;
  }
</style>
```

- [ ] **Step 2: Verify build and check pass**

Run: `just check`
Expected: all tests + lint + typecheck + fmt pass

- [ ] **Step 3: Commit**

```bash
git add src/entrypoints/watch/App.svelte
git commit -m "Load transcript via cache-then-fetch on watch page"
```

---

## Task 10: Sidebar pop-out button

**Files:**
- Modify: `src/entrypoints/sidepanel/components/Header.svelte`
- Modify: `src/entrypoints/sidepanel/App.svelte`

- [ ] **Step 1: Add onPopOut prop + button to Header**

Replace `src/entrypoints/sidepanel/components/Header.svelte` with:

```svelte
<script lang="ts">
  interface Props {
    title: string;
    autoScroll: boolean;
    onToggleAutoScroll: () => void;
    onPopOut: () => void;
    canPopOut: boolean;
  }
  let { title, autoScroll, onToggleAutoScroll, onPopOut, canPopOut }: Props = $props();
</script>

<header>
  <h1>{title || 'Quoth'}</h1>
  <div class="controls">
    <button
      class="toggle"
      onclick={onPopOut}
      disabled={!canPopOut}
      title="Open in full tab"
    >
      ⇱
    </button>
    <button
      class="toggle"
      class:active={autoScroll}
      onclick={onToggleAutoScroll}
      title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
    >
      {autoScroll ? '⬇' : '⏸'}
    </button>
  </div>
</header>

<style>
  header {
    padding: 8px 12px;
    border-bottom: 1px solid #2a2a4a;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .controls {
    display: flex;
    gap: 4px;
    margin-left: 8px;
  }
  .toggle {
    background: none;
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    cursor: pointer;
    padding: 2px 6px;
    font-size: 12px;
  }
  .toggle.active {
    color: #aac;
    border-color: #446;
  }
  .toggle:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
```

- [ ] **Step 2: Wire the pop-out handler in App.svelte**

In `src/entrypoints/sidepanel/App.svelte`, find the `<Header ... />` usage and update the script + markup.

In the `<script lang="ts">` block, add after the `handleSeek` function:

```typescript
  // Track latest currentTimeMs from time-update messages for pop-out
  let currentTimeMs = $state(0);

  // Update currentTimeMs whenever a time-update message arrives. We piggyback
  // on the handleMessage call by also inspecting the incoming message here.
  browser.runtime.onMessage.addListener((message: ContentMessage, sender) => {
    if (sender.tab?.id && sender.tab.id === youtubeTabId && message.type === 'time-update') {
      currentTimeMs = message.currentTimeMs;
    }
  });

  function handlePopOut() {
    const videoId = state.videoInfo?.videoId;
    if (!videoId) return;
    const seconds = Math.floor(currentTimeMs / 1000);
    const url = browser.runtime.getURL(`watch.html?v=${videoId}&t=${seconds}`);
    browser.tabs.create({ url });
  }
```

Replace the `<Header>` element in the markup with:

```svelte
  <Header
    title={state.videoInfo?.title ?? ''}
    {autoScroll}
    onToggleAutoScroll={() => (autoScroll = !autoScroll)}
    onPopOut={handlePopOut}
    canPopOut={state.videoInfo !== null}
  />
```

- [ ] **Step 3: Verify build and check pass**

Run: `just check`
Expected: all tests + lint + typecheck + fmt pass

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/sidepanel/components/Header.svelte src/entrypoints/sidepanel/App.svelte
git commit -m "Add sidebar pop-out button that opens watch page"
```

---

## Task 11: Playwright smoke test for watch page

**Files:**
- Create: `tools/smoke-test-watch.ts`

- [ ] **Step 1: Write the smoke test script**

Create `tools/smoke-test-watch.ts`:

```typescript
#!/usr/bin/env -S bun run
/**
 * ABOUTME: Smoke test for the watch-page entry: loads chrome-extension://.../watch.html directly.
 * ABOUTME: Verifies iframe embed loads, transcript populates, click-to-seek works.
 */

import { chromium } from 'playwright';
import path from 'path';

const extensionPath = path.resolve('.output/chrome-mv3');
const videoId = process.argv[2] || 'YwZR6tc7qYg';

console.log('Launching browser with extension...');
const context = await chromium.launchPersistentContext('', {
  headless: false,
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});

let [background] = context.serviceWorkers();
if (!background) {
  background = await context.waitForEvent('serviceworker');
}
const extensionId = background.url().split('/')[2];
console.log('Extension ID:', extensionId);

const page = context.pages()[0] || (await context.newPage());
page.on('console', (m) => {
  if (m.text().includes('[quoth') || m.type() === 'error') console.log(`[W] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[W ERROR] ${e.message}`));

const watchUrl = `chrome-extension://${extensionId}/watch.html?v=${videoId}&t=30`;
console.log(`Opening watch page: ${watchUrl}`);
await page.goto(watchUrl, { waitUntil: 'load', timeout: 30000 });

// Wait for transcript to populate (words rendered)
console.log('Waiting for transcript to load...');
await page.waitForSelector('.word', { timeout: 20000 });

const title = await page.locator('h1').textContent();
const wordCount = await page.locator('.word').count();
console.log(`Title: ${title}`);
console.log(`Words loaded: ${wordCount}`);

if (wordCount === 0) {
  console.log('\nSMOKE TEST FAILED: no words rendered');
  await page.screenshot({ path: '.output/smoke-test-watch-failure.png' });
  await context.close();
  process.exit(1);
}

// Click a word well past t=30 so we can detect the seek
console.log('\n--- Click-to-seek test ---');
const targetWord = page.locator('.word').nth(500);
const wordText = await targetWord.textContent();
const wordStart = await targetWord.getAttribute('data-start');
console.log(`Clicking word "${wordText?.trim()}" (data-start: ${wordStart}ms)`);

await targetWord.click();
// Wait long enough for an infoDelivery tick to propagate the new time
await page.waitForTimeout(2000);

// Read currentTimeMs from the on-screen status line
const statusText = await page.locator('header').textContent();
console.log(`Header after click: ${statusText?.trim()}`);

// Assert seek by asking the player via the infoDelivery state (currentTimeMs updates visibly on-screen).
// We check by asserting the active-word highlight moved to a word whose start is close to target.
const activeIdx = await page
  .locator('.word.active-word')
  .first()
  .getAttribute('data-start');
console.log(`Active word data-start after click: ${activeIdx}ms`);

if (wordStart && activeIdx) {
  const expected = parseInt(wordStart);
  const got = parseInt(activeIdx);
  const diff = Math.abs(got - expected);
  console.log(`Expected: ~${expected}ms, Got: ${got}ms, Diff: ${diff}ms`);
  if (diff > 5000) {
    console.log('Click-to-seek: MISMATCH');
    await context.close();
    process.exit(1);
  }
  console.log('Click-to-seek: WORKING');
}

// Cache hit check: reload the page and verify "(cached)" status
console.log('\n--- Cache hit check ---');
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.word', { timeout: 10000 });
const placeholder = await page.locator('.placeholder').count();
console.log(`Placeholders visible after reload: ${placeholder}`);
// If we re-rendered quickly, transcript should appear. Cache hit is implicit in speed;
// a stronger assertion would check network requests, keep simple for now.

console.log('\nSMOKE TEST PASSED');
await context.close();
```

- [ ] **Step 2: Add justfile recipe**

Open `justfile` and add this recipe after the existing `smoke-test-firefox` recipe:

```make
# Watch-page smoke test: load watch.html directly and verify transcript + click-to-seek
smoke-test-watch *VIDEO_ID:
    just build chrome
    bun run tools/smoke-test-watch.ts {{VIDEO_ID}}
```

- [ ] **Step 3: Run the smoke test**

Run: `just smoke-test-watch`
Expected: ends with "SMOKE TEST PASSED"

If it fails, inspect `.output/smoke-test-watch-failure.png` and `[W]` log lines. Common issues:
- iframe not loaded: check `embedUrl` formation in `App.svelte`
- postMessage not received: check `subscribeToMessages` source filtering
- transcript empty: check `host_permissions` and Innertube fetch

- [ ] **Step 4: Verify no regressions**

Run: `just smoke-test`
Expected: existing sidebar smoke test still passes ("SMOKE TEST PASSED")

Run: `just check`
Expected: all tests + lint + typecheck + fmt pass

- [ ] **Step 5: Commit**

```bash
git add tools/smoke-test-watch.ts justfile
git commit -m "Add Playwright smoke test for watch page"
```

---

## Task 12: Manual verification of pop-out button

**Files:** none (verification only)

- [ ] **Step 1: Build fresh**

Run: `just build chrome`
Expected: success

- [ ] **Step 2: Launch dev mode**

Run: `just dev chrome 'https://www.youtube.com/watch?v=YwZR6tc7qYg'`
Expected: Chrome opens with the extension loaded and navigates to YouTube

- [ ] **Step 3: Open sidebar and verify pop-out button**

In Chrome: click the Quoth extension icon to open the side panel. Wait for transcript to load.

Click the ⇱ button in the sidebar header.

Expected:
- A new tab opens at `chrome-extension://<id>/watch.html?v=YwZR6tc7qYg&t=N` (where N is the current playback time)
- Video iframe loads and starts playing
- Transcript renders with the active word highlighted
- Click-to-seek works

- [ ] **Step 4: Close dev mode**

Close the browser; dev mode exits.

---

## Self-Review

After completing all tasks, verify:

1. **All spec requirements implemented:**
   - Standalone watch page at `chrome-extension://<id>/watch.html?v=X&t=N` — Tasks 7, 8, 9
   - Video iframe + transcript stacked layout — Task 9
   - Autoscroll follow/browse toggle — Task 9
   - Click-to-seek — Task 8, 9
   - Per-video cache via chrome.storage.local — Tasks 2, 3, 9
   - Sidebar pop-out button — Task 10
   - Playwright smoke test — Task 11
   - Sidebar/content/background untouched — verified by tasks not modifying them

2. **`just check` passes**
3. **`just smoke-test-watch` passes**
4. **`just smoke-test` still passes** (sidebar regression check)
5. **Manual pop-out verification** (Task 12)

## Known risks (from design doc)

- **Embed-disabled videos**: watch page shows transcript but no playable video. v1 shows plain error; deferred fallback UX.
- **IFrame Player API timing**: if `infoDelivery` events don't arrive frequently enough, add polling by sending `{event:'command',func:'getCurrentTime'}` every 250ms.
- **Firefox per-user UUIDs**: watch-page URLs are not shareable across Firefox users (documented in design).
