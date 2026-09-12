/**
 * ABOUTME: Pure decision helper for request-state handling (fast tab switching).
 * ABOUTME: Lets a content script replay its in-memory transcript with no network.
 */

/**
 * Returns true when a `request-state` message can be answered by replaying the
 * tab's already-loaded transcript instead of refetching from the network.
 * Only successful loads are cached, so a matching video id means a complete
 * transcript is available.
 */
export function shouldReplayCached(
  cachedVideoId: string | null,
  pageVideoId: string | null,
): boolean {
  return cachedVideoId !== null && pageVideoId !== null && cachedVideoId === pageVideoId;
}
