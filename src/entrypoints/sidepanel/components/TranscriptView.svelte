<script lang="ts">
  import type { TimedWord, Chapter } from '../../../core/types';
  import {
    findActiveWordIndex,
    findHorizonWindow,
    horizonIntensity,
    type WordSegment,
  } from '../../../core/playback-sync';
  import { formatTime } from '../../../core/time-format';

  interface Props {
    words: TimedWord[];
    segments: WordSegment[];
    chapters: Chapter[];
    currentTimeMs: number;
    activeSegmentIndex: number;
    autoScroll: boolean;
    videoId: string;
    peakCap: number;
    onSeek: (timeMs: number) => void;
    onAutoScrollDisable?: () => void;
  }

  let {
    words,
    segments,
    chapters,
    currentTimeMs,
    activeSegmentIndex,
    autoScroll,
    videoId,
    peakCap,
    onSeek,
    onAutoScrollDisable,
  }: Props = $props();

  // Range of word indices whose horizon intensity may be nonzero.
  // Words outside this window render with default (transparent) background.
  let horizonWindow: [number, number] = $derived(findHorizonWindow(words, currentTimeMs));

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
  let programmaticScroll = false;

  $effect(() => {
    const el = segmentEls[activeSegmentIndex];
    if (autoScroll && el) {
      programmaticScroll = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // Reset flag after the smooth scroll animation settles
      setTimeout(() => (programmaticScroll = false), 500);
    }
  });

  function handleUserScroll() {
    if (!programmaticScroll && autoScroll && onAutoScrollDisable) {
      onAutoScrollDisable();
    }
  }

  function timestampUrl(timeMs: number): string {
    const seconds = Math.floor(timeMs / 1000);
    return `https://youtube.com/watch?v=${videoId}&t=${seconds}`;
  }
</script>

<div class="transcript" onscroll={handleUserScroll}>
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
          ? Math.min(horizonIntensity(word, currentTimeMs), peakCap)
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
    margin: 24px 0 8px 0;
    padding: 0 6px;
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
    display: block;
    font-size: 11px;
    font-weight: 400;
    color: var(--text-very-dim);
  }

  .segment {
    margin: 0 0 12px 0;
    line-height: 1.6;
    padding: 4px 6px;
    border-radius: 4px;
  }

  .timestamp {
    display: block;
    font-size: 11px;
    color: var(--text-very-dim);
    margin-bottom: 2px;
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
    background: var(--segment-hover);
  }

  .current-word {
    color: var(--current-word-text);
  }
</style>
