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

const TAB_TITLE_SUFFIX = / - YouTube$/;

/** Lists all open YouTube watch tabs for the tab picker, with the browser's " - YouTube" suffix removed. */
export async function listYouTubeTabs(): Promise<YouTubeTabInfo[]> {
  const tabs = await browser.tabs.query({});
  return tabs
    .filter((tab) => tab.id !== undefined && isYouTubeTab(tab))
    .map((tab) => ({
      id: tab.id as number,
      title: (tab.title || tab.url || 'YouTube').replace(TAB_TITLE_SUFFIX, ''),
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

export const setupTabConnector: TabConnector = async (callbacks: TabConnectorCallbacks) => {
  let connectedTabId: number | null = null;
  let following = true;

  function connect(tabId: number): void {
    connectedTabId = tabId;
    callbacks.onConnect(tabId);
    if (callbacks.sendMessage) {
      callbacks.sendMessage(tabId, { type: 'request-state' });
    }
  }

  function connectIfYouTube(tab: Browser.tabs.Tab): void {
    if (!following) return;
    if (isYouTubeTab(tab) && tab.id !== undefined && tab.id !== connectedTabId) {
      connect(tab.id);
    }
  }

  // Re-emits the tab list and handles the connected tab disappearing from it.
  async function refreshTabs(): Promise<void> {
    const tabs = await listYouTubeTabs();
    if (callbacks.onTabsChanged) {
      callbacks.onTabsChanged(tabs);
    }
    if (connectedTabId === null || tabs.some((t) => t.id === connectedTabId)) return;
    connectedTabId = null;
    if (!following) {
      callbacks.onDisconnect?.('pinned-tab-closed');
      return;
    }
    const next = tabs.find((t) => t.active) ?? tabs[0];
    if (next) {
      connect(next.id);
    } else {
      callbacks.onDisconnect?.('no-tabs');
    }
  }

  const onActivated = async (activeInfo: { tabId: number; windowId: number }) => {
    const tab = await browser.tabs.get(activeInfo.tabId);
    connectIfYouTube(tab);
    await refreshTabs();
  };

  // Fires when a tab's URL changes (navigation within an existing tab)
  const onUpdated = async (
    _tabId: number,
    changeInfo: { url?: string; status?: string },
    tab: Browser.tabs.Tab,
  ) => {
    if (changeInfo.url || changeInfo.status === 'complete') {
      connectIfYouTube(tab);
      await refreshTabs();
    }
  };

  const onRemoved = async () => {
    await refreshTabs();
  };

  browser.tabs.onActivated.addListener(onActivated);
  browser.tabs.onUpdated.addListener(onUpdated);
  browser.tabs.onRemoved.addListener(onRemoved);

  // Prefer the active YouTube tab; fall back to any YouTube tab
  const initialTabId = (await findActiveYouTubeTab()) ?? (await findAnyYouTubeTab());
  if (initialTabId !== null) {
    connect(initialTabId);
  }
  await refreshTabs();

  return {
    pin(tabId: number) {
      following = false;
      connect(tabId);
    },
    async follow() {
      following = true;
      // Prefer the active YouTube tab; with nothing connected, any YouTube tab will do.
      const targetTabId =
        (await findActiveYouTubeTab()) ??
        (connectedTabId === null ? await findAnyYouTubeTab() : null);
      if (targetTabId !== null && targetTabId !== connectedTabId) {
        connect(targetTabId);
      }
    },
    cleanup() {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
    },
  };
};
