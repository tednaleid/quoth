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

  // Only handle messages from the tab we're connected to
  browser.runtime.onMessage.addListener((message: ContentMessage, sender) => {
    if (sender.tab?.id && sender.tab.id === youtubeTabId) {
      handleMessage(message);
    }
  });

  // When the user switches tabs, connect to the new active YouTube tab
  browser.tabs.onActivated.addListener(async (activeInfo) => {
    const tab = await browser.tabs.get(activeInfo.tabId);
    if (tab.url?.match(/youtube\.com\/watch/)) {
      if (tab.id !== youtubeTabId) {
        youtubeTabId = tab.id!;
        // Reset state and request transcript from the new tab
        words = [];
        segments = [];
        videoInfo = null;
        activeWordIndex = -1;
        activeSegmentIndex = -1;
        status = 'Loading...';
        sendToContent({ type: 'request-state' });
      }
    }
  });

  // On startup, find the active YouTube tab (or first available)
  async function connectToYouTubeTab() {
    // Prefer the active tab if it's YouTube
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
      url: '*://*.youtube.com/watch*',
    });
    if (activeTab?.id) {
      youtubeTabId = activeTab.id;
    } else {
      // Fall back to any YouTube tab
      youtubeTabId = await findYouTubeTab();
    }
    if (youtubeTabId) {
      sendToContent({ type: 'request-state' });
    }
  }

  connectToYouTubeTab();
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
