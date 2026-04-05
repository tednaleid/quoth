<script lang="ts">
  import type { TimedWord, VideoInfo } from '../../core/types';
  import type { WordSegment } from '../../core/playback-sync';
  import {
    findActiveWordIndex,
    findActiveSegmentIndex,
    groupWordsIntoSegments,
  } from '../../core/playback-sync';
  import type { ContentMessage, SidePanelMessage } from '../../messages';
  import Header from './components/Header.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import TranscriptView from './components/TranscriptView.svelte';

  let videoInfo: VideoInfo | null = $state(null);
  let words: TimedWord[] = $state([]);
  let segments: WordSegment[] = $state([]);
  let activeWordIndex = $state(-1);
  let activeSegmentIndex = $state(-1);
  let autoScroll = $state(true);
  let status = $state('Open a YouTube video to see its transcript.');

  const SEGMENT_GAP_MS = 2000;

  $effect(() => {
    if (words.length > 0) {
      segments = groupWordsIntoSegments(words, SEGMENT_GAP_MS);
    } else {
      segments = [];
    }
  });

  function handleMessage(message: ContentMessage) {
    switch (message.type) {
      case 'video-detected':
        videoInfo = message.videoInfo;
        status = 'Loading captions...';
        break;

      case 'captions-loaded':
        words = message.words;
        status = `${message.words.length} words loaded`;
        break;

      case 'captions-error':
        status = `Error: ${message.error}`;
        break;

      case 'video-left':
        videoInfo = null;
        words = [];
        segments = [];
        activeWordIndex = -1;
        activeSegmentIndex = -1;
        status = 'Open a YouTube video to see its transcript.';
        break;

      case 'time-update':
        if (words.length > 0) {
          activeWordIndex = findActiveWordIndex(words, message.currentTimeMs);
          activeSegmentIndex = findActiveSegmentIndex(segments, message.currentTimeMs);
        }
        break;
    }
  }

  // Track the YouTube tab we're connected to
  let youtubeTabId: number | null = $state(null);

  async function findYouTubeTab(): Promise<number | null> {
    const tabs = await browser.tabs.query({ url: '*://*.youtube.com/watch*' });
    return tabs[0]?.id ?? null;
  }

  function sendToContent(message: SidePanelMessage) {
    if (youtubeTabId) {
      browser.tabs.sendMessage(youtubeTabId, message).catch(() => {
        // Content script may not be loaded
      });
    }
  }

  function handleSeek(timeMs: number) {
    sendToContent({ type: 'seek-to', timeMs });
  }

  // Listen for messages from content script (via background)
  browser.runtime.onMessage.addListener((message: ContentMessage, sender) => {
    // Track which tab the content script is on
    if (sender.tab?.id) {
      youtubeTabId = sender.tab.id;
    }
    handleMessage(message);
  });

  // On startup, find the YouTube tab and request its state
  findYouTubeTab().then((tabId) => {
    if (tabId) {
      youtubeTabId = tabId;
      sendToContent({ type: 'request-state' });
    }
  });
</script>

<main>
  <Header
    title={videoInfo?.title ?? ''}
    {autoScroll}
    onToggleAutoScroll={() => (autoScroll = !autoScroll)}
  />

  {#if words.length > 0}
    <TranscriptView
      {words}
      {segments}
      {activeWordIndex}
      {activeSegmentIndex}
      {autoScroll}
      videoId={videoInfo?.videoId ?? ''}
      onSeek={handleSeek}
    />
  {:else}
    <div class="placeholder">
      <p>{status}</p>
    </div>
  {/if}

  <StatusBar {status} />
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
    flex: 1;
    padding: 12px;
    color: #888;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
