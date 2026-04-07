/**
 * ABOUTME: Pinned tab connector -- monitors a specific YouTube tab for closure or navigation.
 * ABOUTME: Implements the PinnedTabConnector port (src/ports/pinned-tab-connector.ts).
 */

import type {
  PinnedTabConnector,
  PinnedTabConnectorCallbacks,
} from '../../ports/pinned-tab-connector';

const YOUTUBE_WATCH_PATTERN = /youtube\.com\/watch/;

export const setupPinnedTabConnector: PinnedTabConnector = async (
  tabId: number,
  callbacks: PinnedTabConnectorCallbacks,
) => {
  callbacks.onConnect(tabId);
  if (callbacks.sendMessage) {
    callbacks.sendMessage(tabId, { type: 'request-state' });
  }

  const onRemoved = (removedTabId: number) => {
    if (removedTabId === tabId) {
      callbacks.onDisconnect('tab-closed');
    }
  };

  const onUpdated = (updatedTabId: number, changeInfo: { url?: string }) => {
    if (updatedTabId === tabId && changeInfo.url !== undefined) {
      if (!YOUTUBE_WATCH_PATTERN.test(changeInfo.url)) {
        callbacks.onDisconnect('navigated-away');
      }
    }
  };

  browser.tabs.onRemoved.addListener(onRemoved);
  browser.tabs.onUpdated.addListener(onUpdated);

  return () => {
    browser.tabs.onRemoved.removeListener(onRemoved);
    browser.tabs.onUpdated.removeListener(onUpdated);
  };
};
