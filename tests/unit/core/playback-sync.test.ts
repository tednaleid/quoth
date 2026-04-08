import { describe, it, expect } from 'vitest';
import { findActiveWordIndex, groupWordsIntoSegments } from '../../../src/core/playback-sync';
import type { TimedWord } from '../../../src/core/types';

const words: TimedWord[] = [
  { text: 'welcome', start: 1000, end: 1500, original: 'welcome' },
  { text: 'to', start: 1500, end: 1800, original: 'to' },
  { text: 'the', start: 1800, end: 2000, original: 'the' },
  { text: 'show', start: 2000, end: 2500, original: 'show' },
  { text: 'today', start: 5000, end: 5500, original: 'today' },
  { text: 'we', start: 5500, end: 5800, original: 'we' },
  { text: 'talk', start: 5800, end: 6200, original: 'talk' },
  { text: 'about', start: 8000, end: 8500, original: 'about' },
  { text: 'things', start: 8500, end: 9000, original: 'things' },
];

describe('findActiveWordIndex', () => {
  it('returns -1 before any words start', () => {
    expect(findActiveWordIndex(words, 0)).toBe(-1);
  });

  it('finds active word at exact start time', () => {
    expect(findActiveWordIndex(words, 1000)).toBe(0);
  });

  it('finds active word mid-way through a word', () => {
    expect(findActiveWordIndex(words, 1600)).toBe(1);
  });

  it('finds word in later segment', () => {
    expect(findActiveWordIndex(words, 5200)).toBe(4);
  });

  it('returns last word index after all words end', () => {
    expect(findActiveWordIndex(words, 99999)).toBe(8);
  });

  it('handles gaps between segments', () => {
    // time=3000 is after show (end=2500) but before today (start=5000)
    // should return index 3 (show), the last word whose start <= 3000
    expect(findActiveWordIndex(words, 3000)).toBe(3);
  });
});

describe('groupWordsIntoSegments', () => {
  it('returns empty array for empty words', () => {
    expect(groupWordsIntoSegments([], 2000)).toEqual([]);
  });

  it('keeps short transcript as a single segment', () => {
    const segments = groupWordsIntoSegments(words, 2000);
    // 9 words is below the minimum segment size, so no breaks
    expect(segments).toHaveLength(1);
    expect(segments[0].startIndex).toBe(0);
    expect(segments[0].endIndex).toBe(8);
  });

  it('breaks at sentence ends when length pressure builds up', () => {
    // 160 words with uniform timing, sentences every 50 words
    const longWords: TimedWord[] = Array.from({ length: 160 }, (_, i) => {
      const text = i > 0 && (i + 1) % 50 === 0 ? `end.` : `word${i}`;
      return { text, start: i * 200, end: (i + 1) * 200, original: text };
    });
    const segments = groupWordsIntoSegments(longWords, 2000);
    // Should break at sentence boundaries as length pressure increases
    expect(segments.length).toBeGreaterThan(1);
    // Every segment boundary should be at a sentence end
    for (let i = 0; i < segments.length - 1; i++) {
      expect(longWords[segments[i].endIndex].text).toMatch(/[.!?]$/);
    }
  });

  it('breaks at large gaps with sentence ends even in shorter segments', () => {
    // 60 words: first 30 tightly packed, then a big pause, then 30 more
    const gapWords: TimedWord[] = Array.from({ length: 60 }, (_, i) => {
      const text = i === 29 ? 'pause.' : `w${i}`;
      // First 30 words: 100ms apart. Then a 5000ms gap. Then 100ms apart again.
      const start = i <= 29 ? i * 100 : 29 * 100 + 5000 + (i - 30) * 100;
      return { text, start, end: start + 100, original: text };
    });
    const segments = groupWordsIntoSegments(gapWords, 2000);
    // The 5000ms gap + sentence end should trigger a break
    expect(segments.length).toBeGreaterThan(1);
    expect(segments[0].endIndex).toBe(29);
  });

  it('does not split short segments even if they have sentence endings', () => {
    const shortWords: TimedWord[] = [
      { text: 'Hello.', start: 0, end: 100, original: 'Hello.' },
      { text: 'World.', start: 100, end: 200, original: 'World.' },
      { text: 'Done.', start: 200, end: 300, original: 'Done.' },
    ];
    const segments = groupWordsIntoSegments(shortWords, 2000);
    expect(segments).toHaveLength(1);
  });
});
