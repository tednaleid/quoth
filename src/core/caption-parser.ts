/**
 * ABOUTME: Parses YouTube JSON3 caption format into TimedWord arrays.
 * ABOUTME: Handles both auto-generated (word-level timing) and manual (segment-level) captions.
 */
import type { TimedWord } from './types';

interface Json3Segment {
  utf8: string;
  tOffsetMs?: number;
}
interface Json3Event {
  tStartMs: number;
  dDurationMs: number;
  segs?: Json3Segment[];
}
interface Json3Response {
  events: Json3Event[];
}

export function parseJson3Captions(json3: Json3Response): TimedWord[] {
  const words: TimedWord[] = [];
  for (const event of json3.events) {
    if (!event.segs || event.segs.length === 0) continue;
    const hasWordTiming = event.segs.some((seg) => seg.tOffsetMs !== undefined);
    if (hasWordTiming) {
      words.push(...parseWordTimedSegments(event));
    } else {
      words.push(...interpolateSegmentTiming(event));
    }
  }
  return words;
}

function parseWordTimedSegments(event: Json3Event): TimedWord[] {
  const words: TimedWord[] = [];
  const segs = event.segs!;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const text = seg.utf8.trim();
    if (!text) continue;
    const start = event.tStartMs + (seg.tOffsetMs ?? 0);
    const nextOffset =
      i + 1 < segs.length
        ? event.tStartMs + (segs[i + 1].tOffsetMs ?? 0)
        : event.tStartMs + event.dDurationMs;
    words.push({ text, start, end: nextOffset, original: text });
  }
  return words;
}

function interpolateSegmentTiming(event: Json3Event): TimedWord[] {
  const fullText = event.segs!.map((s) => s.utf8).join('');
  const splitWords = fullText.split(/\s+/).filter((w) => w.length > 0);
  if (splitWords.length === 0) return [];
  const wordDuration = event.dDurationMs / splitWords.length;
  return splitWords.map((text, i) => ({
    text,
    start: Math.round(event.tStartMs + i * wordDuration),
    end: Math.round(event.tStartMs + (i + 1) * wordDuration),
    original: text,
  }));
}
