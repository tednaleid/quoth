import { describe, it, expect } from 'vitest';
import {
  findActiveWordIndex,
  findHorizonWindow,
  groupWordsIntoSegments,
  horizonIntensity,
} from '../../../src/core/playback-sync';
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

describe('horizonIntensity', () => {
  // Helper: make a word with only its start time meaningful for the intensity function.
  const wordAt = (startMs: number): TimedWord => ({
    text: 'w',
    start: startMs,
    end: startMs + 500,
    original: 'w',
  });

  describe('future (approaching) words', () => {
    it('is 1.0 at the exact start time', () => {
      expect(horizonIntensity(wordAt(10_000), 10_000)).toBe(1.0);
    });

    it('is 1.0 within the full-intensity window (0 < d < 1.5s)', () => {
      expect(horizonIntensity(wordAt(10_500), 10_000)).toBe(1.0);
      expect(horizonIntensity(wordAt(11_499), 10_000)).toBe(1.0);
    });

    it('is 1.0 at the 1.5s knee (ramp begin)', () => {
      expect(horizonIntensity(wordAt(11_500), 10_000)).toBe(1.0);
    });

    it('is 0.75 at the 1.5s-3s midpoint (d=2.25s)', () => {
      expect(horizonIntensity(wordAt(12_250), 10_000)).toBeCloseTo(0.75);
    });

    it('is 0.5 at the 3s knee', () => {
      expect(horizonIntensity(wordAt(13_000), 10_000)).toBeCloseTo(0.5);
    });

    it('is 0.25 at the 3s-10s midpoint (d=6.5s)', () => {
      expect(horizonIntensity(wordAt(16_500), 10_000)).toBeCloseTo(0.25);
    });

    it('approaches 0 just before the 10s knee', () => {
      expect(horizonIntensity(wordAt(19_999), 10_000)).toBeCloseTo(0.0, 3);
    });

    it('is 0 at the 10s knee', () => {
      expect(horizonIntensity(wordAt(20_000), 10_000)).toBe(0);
    });

    it('is 0 well beyond the 10s future window', () => {
      expect(horizonIntensity(wordAt(30_000), 10_000)).toBe(0);
    });
  });

  describe('past (decaying) words', () => {
    it('is 1.0 within the 0.75s past-full window', () => {
      expect(horizonIntensity(wordAt(9_500), 10_000)).toBe(1.0);
      expect(horizonIntensity(wordAt(9_251), 10_000)).toBe(1.0);
    });

    it('is 1.0 at the 0.75s knee (ramp begin)', () => {
      expect(horizonIntensity(wordAt(9_250), 10_000)).toBe(1.0);
    });

    it('is 0.75 at the 0.75s-1.5s midpoint (d=1.125s)', () => {
      expect(horizonIntensity(wordAt(8_875), 10_000)).toBeCloseTo(0.75);
    });

    it('is 0.5 at the 1.5s knee', () => {
      expect(horizonIntensity(wordAt(8_500), 10_000)).toBeCloseTo(0.5);
    });

    it('is 0.25 at the 1.5s-5s midpoint (d=3.25s)', () => {
      expect(horizonIntensity(wordAt(6_750), 10_000)).toBeCloseTo(0.25);
    });

    it('is 0 at the 5s knee', () => {
      expect(horizonIntensity(wordAt(5_000), 10_000)).toBe(0);
    });

    it('is 0 well beyond the 5s past window', () => {
      expect(horizonIntensity(wordAt(0), 10_000)).toBe(0);
    });
  });

  describe('asymmetry (past decays 2x faster than future ramps)', () => {
    // At 50% intensity, future boundary is at 3s out, past boundary is at 1.5s ago.
    // Confirming 2x asymmetry at the knee.
    it('50% intensity at +3s future equals 50% at -1.5s past', () => {
      const futureMid = horizonIntensity(wordAt(13_000), 10_000);
      const pastMid = horizonIntensity(wordAt(8_500), 10_000);
      expect(futureMid).toBeCloseTo(pastMid);
      expect(futureMid).toBeCloseTo(0.5);
    });
  });
});

describe('findHorizonWindow', () => {
  // Words spaced 1s apart so time<->index math is easy.
  const spacedWords: TimedWord[] = Array.from({ length: 60 }, (_, i) => ({
    text: `w${i}`,
    start: i * 1000,
    end: i * 1000 + 500,
    original: `w${i}`,
  }));

  it('returns [-1, -1] for empty words', () => {
    expect(findHorizonWindow([], 10_000)).toEqual([-1, -1]);
  });

  it('returns [-1, -1] when nowMs is far before any word', () => {
    // Words start at 0; "now" is 20s before word 0, so the +10s future window
    // still doesn't reach word 0 at time=0.
    expect(findHorizonWindow(spacedWords, -20_000)).toEqual([-1, -1]);
  });

  it('returns [-1, -1] when nowMs is far past the last word', () => {
    // Last word is at 59_000ms. "Now" at 200_000ms is 141s past; even the
    // -5s past tail doesn't reach word 59 at time=59_000.
    expect(findHorizonWindow(spacedWords, 200_000)).toEqual([-1, -1]);
  });

  it('includes words within [nowMs - 5000, nowMs + 10000]', () => {
    // nowMs=30_000: window is word.start in [25_000, 40_000] → indices 25..40
    const [start, end] = findHorizonWindow(spacedWords, 30_000);
    expect(start).toBe(25);
    expect(end).toBe(40);
  });

  it('includes word whose start equals the past boundary exactly', () => {
    // word 25 starts at 25_000 = 30_000 - 5000 (boundary)
    const [start] = findHorizonWindow(spacedWords, 30_000);
    expect(start).toBe(25);
  });

  it('includes word whose start equals the future boundary exactly', () => {
    // word 40 starts at 40_000 = 30_000 + 10_000 (boundary)
    const [, end] = findHorizonWindow(spacedWords, 30_000);
    expect(end).toBe(40);
  });

  it('clips to the start of the word array', () => {
    // Near beginning: window would want words from start = -3000, clip to 0
    const [start, end] = findHorizonWindow(spacedWords, 2_000);
    expect(start).toBe(0);
    expect(end).toBe(12);
  });

  it('clips to the end of the word array', () => {
    // Near end: window would want words up to start = 68_000, clip to 59
    const [start, end] = findHorizonWindow(spacedWords, 58_000);
    expect(start).toBe(53);
    expect(end).toBe(59);
  });

  it('handles a single-word array', () => {
    const single = [spacedWords[0]];
    expect(findHorizonWindow(single, 0)).toEqual([0, 0]);
    expect(findHorizonWindow(single, 5_000)).toEqual([0, 0]); // still within past window
    expect(findHorizonWindow(single, 6_000)).toEqual([-1, -1]); // past 5s boundary
  });
});
