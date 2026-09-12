<!--
  ABOUTME: Small bordered icon button used across the header; the single home of the .toggle style.
  ABOUTME: Passes through native button attributes (title, aria-*, disabled, onclick).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    active?: boolean;
    children: Snippet;
  }
  let { active = false, children, ...rest }: Props = $props();
</script>

<button type="button" class="toggle" class:active {...rest}>
  {@render children()}
</button>

<style>
  .toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: 1px solid var(--button-border);
    border-radius: 4px;
    color: var(--text-dim);
    cursor: pointer;
    padding: 3px 6px;
    font-size: 12px;
    line-height: 1;
  }
  .toggle:hover {
    color: var(--button-text-active);
  }
  .toggle.active {
    color: var(--button-text-active);
    border-color: var(--button-border-active);
  }
  .toggle:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
