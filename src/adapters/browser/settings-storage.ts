/**
 * ABOUTME: Persistence for HighlightSettings via browser.storage.local.
 * ABOUTME: Single key; falls back to defaults on miss or partial data.
 */
import { DEFAULT_SETTINGS, type HighlightSettings } from '../../core/settings';

const STORAGE_KEY = 'quoth.highlight-settings';

interface StorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export class SettingsStorage {
  constructor(private storage: StorageLike) {}

  async load(): Promise<HighlightSettings> {
    const result = await this.storage.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] as Partial<HighlightSettings> | undefined;
    if (!stored) return { ...DEFAULT_SETTINGS };
    // Merge over defaults so newly-added fields work for users with old saves.
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  async save(settings: HighlightSettings): Promise<void> {
    await this.storage.set({ [STORAGE_KEY]: settings });
  }
}
