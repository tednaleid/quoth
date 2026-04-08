import { describe, it, expect } from 'vitest';
import { parseJson3Captions } from '../../../src/core/caption-parser';
import autoCaptions from '../../fixtures/captions/sample-auto-captions.json';
import manualCaptions from '../../fixtures/captions/sample-manual-captions.json';

describe('parseJson3Captions', () => {
  it('parses auto-generated captions into 13 words', () => {
    const words = parseJson3Captions(autoCaptions);
    expect(words).toHaveLength(13);
  });

  it('auto-captions: first word has correct timing', () => {
    const words = parseJson3Captions(autoCaptions);
    // first seg has no tOffsetMs so start = 1040 + 0 = 1040
    // next seg has tOffsetMs=320 so end = 1040 + 320 = 1360
    expect(words[0].text).toBe('welcome');
    expect(words[0].start).toBe(1040);
    expect(words[0].end).toBe(1360);
  });

  it('auto-captions: trims leading/trailing whitespace from word text', () => {
    const words = parseJson3Captions(autoCaptions);
    for (const word of words) {
      expect(word.text).toBe(word.text.trim());
    }
  });

  it('parses manual captions and splits text by whitespace', () => {
    const words = parseJson3Captions(manualCaptions);
    // "Welcome to the show." -> 4 words
    // "Today we are going to talk" -> 6 words
    // "about something interesting." -> 3 words
    expect(words).toHaveLength(13);
  });

  it('manual captions: interpolates timing evenly across words', () => {
    const words = parseJson3Captions(manualCaptions);
    // First event: tStartMs=1040, dDurationMs=3360, 4 words -> 840ms each
    expect(words[0].start).toBe(1040);
    expect(words[0].end).toBe(1040 + 840);
    expect(words[1].start).toBe(1040 + 840);
    expect(words[1].end).toBe(1040 + 840 * 2);
  });

  it('skips events with empty segs array', () => {
    const data = {
      events: [
        { tStartMs: 0, dDurationMs: 1000, segs: [] },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'hello' }] },
      ],
    };
    const words = parseJson3Captions(data);
    expect(words).toHaveLength(1);
    expect(words[0].text).toBe('hello');
  });

  it('skips events missing segs property', () => {
    const data = {
      events: [
        { tStartMs: 0, dDurationMs: 1000 },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'hello' }] },
      ],
    };
    const words = parseJson3Captions(data as never);
    expect(words).toHaveLength(1);
    expect(words[0].text).toBe('hello');
  });

  it('strips >> speaker-change markers from word-timed captions', () => {
    const data = {
      events: [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          segs: [
            { utf8: '>> Yeah,', tOffsetMs: 0 },
            { utf8: ' okay.', tOffsetMs: 500 },
          ],
        },
      ],
    };
    const words = parseJson3Captions(data);
    expect(words[0].text).toBe('Yeah,');
    expect(words[1].text).toBe('okay.');
  });

  it('strips >> speaker-change markers from interpolated captions', () => {
    const data = {
      events: [
        {
          tStartMs: 0,
          dDurationMs: 2000,
          segs: [{ utf8: '>> Hello world' }],
        },
      ],
    };
    const words = parseJson3Captions(data);
    expect(words).toHaveLength(2);
    expect(words[0].text).toBe('Hello');
    expect(words[1].text).toBe('world');
  });
});
