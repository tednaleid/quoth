<script lang="ts">
  import {
    createInitialState,
    handleMessage,
    type TranscriptState,
  } from '../../core/message-handler';
  import { setupTabConnector } from '../../adapters/browser/tab-connector';
  import { SettingsStorage } from '../../adapters/browser/settings-storage';
  import { DEFAULT_SETTINGS, hexToRgbString, type HighlightSettings } from '../../core/settings';
  import type { ContentMessage, SidePanelMessage } from '../../messages';
  import { isSeek } from '../../core/seek-detector';
  import Header from './components/Header.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import TranscriptView from './components/TranscriptView.svelte';

  let state: TranscriptState = $state(createInitialState());
  let autoScroll = $state(true);
  let settings: HighlightSettings = $state({ ...DEFAULT_SETTINGS });
  let settingsOpen = $state(false);
  let lastTimeMs: number | null = $state(null);
  let forceSnapToken = $state(0);

  // Track the YouTube tab we're connected to (for message filtering and seeking)
  let youtubeTabId: number | null = $state(null);

  // Load + persist user highlight settings via browser.storage.local.
  const settingsStorage = new SettingsStorage(browser.storage.local);
  settingsStorage
    .load()
    .then((loaded) => {
      settings = loaded;
    })
    .catch((err) => {
      console.warn('[quoth sidebar] failed to load settings:', err);
    });

  function updateSettings(next: HighlightSettings) {
    settings = next;
    settingsStorage.save(next).catch((err) => {
      console.warn('[quoth sidebar] failed to save settings:', err);
    });
  }

  // Only handle messages from the tab we're connected to
  browser.runtime.onMessage.addListener((message: ContentMessage, sender) => {
    if (sender.tab?.id && sender.tab.id === youtubeTabId) {
      if (message.type === 'video-detected' || message.type === 'video-left') {
        lastTimeMs = null;
      }
      if (message.type === 'time-update') {
        if (isSeek(lastTimeMs, message.currentTimeMs)) {
          autoScroll = true;
          forceSnapToken++;
        }
        lastTimeMs = message.currentTimeMs;
      }
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
    autoScroll = true;
    forceSnapToken++;
  }

  async function handlePopout() {
    if (!youtubeTabId) return;
    const url = browser.runtime.getURL(`/popout.html?tabId=${youtubeTabId}`);
    await browser.tabs.create({ url });
    window.close();
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

<main
  style:--bg={settings.bg}
  style:--text={settings.text}
  style:--horizon-rgb={hexToRgbString(settings.peak)}
  style:--current-word-text={settings.current}
>
  <Header
    title={state.videoInfo?.title ?? ''}
    {autoScroll}
    onToggleAutoScroll={() => {
      autoScroll = !autoScroll;
      if (autoScroll) forceSnapToken++;
    }}
    settingsOpen
    onToggleSettings={() => (settingsOpen = !settingsOpen)}
    onPopout={handlePopout}
  />

  <SettingsPanel {settings} open={settingsOpen} onChange={updateSettings} />

  {#if state.words.length > 0}
    <TranscriptView
      words={state.words}
      segments={state.segments}
      currentTimeMs={state.currentTimeMs}
      chapters={state.chapters}
      {autoScroll}
      {forceSnapToken}
      videoId={state.videoInfo?.videoId ?? ''}
      peakCap={settings.peakCap}
      horizonSeconds={settings.horizonSeconds}
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
  :global(:root) {
    color-scheme: light dark;

    /* Chrome colors (border, dim text, etc.). The four "palette" vars
       (--bg, --text, --horizon-rgb, --current-word-text) are set on <main>
       from user settings, so they don't live here. */
    --text-dim: #888;
    --text-dimmer: #666;
    --text-very-dim: #556;
    --text-very-dim-hover: #88a;
    --border-dim: #2a2a4a;
    --button-border: #333;
    --button-border-active: #446;
    --button-text-active: #aac;
    --chapter-link: #c0c8e0;
    --chapter-link-hover: #e0e8ff;
    --segment-hover: rgba(100, 150, 255, 0.15);
  }

  @media (prefers-color-scheme: light) {
    :global(:root) {
      --text-dim: #667;
      --text-dimmer: #889;
      --text-very-dim: #99a;
      --text-very-dim-hover: #556;
      --border-dim: #dde;
      --button-border: #ccd;
      --button-border-active: #99a;
      --button-text-active: #334;
      --chapter-link: #3a4a7a;
      --chapter-link-hover: #1a2340;
      --segment-hover: rgba(60, 110, 220, 0.1);
    }
  }

  main {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    color: var(--text);
    background: var(--bg);
    font-size: 16px;
  }

  .placeholder {
    flex: 1;
    padding: 12px;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
