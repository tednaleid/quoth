/**
 * ABOUTME: Port interface for browser sidebar/side panel lifecycle.
 * ABOUTME: Implementations: ChromeSidebarHost (sidePanel API), FirefoxSidebarHost (sidebarAction API).
 */

export interface SidebarHost {
  initialize(): void;
}
