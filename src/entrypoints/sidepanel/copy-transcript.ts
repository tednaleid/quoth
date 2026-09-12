// ABOUTME: Copy flow shared by the side panel and popout: format, write the clipboard, toast the result.
// ABOUTME: Wiring only; formatting lives in core and the clipboard call in adapters.
import { copyTextToClipboard } from '../../adapters/browser/clipboard';
import { formatTranscript, type CopyFormat } from '../../core/transcript-export';
import type { TranscriptState } from '../../core/message-handler';
import type { Toast } from './toast.svelte';

export const COPY_FORMAT_LABELS: { id: CopyFormat; label: string }[] = [
  { id: 'plain', label: 'Plain text' },
  { id: 'timestamps', label: 'With timestamps' },
  { id: 'markdown', label: 'Markdown with timestamp links' },
];

export async function copyTranscript(
  state: TranscriptState,
  format: CopyFormat,
  toast: Toast,
  logPrefix: string,
): Promise<void> {
  if (state.words.length === 0) {
    toast.show('Nothing to copy yet', true);
    return;
  }
  try {
    await copyTextToClipboard(
      formatTranscript(format, state.words, state.segments, state.chapters, state.videoInfo),
    );
    toast.show('Transcript copied to clipboard');
  } catch (err) {
    console.warn(`${logPrefix} copy failed:`, err);
    toast.show('Copy failed, select the text manually', true);
  }
}
