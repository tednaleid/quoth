/**
 * ABOUTME: CacheStore adapter backed by browser.storage.local (Chrome/Firefox WebExtensions).
 * ABOUTME: Keys are prefixed with "transcript:" so we can share the namespace with future caches.
 */
import type { CacheStore, CachedTranscript } from '../../ports/cache-store';

const KEY_PREFIX = 'transcript:';

interface StorageLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export class ChromeStorageLocalCache implements CacheStore {
  constructor(private storage: StorageLike) {}

  async get(videoId: string): Promise<CachedTranscript | null> {
    const key = KEY_PREFIX + videoId;
    const result = await this.storage.get(key);
    const value = result[key];
    if (!value) return null;
    return value as CachedTranscript;
  }

  async set(videoId: string, data: CachedTranscript): Promise<void> {
    const key = KEY_PREFIX + videoId;
    await this.storage.set({ [key]: data });
  }
}
