/**
 * ABOUTME: Tab discovery and switching logic for the side panel.
 * ABOUTME: Finds the active YouTube tab on startup and tracks tab activations.
 */

import type { SidePanelMessage } from '../../messages';

export interface TabConnectorCallbacks {
  onConnect: (tabId: number) => void;
  sendMessage?: (tabId: number, message: SidePanelMessage) => void;
}

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

export async function setupTabConnector(callbacks: TabConnectorCallbacks): Promise<() => void> {
  let connectedTabId: number | null = null;

  const onActivated = async (activeInfo: { tabId: number; windowId: number }) => {
    const tab = await browser.tabs.get(activeInfo.tabId);
    if (isYouTubeTab(tab) && tab.id !== undefined) {
      if (tab.id !== connectedTabId) {
        connectedTabId = tab.id;
        notifyConnect(tab.id, callbacks);
      }
    }
  };

  browser.tabs.onActivated.addListener(onActivated);

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
  };
}
