<!--
  ABOUTME: Transient status message pinned near the top of the panel, below the header.
  ABOUTME: Colors come from the theme variables so it matches the user's palette.
-->
<script lang="ts">
  import type { ToastMessage } from '../toast.svelte';

  interface Props {
    toast: ToastMessage | null;
  }
  let { toast }: Props = $props();
</script>

{#if toast}
  <div class="toast" class:error={toast.error} role="status">
    {toast.message}
  </div>
{/if}

<style>
  .toast {
    position: absolute;
    top: 48px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    max-width: calc(100% - 24px);
    padding: 6px 12px;
    border: 1px solid var(--button-border-active);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  }
  .toast.error {
    border-color: rgb(var(--horizon-rgb));
  }
</style>
