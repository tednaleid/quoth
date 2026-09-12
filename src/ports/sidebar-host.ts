/**
 * ABOUTME: Port interface for browser sidebar/side panel lifecycle.
 * ABOUTME: Implementations: ChromeSidebarHost (sidePanel API), FirefoxSidebarHost (sidebarAction API).
 */

export interface SidebarHost {
  initialize(): void;
  /**
   * Opens the docked sidebar for a tab. Browsers only allow this in response
   * to a user gesture, so it rejects when called without one.
   */
  open(tabId: number): Promise<void>;
}
