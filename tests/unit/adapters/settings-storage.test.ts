/**
 * ABOUTME: Tests for SettingsStorage with an injected mock StorageLike.
 */
import { describe, it, expect, vi } from 'vitest';
import { SettingsStorage } from '../../../src/adapters/browser/settings-storage';
import { DEFAULT_SETTINGS, type HighlightSettings } from '../../../src/core/settings';

function makeStorage(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  return {
    get: vi.fn(async (key: string) => ({ [key]: data[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(data, items);
    }),
    data,
  };
}

const customSettings: HighlightSettings = {
  bg: '#101010',
  text: '#eaeaea',
  peak: '#fabd2f',
  current: '#ffffff',
  peakCap: 0.65,
  horizonSeconds: 12,
};

describe('SettingsStorage', () => {
  it('returns defaults when nothing is stored', async () => {
    const storage = makeStorage();
    const store = new SettingsStorage(storage);
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('reads using the namespaced key', async () => {
    const storage = makeStorage();
    const store = new SettingsStorage(storage);
    await store.load();
    expect(storage.get).toHaveBeenCalledWith('quoth.highlight-settings');
  });

  it('round-trips a saved settings object', async () => {
    const storage = makeStorage();
    const store = new SettingsStorage(storage);
    await store.save(customSettings);
    expect(await store.load()).toEqual(customSettings);
  });

  it('writes using the namespaced key', async () => {
    const storage = makeStorage();
    const store = new SettingsStorage(storage);
    await store.save(customSettings);
    expect(storage.set).toHaveBeenCalledWith({
      'quoth.highlight-settings': customSettings,
    });
  });

  it('merges partial stored settings over defaults', async () => {
    // Simulate an older saved version with only some fields populated.
    const storage = makeStorage({
      'quoth.highlight-settings': { peak: '#fabd2f', peakCap: 0.5 },
    });
    const store = new SettingsStorage(storage);
    const loaded = await store.load();
    expect(loaded.peak).toBe('#fabd2f');
    expect(loaded.peakCap).toBe(0.5);
    // Other fields should fall back to defaults.
    expect(loaded.bg).toBe(DEFAULT_SETTINGS.bg);
    expect(loaded.text).toBe(DEFAULT_SETTINGS.text);
    expect(loaded.current).toBe(DEFAULT_SETTINGS.current);
  });
});
