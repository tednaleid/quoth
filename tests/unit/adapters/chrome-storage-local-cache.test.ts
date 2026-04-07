/**
 * ABOUTME: Tests for the ChromeStorageLocalCache adapter.
 * ABOUTME: Uses an injectable storage dep to exercise cache get/set semantics.
 */
import { describe, it, expect, vi } from 'vitest';
import { ChromeStorageLocalCache } from '../../../src/adapters/browser/chrome-storage-local-cache';
import type { CachedTranscript } from '../../../src/ports/cache-store';

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

const sampleCache: CachedTranscript = {
  videoInfo: {
    videoId: 'abc123',
    title: 'Test',
    channelName: 'Chan',
    durationMs: 60000,
  },
  words: [{ text: 'hello', start: 0, end: 500, original: 'hello' }],
};

describe('ChromeStorageLocalCache', () => {
  it('returns null when key is not present', async () => {
    const storage = makeStorage();
    const cache = new ChromeStorageLocalCache(storage);
    expect(await cache.get('missing')).toBeNull();
  });

  it('stores and retrieves a cached transcript', async () => {
    const storage = makeStorage();
    const cache = new ChromeStorageLocalCache(storage);
    await cache.set('abc123', sampleCache);
    expect(await cache.get('abc123')).toEqual(sampleCache);
  });

  it('uses "transcript:" prefix for storage keys', async () => {
    const storage = makeStorage();
    const cache = new ChromeStorageLocalCache(storage);
    await cache.set('abc123', sampleCache);
    expect(storage.set).toHaveBeenCalledWith({ 'transcript:abc123': sampleCache });
  });

  it('reads using the prefixed key', async () => {
    const storage = makeStorage({ 'transcript:abc123': sampleCache });
    const cache = new ChromeStorageLocalCache(storage);
    const result = await cache.get('abc123');
    expect(storage.get).toHaveBeenCalledWith('transcript:abc123');
    expect(result).toEqual(sampleCache);
  });

  it('isolates different videoIds', async () => {
    const storage = makeStorage();
    const cache = new ChromeStorageLocalCache(storage);
    const other = { ...sampleCache, words: [] };
    await cache.set('abc123', sampleCache);
    await cache.set('xyz789', other);
    expect(await cache.get('abc123')).toEqual(sampleCache);
    expect(await cache.get('xyz789')).toEqual(other);
  });
});
