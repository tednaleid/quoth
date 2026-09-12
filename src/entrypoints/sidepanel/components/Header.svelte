<script lang="ts">
  import type { CopyFormat } from '../../../core/settings';

  interface Props {
    title: string;
    autoScroll: boolean;
    onToggleAutoScroll: () => void;
    onToggleSettings: () => void;
    settingsOpen: boolean;
    onPopout?: () => void;
    disconnected?: boolean;
    copyFormat?: CopyFormat;
    onCopyFormatChange?: (format: CopyFormat) => void;
    onCopy?: () => void;
    copyDisabled?: boolean;
  }
  let {
    title,
    autoScroll,
    onToggleAutoScroll,
    onToggleSettings,
    settingsOpen,
    onPopout,
    disconnected,
    copyFormat = 'markdown',
    onCopyFormatChange,
    onCopy,
    copyDisabled = false,
  }: Props = $props();
</script>

<header>
  <h1 class:disconnected>{title || 'Quoth'}</h1>
  <div class="controls">
    {#if onCopy}
      <select
        class="format"
        value={copyFormat}
        onchange={(e) => onCopyFormatChange?.(e.currentTarget.value as CopyFormat)}
        title="Copy format"
        aria-label="Copy format"
      >
        <option value="markdown">MD links</option>
        <option value="timestamps">Timestamps</option>
        <option value="plain">Plain</option>
      </select>
      <button
        class="toggle"
        onclick={onCopy}
        disabled={copyDisabled}
        title="Copy transcript to clipboard"
        aria-label="Copy transcript"
      >
        Copy
      </button>
    {/if}
    <button
      class="toggle"
      class:active={settingsOpen}
      onclick={onToggleSettings}
      title="Highlight settings"
      aria-label="Highlight settings"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <line x1="1" y1="3" x2="13" y2="3" />
        <circle cx="9" cy="3" r="1.6" fill="currentColor" stroke="none" />
        <line x1="1" y1="7" x2="13" y2="7" />
        <circle cx="5" cy="7" r="1.6" fill="currentColor" stroke="none" />
        <line x1="1" y1="11" x2="13" y2="11" />
        <circle cx="10" cy="11" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    </button>
    {#if onPopout}
      <button class="toggle" onclick={onPopout} title="Open in new tab">
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <rect x="1" y="3" width="8" height="8" rx="1" />
          <polyline points="6,1 11,1 11,6" />
          <line x1="11" y1="1" x2="6" y2="6" />
        </svg>
      </button>
    {/if}
    <button
      class="toggle autoscroll"
      class:active={autoScroll}
      onclick={onToggleAutoScroll}
      title={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'}
    >
      {autoScroll ? '⬇' : '⏸'}
    </button>
  </div>
</header>

<style>
  header {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .controls {
    display: flex;
    gap: 4px;
    margin-left: 8px;
  }
  .toggle {
    background: none;
    border: 1px solid var(--button-border);
    border-radius: 4px;
    color: var(--text-dim);
    cursor: pointer;
    padding: 2px 6px;
    font-size: 12px;
  }
  .toggle.autoscroll {
    /* Bump the ⬇/⏸ glyph 50% bigger than the other toggle buttons. */
    font-size: 18px;
    line-height: 1;
  }
  .toggle.active {
    color: var(--button-text-active);
    border-color: var(--button-border-active);
  }
  .toggle:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .format {
    background: none;
    border: 1px solid var(--button-border);
    border-radius: 4px;
    color: var(--text-dim);
    cursor: pointer;
    padding: 2px 4px;
    font-size: 12px;
    max-width: 92px;
  }
  h1.disconnected {
    color: var(--text-dimmer);
  }
</style>
