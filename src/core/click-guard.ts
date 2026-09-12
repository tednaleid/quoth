/**
 * ABOUTME: Pure click-vs-drag guard so text selection never triggers seek.
 * ABOUTME: A seek fires only on a plain click with a collapsed selection.
 */

export interface Point {
  x: number;
  y: number;
}

/** Max pointer travel (px) still counted as a click rather than a drag-select. */
export const CLICK_DRAG_THRESHOLD_PX = 5;

/**
 * Returns true when a mousedown->click gesture should seek: the pointer barely
 * moved and there is no active text selection. DOM selection reads stay in the
 * Svelte component; only the boolean crosses into core.
 */
export function shouldSeekOnClick(down: Point, up: Point, selectionCollapsed: boolean): boolean {
  if (!selectionCollapsed) return false;
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  return Math.hypot(dx, dy) <= CLICK_DRAG_THRESHOLD_PX;
}
