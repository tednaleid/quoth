/**
 * ABOUTME: Tab discovery and switching logic for the side panel -- uses browser.tabs.
 * ABOUTME: Implements the TabConnector port (src/ports/tab-connector.ts).
 */

import type {
  TabConnector,
  TabConnectorCallbacks,
  YouTubeTabInfo,
} from '../../ports/tab-connector';

const YOUTUBE_WATCH_PATTERN = /youtube\.com\/watch/;

function isYouTubeTab(tab: Browser.tabs.Tab): boolean {
  return !!tab.url?.match(YOUTUBE_WATCH_PATTERN);
}

/** Lists all open YouTube watch tabs for the tab selector UI. */
export async function listYouTubeTabs(): Promise<YouTubeTabInfo[]> {
  const tabs = await browser.tabs.query({});
  return tabs
    .filter((tab) => tab.id !== undefined && isYouTubeTab(tab))
    .map((tab) => ({
      id: tab.id as number,
      title: tab.title || tab.url || 'YouTube',
      url: tab.url || '',
      active: !!tab.active,
    }));
}

async function findActiveYouTubeTab(): Promise<number | null> {
  const tabs = await browser.tabs.query({ active: true });
  const ytTab = tabs.find(isYouTubeTab);
  return ytTab?.id ?? null;
}

async function findAnyYouTubeTab(): Promise<number | null> {
  const tabs = await browser.tabs.query({});
  const ytTab = tabs.find(isYouTubeTab);
  return ytTab?.id ?? null;
}

function notifyConnect(tabId: number, callbacks: TabConnectorCallbacks): void {
  callbacks.onConnect(tabId);
  if (callbacks.sendMessage) {
    callbacks.sendMessage(tabId, { type: 'request-state' });
  }
}

async function emitTabs(callbacks: TabConnectorCallbacks): Promise<void> {
  if (callbacks.onTabsChanged) {
    callbacks.onTabsChanged(await listYouTubeTabs());
  }
}

export const setupTabConnector: TabConnector = async (callbacks: TabConnectorCallbacks) => {
  let connectedTabId: number | null = null;

  function connectIfYouTube(tab: Browser.tabs.Tab): void {
    // A manually pinned tab suppresses follow-active auto-switching.
    if (callbacks.isPinned?.()) return;
    if (isYouTubeTab(tab) && tab.id !== undefined && tab.id !== connectedTabId) {
      connectedTabId = tab.id;
      notifyConnect(tab.id, callbacks);
    }
  }

  const onActivated = async (activeInfo: { tabId: number; windowId: number }) => {
    const tab = await browser.tabs.get(activeInfo.tabId);
    connectIfYouTube(tab);
    await emitTabs(callbacks);
  };

  // Fires when a tab's URL changes (navigation within an existing tab)
  const onUpdated = (
    _tabId: number,
    changeInfo: { url?: string; status?: string },
    tab: Browser.tabs.Tab,
  ) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      connectIfYouTube(tab);
      void emitTabs(callbacks);
    }
  };

  const onRemoved = () => {
    void emitTabs(callbacks);
  };

  browser.tabs.onActivated.addListener(onActivated);
  browser.tabs.onUpdated.addListener(onUpdated);
  browser.tabs.onRemoved.addListener(onRemoved);

  // Prefer the active YouTube tab; fall back to any YouTube tab
  const activeTabId = await findActiveYouTubeTab();
  if (activeTabId !== null) {
    connectedTabId = activeTabId;
    notifyConnect(activeTabId, callbacks);
  } else {
    const tabId = await findAnyYouTubeTab();
    if (tabId !== null) {
      connectedTabId = tabId;
      notifyConnect(tabId, callbacks);
    }
  }
  await emitTabs(callbacks);

  return () => {
    browser.tabs.onActivated.removeListener(onActivated);
    browser.tabs.onUpdated.removeListener(onUpdated);
    browser.tabs.onRemoved.removeListener(onRemoved);
  };
};
