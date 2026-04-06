/**
 * ABOUTME: Firefox sidebarAction adapter -- toggles sidebar when extension icon is clicked.
 * ABOUTME: Uses browser.sidebarAction.toggle() (Firefox 109+, MV2 and MV3).
 */
import type { SidebarHost } from '../../ports/sidebar-host';

export class FirefoxSidebarHost implements SidebarHost {
  initialize(): void {
    // browserAction requires a browser_action manifest key. Firefox may or may not
    // expose it depending on manifest config. Guard to avoid crashing the background.
    if (browser.browserAction?.onClicked) {
      browser.browserAction.onClicked.addListener(() => {
        // @ts-expect-error -- sidebarAction not in WXT's browser types yet
        browser.sidebarAction.toggle();
      });
    }
  }
}
