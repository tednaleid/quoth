/**
 * ABOUTME: Clipboard write adapter for the side panel (uses navigator.clipboard).
 * ABOUTME: Falls back to textarea+execCommand for older Firefox contexts.
 */

/** Copies text to the system clipboard. Rejects when the copy fails. */
export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall through to the legacy path (e.g. clipboard permission denied).
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('clipboard copy failed');
  } finally {
    textarea.remove();
  }
}
