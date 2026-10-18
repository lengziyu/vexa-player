import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref, type EffectScope } from "vue";
import { useIdleControls } from "../src/composables/useIdleControls";
let scope: EffectScope;
beforeEach(() => {
  vi.useFakeTimers();
  scope = effectScope();
});
afterEach(() => {
  scope.stop();
  vi.useRealTimers();
});
describe("fullscreen control visibility", () => {
  it("hides after inactivity and restarts the delay on activity", async () => {
    const controls = scope.run(() =>
      useIdleControls(
        () => true,
        () => false,
      ),
    )!;
    await vi.advanceTimersByTimeAsync(2000);
    expect(controls.idle.value).toBe(false);
    controls.wake();
    await vi.advanceTimersByTimeAsync(2000);
    expect(controls.idle.value).toBe(false);
    await vi.advanceTimersByTimeAsync(800);
    expect(controls.idle.value).toBe(true);
    controls.wake();
    expect(controls.idle.value).toBe(false);
  });
  it("keeps controls visible while dragging or a popover is open", async () => {
    const pinned = ref(true),
      controls = scope.run(() =>
        useIdleControls(
          () => true,
          () => pinned.value,
        ),
      )!;
    await vi.advanceTimersByTimeAsync(10000);
    expect(controls.idle.value).toBe(false);
    pinned.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(2800);
    expect(controls.idle.value).toBe(true);
  });
  it("shows controls on pause or fullscreen exit and clears timers on disposal", async () => {
    const active = ref(true),
      controls = scope.run(() =>
        useIdleControls(
          () => active.value,
          () => false,
        ),
      )!;
    await vi.advanceTimersByTimeAsync(2800);
    expect(controls.idle.value).toBe(true);
    active.value = false;
    await nextTick();
    expect(controls.idle.value).toBe(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(controls.idle.value).toBe(false);
    active.value = true;
    await nextTick();
    scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
