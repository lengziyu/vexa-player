export interface PlayerEngine {
  readonly element: HTMLVideoElement;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  configure(options: {
    muted: boolean;
    volume: number;
    speed: number;
    loop: boolean;
  }): void;
  destroy(): void;
}
export class HtmlVideoEngine implements PlayerEngine {
  constructor(readonly element: HTMLVideoElement) {}
  play(): Promise<void> {
    return this.element.play();
  }
  pause(): void {
    this.element.pause();
  }
  seek(seconds: number): void {
    if (Number.isFinite(seconds) && Number.isFinite(this.element.duration))
      this.element.currentTime = Math.max(
        0,
        Math.min(this.element.duration, seconds),
      );
  }
  configure(options: {
    muted: boolean;
    volume: number;
    speed: number;
    loop: boolean;
  }): void {
    this.element.muted = options.muted;
    this.element.volume = Math.max(0, Math.min(1, options.volume));
    this.element.playbackRate = options.speed;
    this.element.loop = options.loop;
  }
  destroy(): void {
    this.pause();
    this.element.removeAttribute("src");
    this.element.load();
  }
}
