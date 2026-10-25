import { MediaAsset } from '@/types/asset';
import { Logger } from '@/core/logger';

/** Longer audio is not decoded for the waveform: decoding keeps the whole track in memory as float samples */
export const MAX_WAVEFORM_SECONDS = 10 * 60;
export const PEAKS_PER_SECOND = 50;
export const FILMSTRIP_FRAMES = 12;
const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 54;

export interface WaveformPeaks {
  /** Largest absolute sample per bucket, 0..1, evenly spread over the whole asset */
  peaks: Float32Array;
  duration: number;
}

/** Reduces samples to `buckets` peak values (max absolute amplitude per bucket) */
export const computePeaks = (samples: Float32Array, buckets: number): Float32Array => {
  const count = Math.max(1, Math.floor(buckets));
  const peaks = new Float32Array(count);
  if (samples.length === 0) return peaks;

  const size = samples.length / count;
  for (let b = 0; b < count; b++) {
    const start = Math.floor(b * size);
    const end = Math.max(start + 1, Math.min(samples.length, Math.floor((b + 1) * size)));
    let max = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > max) max = v;
    }
    peaks[b] = Math.min(1, max);
  }
  return peaks;
};

/** Peaks of the part of an asset a clip shows: `fromSeconds`..`toSeconds` of the source, resampled to `columns` values */
export const sliceWaveform = (
  waveform: WaveformPeaks,
  fromSeconds: number,
  toSeconds: number,
  columns: number
): Float32Array => {
  const out = new Float32Array(Math.max(1, Math.floor(columns)));
  if (waveform.duration <= 0 || waveform.peaks.length === 0) return out;

  const perSecond = waveform.peaks.length / waveform.duration;
  const span = Math.max(0.001, toSeconds - fromSeconds);
  for (let c = 0; c < out.length; c++) {
    const a = Math.floor((fromSeconds + (c / out.length) * span) * perSecond);
    const b = Math.max(a + 1, Math.floor((fromSeconds + ((c + 1) / out.length) * span) * perSecond));
    let max = 0;
    for (let i = Math.max(0, a); i < Math.min(waveform.peaks.length, b); i++) {
      if (waveform.peaks[i] > max) max = waveform.peaks[i];
    }
    out[c] = max;
  }
  return out;
};

const waveformCache = new Map<string, Promise<WaveformPeaks | null>>();
const filmstripCache = new Map<string, Promise<string | null>>();

/** Decoding and frame grabbing run one after another so a big import does not freeze the editor */
let workQueue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
  const result = workQueue.then(job, job);
  workQueue = result.catch(() => undefined);
  return result;
};

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

const decodeWaveform = async (asset: MediaAsset): Promise<WaveformPeaks | null> => {
  if (!asset.url || asset.duration > MAX_WAVEFORM_SECONDS) return null;
  if (typeof OfflineAudioContext === 'undefined') return null;

  try {
    const response = await fetch(asset.url);
    const buffer = await response.arrayBuffer();
    // An offline context decodes without needing a user gesture or an audio device
    const context = new OfflineAudioContext(1, 1, 44100);
    const audio = await context.decodeAudioData(buffer);

    const channels = audio.numberOfChannels;
    const mixed = new Float32Array(audio.length);
    for (let c = 0; c < channels; c++) {
      const data = audio.getChannelData(c);
      for (let i = 0; i < data.length; i++) mixed[i] += data[i] / channels;
    }

    const buckets = Math.min(20000, Math.max(200, Math.round(audio.duration * PEAKS_PER_SECOND)));
    return { peaks: computePeaks(mixed, buckets), duration: audio.duration };
  } catch (e) {
    Logger.warn('mediaCache', `Waveform unavailable for ${asset.name}`, e);
    return null;
  }
};

/** Waveform peaks for an audio or video asset, decoded once and cached. Resolves to null when not available. */
export const getWaveform = (asset: MediaAsset): Promise<WaveformPeaks | null> => {
  let cached = waveformCache.get(asset.id);
  if (!cached) {
    cached = enqueue(() => decodeWaveform(asset));
    waveformCache.set(asset.id, cached);
  }
  return cached;
};

const grabFilmstrip = async (asset: MediaAsset): Promise<string | null> => {
  if (!asset.url || asset.type !== 'video' || typeof document === 'undefined') return null;

  try {
    const video = document.createElement('video');
    // Anonymous CORS: the Tauri asset protocol answers cross-origin, and without it the canvas that draws the video is tainted (thumbnails, film strip, chroma key fail)
    video.crossOrigin = 'anonymous';
    video.src = asset.url;
    video.muted = true;
    video.preload = 'auto';
    video.playsInline = true;

    const ready = await withTimeout(
      new Promise<boolean>((resolve) => {
        video.onloadeddata = () => resolve(true);
        video.onerror = () => resolve(false);
      }),
      4000,
      false
    );
    if (!ready) return null;

    const duration = video.duration && isFinite(video.duration) ? video.duration : asset.duration;
    const canvas = document.createElement('canvas');
    canvas.width = FRAME_WIDTH * FILMSTRIP_FRAMES;
    canvas.height = FRAME_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    for (let i = 0; i < FILMSTRIP_FRAMES; i++) {
      // Sample the middle of each slice so the strip lines up with the timeline
      const time = Math.min(duration - 0.05, ((i + 0.5) / FILMSTRIP_FRAMES) * duration);
      const seeked = await withTimeout(
        new Promise<boolean>((resolve) => {
          video.onseeked = () => resolve(true);
          video.currentTime = Math.max(0, time);
        }),
        2500,
        false
      );
      if (seeked) ctx.drawImage(video, i * FRAME_WIDTH, 0, FRAME_WIDTH, FRAME_HEIGHT);
    }

    video.removeAttribute('src');
    video.load();
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch (e) {
    Logger.warn('mediaCache', `Filmstrip unavailable for ${asset.name}`, e);
    return null;
  }
};

/** A horizontal strip of evenly spaced frames of a video asset (data URL), cached. Resolves to null when not available. */
export const getFilmstrip = (asset: MediaAsset): Promise<string | null> => {
  let cached = filmstripCache.get(asset.id);
  if (!cached) {
    cached = enqueue(() => grabFilmstrip(asset));
    filmstripCache.set(asset.id, cached);
  }
  return cached;
};

/** Forgets cached visuals, e.g. after the media at an asset id changed */
export const clearMediaCache = (assetId?: string): void => {
  if (assetId) {
    waveformCache.delete(assetId);
    filmstripCache.delete(assetId);
  } else {
    waveformCache.clear();
    filmstripCache.clear();
  }
};
