/**
 * ABOUTME: Factory that returns the correct SidebarHost adapter for the target browser.
 * ABOUTME: Called from background.ts with import.meta.env.BROWSER at build time.
 */
import type { SidebarHost } from '../ports/sidebar-host';
import { ChromeSidebarHost } from './chrome/sidebar-host';
import { FirefoxSidebarHost } from './firefox/sidebar-host';

export function createSidebarHost(browser: string): SidebarHost {
  if (browser === 'firefox') {
    return new FirefoxSidebarHost();
  }
  return new ChromeSidebarHost();
}
