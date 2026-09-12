<script lang="ts">
  import {
    createInitialState,
    handleMessage,
    type TranscriptState,
  } from '../../core/message-handler';
  import { setupTabConnector } from '../../adapters/browser/tab-connector';
  import type { TabConnection, YouTubeTabInfo } from '../../ports/tab-connector';
  import { SettingsStorage } from '../../adapters/browser/settings-storage';
  import { DEFAULT_SETTINGS, hexToRgbString, type HighlightSettings } from '../../core/settings';
  import type { CopyFormat } from '../../core/transcript-export';
  import type { ContentMessage, SidePanelMessage } from '../../messages';
  import { isSeek } from '../../core/seek-detector';
  import { copyTranscript } from './copy-transcript';
  import { createToast } from './toast.svelte';
  import Header from './components/Header.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import Toast from './components/Toast.svelte';
  import TranscriptView from './components/TranscriptView.svelte';

  let state: TranscriptState = $state(createInitialState());
  let autoScroll = $state(true);
  let settings: HighlightSettings = $state({ ...DEFAULT_SETTINGS });
  let settingsOpen = $state(false);
  let lastTimeMs: number | null = $state(null);
  let forceSnapToken = $state(0);
  const toast = createToast();

  // Track the YouTube tab we're connected to (for message filtering and seeking)
  let youtubeTabId: number | null = $state(null);
  // Follow-active (default) vs pinned to a manually selected tab.
  let followActive = $state(true);
  let availableTabs: YouTubeTabInfo[] = $state([]);

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

  // The connector owns which tab is connected; the panel only asks it to pin or follow.
  let connection: TabConnection | null = null;

  function handlePinTab(tabId: number) {
    followActive = false;
    connection?.pin(tabId);
  }

  function handleToggleFollow() {
    if (followActive) {
      if (youtubeTabId !== null) handlePinTab(youtubeTabId);
      return;
    }
    followActive = true;
    connection?.follow().catch((err) => {
      console.warn('[quoth sidebar] failed to follow active tab:', err);
    });
  }

  function handleCopy(format: CopyFormat) {
    void copyTranscript(state, format, toast, '[quoth sidebar]');
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
    onTabsChanged(tabs) {
      availableTabs = tabs;
    },
    onDisconnect(reason) {
      youtubeTabId = null;
      state = {
        ...createInitialState(),
        status: reason === 'pinned-tab-closed' ? 'Pinned tab closed' : 'No YouTube tabs open',
      };
    },
  }).then((conn) => {
    connection = conn;
  });
</script>

<main
  class="app"
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
    tabs={availableTabs}
    selectedTabId={youtubeTabId}
    {followActive}
    onSelectTab={handlePinTab}
    onToggleFollow={handleToggleFollow}
    onCopy={handleCopy}
    copyDisabled={state.words.length === 0}
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

  <Toast toast={toast.current} />

  <StatusBar status={state.status} />
</main>
