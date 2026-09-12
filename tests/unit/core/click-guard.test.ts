/**
 * ABOUTME: Tests for the click-vs-drag guard (seek vs text selection).
 * ABOUTME: Clicking seeks; drag-selecting text must not seek or snap.
 */
import { describe, it, expect } from 'vitest';
import { shouldSeekOnClick } from '../../../src/core/click-guard';

describe('shouldSeekOnClick', () => {
  it('returns true for a plain click with collapsed selection', () => {
    expect(shouldSeekOnClick({ x: 10, y: 10 }, { x: 11, y: 10 }, true)).toBe(true);
  });

  it('returns false when text is selected (non-collapsed selection)', () => {
    expect(shouldSeekOnClick({ x: 10, y: 10 }, { x: 11, y: 10 }, false)).toBe(false);
  });

  it('returns false when the pointer dragged beyond the threshold', () => {
    expect(shouldSeekOnClick({ x: 10, y: 10 }, { x: 100, y: 10 }, true)).toBe(false);
  });

  it('returns false when the pointer dragged with a selection', () => {
    expect(shouldSeekOnClick({ x: 10, y: 10 }, { x: 100, y: 50 }, false)).toBe(false);
  });
});
