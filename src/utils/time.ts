/**
 * Converts seconds into a formatted timecode (HH:MM:SS.FF or MM:SS:FF)
 */
export function formatTimecode(seconds: number, fps: number = 30): string {
  if (isNaN(seconds) || seconds < 0) seconds = 0;

  const totalFrames = Math.floor(seconds * fps);
  const frameRemainder = totalFrames % fps;

  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n: number, z: number = 2) => String(n).padStart(z, '0');

  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}:${pad(frameRemainder)}`;
  }
  return `${pad(mins)}:${pad(secs)}:${pad(frameRemainder)}`;
}

/**
 * Converts formatted string time or seconds to clean rounded float
 */
export function clampTime(time: number, min: number = 0, max: number = Infinity): number {
  return Math.max(min, Math.min(max, Math.round(time * 1000) / 1000));
}

/**
 * Rounds a time to the nearest frame boundary
 */
export function snapToFrame(time: number, fps: number = 30): number {
  const frameDuration = 1 / fps;
  return Math.round(time / frameDuration) * frameDuration;
}
