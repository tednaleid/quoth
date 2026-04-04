<script lang="ts">
  interface Props {
    title: string;
    autoScroll: boolean;
    onToggleAutoScroll: () => void;
  }
  let { title, autoScroll, onToggleAutoScroll }: Props = $props();
</script>

<header>
  <h1>{title || 'Quoth'}</h1>
  <div class="controls">
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
    font-size: 14px;
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
</style>
