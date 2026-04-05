/**
 * ABOUTME: Tests for watch-page URL parameter parsing.
 * ABOUTME: Covers videoId extraction, t parameter handling, and validation.
 */
import { describe, it, expect } from 'vitest';
import { parseWatchParams } from '../../../src/core/watch-url';

describe('parseWatchParams', () => {
  it('extracts videoId from v parameter', () => {
    const result = parseWatchParams('?v=YwZR6tc7qYg');
    expect(result.videoId).toBe('YwZR6tc7qYg');
  });

  it('returns null videoId when v is missing', () => {
    const result = parseWatchParams('');
    expect(result.videoId).toBeNull();
  });

  it('extracts t parameter as integer seconds', () => {
    const result = parseWatchParams('?v=abc&t=147');
    expect(result.initialTimeMs).toBe(147000);
  });

  it('returns 0 when t parameter is missing', () => {
    const result = parseWatchParams('?v=abc');
    expect(result.initialTimeMs).toBe(0);
  });

  it('returns 0 when t parameter is not a number', () => {
    const result = parseWatchParams('?v=abc&t=xyz');
    expect(result.initialTimeMs).toBe(0);
  });

  it('strips "s" suffix from t parameter (YouTube format)', () => {
    const result = parseWatchParams('?v=abc&t=147s');
    expect(result.initialTimeMs).toBe(147000);
  });

  it('handles leading ? or no leading ?', () => {
    expect(parseWatchParams('v=abc').videoId).toBe('abc');
    expect(parseWatchParams('?v=abc').videoId).toBe('abc');
  });
});
