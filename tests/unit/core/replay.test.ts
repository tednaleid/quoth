/**
 * ABOUTME: Tests for the request-state replay decision (fast tab switching).
 * ABOUTME: A tab that already loaded its video replays cached messages with no network.
 */
import { describe, it, expect } from 'vitest';
import { shouldReplayCached } from '../../../src/core/replay';

describe('shouldReplayCached', () => {
  it('replays when the cached video matches the page and has a payload', () => {
    expect(shouldReplayCached('abc', true, 'abc')).toBe(true);
  });

  it('refetches when nothing is cached yet', () => {
    expect(shouldReplayCached(null, false, 'abc')).toBe(false);
  });

  it('refetches when the page video differs from the cache', () => {
    expect(shouldReplayCached('abc', true, 'xyz')).toBe(false);
  });

  it('refetches when the cache has no payload (previous fetch never finished)', () => {
    expect(shouldReplayCached('abc', false, 'abc')).toBe(false);
  });

  it('refetches when the page has no video id', () => {
    expect(shouldReplayCached('abc', true, null)).toBe(false);
  });
});
