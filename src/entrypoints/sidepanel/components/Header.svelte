<!--
  ABOUTME: Single-row header: pin, title (a tab picker when several YouTube tabs are open), copy menu,
  ABOUTME: auto-scroll toggle, highlight settings, and pop-out. All icons are inline SVG.
-->
<script lang="ts">
  import type { YouTubeTabInfo } from '../../../ports/tab-connector';
  import type { CopyFormat } from '../../../core/transcript-export';
  import { COPY_FORMAT_LABELS } from '../copy-transcript';
  import IconButton from './IconButton.svelte';
  import Menu from './Menu.svelte';

  interface Props {
    title: string;
    autoScroll: boolean;
    onToggleAutoScroll: () => void;
    onToggleSettings: () => void;
    settingsOpen: boolean;
    onPopout?: () => void;
    disconnected?: boolean;
    /** Open YouTube tabs for the title picker. The picker and pin render whenever their callbacks are given. */
    tabs?: YouTubeTabInfo[];
    selectedTabId?: number | null;
    followActive?: boolean;
    onSelectTab?: (tabId: number) => void;
    onToggleFollow?: () => void;
    onCopy?: (format: CopyFormat) => void;
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
    tabs = [],
    selectedTabId = null,
    followActive = true,
    onSelectTab,
    onToggleFollow,
    onCopy,
    copyDisabled = false,
  }: Props = $props();

  let tabItems = $derived(
    tabs.map((t) => ({ id: String(t.id), label: t.title, selected: t.id === selectedTabId })),
  );
</script>

<header>
  {#if onToggleFollow}
    <IconButton
      active={!followActive}
      onclick={onToggleFollow}
      title={followActive
        ? 'Following the active tab (click to pin this one)'
        : 'Pinned to this tab (click to follow the active tab)'}
      aria-label="Pin to this tab"
      aria-pressed={!followActive}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      >
        <rect
          x="4"
          y="1.5"
          width="6"
          height="4"
          rx="1"
          fill={followActive ? 'none' : 'currentColor'}
        />
        <path d="M3 8.5C3 6.5 4 5.5 5 5.5h4c1 0 2 1 2 3z" />
        <line x1="7" y1="8.5" x2="7" y2="13" />
      </svg>
    </IconButton>
  {/if}

  <h1 class:disconnected>
    {#if onSelectTab}
      <Menu
        variant="title"
        items={tabItems}
        onSelect={(id) => onSelectTab(Number(id))}
        label="Choose YouTube tab"
        title="Choose which YouTube tab to show"
      >
        {title || 'Quoth'}
      </Menu>
    {:else}
      <span class="title-text">{title || 'Quoth'}</span>
    {/if}
  </h1>

  <div class="controls">
    {#if onCopy}
      <Menu
        items={COPY_FORMAT_LABELS}
        onSelect={(id) => onCopy(id as CopyFormat)}
        label="Copy transcript"
        title="Copy transcript"
        disabled={copyDisabled}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        >
          <rect x="5" y="5" width="7.5" height="7.5" rx="1" />
          <path d="M9 5V2.5a1 1 0 0 0-1-1H2.5a1 1 0 0 0-1 1V8a1 1 0 0 0 1 1H5" />
        </svg>
      </Menu>
    {/if}
    <IconButton
      active={autoScroll}
      onclick={onToggleAutoScroll}
      title={autoScroll
        ? 'Auto-scroll on (click to pause)'
        : 'Auto-scroll paused (click to resume)'}
      aria-label="Toggle auto-scroll"
      aria-pressed={autoScroll}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        {#if autoScroll}
          <line x1="7" y1="1.5" x2="7" y2="9" />
          <polyline points="3.5,5.5 7,9 10.5,5.5" />
          <line x1="2.5" y1="12.5" x2="11.5" y2="12.5" />
        {:else}
          <rect x="3" y="2" width="3" height="10" rx="0.75" fill="currentColor" stroke="none" />
          <rect x="8" y="2" width="3" height="10" rx="0.75" fill="currentColor" stroke="none" />
        {/if}
      </svg>
    </IconButton>
    <IconButton
      active={settingsOpen}
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
    </IconButton>
    {#if onPopout}
      <IconButton onclick={onPopout} title="Open in new tab" aria-label="Open in new tab">
        <svg
          width="14"
          height="14"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <rect x="1" y="3" width="8" height="8" rx="1" />
          <polyline points="6,1 11,1 11,6" />
          <line x1="11" y1="1" x2="6" y2="6" />
        </svg>
      </IconButton>
    {/if}
  </div>
</header>

<style>
  header {
    position: relative;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    flex: 1;
    min-width: 0;
    display: flex;
  }
  .title-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .controls {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  h1.disconnected {
    color: var(--text-dimmer);
  }
</style>
