/**
 * ABOUTME: Chrome sidePanel adapter -- opens side panel when extension icon is clicked.
 * ABOUTME: Uses chrome.sidePanel.setPanelBehavior (Chrome 114+, MV3 only).
 */
import type { SidebarHost } from '../../ports/sidebar-host';

// chrome.sidePanel is not in WXT's browser types yet.
interface SidePanelApi {
  setPanelBehavior(options: { openPanelOnActionClick: boolean }): void;
  open(options: { tabId: number }): Promise<void>;
}

function sidePanel(): SidePanelApi {
  return (globalThis as unknown as { chrome: { sidePanel: SidePanelApi } }).chrome.sidePanel;
}

export class ChromeSidebarHost implements SidebarHost {
  initialize(): void {
    sidePanel().setPanelBehavior({ openPanelOnActionClick: true });
  }

  open(tabId: number): Promise<void> {
    return sidePanel().open({ tabId });
  }
}
