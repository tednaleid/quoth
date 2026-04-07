/**
 * ABOUTME: Maps punctuated/cased text back to original TimedWord timestamps via jsdiff.
 * ABOUTME: Pure function -- will eventually move to src/core/ once proven correct.
 */

import { diffWords } from 'diff';
import type { TimedWord } from '../../src/core/types';

/**
 * Align formatted text back to original word timestamps using jsdiff.
 *
 * The model changes text (adds punctuation, fixes casing) but we need to
 * preserve the original word-level timestamps. This function uses diffWords
 * to find the correspondence between original and formatted words, then
 * maps each formatted word to the closest original word's timestamp.
 */
export function alignTimestamps(original: TimedWord[], formattedText: string): TimedWord[] {
  const originalText = original.map((w) => w.text).join(' ');
  const changes = diffWords(originalText, formattedText, { ignoreCase: true });

  const result: TimedWord[] = [];
  let origCursor = 0;

  for (const change of changes) {
    const words = change.value.trim().split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) continue;

    if (!change.added && !change.removed) {
      // Unchanged words (ignoring case): emit with original timestamps
      for (const word of words) {
        if (origCursor < original.length) {
          result.push({
            text: word,
            start: original[origCursor].start,
            end: original[origCursor].end,
            original: original[origCursor].original,
          });
          origCursor++;
        }
      }
    } else if (change.removed && !change.added) {
      // Words removed by the model (rare) -- skip, advance cursor
      origCursor += words.length;
    } else if (change.added && !change.removed) {
      // Words added by the model (punctuation attached to words, new words)
      // Map each to the next available original word's timestamp
      for (const word of words) {
        if (origCursor < original.length) {
          result.push({
            text: word,
            start: original[origCursor].start,
            end: original[origCursor].end,
            original: original[origCursor].original,
          });
          origCursor++;
        }
      }
    }
  }

  return result;
}
