export const SIGNAL_CHAPTERS = ["ACQUIRE", "FIX", "SEAL", "RESOLVE"] as const;

export interface SignalStoryState {
  chapter: number;
  localProgress: number;
  terrain: number;
  devices: number;
  relay: number;
  delivery: number;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const range = (value: number, start: number, end: number) => clamp((value - start) / (end - start));

export function signalStoryState(progress: number): SignalStoryState {
  const normalized = clamp(progress);
  const scaled = normalized * SIGNAL_CHAPTERS.length;
  const chapter = Math.min(SIGNAL_CHAPTERS.length - 1, Math.floor(scaled));
  return {
    chapter,
    localProgress: scaled - chapter,
    terrain: range(normalized, 0, .2),
    devices: range(normalized, .12, .42),
    relay: range(normalized, .36, .66),
    delivery: range(normalized, .62, .94),
  };
}
