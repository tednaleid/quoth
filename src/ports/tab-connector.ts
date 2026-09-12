/**
 * ABOUTME: Port interface for connecting the side panel to its YouTube tab.
 * ABOUTME: Implementation: src/adapters/browser/tab-connector.ts (uses browser.tabs).
 */

import type { SidePanelMessage } from '../messages';

/** Minimal info about an open YouTube tab for the tab selector UI. */
export interface YouTubeTabInfo {
  id: number;
  title: string;
  url: string;
  active: boolean;
}

export interface TabConnectorCallbacks {
  /** Called when the side panel connects to a YouTube tab (initial or switch). */
  onConnect: (tabId: number) => void;
  /** Optional: called after onConnect so the side panel can request current state. */
  sendMessage?: (tabId: number, message: SidePanelMessage) => void;
  /** Optional: called with the full YouTube tab list on startup and on tab changes. */
  onTabsChanged?: (tabs: YouTubeTabInfo[]) => void;
  /** Optional: when true, follow-active auto-switching is suppressed (pinned tab). */
  isPinned?: () => boolean;
}

/**
 * Sets up a tab connector for the side panel: finds a YouTube tab, invokes the
 * onConnect callback, and listens for tab activations to switch between YouTube
 * tabs. Returns a cleanup function that removes the activation listener.
 */
export type TabConnector = (callbacks: TabConnectorCallbacks) => Promise<() => void>;
