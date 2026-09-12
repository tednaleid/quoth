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

/** Why the connector lost its tab without connecting to another one. */
export type TabDisconnectReason = 'no-tabs' | 'pinned-tab-closed';

export interface TabConnectorCallbacks {
  /** Called when the side panel connects to a YouTube tab (initial, switch, or pin). */
  onConnect: (tabId: number) => void;
  /** Optional: called after onConnect so the side panel can request current state. */
  sendMessage?: (tabId: number, message: SidePanelMessage) => void;
  /** Optional: called with the full YouTube tab list on startup and on tab changes. */
  onTabsChanged?: (tabs: YouTubeTabInfo[]) => void;
  /** Optional: called when the connected tab closes or leaves YouTube and nothing replaces it. */
  onDisconnect?: (reason: TabDisconnectReason) => void;
}

/** Handle returned by the connector; the single owner of which tab is connected. */
export interface TabConnection {
  /** Connects to a specific tab and stops following the active tab. */
  pin(tabId: number): void;
  /** Resumes following the active tab, reconnecting to it if it is a YouTube watch page. */
  follow(): Promise<void>;
  /** Removes the tab listeners. */
  cleanup(): void;
}

/**
 * Sets up a tab connector for the side panel: finds a YouTube tab, invokes the
 * onConnect callback, and listens for tab activations to switch between YouTube
 * tabs while following. Returns a handle for pinning, following, and cleanup.
 */
export type TabConnector = (callbacks: TabConnectorCallbacks) => Promise<TabConnection>;
