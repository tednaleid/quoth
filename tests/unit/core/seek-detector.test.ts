/**
 * ABOUTME: Tests for the seek-detector pure helper.
 * ABOUTME: Verifies time-delta seek detection with boundary cases and playback rates.
 */
import { describe, it, expect } from 'vitest';
import { isSeek } from '../../../src/core/seek-detector';

describe('isSeek', () => {
  it('returns false when previousTimeMs is null (first tick)', () => {
    expect(isSeek(null, 5000)).toBe(false);
  });

  it('returns false for a small forward delta (normal 100ms tick)', () => {
    expect(isSeek(1000, 1100)).toBe(false);
  });

  it('returns false for 2x playback tick (~200ms delta)', () => {
    expect(isSeek(1000, 1200)).toBe(false);
  });

  it('returns false at exactly the threshold boundary (750ms)', () => {
    expect(isSeek(1000, 1750)).toBe(false);
  });

  it('returns true just above the threshold (751ms)', () => {
    expect(isSeek(1000, 1751)).toBe(true);
  });

  it('returns true for a large forward jump', () => {
    expect(isSeek(1000, 60000)).toBe(true);
  });

  it('returns true for a backward jump beyond threshold', () => {
    expect(isSeek(10000, 8000)).toBe(true);
  });

  it('returns false for a small backward delta within threshold', () => {
    expect(isSeek(10000, 9500)).toBe(false);
  });

  it('returns false when time is unchanged (paused video)', () => {
    expect(isSeek(5000, 5000)).toBe(false);
  });

  it('respects a custom threshold', () => {
    expect(isSeek(1000, 1400, 500)).toBe(false);
    expect(isSeek(1000, 1501, 500)).toBe(true);
  });
});
