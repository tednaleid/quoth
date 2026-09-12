/**
 * ABOUTME: Tests for pure transcript export formatters (copy feature).
 * ABOUTME: Covers plain text, timestamped, and markdown-link formats.
 */
import { describe, it, expect } from 'vitest';
import {
  formatPlainText,
  formatWithTimestamps,
  formatWithMarkdownLinks,
} from '../../../src/core/transcript-export';
import type { TimedWord } from '../../../src/core/types';
import type { WordSegment } from '../../../src/core/playback-sync';

const words: TimedWord[] = [
  { text: 'Hello', start: 0, end: 500, original: 'Hello' },
  { text: 'world.', start: 500, end: 1000, original: 'world.' },
  { text: 'Second', start: 61000, end: 61500, original: 'Second' },
  { text: 'para.', start: 61500, end: 62000, original: 'para.' },
];

const segments: WordSegment[] = [
  { startIndex: 0, endIndex: 1, startTime: 0, endTime: 1000 },
  { startIndex: 2, endIndex: 3, startTime: 61000, endTime: 62000 },
];

describe('formatPlainText', () => {
  it('joins words per segment with blank-line separated paragraphs', () => {
    expect(formatPlainText(words, segments)).toBe('Hello world.\n\nSecond para.');
  });

  it('returns empty string for empty segments', () => {
    expect(formatPlainText([], [])).toBe('');
  });
});

describe('formatWithTimestamps', () => {
  it('prefixes each paragraph with [m:ss]', () => {
    expect(formatWithTimestamps(words, segments)).toBe(
      '[0:00] Hello world.\n\n[1:01] Second para.',
    );
  });

  it('uses h:mm:ss for hour-long timestamps', () => {
    const w: TimedWord[] = [{ text: 'Hi', start: 3661000, end: 3662000, original: 'Hi' }];
    const s: WordSegment[] = [{ startIndex: 0, endIndex: 0, startTime: 3661000, endTime: 3662000 }];
    expect(formatWithTimestamps(w, s)).toBe('[1:01:01] Hi');
  });
});

describe('formatWithMarkdownLinks', () => {
  it('prefixes each paragraph with a clickable YouTube timestamp link', () => {
    expect(formatWithMarkdownLinks(words, segments, 'abc123')).toBe(
      '[[0:00](https://youtube.com/watch?v=abc123&t=0)] Hello world.\n\n' +
        '[[1:01](https://youtube.com/watch?v=abc123&t=61)] Second para.',
    );
  });
});
