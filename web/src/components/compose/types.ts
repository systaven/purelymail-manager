import type { ComposeRequest } from '@/lib/mail-api';

export interface ComposerWin {
  id: string;
  // Same key = same reply/forward/draft: opening it again focuses the window.
  key?: string;
  request: ComposeRequest;
  minimized: boolean;
  maximized: boolean;
  focusTick: number;
}
