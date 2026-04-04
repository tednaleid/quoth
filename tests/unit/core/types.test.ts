import { describe, it, expect } from 'vitest';
import type { TimedWord, TimedTranscript, FormattingTier } from '../../../src/core/types';

describe('core types', () => {
  it('should create a TimedWord', () => {
    const word: TimedWord = {
      text: 'hello',
      start: 0,
      end: 500,
      original: 'hello',
    };
    expect(word.text).toBe('hello');
    expect(word.start).toBe(0);
    expect(word.end).toBe(500);
  });

  it('should create a TimedTranscript at tier 0', () => {
    const transcript: TimedTranscript = {
      videoId: 'abc123',
      words: [],
      formattingTier: 0,
      paragraphs: [],
      sections: [],
    };
    expect(transcript.videoId).toBe('abc123');
    expect(transcript.formattingTier).toBe(0);
  });

  it('should enforce formatting tier values', () => {
    const tiers: FormattingTier[] = [0, 1, 2, 3];
    expect(tiers).toHaveLength(4);
  });
});
