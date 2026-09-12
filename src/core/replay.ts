/**
 * ABOUTME: Pure decision helper for request-state handling (fast tab switching).
 * ABOUTME: Lets a content script replay its in-memory transcript with no network.
 */

/**
 * Returns true when a `request-state` message can be answered by replaying the
 * tab's already-loaded transcript instead of refetching from the network.
 * Replay is safe only when the page video matches the cached video and the
 * previous fetch actually completed (hasPayload).
 */
export function shouldReplayCached(
  cachedVideoId: string | null,
  hasPayload: boolean,
  pageVideoId: string | null,
): boolean {
  return (
    cachedVideoId !== null && hasPayload && pageVideoId !== null && cachedVideoId === pageVideoId
  );
}
