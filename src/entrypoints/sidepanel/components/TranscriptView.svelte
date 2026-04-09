<script lang="ts">
  import type { TimedWord, Chapter } from '../../../core/types';
  import type { WordSegment } from '../../../core/playback-sync';
  import { formatTime } from '../../../core/time-format';

  interface Props {
    words: TimedWord[];
    segments: WordSegment[];
    chapters: Chapter[];
    activeWordIndex: number;
    activeSegmentIndex: number;
    autoScroll: boolean;
    videoId: string;
    onSeek: (timeMs: number) => void;
    onAutoScrollDisable?: () => void;
  }

  let {
    words,
    segments,
    chapters,
    activeWordIndex,
    activeSegmentIndex,
    autoScroll,
    videoId,
    onSeek,
    onAutoScrollDisable,
  }: Props = $props();

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
          class="chapter-timestamp"
          href={timestampUrl(chapter.startTimeMs)}
          onclick={(e) => {
            e.preventDefault();
            onSeek(chapter.startTimeMs);
          }}
        >
          {formatTime(chapter.startTimeMs)}
        </a>
        {chapter.title}
      </h3>
    {/if}
    <p class="segment" class:active={segIdx === activeSegmentIndex} bind:this={segmentEls[segIdx]}>
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
        <span
          class="word"
          class:active-word={wordIdx === activeWordIndex}
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
    margin: 20px 0 8px 0;
    padding: 0 6px;
    font-size: 15px;
    font-weight: 600;
    color: #c0c8e0;
  }

  .chapter-title:first-child {
    margin-top: 0;
  }

  .chapter-timestamp {
    font-size: 11px;
    font-weight: 400;
    color: #556;
    text-decoration: none;
    margin-right: 6px;
  }

  .chapter-timestamp:hover {
    color: #88a;
  }

  .segment {
    margin: 0 0 12px 0;
    line-height: 1.6;
    padding: 4px 6px;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .segment.active {
    background: rgba(100, 150, 255, 0.15);
  }

  .timestamp {
    display: block;
    font-size: 11px;
    color: #556;
    margin-bottom: 2px;
    text-decoration: none;
  }

  .timestamp:hover {
    color: #88a;
  }

  .word {
    cursor: pointer;
    border-radius: 2px;
    transition: background-color 0.15s;
  }

  .word:hover {
    background: rgba(100, 150, 255, 0.15);
  }

  .active-word {
    background: #ffd54f;
    color: #1a1a2e;
    font-weight: 600;
  }
</style>
