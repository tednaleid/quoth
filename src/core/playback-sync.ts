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

const SENTENCE_END_RE = /[.!?]$/;

function isSentenceEnd(text: string): boolean {
  return SENTENCE_END_RE.test(text);
}

function makeSegment(words: TimedWord[], from: number, to: number): WordSegment {
  return {
    startIndex: from,
    endIndex: to,
    startTime: words[from].start,
    endTime: words[to].end,
  };
}

/**
 * Find the best paragraph break points by ranking gaps at sentence boundaries.
 * See docs/spec/paragraph-segmentation.md for design rationale and alternatives.
 */
export function groupWordsIntoSegments(words: TimedWord[], _gapThresholdMs: number): WordSegment[] {
  if (words.length === 0) return [];
  if (words.length <= 20) return [makeSegment(words, 0, words.length - 1)];

  const TARGET_WORDS_PER_PARA = 70;
  const MAX_WORDS = 150;

  // Collect all candidate break points: sentence ends with their gap size
  const candidates: { index: number; gap: number }[] = [];
  for (let i = 1; i < words.length; i++) {
    if (isSentenceEnd(words[i - 1].text)) {
      const gap = words[i].start - words[i - 1].start;
      candidates.push({ index: i, gap });
    }
  }

  // How many breaks do we want? Target roughly TARGET_WORDS_PER_PARA words each.
  const targetBreaks = Math.max(1, Math.floor(words.length / TARGET_WORDS_PER_PARA) - 1);

  // Rank candidates by gap size (largest first) and pick the top N
  const ranked = [...candidates].sort((a, b) => b.gap - a.gap);
  const breakSet = new Set<number>();
  for (const c of ranked) {
    if (breakSet.size >= targetBreaks) break;
    breakSet.add(c.index);
  }

  // Build segments from the chosen break points
  const breakPoints = [...breakSet].sort((a, b) => a - b);
  const segments = buildSegmentsFromBreaks(words, breakPoints);

  // Second pass: split any remaining oversized segments
  const refined: WordSegment[] = [];
  for (const seg of segments) {
    const len = seg.endIndex - seg.startIndex + 1;
    if (len <= MAX_WORDS) {
      refined.push(seg);
      continue;
    }
    // Find the largest-gap sentence boundary within this segment to split on
    const subBreak = findBestBreakInRange(words, seg.startIndex, seg.endIndex);
    if (subBreak !== -1) {
      refined.push(makeSegment(words, seg.startIndex, subBreak - 1));
      refined.push(makeSegment(words, subBreak, seg.endIndex));
    } else {
      refined.push(seg);
    }
  }

  return refined;
}

function buildSegmentsFromBreaks(words: TimedWord[], breakPoints: number[]): WordSegment[] {
  const segments: WordSegment[] = [];
  let start = 0;
  for (const bp of breakPoints) {
    if (bp > start) {
      segments.push(makeSegment(words, start, bp - 1));
      start = bp;
    }
  }
  segments.push(makeSegment(words, start, words.length - 1));
  return segments;
}

/** Find the sentence-end boundary with the largest gap within a word range. */
function findBestBreakInRange(words: TimedWord[], from: number, to: number): number {
  let bestIdx = -1;
  let bestGap = -1;
  // Only consider breaks in the middle third to avoid tiny fragments
  const rangeLen = to - from + 1;
  const minIdx = from + Math.floor(rangeLen * 0.25);
  const maxIdx = from + Math.floor(rangeLen * 0.75);
  for (let i = minIdx; i <= maxIdx; i++) {
    if (i > 0 && isSentenceEnd(words[i - 1].text)) {
      const gap = words[i].start - words[i - 1].start;
      if (gap > bestGap) {
        bestGap = gap;
        bestIdx = i;
      }
    }
  }
  return bestIdx;
}

export function findActiveSegmentIndex(segments: WordSegment[], currentTimeMs: number): number {
  if (segments.length === 0) return -1;
  if (currentTimeMs < segments[0].startTime) return -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (currentTimeMs >= segments[i].startTime) return i;
  }
  return -1;
}
