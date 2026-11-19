/// <reference types="vite/client" />
import type { BootContext, ShotOptions } from './game/types.ts';

declare global {
  interface Window {
    __G?: BootContext;
    __ready: boolean;
    __frames: number;
    __fatal: string | null;
    __errors: string[];
    __stats?: () => Record<string, unknown>;
    __setShot?: (options: ShotOptions) => void;
  }
  interface Document {
    webkitFullscreenElement?: Element | null;
    webkitFullscreenEnabled?: boolean;
    webkitExitFullscreen?: () => Promise<void> | void;
  }
  interface HTMLElement {
    webkitRequestFullscreen?: () => Promise<void> | void;
  }
}
