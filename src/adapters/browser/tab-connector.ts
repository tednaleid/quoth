/**
 * ABOUTME: Tab discovery and switching logic for the side panel -- uses browser.tabs.
 * ABOUTME: Implements the TabConnector port (src/ports/tab-connector.ts).
 */

import type { TabConnector, TabConnectorCallbacks } from '../../ports/tab-connector';

const YOUTUBE_WATCH_PATTERN = /youtube\.com\/watch/;

function isYouTubeTab(tab: Browser.tabs.Tab): boolean {
  return !!tab.url?.match(YOUTUBE_WATCH_PATTERN);
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

export const setupTabConnector: TabConnector = async (callbacks: TabConnectorCallbacks) => {
  let connectedTabId: number | null = null;

  function connectIfYouTube(tab: Browser.tabs.Tab): void {
    if (isYouTubeTab(tab) && tab.id !== undefined && tab.id !== connectedTabId) {
      connectedTabId = tab.id;
      notifyConnect(tab.id, callbacks);
    }
  }

  const onActivated = async (activeInfo: { tabId: number; windowId: number }) => {
    const tab = await browser.tabs.get(activeInfo.tabId);
    connectIfYouTube(tab);
  };

  // Fires when a tab's URL changes (navigation within an existing tab)
  const onUpdated = (
    _tabId: number,
    changeInfo: { url?: string; status?: string },
    tab: Browser.tabs.Tab,
  ) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      connectIfYouTube(tab);
    }
  };

  browser.tabs.onActivated.addListener(onActivated);
  browser.tabs.onUpdated.addListener(onUpdated);

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

  return () => {
    browser.tabs.onActivated.removeListener(onActivated);
    browser.tabs.onUpdated.removeListener(onUpdated);
  };
};
