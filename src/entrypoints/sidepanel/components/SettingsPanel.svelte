<script lang="ts">
  import { DEFAULT_SETTINGS, type HighlightSettings } from '../../../core/settings';

  interface Props {
    settings: HighlightSettings;
    open: boolean;
    onChange: (next: HighlightSettings) => void;
  }

  let { settings, open, onChange }: Props = $props();

  function update<K extends keyof HighlightSettings>(key: K, value: HighlightSettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  function reset() {
    onChange({ ...DEFAULT_SETTINGS });
  }
</script>

<div class="wrapper" class:open>
  <div class="panel">
    <div class="rows">
      <label class="row">
        <span class="label">bg</span>
        <input
          type="color"
          value={settings.bg}
          oninput={(e) => update('bg', (e.currentTarget as HTMLInputElement).value)}
        />
        <span class="hex">{settings.bg}</span>
      </label>
      <label class="row">
        <span class="label">text</span>
        <input
          type="color"
          value={settings.text}
          oninput={(e) => update('text', (e.currentTarget as HTMLInputElement).value)}
        />
        <span class="hex">{settings.text}</span>
      </label>
      <label class="row">
        <span class="label">peak</span>
        <input
          type="color"
          value={settings.peak}
          oninput={(e) => update('peak', (e.currentTarget as HTMLInputElement).value)}
        />
        <span class="hex">{settings.peak}</span>
      </label>
      <label class="row">
        <span class="label">current</span>
        <input
          type="color"
          value={settings.current}
          oninput={(e) => update('current', (e.currentTarget as HTMLInputElement).value)}
        />
        <span class="hex">{settings.current}</span>
      </label>
      <label class="row slider-row">
        <span class="label">peak cap</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={settings.peakCap}
          oninput={(e) =>
            update('peakCap', parseFloat((e.currentTarget as HTMLInputElement).value))}
        />
        <span class="hex">{settings.peakCap.toFixed(2)}</span>
      </label>
    </div>
    <div class="actions">
      <button type="button" class="reset" onclick={reset}>Reset to Dracula red</button>
    </div>
  </div>
</div>

<style>
  /* Animate height via grid-template-rows 0fr → 1fr (smooth, content-sized). */
  .wrapper {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.2s ease;
  }
  .wrapper.open {
    grid-template-rows: 1fr;
  }
  .panel {
    overflow: hidden;
    background: var(--bg);
    border-bottom: 1px solid var(--border-dim);
  }
  .rows {
    padding: 12px 14px 8px 14px;
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 6px 12px;
    align-items: center;
  }
  .row {
    display: contents;
    cursor: pointer;
  }
  .label {
    font-size: 12px;
    color: var(--text-dim);
    text-align: right;
  }
  .hex {
    font-size: 11px;
    color: var(--text-dim);
    font-family: ui-monospace, Menlo, monospace;
  }
  input[type='color'] {
    width: 28px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--button-border);
    border-radius: 3px;
    background: none;
    cursor: pointer;
  }
  input[type='color']::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  input[type='color']::-webkit-color-swatch {
    border: none;
    border-radius: 2px;
  }
  input[type='range'] {
    width: 100%;
    cursor: pointer;
  }
  .slider-row input[type='range'] {
    /* Slider takes the full middle column (where color swatches sit). */
    grid-column: 2;
  }
  .actions {
    padding: 0 14px 12px 14px;
    display: flex;
    justify-content: flex-end;
  }
  .reset {
    background: none;
    border: 1px solid var(--button-border);
    border-radius: 4px;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 11px;
    padding: 3px 8px;
  }
  .reset:hover {
    color: var(--button-text-active);
    border-color: var(--button-border-active);
  }
</style>
