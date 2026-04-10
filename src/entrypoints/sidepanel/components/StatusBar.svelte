<script lang="ts">
  interface Props {
    status: string;
  }
  let { status }: Props = $props();
</script>

<footer class="status-bar">
  <span>{status}</span>
</footer>

<style>
  .status-bar {
    padding: 4px 12px;
    font-size: 12px;
    color: var(--text-dimmer);
    border-top: 1px solid var(--border-dim);
    flex-shrink: 0;
  }
</style>
