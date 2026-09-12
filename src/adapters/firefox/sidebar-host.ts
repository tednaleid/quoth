/**
 * ABOUTME: Firefox sidebarAction adapter -- toggles sidebar when extension icon is clicked.
 * ABOUTME: Uses browser.sidebarAction (Firefox 109+, MV2 and MV3).
 */
import type { SidebarHost } from '../../ports/sidebar-host';

// browser.sidebarAction is not in WXT's browser types yet.
interface SidebarActionApi {
  toggle(): Promise<void>;
  open(): Promise<void>;
}

function sidebarAction(): SidebarActionApi {
  return (browser as unknown as { sidebarAction: SidebarActionApi }).sidebarAction;
}

export class FirefoxSidebarHost implements SidebarHost {
  initialize(): void {
    browser.browserAction.onClicked.addListener(() => {
      void sidebarAction().toggle();
    });
  }

  open(_tabId: number): Promise<void> {
    return sidebarAction().open();
  }
}
