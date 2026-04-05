/**
 * ABOUTME: Chrome sidePanel adapter -- opens side panel when extension icon is clicked.
 * ABOUTME: Uses chrome.sidePanel.setPanelBehavior (Chrome 114+, MV3 only).
 */
import type { SidebarHost } from '../../ports/sidebar-host';

export class ChromeSidebarHost implements SidebarHost {
  initialize(): void {
    // @ts-expect-error -- chrome.sidePanel not in WXT's browser types yet
    globalThis.chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
}
