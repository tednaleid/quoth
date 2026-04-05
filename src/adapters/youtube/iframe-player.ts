/**
 * ABOUTME: VideoPlayer adapter using YouTube's IFrame Player API postMessage protocol.
 * ABOUTME: Sends commands via iframe.contentWindow.postMessage, receives events via window 'message'.
 */
import type { VideoPlayer, VideoPlayerState } from '../../ports/video-player';

export interface IFramePlayerDeps {
  postMessage: (msg: string) => void;
  subscribeToMessages: (handler: (data: unknown) => void) => () => void;
}

const PLAYER_ID = 'quoth-player';
const CHANNEL = 'widget';

// YouTube PlayerState values: https://developers.google.com/youtube/iframe_api_reference#Playback_status
const STATE_PLAYING = 1;

interface InfoDelivery {
  currentTime?: number;
  playerState?: number;
  duration?: number;
}

export class IFramePlayer implements VideoPlayer {
  private currentState: VideoPlayerState = {
    currentTimeMs: 0,
    isPlaying: false,
    durationMs: 0,
  };
  private listeners: Array<(state: VideoPlayerState) => void> = [];
  private unsubscribeMessages: (() => void) | null = null;

  constructor(private deps: IFramePlayerDeps) {}

  initialize(): void {
    this.unsubscribeMessages = this.deps.subscribeToMessages((data) => this.handleMessage(data));
    this.deps.postMessage(JSON.stringify({ event: 'listening', id: PLAYER_ID, channel: CHANNEL }));
  }

  destroy(): void {
    this.unsubscribeMessages?.();
    this.unsubscribeMessages = null;
    this.listeners = [];
  }

  getState(): VideoPlayerState {
    return this.currentState;
  }

  seekTo(timeMs: number): void {
    this.deps.postMessage(
      JSON.stringify({
        event: 'command',
        func: 'seekTo',
        args: [timeMs / 1000, true],
        id: PLAYER_ID,
        channel: CHANNEL,
      }),
    );
  }

  onTimeUpdate(callback: (state: VideoPlayerState) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  private handleMessage(data: unknown): void {
    let parsed: unknown;
    if (typeof data === 'string') {
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
    } else {
      parsed = data;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const msg = parsed as { event?: string; info?: InfoDelivery };
    if (msg.event !== 'infoDelivery' || !msg.info) return;
    const info = msg.info;
    this.currentState = {
      currentTimeMs:
        info.currentTime !== undefined
          ? Math.round(info.currentTime * 1000)
          : this.currentState.currentTimeMs,
      isPlaying:
        info.playerState !== undefined
          ? info.playerState === STATE_PLAYING
          : this.currentState.isPlaying,
      durationMs:
        info.duration !== undefined
          ? Math.round(info.duration * 1000)
          : this.currentState.durationMs,
    };
    this.listeners.forEach((l) => l(this.currentState));
  }
}
