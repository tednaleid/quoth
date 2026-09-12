/**
 * ABOUTME: Pure formatters for copying the transcript to the clipboard.
 * ABOUTME: Plain text, [m:ss] timestamps, or markdown YouTube links per paragraph.
 */
import type { TimedWord } from './types';
import type { WordSegment } from './playback-sync';
import { formatTime, timeToSeconds } from './time-format';

function paragraphText(words: TimedWord[], startIndex: number, endIndex: number): string {
  return words
    .slice(startIndex, endIndex + 1)
    .map((w) => w.text)
    .join(' ')
    .trim();
}

export function timestampUrl(videoId: string, timeMs: number): string {
  return `https://youtube.com/watch?v=${videoId}&t=${timeToSeconds(timeMs)}`;
}

/** Paragraphs joined by blank lines, no timestamps. */
export function formatPlainText(words: TimedWord[], segments: WordSegment[]): string {
  return segments.map((s) => paragraphText(words, s.startIndex, s.endIndex)).join('\n\n');
}

/** Each paragraph prefixed with [m:ss] (or [h:mm:ss]). */
export function formatWithTimestamps(words: TimedWord[], segments: WordSegment[]): string {
  return segments
    .map((s) => `[${formatTime(s.startTime)}] ${paragraphText(words, s.startIndex, s.endIndex)}`)
    .join('\n\n');
}

/** Each paragraph prefixed with a clickable markdown YouTube timestamp link. */
export function formatWithMarkdownLinks(
  words: TimedWord[],
  segments: WordSegment[],
  videoId: string,
): string {
  return segments
    .map(
      (s) =>
        `[[${formatTime(s.startTime)}](${timestampUrl(videoId, s.startTime)})] ${paragraphText(words, s.startIndex, s.endIndex)}`,
    )
    .join('\n\n');
}
