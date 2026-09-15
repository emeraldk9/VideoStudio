import type { WindowApi } from '../preload/preload';

declare global {
  interface Window {
    api: WindowApi;
  }
}

export {};
