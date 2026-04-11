<script lang="ts">
  import type { TimedWord, Chapter } from '../../../core/types';
  import {
    findActiveWordIndex,
    findHorizonWindow,
    horizonIntensity,
    makeHorizonKnees,
    type WordSegment,
  } from '../../../core/playback-sync';
  import { formatTime } from '../../../core/time-format';

  // Auto-scroll tunables. The active line is free to drift in the top
  // TOP_ZONE_FRACTION of the viewport without triggering scroll. When it
  // crosses below that threshold, we smooth-snap (over SNAP_DURATION_MS)
  // so it lands at SNAP_TARGET_FRACTION from the top.
  const TOP_ZONE_FRACTION = 0.3;
  const SNAP_TARGET_FRACTION = 0.05;
  const SNAP_DURATION_MS = 100;
  const KEY_SCROLL_KEYS = new Set([
    'PageUp',
    'PageDown',
    'ArrowUp',
    'ArrowDown',
    'Home',
    'End',
    ' ',
  ]);

  interface Props {
    words: TimedWord[];
    segments: WordSegment[];
    chapters: Chapter[];
    currentTimeMs: number;
    autoScroll: boolean;
    videoId: string;
    peakCap: number;
    horizonSeconds: number;
    onSeek: (timeMs: number) => void;
    onAutoScrollDisable?: () => void;
  }

  let {
    words,
    segments,
    chapters,
    currentTimeMs,
    autoScroll,
    videoId,
    peakCap,
    horizonSeconds,
    onSeek,
    onAutoScrollDisable,
  }: Props = $props();

  // Derived horizon knees from the user-controlled horizonSeconds setting.
  let knees = $derived(makeHorizonKnees(horizonSeconds));

  // Range of word indices whose horizon intensity may be nonzero.
  // Words outside this window render with default (transparent) background.
  let horizonWindow: [number, number] = $derived(findHorizonWindow(words, currentTimeMs, knees));

  // Index of the word currently being spoken (for the text-color shift).
  // -1 when no word is active.
  let currentWordIdx: number = $derived(findActiveWordIndex(words, currentTimeMs));

  // Map segment index -> chapter that starts at or just before this segment.
  // Uses a plain object instead of Map to avoid Svelte reactivity lint warning.
  let chapterMap: Record<number, Chapter> = $derived.by(() => {
    const map: Record<number, Chapter> = {};
    if (chapters.length === 0 || segments.length === 0) return map;
    const assigned: Record<number, boolean> = {};
    let chapterIdx = 0;
    for (let segIdx = 0; segIdx < segments.length; segIdx++) {
      while (
        chapterIdx + 1 < chapters.length &&
        chapters[chapterIdx + 1].startTimeMs <= segments[segIdx].startTime
      ) {
        chapterIdx++;
      }
      if (chapters[chapterIdx].startTimeMs <= segments[segIdx].startTime && !assigned[chapterIdx]) {
        map[segIdx] = chapters[chapterIdx];
        assigned[chapterIdx] = true;
      }
    }
    return map;
  });

  let segmentEls: (HTMLElement | undefined)[] = $state([]);
  let transcriptEl: HTMLDivElement | undefined = $state();

  // Smooth-scroll tween (rAF-driven, easeOutCubic). CSS scroll-behavior:smooth
  // doesn't let us control duration, so we tween scrollTop ourselves.
  let tweenAbort = false;
  function smoothScrollTo(target: number, durationMs: number) {
    if (!transcriptEl) return;
    const el = transcriptEl;
    tweenAbort = false;
    const start = el.scrollTop;
    const startTime = performance.now();
    const delta = target - start;
    if (Math.abs(delta) < 1) return;
    function step(now: number) {
      if (tweenAbort) return;
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      el.scrollTop = start + delta * eased;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Line-aware auto-scroll. On every current-word change, if the active word
  // has drifted past the top zone, snap it back near the top. When the
  // transcript is already scrolled to the bottom (end of video), skip the
  // snap entirely so we don't stutter trying to scroll past maxScrollTop.
  $effect(() => {
    // Re-run whenever the current word changes.
    void currentWordIdx;
    if (!autoScroll || !transcriptEl || currentWordIdx < 0) return;
    const wordEl = transcriptEl.querySelector('.current-word') as HTMLElement | null;
    if (!wordEl) return;
    const wordRect = wordEl.getBoundingClientRect();
    const containerRect = transcriptEl.getBoundingClientRect();
    const wordTopInViewport = wordRect.top - containerRect.top;
    const threshold = containerRect.height * TOP_ZONE_FRACTION;
    if (wordTopInViewport > threshold) {
      const maxScrollTop = transcriptEl.scrollHeight - transcriptEl.clientHeight;
      // Already at the bottom of the transcript; nothing to scroll to.
      if (transcriptEl.scrollTop >= maxScrollTop - 1) return;
      const desired =
        transcriptEl.scrollTop + wordTopInViewport - containerRect.height * SNAP_TARGET_FRACTION;
      const target = Math.min(desired, maxScrollTop);
      smoothScrollTo(target, SNAP_DURATION_MS);
    }
  });

  function disableAutoScroll() {
    tweenAbort = true;
    if (autoScroll && onAutoScrollDisable) onAutoScrollDisable();
  }

  function handleWheel() {
    disableAutoScroll();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (KEY_SCROLL_KEYS.has(e.key)) disableAutoScroll();
  }

  function timestampUrl(timeMs: number): string {
    const seconds = Math.floor(timeMs / 1000);
    return `https://youtube.com/watch?v=${videoId}&t=${seconds}`;
  }
</script>

<div
  class="transcript"
  bind:this={transcriptEl}
  style:--peak-cap={peakCap}
  onwheel={handleWheel}
  onkeydown={handleKeydown}
  role="region"
  tabindex="-1"
>
  {#each segments as segment, segIdx (segment.startIndex)}
    {#if chapterMap[segIdx]}
      {@const chapter = chapterMap[segIdx]}
      <h3 class="chapter-title">
        <a
          class="chapter-link"
          href={timestampUrl(chapter.startTimeMs)}
          onclick={(e) => {
            e.preventDefault();
            onSeek(chapter.startTimeMs);
          }}
        >
          <span class="chapter-timestamp">{formatTime(chapter.startTimeMs)}</span>
          {chapter.title}
        </a>
      </h3>
    {/if}
    <p class="segment" bind:this={segmentEls[segIdx]}>
      <a
        class="timestamp"
        href={timestampUrl(segment.startTime)}
        onclick={(e) => {
          e.preventDefault();
          onSeek(segment.startTime);
        }}
      >
        {formatTime(segment.startTime)}
      </a>
      {#each { length: segment.endIndex - segment.startIndex + 1 } as _, i (segment.startIndex + i)}
        {@const wordIdx = segment.startIndex + i}
        {@const word = words[wordIdx]}
        {@const inHorizon = wordIdx >= horizonWindow[0] && wordIdx <= horizonWindow[1]}
        {@const intensity = inHorizon
          ? Math.min(horizonIntensity(word, currentTimeMs, knees), peakCap)
          : 0}
        <span
          class="word"
          class:current-word={wordIdx === currentWordIdx}
          style:--word-intensity={intensity}
          data-start={word.start}
          data-end={word.end}
          onclick={() => onSeek(word.start)}
          role="button"
          tabindex="-1">{word.text + ' '}</span
        >
      {/each}
    </p>
  {/each}
</div>

<style>
  .transcript {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
  }

  .chapter-title {
    position: relative;
    margin: 24px 0 8px 0;
    padding: 0 56px 0 6px;
    font-size: 24px;
    font-weight: 600;
    line-height: 1.3;
  }

  .chapter-title:first-child {
    margin-top: 0;
  }

  .chapter-link {
    color: var(--chapter-link);
    text-decoration: none;
  }

  .chapter-link:hover {
    color: var(--chapter-link-hover);
  }

  .chapter-timestamp {
    position: absolute;
    top: 8px;
    right: 6px;
    font-size: 11px;
    font-weight: 400;
    color: var(--text-very-dim);
  }

  .segment {
    position: relative;
    margin: 0 0 12px 0;
    line-height: 1.6;
    padding: 4px 56px 4px 6px;
    border-radius: 4px;
  }

  .timestamp {
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: 11px;
    color: var(--text-very-dim);
    text-decoration: none;
  }

  .timestamp:hover {
    color: var(--text-very-dim-hover);
  }

  .word {
    cursor: pointer;
    background-color: rgba(var(--horizon-rgb), var(--word-intensity, 0));
  }

  .word:hover {
    background-color: rgba(var(--horizon-rgb), var(--peak-cap, 0.65));
  }

  .current-word {
    color: var(--current-word-text);
  }
</style>
