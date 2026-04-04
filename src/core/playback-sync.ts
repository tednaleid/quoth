/**
 * ABOUTME: Core logic for syncing transcript display with video playback.
 * ABOUTME: Provides binary search for active word and segment grouping for paragraph display.
 */
import type { TimedWord } from './types';

export interface WordSegment {
  startIndex: number;
  endIndex: number;
  startTime: number;
  endTime: number;
}

export function findActiveWordIndex(words: TimedWord[], currentTimeMs: number): number {
  if (words.length === 0) return -1;
  if (currentTimeMs < words[0].start) return -1;
  let low = 0;
  let high = words.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (words[mid].start <= currentTimeMs) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.min(high, words.length - 1);
}

export function groupWordsIntoSegments(words: TimedWord[], gapThresholdMs: number): WordSegment[] {
  if (words.length === 0) return [];
  const segments: WordSegment[] = [];
  let segStart = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].start;
    if (gap >= gapThresholdMs) {
      segments.push({
        startIndex: segStart,
        endIndex: i - 1,
        startTime: words[segStart].start,
        endTime: words[i - 1].end,
      });
      segStart = i;
    }
  }
  segments.push({
    startIndex: segStart,
    endIndex: words.length - 1,
    startTime: words[segStart].start,
    endTime: words[words.length - 1].end,
  });
  return segments;
}

export function findActiveSegmentIndex(segments: WordSegment[], currentTimeMs: number): number {
  if (segments.length === 0) return -1;
  if (currentTimeMs < segments[0].startTime) return -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (currentTimeMs >= segments[i].startTime) return i;
  }
  return -1;
}
