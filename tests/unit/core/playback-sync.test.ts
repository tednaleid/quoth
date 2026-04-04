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
  it('groups into 3 segments with gapThresholdMs=2000', () => {
    const segments = groupWordsIntoSegments(words, 2000);
    expect(segments).toHaveLength(3);
    expect(segments[0].startIndex).toBe(0);
    expect(segments[0].endIndex).toBe(3);
    expect(segments[1].startIndex).toBe(4);
    expect(segments[1].endIndex).toBe(6);
    expect(segments[2].startIndex).toBe(7);
    expect(segments[2].endIndex).toBe(8);
  });

  it('returns empty array for empty words', () => {
    expect(groupWordsIntoSegments([], 2000)).toEqual([]);
  });

  it('puts all close words in one segment when gap threshold is large', () => {
    const segments = groupWordsIntoSegments(words, 100000);
    expect(segments).toHaveLength(1);
    expect(segments[0].startIndex).toBe(0);
    expect(segments[0].endIndex).toBe(8);
  });
});
