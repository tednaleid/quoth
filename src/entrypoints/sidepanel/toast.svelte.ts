// ABOUTME: Transient toast state shared by the side panel and popout (runes module).
// ABOUTME: show() replaces the current message and clears it after a short delay.

export interface ToastMessage {
  message: string;
  error: boolean;
}

export interface Toast {
  readonly current: ToastMessage | null;
  show(message: string, error?: boolean): void;
}

export function createToast(durationMs = 2500): Toast {
  let current = $state<ToastMessage | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    get current() {
      return current;
    },
    show(message: string, error = false) {
      if (timer) clearTimeout(timer);
      current = { message, error };
      timer = setTimeout(() => {
        current = null;
        timer = null;
      }, durationMs);
    },
  };
}
