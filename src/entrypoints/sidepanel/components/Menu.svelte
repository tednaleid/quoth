<!--
  ABOUTME: Dropdown menu: a trigger (icon button or the header title) that opens a list of actions.
  ABOUTME: Closes on pick, outside click, or Escape. Items wrap so long titles show in full.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import IconButton from './IconButton.svelte';

  export interface MenuItem {
    id: string;
    label: string;
    selected?: boolean;
  }

  interface Props {
    items: MenuItem[];
    onSelect: (id: string) => void;
    /** Accessible name for the trigger. */
    label: string;
    title?: string;
    /** icon: a bordered icon button with a right-aligned list. title: the header title with a full-width list. */
    variant?: 'icon' | 'title';
    disabled?: boolean;
    children: Snippet;
  }
  let {
    items,
    onSelect,
    label,
    title,
    variant = 'icon',
    disabled = false,
    children,
  }: Props = $props();

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();

  function handleWindowClick(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }

  function pick(id: string) {
    open = false;
    onSelect(id);
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="menu" class:title-menu={variant === 'title'} bind:this={root}>
  {#if variant === 'title'}
    <button
      type="button"
      class="title-trigger"
      aria-label={label}
      {title}
      aria-haspopup="menu"
      aria-expanded={open}
      {disabled}
      onclick={() => (open = !open)}
    >
      <span class="title-text">{@render children()}</span>
      <svg
        class="chevron"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <polyline points="1.5,3.5 5,7 8.5,3.5" />
      </svg>
    </button>
  {:else}
    <IconButton
      active={open}
      aria-label={label}
      {title}
      aria-haspopup="menu"
      aria-expanded={open}
      {disabled}
      onclick={() => (open = !open)}
    >
      {@render children()}
    </IconButton>
  {/if}
  {#if open}
    <ul class="list" role="menu">
      {#each items as item (item.id)}
        <li role="none">
          <button
            type="button"
            role="menuitem"
            class="item"
            class:selected={item.selected}
            onclick={() => pick(item.id)}
          >
            <svg
              class="check"
              width="12"
              height="12"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              {#if item.selected}
                <polyline points="2,7.5 5.5,11 12,3.5" />
              {/if}
            </svg>
            <span>{item.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .menu {
    position: relative;
    min-width: 0;
  }
  /* The title menu positions its list against the header, so the header owns the positioning context. */
  .menu.title-menu {
    position: static;
    flex: 1;
  }
  .title-trigger {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .title-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chevron {
    flex-shrink: 0;
    color: var(--text-dim);
  }
  .list {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    margin: 0;
    padding: 4px 0;
    list-style: none;
    min-width: 240px;
    max-width: calc(100vw - 24px);
    background: var(--bg);
    border: 1px solid var(--button-border-active);
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  }
  .title-menu .list {
    top: calc(100% - 2px);
    left: 12px;
    right: 12px;
    max-width: none;
  }
  .item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    background: none;
    border: 0;
    padding: 6px 10px;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.4;
    text-align: left;
    white-space: normal;
    cursor: pointer;
  }
  .item:hover {
    background: var(--segment-hover);
  }
  .item.selected {
    font-weight: 600;
  }
  .check {
    flex-shrink: 0;
    margin-top: 3px;
    color: var(--button-text-active);
  }
</style>
