/**
 * ABOUTME: Maps punctuated/cased text back to original TimedWord timestamps.
 * ABOUTME: Pure function -- will eventually move to src/core/ once proven correct.
 */

import type { TimedWord } from '../../src/core/types';

/**
 * Align formatted words back to original word timestamps.
 *
 * The punctuation model processes words in order and produces one output
 * word per input word (with optional punctuation attached). This function
 * splits the formatted text into words and maps them 1:1 to the original
 * TimedWord timestamps.
 *
 * If the formatted output has fewer words than the original (due to chunking
 * edge effects), remaining original words are passed through unchanged.
 * If it has more words (shouldn't happen), extras are dropped.
 */
export function alignTimestamps(original: TimedWord[], formattedText: string): TimedWord[] {
  const formattedWords = formattedText.split(/\s+/).filter((w) => w.length > 0);
  const result: TimedWord[] = [];

  const count = Math.min(original.length, formattedWords.length);
  for (let i = 0; i < count; i++) {
    result.push({
      text: formattedWords[i],
      start: original[i].start,
      end: original[i].end,
      original: original[i].original,
    });
  }

  // Pass through any remaining original words that weren't covered
  for (let i = count; i < original.length; i++) {
    result.push({ ...original[i] });
  }

  return result;
}
