<script lang="ts">
  import {
    createInitialState,
    handleMessage,
    type TranscriptState,
  } from '../../core/message-handler';
  import { setupTabConnector } from '../../adapters/browser/tab-connector';
  import type { ContentMessage, SidePanelMessage } from '../../messages';
  import Header from './components/Header.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import TranscriptView from './components/TranscriptView.svelte';

  let state: TranscriptState = $state(createInitialState());
  let autoScroll = $state(true);

  // Track the YouTube tab we're connected to (for message filtering and seeking)
  let youtubeTabId: number | null = $state(null);

  // Only handle messages from the tab we're connected to
  browser.runtime.onMessage.addListener((message: ContentMessage, sender) => {
    if (sender.tab?.id && sender.tab.id === youtubeTabId) {
      state = handleMessage(state, message);
    }
  });

  function sendToTab(tabId: number, message: SidePanelMessage) {
    // "Receiving end does not exist" is expected if the content script hasn't loaded yet -- swallow silently
    browser.tabs.sendMessage(tabId, message).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Receiving end does not exist')) {
        console.warn('[quoth sidebar] tabs.sendMessage failed:', msg);
      }
    });
  }

  function handleSeek(timeMs: number) {
    if (youtubeTabId) {
      sendToTab(youtubeTabId, { type: 'seek-to', timeMs });
    }
  }

  function handlePopOut() {
    const videoId = state.videoInfo?.videoId;
    if (!videoId) return;
    const seconds = Math.floor(state.currentTimeMs / 1000);
    const url = browser.runtime.getURL(`watch.html?v=${videoId}&t=${seconds}`);
    browser.tabs.create({ url });
  }

  setupTabConnector({
    onConnect(tabId) {
      youtubeTabId = tabId;
      state = { ...createInitialState(), status: 'Loading...' };
    },
    sendMessage(tabId, message) {
      sendToTab(tabId, message);
    },
  });
</script>

<main>
  <Header
    title={state.videoInfo?.title ?? ''}
    {autoScroll}
    onToggleAutoScroll={() => (autoScroll = !autoScroll)}
    onPopOut={handlePopOut}
    canPopOut={state.videoInfo !== null}
  />

  {#if state.words.length > 0}
    <TranscriptView
      words={state.words}
      segments={state.segments}
      activeWordIndex={state.activeWordIndex}
      activeSegmentIndex={state.activeSegmentIndex}
      {autoScroll}
      videoId={state.videoInfo?.videoId ?? ''}
      onSeek={handleSeek}
    />
  {:else}
    <div class="placeholder">
      <p>{state.status}</p>
    </div>
  {/if}

  <StatusBar status={state.status} />
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
