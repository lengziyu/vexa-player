export interface QualitySample {
  frames: number;
  dropped: number;
  ratio: number;
  struggling: boolean;
}

/** Uses decoder counters; ignores paused periods, resets and the first sampling window. */
export class PlaybackQualityMonitor {
  private previous: { total: number; dropped: number } | null = null;
  private badWindows = 0;
  reset(): void {
    this.previous = null;
    this.badWindows = 0;
  }
  sample(
    total: number,
    dropped: number,
    eligible: boolean,
  ): QualitySample | null {
    if (
      !Number.isFinite(total) ||
      !Number.isFinite(dropped) ||
      total < 0 ||
      dropped < 0 ||
      dropped > total
    ) {
      this.reset();
      return null;
    }
    const previous = this.previous;
    this.previous = { total, dropped };
    if (
      !eligible ||
      !previous ||
      total < previous.total ||
      dropped < previous.dropped
    ) {
      this.badWindows = 0;
      return null;
    }
    const frames = total - previous.total,
      lost = dropped - previous.dropped;
    if (frames < 12) {
      this.badWindows = 0;
      return null;
    }
    const ratio = lost / frames;
    this.badWindows = ratio > 0.05 ? this.badWindows + 1 : 0;
    return { frames, dropped: lost, ratio, struggling: this.badWindows >= 3 };
  }
}
