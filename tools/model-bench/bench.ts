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
import { OliverguhrAdapter } from './oliverguhr-adapter';
import { alignTimestamps } from './align';
import { printReport, toMarkdown, type BenchResult } from './report';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    save: { type: 'boolean', default: false },
    model: { type: 'string', short: 'm' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`Usage: just model-bench [fixture-name] [-m model] [--save]

Runs punctuation/casing models against transcript fixtures and reports results.

  fixture-name   Name of a fixture in tests/fixtures/captions/ (without .json)
                 or path to a .json file from 'just transcript'. Default: dexter-horthy
  -m model       Model to run: bad-code, oliverguhr, or all (default: all)
  --save         Write markdown report to docs/spec/model-comparisons/

Examples:
  just model-bench
  just model-bench dexter-horthy -m oliverguhr
  just model-bench .llm/YwZR6tc7qYg.json --save`);
  process.exit(0);
}

// Load transcript data
const fixtureName = positionals[0] || 'dexter-horthy';
let words: TimedWord[];

if (fixtureName.endsWith('.json')) {
  const raw = await Bun.file(fixtureName).json();
  if (raw.words) {
    words = raw.words;
  } else if (raw.events) {
    words = parseJson3Captions(raw);
  } else {
    console.error('Unrecognized JSON format. Expected words[] or events[].');
    process.exit(1);
  }
} else {
  const fixturePath = resolve(`tests/fixtures/captions/${fixtureName}.json`);
  if (!existsSync(fixturePath)) {
    console.error(`Fixture not found: ${fixturePath}`);
    process.exit(1);
  }
  const raw = await Bun.file(fixturePath).json();
  words = parseJson3Captions(raw);
}

const durationMs = words.length > 0 ? words[words.length - 1].end : 0;
console.log(`Loaded ${words.length} words from ${fixtureName} (${(durationMs / 1000 / 60).toFixed(1)} min)`);

const CHUNK_SIZE = 300;
const chunks: string[] = [];
for (let i = 0; i < words.length; i += CHUNK_SIZE) {
  chunks.push(
    words
      .slice(i, i + CHUNK_SIZE)
      .map((w) => w.text)
      .join(' '),
  );
}
console.log(`Split into ${chunks.length} chunks of ~${CHUNK_SIZE} words`);

const rawText = words.map((w) => w.text).join(' ');
const modelFilter = values.model || 'all';
const results: BenchResult[] = [];

// --- 1-800-BAD-CODE model ---
if (modelFilter === 'all' || modelFilter === 'bad-code') {
  console.log('\n--- 1-800-BAD-CODE/punctuation_fullstop_truecase_english ---');
  const adapter = new PunctuationAdapter();
  const loadTimeMs = await adapter.load();

  const inferenceStart = performance.now();
  const formattedChunks: string[] = [];
  for (const chunk of chunks) {
    const result = await adapter.process(chunk);
    formattedChunks.push(result.text);
  }
  const inferenceTimeMs = performance.now() - inferenceStart;
  await adapter.dispose();

  const formattedText = formattedChunks.join(' ');
  const alignedWords = alignTimestamps(words, formattedText);

  results.push({
    modelName: '1-800-BAD-CODE/punctuation_fullstop_truecase_english',
    fixtureName,
    wordCount: words.length,
    durationMs,
    loadTimeMs,
    inferenceTimeMs,
    rawText,
    formattedText,
    alignedWords,
    notes: ['~45 MB model, SentencePiece tokenizer', 'Punctuation + true-casing + sentence boundaries'],
  });
}

// --- oliverguhr model ---
if (modelFilter === 'all' || modelFilter === 'oliverguhr') {
  const modelPath = '.cache/oliverguhr-base-onnx-q8';
  if (!existsSync(resolve(modelPath, 'onnx/model.onnx'))) {
    console.log('\n--- oliverguhr: SKIPPED (not converted yet) ---');
    console.log('Run .llm/convert-oliverguhr.py and .llm/quantize-oliverguhr.py first');
  } else {
    console.log('\n--- oliverguhr/fullstop-punctuation-multilingual-base (q8) ---');
    const adapter = new OliverguhrAdapter();
    const loadTimeMs = await adapter.load();

    const inferenceStart = performance.now();
    const formattedChunks: string[] = [];
    for (const chunk of chunks) {
      const result = await adapter.process(chunk);
      formattedChunks.push(result.text);
    }
    const inferenceTimeMs = performance.now() - inferenceStart;
    await adapter.dispose();

    const formattedText = formattedChunks.join(' ');
    const alignedWords = alignTimestamps(words, formattedText);

    results.push({
      modelName: 'oliverguhr/fullstop-punctuation-multilingual-base (q8)',
      fixtureName,
      wordCount: words.length,
      durationMs,
      loadTimeMs,
      inferenceTimeMs,
      rawText,
      formattedText,
      alignedWords,
      notes: [
        '~265 MB quantized (from ~1 GB fp32)',
        'Punctuation only (no true-casing)',
        'XLM-RoBERTa base, trained on diverse text including spoken',
      ],
    });
  }
}

// Print all results
for (const result of results) {
  printReport(result);
}

if (values.save && results.length > 0) {
  const outDir = resolve('docs/spec/model-comparisons');
  mkdirSync(outDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outPath = resolve(outDir, `${date}-${fixtureName.replace(/[/.]/g, '-')}.md`);
  const md = results.map(toMarkdown).join('\n---\n\n');
  await Bun.write(outPath, md);
  console.log(`Report saved to ${outPath}`);
}
