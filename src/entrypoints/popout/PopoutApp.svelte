<script lang="ts">
  import {
    createInitialState,
    handleMessage,
    type TranscriptState,
  } from '../../core/message-handler';
  import { setupPinnedTabConnector } from '../../adapters/browser/pinned-tab-connector';
  import type { ContentMessage, SidePanelMessage } from '../../messages';
  import Header from '../sidepanel/components/Header.svelte';
  import StatusBar from '../sidepanel/components/StatusBar.svelte';
  import TranscriptView from '../sidepanel/components/TranscriptView.svelte';

  interface Props {
    pinnedTabId: number;
  }
  let { pinnedTabId }: Props = $props();

  let state: TranscriptState = $state(createInitialState());
  let autoScroll = $state(true);
  let disconnected = $state(false);

  // Only handle messages from the pinned tab; ignore time-update when disconnected
  browser.runtime.onMessage.addListener((message: ContentMessage, sender) => {
    if (sender.tab?.id && sender.tab.id === pinnedTabId) {
      if (disconnected && message.type === 'time-update') return;
      state = handleMessage(state, message);
    }
  });

  function sendToTab(tabId: number, message: SidePanelMessage) {
    browser.tabs.sendMessage(tabId, message).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('Receiving end does not exist')) {
        console.warn('[quoth popout] tabs.sendMessage failed:', msg);
      }
    });
  }

  function handleSeek(timeMs: number) {
    if (!disconnected) {
      sendToTab(pinnedTabId, { type: 'seek-to', timeMs });
    }
  }

  setupPinnedTabConnector(pinnedTabId, {
    onConnect(_tabId) {
      state = { ...createInitialState(), status: 'Loading...' };
    },
    onDisconnect(reason) {
      disconnected = true;
      state = {
        ...state,
        activeWordIndex: -1,
        activeSegmentIndex: -1,
        status: reason === 'tab-closed' ? 'YouTube tab closed' : 'Video navigated away',
      };
    },
    sendMessage(tabId, message) {
      sendToTab(tabId, message);
    },
  });
</script>

<main class:disconnected>
  <Header
    title={state.videoInfo?.title ?? ''}
    {autoScroll}
    onToggleAutoScroll={() => (autoScroll = !autoScroll)}
    {disconnected}
  />

  {#if state.words.length > 0}
    <TranscriptView
      words={state.words}
      segments={state.segments}
      activeWordIndex={state.activeWordIndex}
      activeSegmentIndex={state.activeSegmentIndex}
      chapters={state.chapters}
      {autoScroll}
      videoId={state.videoInfo?.videoId ?? ''}
      onSeek={handleSeek}
      onAutoScrollDisable={() => (autoScroll = false)}
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
    font-size: 16px;
  }

  main.disconnected {
    opacity: 0.6;
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
