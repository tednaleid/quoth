<script lang="ts">
  interface Props {
    title: string;
    autoScroll: boolean;
    onToggleAutoScroll: () => void;
    onPopout?: () => void;
    disconnected?: boolean;
  }
  let { title, autoScroll, onToggleAutoScroll, onPopout, disconnected }: Props = $props();
</script>

<header>
  <h1 class:disconnected>{title || 'Quoth'}</h1>
  <div class="controls">
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
      class="toggle"
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
    border-bottom: 1px solid #2a2a4a;
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
    border: 1px solid #333;
    border-radius: 4px;
    color: #888;
    cursor: pointer;
    padding: 2px 6px;
    font-size: 12px;
  }
  .toggle.active {
    color: #aac;
    border-color: #446;
  }
  h1.disconnected {
    color: #666;
  }
</style>
