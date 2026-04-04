<script lang="ts">
  import type { TimedWord } from '../../../core/types';
  import type { WordSegment } from '../../../core/playback-sync';
  import { formatTime } from '../../../core/time-format';

  interface Props {
    words: TimedWord[];
    segments: WordSegment[];
    activeWordIndex: number;
    activeSegmentIndex: number;
    autoScroll: boolean;
    videoId: string;
    onSeek: (timeMs: number) => void;
  }

  let { words, segments, activeWordIndex, activeSegmentIndex, autoScroll, videoId, onSeek }: Props =
    $props();

  let activeSegmentEl: HTMLElement | null = $state(null);

  $effect(() => {
    if (autoScroll && activeSegmentEl) {
      activeSegmentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  function timestampUrl(timeMs: number): string {
    const seconds = Math.floor(timeMs / 1000);
    return `https://youtube.com/watch?v=${videoId}&t=${seconds}`;
  }
</script>

<div class="transcript">
  {#each segments as segment, segIdx (segment.startIndex)}
    <p
      class="segment"
      class:active={segIdx === activeSegmentIndex}
      bind:this={segIdx === activeSegmentIndex ? activeSegmentEl : undefined}
    >
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
          tabindex="-1"
          >{word.text}
        </span>
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

  .segment {
    margin: 0 0 12px 0;
    line-height: 1.6;
    padding: 4px 6px;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .segment.active {
    background: rgba(100, 150, 255, 0.08);
  }

  .timestamp {
    display: block;
    font-size: 10px;
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
    background: rgba(100, 150, 255, 0.2);
  }
</style>
