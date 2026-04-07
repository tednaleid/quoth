/**
 * ABOUTME: Proper adapter for 1-800-BAD-CODE punctuation model using SentencePiece tokenization.
 * ABOUTME: Replaces punctuation-restore's broken tokenizer with real subword encoding.
 */

import * as ort from 'onnxruntime-node';
import { SentencePieceProcessor } from 'sentencepiece-js';
import { resolve } from 'node:path';

const MODEL_DIR = resolve(
  'node_modules/punctuation-restore/models/1-800-BAD-CODE/punctuation_fullstop_truecase_english',
);

// Punctuation labels from the model's post_preds output
const POST_PUNCT: Record<number, string> = {
  0: '', // O (no punctuation)
  1: '.', // PERIOD
  2: ',', // COMMA
  3: '?', // QUESTION
};

export interface PunctuationResult {
  text: string;
  loadTimeMs: number;
  inferenceTimeMs: number;
}

export class PunctuationAdapter {
  private session: ort.InferenceSession | null = null;
  private sp: SentencePieceProcessor | null = null;

  async load(): Promise<number> {
    const start = performance.now();
    this.sp = new SentencePieceProcessor();
    await this.sp.load(resolve(MODEL_DIR, 'tokenizer.model'));
    this.session = await ort.InferenceSession.create(resolve(MODEL_DIR, 'model.onnx'));
    return performance.now() - start;
  }

  async process(text: string): Promise<PunctuationResult> {
    if (!this.session || !this.sp) {
      const loadTimeMs = await this.load();
      return { ...(await this.processInternal(text)), loadTimeMs };
    }
    return { ...(await this.processInternal(text)), loadTimeMs: 0 };
  }

  private async processInternal(text: string): Promise<{ text: string; inferenceTimeMs: number }> {
    const sp = this.sp!;
    const session = this.session!;

    // Lowercase and strip existing punctuation (model expects clean input)
    const cleaned = text
      .toLowerCase()
      .replace(/[.,!?;:'"()\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Tokenize with SentencePiece
    const pieces = sp.encodePieces(cleaned);
    const ids = sp.encodeIds(cleaned);

    // Build word-to-subtoken mapping: which subtokens belong to which input word
    // SentencePiece uses "▁" prefix for word-initial subtokens
    const words = cleaned.split(' ');
    const wordBoundaries: number[] = []; // index into pieces[] where each word starts
    let pieceIdx = 0;
    for (let w = 0; w < words.length; w++) {
      wordBoundaries.push(pieceIdx);
      // Advance past all subtokens for this word
      // The first subtoken starts with ▁, subsequent ones don't
      pieceIdx++; // first subtoken
      while (pieceIdx < pieces.length && !pieces[pieceIdx].startsWith('▁')) {
        pieceIdx++;
      }
    }

    // Run ONNX inference
    const inputIds = new BigInt64Array(ids.map((id) => BigInt(id)));
    const feeds = {
      input_ids: new ort.Tensor('int64', inputIds, [1, ids.length]),
    };

    const start = performance.now();
    const outputs = await session.run(feeds);
    const inferenceTimeMs = performance.now() - start;

    // Extract predictions per subtoken
    const postPreds = outputs.post_preds;
    const capPreds = outputs.cap_preds;

    // cap_preds is 3D: [1, seq_len, max_char_len] -- per-character casing booleans
    const capData = capPreds.data;
    const maxCharLen = capPreds.dims[2]; // typically 16

    // Reconstruct each word from its subtokens with proper casing and punctuation
    const resultWords: string[] = [];

    for (let w = 0; w < words.length; w++) {
      const startIdx = wordBoundaries[w];
      const endIdx = w + 1 < wordBoundaries.length ? wordBoundaries[w + 1] : pieces.length;
      const lastSubtokenIdx = endIdx - 1;

      // Reconstruct word with per-character casing from all subtokens.
      // cap_preds indexes include the SentencePiece "▁" prefix, so apply
      // casing to the full piece string, then strip "▁" from the result.
      let casedWord = '';
      for (let t = startIdx; t < endIdx; t++) {
        const piece = pieces[t];
        let casedPiece = '';
        for (let c = 0; c < piece.length; c++) {
          const capIdx = t * maxCharLen + c;
          const shouldCap = capIdx < capData.length && capData[capIdx];
          casedPiece += shouldCap ? piece[c].toUpperCase() : piece[c];
        }
        casedWord += casedPiece.replace(/^▁/, '');
      }

      // Always capitalize "i" when standalone
      if (casedWord === 'i') casedWord = 'I';

      // Punctuation: use last subtoken's post_preds
      const postPred = Number(postPreds.data[lastSubtokenIdx] ?? 0);
      const punct = POST_PUNCT[postPred] ?? '';

      resultWords.push(casedWord + punct);
    }

    return { text: resultWords.join(' '), inferenceTimeMs };
  }

  async dispose(): Promise<void> {
    if (this.session) {
      await this.session.release();
      this.session = null;
    }
  }
}
