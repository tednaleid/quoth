#!/usr/bin/env -S bun run
/**
 * ABOUTME: Model comparison harness for transcript formatting candidates.
 * ABOUTME: Runs punctuation/casing models against fixtures, reports quality and performance.
 */

import { parseArgs } from 'node:util';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import PunctuationRestorer from 'punctuation-restore';
import { parseJson3Captions } from '../../src/core/caption-parser';
import type { TimedWord } from '../../src/core/types';
import { alignTimestamps } from './align';
import { printReport, toMarkdown, type BenchResult } from './report';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    save: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`Usage: just model-bench [fixture-name] [--save]

Runs punctuation/casing models against transcript fixtures and reports results.

  fixture-name   Name of a fixture in tests/fixtures/captions/ (without .json)
                 or path to a .json file from 'just transcript'. Default: dexter-horthy
  --save         Write markdown report to docs/spec/model-comparisons/

Examples:
  just model-bench
  just model-bench dexter-horthy
  just model-bench .llm/YwZR6tc7qYg.json --save`);
  process.exit(0);
}

// Load transcript data
const fixtureName = positionals[0] || 'dexter-horthy';
let words: TimedWord[];
let durationMs: number;

if (fixtureName.endsWith('.json')) {
  // Load from a transcript JSON file (output of `just transcript`)
  const raw = await Bun.file(fixtureName).json();
  if (raw.words) {
    // Format from transcript.ts: { videoId, title, wordCount, words }
    words = raw.words;
  } else if (raw.events) {
    // Raw JSON3 caption format
    words = parseJson3Captions(raw);
  } else {
    console.error('Unrecognized JSON format. Expected words[] or events[].');
    process.exit(1);
  }
} else {
  // Load from fixtures directory
  const fixturePath = resolve(`tests/fixtures/captions/${fixtureName}.json`);
  if (!existsSync(fixturePath)) {
    console.error(`Fixture not found: ${fixturePath}`);
    console.error(`Available: ${(await Bun.file('tests/fixtures/captions/').text()).slice(0, 200)}`);
    process.exit(1);
  }
  const raw = await Bun.file(fixturePath).json();
  words = parseJson3Captions(raw);
}

durationMs = words.length > 0 ? words[words.length - 1].end : 0;
console.log(`Loaded ${words.length} words from ${fixtureName} (${(durationMs / 1000 / 60).toFixed(1)} min)`);

// Prepare input: join all words into chunks the model can handle
// The model's tokenizer has a 512-token limit, so we chunk by ~400 words
const CHUNK_SIZE = 400;
const chunks: string[] = [];
for (let i = 0; i < words.length; i += CHUNK_SIZE) {
  const chunk = words.slice(i, i + CHUNK_SIZE);
  chunks.push(chunk.map((w) => w.text).join(' '));
}
console.log(`Split into ${chunks.length} chunks of ~${CHUNK_SIZE} words`);

// Run the model
console.log('\nLoading model...');
const loadStart = performance.now();
const restorer = new PunctuationRestorer();
await restorer.initialize();
const loadTimeMs = performance.now() - loadStart;
console.log(`Model loaded in ${(loadTimeMs / 1000).toFixed(1)}s`);

console.log('Running inference...');
const inferenceStart = performance.now();
const sentences = await restorer.restore(chunks);
const inferenceTimeMs = performance.now() - inferenceStart;
console.log(`Inference complete in ${(inferenceTimeMs / 1000).toFixed(1)}s`);

const formattedText = sentences.join(' ');
const rawText = words.map((w) => w.text).join(' ');

// Align timestamps
console.log('Aligning timestamps...');
const alignedWords = alignTimestamps(words, formattedText);
console.log(`Aligned ${alignedWords.length} words (original: ${words.length})`);

const notes: string[] = [
  'punctuation-restore uses a simplified tokenizer (maps all words to UNK)',
  'Model quality is degraded -- actual 1-800-BAD-CODE model needs SentencePiece tokenization',
  'This run evaluates the pipeline/alignment, not the model at its best',
];

const result: BenchResult = {
  modelName: '1-800-BAD-CODE/punctuation_fullstop_truecase_english (via punctuation-restore)',
  fixtureName,
  wordCount: words.length,
  durationMs,
  loadTimeMs,
  inferenceTimeMs,
  rawText,
  formattedText,
  alignedWords,
  notes,
};

printReport(result);

if (values.save) {
  const outDir = resolve('docs/spec/model-comparisons');
  mkdirSync(outDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outPath = resolve(outDir, `${date}-${fixtureName.replace(/[/.]/g, '-')}.md`);
  await Bun.write(outPath, toMarkdown(result));
  console.log(`Report saved to ${outPath}`);
}
