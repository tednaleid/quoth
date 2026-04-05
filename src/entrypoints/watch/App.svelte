<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { parseWatchParams } from '../../core/watch-url';
  import { YouTubeTranscriptSource } from '../../adapters/youtube/transcript-source';
  import { ChromeStorageLocalCache } from '../../adapters/browser/chrome-storage-local-cache';
  import {
    groupWordsIntoSegments,
    findActiveWordIndex,
    findActiveSegmentIndex,
    type WordSegment,
  } from '../../core/playback-sync';
  import type { TimedWord, VideoInfo } from '../../core/types';
  import type { EmbedMessage } from '../../messages';
  import TranscriptView from '../sidepanel/components/TranscriptView.svelte';

  const SEGMENT_GAP_MS = 2000;
  const params = parseWatchParams(window.location.search);

  let iframeEl: HTMLIFrameElement | undefined = $state();
  let videoInfo: VideoInfo | null = $state(null);
  let words: TimedWord[] = $state([]);
  let segments: WordSegment[] = $state([]);
  let currentTimeMs = $state(0);
  let autoScroll = $state(true);
  let status = $state('Loading…');

  const activeWordIndex = $derived(findActiveWordIndex(words, currentTimeMs));
  const activeSegmentIndex = $derived(findActiveSegmentIndex(segments, currentTimeMs));

  const embedUrl = params.videoId
    ? `https://www.youtube.com/embed/${params.videoId}?enablejsapi=1&mute=1&origin=${encodeURIComponent(window.location.origin)}&start=${Math.floor(params.initialTimeMs / 1000)}`
    : '';

  async function loadTranscript(videoId: string) {
    const cache = new ChromeStorageLocalCache({
      get: (k) => browser.storage.local.get(k) as Promise<Record<string, unknown>>,
      set: (items) => browser.storage.local.set(items),
    });
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

  let embedTabId: number | null = null;
  let embedFrameId: number | null = null;

  function handleSeek(timeMs: number) {
    if (embedTabId === null || embedFrameId === null) return;
    browser.tabs
      .sendMessage(embedTabId, { type: 'embed-seek', timeMs }, { frameId: embedFrameId })
      .catch(() => {});
  }

  const messageListener = (
    message: EmbedMessage,
    sender: { tab?: { id?: number }; frameId?: number },
  ) => {
    if (message.type === 'embed-time-update') {
      currentTimeMs = message.currentTimeMs;
      if (sender?.tab?.id !== undefined && sender.frameId !== undefined) {
        embedTabId = sender.tab.id;
        embedFrameId = sender.frameId;
      }
    }
  };

  onMount(() => {
    if (!iframeEl || !params.videoId) return;

    browser.runtime.onMessage.addListener(messageListener);

    loadTranscript(params.videoId).catch((err) => {
      status = `Error: ${err instanceof Error ? err.message : String(err)}`;
    });
  });

  onDestroy(() => {
    browser.runtime.onMessage.removeListener(messageListener);
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
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
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
