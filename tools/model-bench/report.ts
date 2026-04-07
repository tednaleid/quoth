/**
 * ABOUTME: Formats model bench results for terminal output and optional markdown files.
 * ABOUTME: Shows side-by-side comparison of raw vs formatted transcript text.
 */

import { formatTime } from '../../src/core/time-format';
import type { TimedWord } from '../../src/core/types';

export interface BenchResult {
  modelName: string;
  fixtureName: string;
  wordCount: number;
  durationMs: number;
  loadTimeMs: number;
  inferenceTimeMs: number;
  rawText: string;
  formattedText: string;
  alignedWords: TimedWord[];
  notes: string[];
}

export function printReport(result: BenchResult): void {
  const { modelName, fixtureName, wordCount, durationMs, loadTimeMs, inferenceTimeMs } = result;

  console.log(`\n=== Model Bench: ${modelName} ===`);
  console.log(`Fixture: ${fixtureName} (${wordCount} words, ${formatTime(durationMs)})`);
  console.log(`Load time: ${(loadTimeMs / 1000).toFixed(1)}s`);
  console.log(`Inference time: ${(inferenceTimeMs / 1000).toFixed(1)}s (${(inferenceTimeMs / wordCount).toFixed(2)}ms/word)`);

  if (result.notes.length > 0) {
    console.log(`\nNotes:`);
    for (const note of result.notes) {
      console.log(`  - ${note}`);
    }
  }

  // Side-by-side sample
  const sampleLen = 300;
  console.log(`\n--- Sample (first ${sampleLen} chars) ---`);
  console.log(`RAW:  ${result.rawText.slice(0, sampleLen)}`);
  console.log(`OUT:  ${result.formattedText.slice(0, sampleLen)}`);

  // Alignment check
  const alignSample = Math.min(10, result.alignedWords.length);
  console.log(`\n--- Alignment check (first ${alignSample} words) ---`);
  for (let i = 0; i < alignSample; i++) {
    const w = result.alignedWords[i];
    const timeStr = `${formatTime(w.start)} - ${formatTime(w.end)}`;
    const changed = w.text !== w.original ? ` (was "${w.original}")` : '';
    console.log(`  "${w.text}"  ${timeStr}${changed}`);
  }

  console.log('');
}

export function toMarkdown(result: BenchResult): string {
  const { modelName, fixtureName, wordCount, durationMs, loadTimeMs, inferenceTimeMs } = result;

  const lines: string[] = [
    `# Model Bench: ${modelName}`,
    '',
    `Fixture: ${fixtureName} (${wordCount} words, ${formatTime(durationMs)})`,
    '',
    '## Metrics',
    '',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Load time | ${(loadTimeMs / 1000).toFixed(1)}s |`,
    `| Inference time | ${(inferenceTimeMs / 1000).toFixed(1)}s |`,
    `| Per-word | ${(inferenceTimeMs / wordCount).toFixed(2)}ms |`,
    '',
  ];

  if (result.notes.length > 0) {
    lines.push('## Notes', '');
    for (const note of result.notes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  lines.push('## Sample output', '', '### Raw', '', '```');
  lines.push(result.rawText.slice(0, 500));
  lines.push('```', '', '### Formatted', '', '```');
  lines.push(result.formattedText.slice(0, 500));
  lines.push('```', '');

  return lines.join('\n');
}
