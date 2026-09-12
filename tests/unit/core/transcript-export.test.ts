/**
 * ABOUTME: Tests for pure transcript export formatters (copy feature).
 * ABOUTME: Covers plain text, timestamped, and markdown document formats.
 */
import { describe, it, expect } from 'vitest';
import {
  formatPlainText,
  formatWithTimestamps,
  formatMarkdown,
} from '../../../src/core/transcript-export';
import type { Chapter, TimedWord, VideoInfo } from '../../../src/core/types';
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

const videoInfo: VideoInfo = {
  videoId: 'abc123',
  title: 'A Talk',
  channelName: 'Some Channel',
  durationMs: 2723000,
};

const chapters: Chapter[] = [
  { title: 'Intro', startTimeMs: 0 },
  { title: 'Main Point', startTimeMs: 60000 },
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

describe('formatMarkdown', () => {
  it('emits title, metadata line, chapter headings, and timestamp-linked paragraphs', () => {
    expect(formatMarkdown(words, segments, chapters, videoInfo)).toBe(
      '# A Talk\n\n' +
        '[Video](https://youtube.com/watch?v=abc123) | Some Channel | 45:23\n\n' +
        '## Intro\n\n' +
        '[0:00](https://youtube.com/watch?v=abc123&t=0) Hello world.\n\n' +
        '## Main Point\n\n' +
        '[1:01](https://youtube.com/watch?v=abc123&t=61) Second para.',
    );
  });

  it('omits chapter headings when the video has no chapters', () => {
    expect(formatMarkdown(words, segments, [], videoInfo)).toBe(
      '# A Talk\n\n' +
        '[Video](https://youtube.com/watch?v=abc123) | Some Channel | 45:23\n\n' +
        '[0:00](https://youtube.com/watch?v=abc123&t=0) Hello world.\n\n' +
        '[1:01](https://youtube.com/watch?v=abc123&t=61) Second para.',
    );
  });
});
