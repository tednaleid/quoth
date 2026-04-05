/**
 * ABOUTME: Tests for SidebarHost factory.
 * ABOUTME: Verifies correct adapter is returned based on browser target string.
 */
import { describe, it, expect } from 'vitest';
import { createSidebarHost } from '../../../src/adapters/sidebar-host-factory';
import { ChromeSidebarHost } from '../../../src/adapters/chrome/sidebar-host';

describe('createSidebarHost', () => {
  it('returns ChromeSidebarHost for "chrome" browser', () => {
    const host = createSidebarHost('chrome');
    expect(host).toBeInstanceOf(ChromeSidebarHost);
  });

  it('returns ChromeSidebarHost as default for unknown browser', () => {
    const host = createSidebarHost('unknown');
    expect(host).toBeInstanceOf(ChromeSidebarHost);
  });
});
