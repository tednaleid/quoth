/**
 * ABOUTME: Factory that returns the correct SidebarHost adapter for the target browser.
 * ABOUTME: Called from background.ts with import.meta.env.BROWSER at build time.
 */
import type { SidebarHost } from '../ports/sidebar-host';
import { ChromeSidebarHost } from './chrome/sidebar-host';

export function createSidebarHost(_browser: string): SidebarHost {
  // Firefox adapter added in Task 2
  return new ChromeSidebarHost();
}
