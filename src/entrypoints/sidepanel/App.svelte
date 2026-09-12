<script lang="ts">
  import {
    createInitialState,
    handleMessage,
    type TranscriptState,
  } from '../../core/message-handler';
  import { setupTabConnector } from '../../adapters/browser/tab-connector';
  import type { TabConnection, YouTubeTabInfo } from '../../ports/tab-connector';
  import { SettingsStorage } from '../../adapters/browser/settings-storage';
  import { copyTextToClipboard } from '../../adapters/browser/clipboard';
  import {
    formatPlainText,
    formatWithTimestamps,
    formatWithMarkdownLinks,
  } from '../../core/transcript-export';
  import {
    DEFAULT_SETTINGS,
    hexToRgbString,
    type CopyFormat,
    type HighlightSettings,
  } from '../../core/settings';
  import type { ContentMessage, SidePanelMessage } from '../../messages';
  import { isSeek } from '../../core/seek-detector';
  import Header from './components/Header.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import TabSelector from './components/TabSelector.svelte';
  import TranscriptView from './components/TranscriptView.svelte';

  let state: TranscriptState = $state(createInitialState());
  let autoScroll = $state(true);
  let settings: HighlightSettings = $state({ ...DEFAULT_SETTINGS });
  let settingsOpen = $state(false);
  let lastTimeMs: number | null = $state(null);
  let forceSnapToken = $state(0);

  // Track the YouTube tab we're connected to (for message filtering and seeking)
  let youtubeTabId: number | null = $state(null);
  // Follow-active (default) vs pinned to a manually selected tab.
  let followActive = $state(true);
  let availableTabs: YouTubeTabInfo[] = $state([]);
  let toast: { message: string; error: boolean } | null = $state(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

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

  function showToast(message: string, error = false) {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, error };
    toastTimer = setTimeout(() => {
      toast = null;
      toastTimer = null;
    }, 2500);
  }

  // The connector owns which tab is connected; the panel only asks it to pin or follow.
  let connection: TabConnection | null = null;

  function handlePinTab(tabId: number) {
    followActive = false;
    connection?.pin(tabId);
  }

  function handleToggleFollow() {
    followActive = true;
    connection?.follow().catch((err) => {
      console.warn('[quoth sidebar] failed to follow active tab:', err);
    });
  }

  function buildCopyText(): string {
    const { words, segments } = state;
    const videoId = state.videoInfo?.videoId ?? '';
    if (settings.copyFormat === 'plain') return formatPlainText(words, segments);
    if (settings.copyFormat === 'timestamps') return formatWithTimestamps(words, segments);
    return formatWithMarkdownLinks(words, segments, videoId);
  }

  async function handleCopy() {
    if (state.words.length === 0) {
      showToast('Nothing to copy yet', true);
      return;
    }
    try {
      await copyTextToClipboard(buildCopyText());
      showToast('Transcript copied to clipboard!');
    } catch (err) {
      console.warn('[quoth sidebar] copy failed:', err);
      showToast('Copy failed — select the text manually', true);
    }
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
    copyFormat={settings.copyFormat}
    onCopyFormatChange={(format: CopyFormat) => updateSettings({ ...settings, copyFormat: format })}
    onCopy={handleCopy}
    copyDisabled={state.words.length === 0}
  />

  <TabSelector
    tabs={availableTabs}
    selectedTabId={youtubeTabId}
    {followActive}
    onSelectTab={handlePinTab}
    onToggleFollow={handleToggleFollow}
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

  {#if toast}
    <div class="toast" class:error={toast.error} role="status">
      {toast.message}
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
    position: relative;
  }

  .placeholder {
    flex: 1;
    padding: 12px;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .toast {
    position: absolute;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: #fff;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
    white-space: nowrap;
    z-index: 10;
  }

  .toast.error {
    background: #7a2a2a;
  }
</style>
