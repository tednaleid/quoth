<script lang="ts">
  import type { YouTubeTabInfo } from '../../../ports/tab-connector';

  interface Props {
    tabs: YouTubeTabInfo[];
    selectedTabId: number | null;
    followActive: boolean;
    onSelectTab: (tabId: number) => void;
    onToggleFollow: () => void;
  }
  let { tabs, selectedTabId, followActive, onSelectTab, onToggleFollow }: Props = $props();

  function shortTitle(tab: YouTubeTabInfo): string {
    const prefix = tab.id === selectedTabId ? '● ' : '';
    const title = tab.title.length > 40 ? `${tab.title.slice(0, 40)}…` : tab.title;
    return `${prefix}${title}`;
  }
</script>

<div class="tabbar">
  {#if tabs.length === 0}
    <span class="empty">No YouTube tabs open</span>
  {:else}
    <select
      class="tabs"
      value={selectedTabId ?? ''}
      onchange={(e) => {
        const id = Number(e.currentTarget.value);
        if (!Number.isNaN(id)) onSelectTab(id);
      }}
      title="YouTube tab to show transcript from"
      aria-label="YouTube tab selector"
    >
      {#each tabs as tab (tab.id)}
        <option value={tab.id} selected={tab.id === selectedTabId}>
          {shortTitle(tab)}
        </option>
      {/each}
    </select>
    <button
      class="toggle"
      class:active={followActive}
      onclick={onToggleFollow}
      title={followActive
        ? 'Following active tab (click to pin)'
        : 'Pinned to selected tab (click to follow active)'}
      aria-label="Toggle follow active tab"
    >
      {followActive ? '🔓' : '📌'}
    </button>
  {/if}
</div>

<style>
  .tabbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
  .tabs {
    flex: 1;
    background: none;
    border: 1px solid var(--button-border);
    border-radius: 4px;
    color: var(--text);
    padding: 2px 4px;
    font-size: 12px;
    min-width: 0;
  }
  .empty {
    font-size: 12px;
    color: var(--text-dimmer);
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
  .toggle.active {
    color: var(--button-text-active);
    border-color: var(--button-border-active);
  }
</style>
