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
    const result = parseWatchParams('?v=dQw4w9WgXcQ&t=147');
    expect(result.initialTimeMs).toBe(147000);
  });

  it('returns 0 when t parameter is missing', () => {
    const result = parseWatchParams('?v=dQw4w9WgXcQ');
    expect(result.initialTimeMs).toBe(0);
  });

  it('returns 0 when t parameter is not a number', () => {
    const result = parseWatchParams('?v=dQw4w9WgXcQ&t=xyz');
    expect(result.initialTimeMs).toBe(0);
  });

  it('strips "s" suffix from t parameter (YouTube format)', () => {
    const result = parseWatchParams('?v=dQw4w9WgXcQ&t=147s');
    expect(result.initialTimeMs).toBe(147000);
  });

  it('handles leading ? or no leading ?', () => {
    expect(parseWatchParams('v=dQw4w9WgXcQ').videoId).toBe('dQw4w9WgXcQ');
    expect(parseWatchParams('?v=dQw4w9WgXcQ').videoId).toBe('dQw4w9WgXcQ');
  });

  it('returns null videoId when v does not match YouTube format (too short)', () => {
    expect(parseWatchParams('?v=abc').videoId).toBeNull();
  });

  it('returns null videoId when v contains invalid characters', () => {
    expect(parseWatchParams('?v=abcde!fghij').videoId).toBeNull();
  });

  it('returns null videoId for path traversal attempt', () => {
    expect(parseWatchParams('?v=../evil/path').videoId).toBeNull();
  });

  it('accepts valid 11-character YouTube IDs with underscores and hyphens', () => {
    expect(parseWatchParams('?v=abc_DEF-123').videoId).toBe('abc_DEF-123');
  });
});
