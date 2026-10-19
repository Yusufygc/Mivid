import { AudioSettings } from '@/types/timeline';

/**
 * Gain from the fade-in and fade-out ramps at clip-local time (0..1).
 * Linear ramps, like FFmpeg's `afade` default curve, so the preview matches the export.
 */
export const fadeGain = (localTime: number, duration: number, fadeIn: number, fadeOut: number): number => {
  let gain = 1;
  if (fadeIn > 0) gain = Math.min(gain, Math.max(0, localTime / fadeIn));
  if (fadeOut > 0) gain = Math.min(gain, Math.max(0, (duration - localTime) / fadeOut));
  return Math.min(1, Math.max(0, gain));
};

/** Playback volume of a clip at clip-local time, for an HTMLMediaElement (0..1) */
export const previewVolume = (
  audio: AudioSettings | undefined,
  trackMuted: boolean,
  localTime: number,
  duration: number
): number => {
  if (trackMuted || audio?.muted) return 0;
  const base = Math.min(1, Math.max(0, audio?.volume ?? 1));
  return base * fadeGain(localTime, duration, audio?.fadeIn ?? 0, audio?.fadeOut ?? 0);
};

/** Longest fade that still leaves the other fade room: both fades together may not exceed the clip */
export const maxFade = (duration: number, otherFade: number): number =>
  Math.max(0, Math.round((duration - otherFade) * 100) / 100);

/** FFmpeg filters for the fades of a clip whose audio starts at 0 (after asetpts) */
export const buildFadeFilters = (audio: AudioSettings | undefined, duration: number): string => {
  const parts: string[] = [];
  const fadeIn = Math.min(audio?.fadeIn ?? 0, duration);
  const fadeOut = Math.min(audio?.fadeOut ?? 0, duration);
  if (fadeIn > 0.005) parts.push(`afade=t=in:st=0:d=${fadeIn.toFixed(2)}`);
  if (fadeOut > 0.005) parts.push(`afade=t=out:st=${Math.max(0, duration - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)}`);
  return parts.length > 0 ? `${parts.join(',')},` : '';
};
