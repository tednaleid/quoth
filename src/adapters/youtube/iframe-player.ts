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

export class IFramePlayer implements VideoPlayer {
  constructor(private deps: IFramePlayerDeps) {}

  getState(): VideoPlayerState {
    return { currentTimeMs: 0, isPlaying: false, durationMs: 0 };
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

  onTimeUpdate(_callback: (state: VideoPlayerState) => void): () => void {
    return () => {};
  }
}
