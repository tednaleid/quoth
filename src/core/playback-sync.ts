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

/**
 * Piecewise-linear fade horizon knees (seconds relative to word.start).
 * All six knees are derived from a single `horizonSeconds` tunable via fixed
 * ratios, so the user can shrink or stretch the whole horizon with one slider
 * and the curve shape is preserved. Past decays 2x faster than future ramps
 * (the PAST knees are 1/2 of their FUTURE counterparts).
 */
export interface HorizonKnees {
  futureFull: number;
  futureMid: number;
  futureFar: number;
  pastFull: number;
  pastMid: number;
  pastFar: number;
}

const FUTURE_FULL_RATIO = 0.15;
const FUTURE_MID_RATIO = 0.3;
const FUTURE_FAR_RATIO = 1.0;
const PAST_FULL_RATIO = 0.075;
const PAST_MID_RATIO = 0.15;
const PAST_FAR_RATIO = 0.5;

/**
 * Build a HorizonKnees from a single tunable. `horizonSeconds` is the total
 * future reach (i.e. the FUTURE_FAR knee); everything else scales from it.
 * At horizonSeconds=10, the knees reproduce the historical defaults
 * (future 1.5/3/10, past 0.75/1.5/5).
 */
export function makeHorizonKnees(horizonSeconds: number): HorizonKnees {
  return {
    futureFull: horizonSeconds * FUTURE_FULL_RATIO,
    futureMid: horizonSeconds * FUTURE_MID_RATIO,
    futureFar: horizonSeconds * FUTURE_FAR_RATIO,
    pastFull: horizonSeconds * PAST_FULL_RATIO,
    pastMid: horizonSeconds * PAST_MID_RATIO,
    pastFar: horizonSeconds * PAST_FAR_RATIO,
  };
}

/**
 * Returns 0.0-1.0 intensity for a word based on its temporal distance from nowMs.
 * Words approaching from the future ramp up over knees.futureFar seconds;
 * past words decay over knees.pastFar seconds.
 */
export function horizonIntensity(word: TimedWord, nowMs: number, knees: HorizonKnees): number {
  const d = (word.start - nowMs) / 1000;
  if (d >= 0) {
    if (d < knees.futureFull) return 1.0;
    if (d < knees.futureMid)
      return 1.0 - 0.5 * ((d - knees.futureFull) / (knees.futureMid - knees.futureFull));
    if (d < knees.futureFar)
      return 0.5 - 0.5 * ((d - knees.futureMid) / (knees.futureFar - knees.futureMid));
    return 0;
  }
  const p = -d;
  if (p < knees.pastFull) return 1.0;
  if (p < knees.pastMid)
    return 1.0 - 0.5 * ((p - knees.pastFull) / (knees.pastMid - knees.pastFull));
  if (p < knees.pastFar) return 0.5 - 0.5 * ((p - knees.pastMid) / (knees.pastFar - knees.pastMid));
  return 0;
}

/**
 * Returns the inclusive [startIdx, endIdx] range of words whose intensity may be nonzero.
 * Range: word.start in [nowMs - knees.pastFar*1000, nowMs + knees.futureFar*1000].
 * Returns [-1, -1] if no word falls in the window.
 */
export function findHorizonWindow(
  words: TimedWord[],
  nowMs: number,
  knees: HorizonKnees,
): [number, number] {
  if (words.length === 0) return [-1, -1];
  const minStart = nowMs - knees.pastFar * 1000;
  const maxStart = nowMs + knees.futureFar * 1000;

  // First index with word.start >= minStart
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (words[mid].start < minStart) lo = mid + 1;
    else hi = mid;
  }
  const startIdx = lo;
  if (startIdx >= words.length) return [-1, -1];
  if (words[startIdx].start > maxStart) return [-1, -1];

  // Last index with word.start <= maxStart
  lo = startIdx;
  hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (words[mid].start <= maxStart) lo = mid + 1;
    else hi = mid;
  }
  const endIdx = lo - 1;
  return [startIdx, endIdx];
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
