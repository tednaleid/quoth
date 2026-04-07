#!/usr/bin/env -S bun run
/**
 * ABOUTME: Model comparison harness for transcript formatting candidates.
 * ABOUTME: Runs punctuation/casing models against fixtures, reports quality and performance.
 */

import { parseArgs } from 'node:util';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseJson3Captions } from '../../src/core/caption-parser';
import type { TimedWord } from '../../src/core/types';
import { PunctuationAdapter } from './punctuation-adapter';
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

// The model's SentencePiece tokenizer expands words into subtokens.
// A 512-token limit means ~300 words per chunk to stay safe.
const CHUNK_SIZE = 300;
const chunks: string[] = [];
for (let i = 0; i < words.length; i += CHUNK_SIZE) {
  const chunk = words.slice(i, i + CHUNK_SIZE);
  chunks.push(chunk.map((w) => w.text).join(' '));
}
console.log(`Split into ${chunks.length} chunks of ~${CHUNK_SIZE} words`);

// Run the model with proper SentencePiece tokenization
console.log('\nLoading model...');
const adapter = new PunctuationAdapter();
const loadTimeMs = await adapter.load();
console.log(`Model loaded in ${(loadTimeMs / 1000).toFixed(1)}s`);

console.log('Running inference...');
const inferenceStart = performance.now();
const formattedChunks: string[] = [];
for (const chunk of chunks) {
  const result = await adapter.process(chunk);
  formattedChunks.push(result.text);
}
const inferenceTimeMs = performance.now() - inferenceStart;
console.log(`Inference complete in ${(inferenceTimeMs / 1000).toFixed(1)}s`);
await adapter.dispose();

const formattedText = formattedChunks.join(' ');
const rawText = words.map((w) => w.text).join(' ');

// Align timestamps
console.log('Aligning timestamps...');
const alignedWords = alignTimestamps(words, formattedText);
console.log(`Aligned ${alignedWords.length} words (original: ${words.length})`);

const notes: string[] = [
  'Using proper SentencePiece tokenization (not punctuation-restore broken tokenizer)',
  'Model trained on formal written text; quality on informal spoken transcripts may vary',
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
