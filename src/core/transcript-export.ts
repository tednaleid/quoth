/**
 * ABOUTME: Pure formatters for copying the transcript to the clipboard.
 * ABOUTME: Plain text, [m:ss] timestamps, or a markdown document with chapters and timestamp links.
 */
import type { Chapter, TimedWord, VideoInfo } from './types';
import { assignChaptersToSegments, type WordSegment } from './playback-sync';
import { formatTime, timeToSeconds } from './time-format';

/** Copy-to-clipboard format: markdown document, plain [m:ss] timestamps, or plain text. */
export type CopyFormat = 'markdown' | 'timestamps' | 'plain';

function paragraphText(words: TimedWord[], startIndex: number, endIndex: number): string {
  return words
    .slice(startIndex, endIndex + 1)
    .map((w) => w.text)
    .join(' ')
    .trim();
}

function videoUrl(videoId: string): string {
  return `https://youtube.com/watch?v=${videoId}`;
}

export function timestampUrl(videoId: string, timeMs: number): string {
  return `${videoUrl(videoId)}&t=${timeToSeconds(timeMs)}`;
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

/**
 * A markdown document: title heading, a video link / channel / duration line,
 * chapters as second-level headings, and each paragraph prefixed with a
 * clickable YouTube timestamp link. Paragraphs are not hard-wrapped.
 */
export function formatMarkdown(
  words: TimedWord[],
  segments: WordSegment[],
  chapters: Chapter[],
  videoInfo: VideoInfo,
): string {
  const { videoId, title, channelName, durationMs } = videoInfo;
  const chapterAt = assignChaptersToSegments(segments, chapters);
  const blocks: string[] = [
    `# ${title}`,
    `[Video](${videoUrl(videoId)}) | ${channelName} | ${formatTime(durationMs)}`,
  ];
  segments.forEach((s, segIdx) => {
    const chapter = chapterAt[segIdx];
    if (chapter) blocks.push(`## ${chapter.title}`);
    blocks.push(
      `[${formatTime(s.startTime)}](${timestampUrl(videoId, s.startTime)}) ${paragraphText(words, s.startIndex, s.endIndex)}`,
    );
  });
  return blocks.join('\n\n');
}

/**
 * Formats the transcript in the requested format. Markdown needs the video
 * metadata for its links and header, so without it the timestamps format is
 * used instead.
 */
export function formatTranscript(
  format: CopyFormat,
  words: TimedWord[],
  segments: WordSegment[],
  chapters: Chapter[],
  videoInfo: VideoInfo | null,
): string {
  if (format === 'plain') return formatPlainText(words, segments);
  if (format === 'timestamps' || !videoInfo) return formatWithTimestamps(words, segments);
  return formatMarkdown(words, segments, chapters, videoInfo);
}
