export function chooseRandom<T extends { id: string }>(
  candidates: T[],
  occupied: Set<string>,
  recent: string[],
  random = Math.random,
): T | undefined {
  const available = candidates.filter((item) => !occupied.has(item.id));
  const fresh = available.filter((item) => !recent.includes(item.id));
  const pool = fresh.length ? fresh : available;
  return pool[Math.floor(random() * pool.length)];
}
export function randomStart(
  duration: number,
  enabled: boolean,
  random = Math.random,
): number {
  if (!enabled || !Number.isFinite(duration) || duration <= 10) return 0;
  const min = duration * 0.05,
    max = Math.min(duration * 0.8, duration - 10);
  return max > min ? min + random() * (max - min) : 0;
}
