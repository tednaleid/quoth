/**
 * ABOUTME: Port interface for connecting a popout tab to a specific YouTube tab.
 * ABOUTME: Unlike TabConnector (follows active tab), this stays pinned to one tab and detects disconnection.
 */

import type { SidePanelMessage } from '../messages';

export type DisconnectReason = 'tab-closed' | 'navigated-away';

export interface PinnedTabConnectorCallbacks {
  /** Called immediately when the connector attaches to the pinned tab. */
  onConnect: (tabId: number) => void;
  /** Called when the pinned tab closes or navigates away from YouTube. */
  onDisconnect: (reason: DisconnectReason) => void;
  /** Optional: called after onConnect so the popout can request current state. */
  sendMessage?: (tabId: number, message: SidePanelMessage) => void;
}

/**
 * Sets up a pinned tab connector: immediately connects to the given tabId,
 * monitors for tab removal or navigation away from YouTube, and invokes
 * onDisconnect when the connection is lost. Returns a cleanup function.
 */
export type PinnedTabConnector = (
  tabId: number,
  callbacks: PinnedTabConnectorCallbacks,
) => Promise<() => void>;
