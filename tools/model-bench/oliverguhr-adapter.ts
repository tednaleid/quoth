/**
 * ABOUTME: Adapter for oliverguhr/fullstop-punctuation-multilingual-base via Transformers.js.
 * ABOUTME: Standard token-classification pipeline -- punctuation only, no casing.
 */

import { pipeline, env, type TokenClassificationOutput } from '@huggingface/transformers';

// Disable WASM proxy for bun/node
env.backends.onnx.wasm.proxy = false;

const PUNCT_MAP: Record<string, string> = { '.': '.', ',': ',', '?': '?', '0': '' };

export interface OliverguhrResult {
  text: string;
  loadTimeMs: number;
  inferenceTimeMs: number;
}

export class OliverguhrAdapter {
  private classifier: Awaited<ReturnType<typeof pipeline>> | null = null;

  async load(): Promise<number> {
    const start = performance.now();
    this.classifier = await pipeline(
      'token-classification',
      '.cache/oliverguhr-base-onnx-q8',
      { local_files_only: true },
    );
    return performance.now() - start;
  }

  async process(text: string): Promise<OliverguhrResult> {
    if (!this.classifier) {
      const loadTimeMs = await this.load();
      return { ...(await this.processInternal(text)), loadTimeMs };
    }
    return { ...(await this.processInternal(text)), loadTimeMs: 0 };
  }

  private async processInternal(text: string): Promise<{ text: string; inferenceTimeMs: number }> {
    const cleaned = text
      .toLowerCase()
      .replace(/[.,!?;:'"()\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const start = performance.now();
    const result = (await this.classifier!(cleaned)) as TokenClassificationOutput;
    const inferenceTimeMs = performance.now() - start;

    // Reconstruct: group subtokens back into words, take last subtoken's punctuation
    const words = cleaned.split(' ');
    let tokenIdx = 0;
    const outputWords: string[] = [];

    for (const word of words) {
      let remaining = word;
      let lastEntity = '0';
      while (tokenIdx < result.length && remaining.length > 0) {
        const tokenText = result[tokenIdx].word.replace(/^▁/, '');
        lastEntity = result[tokenIdx].entity as string;
        remaining = remaining.slice(tokenText.length);
        tokenIdx++;
      }
      const punct = PUNCT_MAP[lastEntity] ?? '';
      outputWords.push(word + punct);
    }

    return { text: outputWords.join(' '), inferenceTimeMs };
  }

  async dispose(): Promise<void> {
    if (this.classifier) {
      await this.classifier.dispose();
      this.classifier = null;
    }
  }
}
