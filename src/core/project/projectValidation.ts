import { TRANSITION_TYPES } from '@/core/transitions/transitions';
import { EFFECT_KINDS } from '@/core/effects/regionEffects';

/**
 * Range checks for a project file that comes from outside (a file the user opened, an autosave, a tampered download).
 * `typeof x === 'number'` is not enough: `fps: 0` makes FFmpeg divide by zero, `width: 100000` makes it allocate
 * gigabytes, `duration: -5` puts a clip with negative length on the timeline. Every check returns a readable reason
 * (Turkish, shown to the user) or null.
 */

export const LIMITS = {
  minFrame: 16,
  maxFrame: 16384,
  minFps: 1,
  maxFps: 240,
  /** Longest time value accepted, in seconds (24 hours) */
  maxSeconds: 86_400,
  maxTracks: 200,
  maxClips: 20_000,
  maxAssets: 5_000,
  maxKeyframes: 5_000,
  maxOffset: 1_000_000,
} as const;

const TRACK_TYPES = ['video', 'audio', 'overlay', 'text', 'effect'];
const CLIP_TYPES = ['video', 'audio', 'image', 'text', 'effect'];
const DIRECTIONS = ['left', 'right', 'up', 'down'];
const EASINGS = ['linear', 'ease-in-out'];
const FIT_MODES = ['stretch', 'contain', 'cover'];
const ANIMATED_PROPS = ['x', 'y', 'scale', 'opacity', 'rotation'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A finite number inside [min, max] */
const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Absent, or a finite number inside [min, max] */
const optionalRange = (value: unknown, min: number, max: number): boolean => value === undefined || inRange(value, min, max);

const oneOf = (value: unknown, allowed: readonly string[]): boolean => typeof value === 'string' && allowed.includes(value);

export const validateProjectSettings = (project: Record<string, unknown>): string | null => {
  if (!inRange(project.width, LIMITS.minFrame, LIMITS.maxFrame) || !inRange(project.height, LIMITS.minFrame, LIMITS.maxFrame)) {
    return `Proje boyutu ${LIMITS.minFrame}-${LIMITS.maxFrame} piksel arasında olmalı.`;
  }
  if (!inRange(project.fps, LIMITS.minFps, LIMITS.maxFps)) {
    return `Kare hızı ${LIMITS.minFps}-${LIMITS.maxFps} arasında olmalı.`;
  }
  if (!optionalRange(project.duration, 0, LIMITS.maxSeconds)) return 'Proje süresi geçersiz.';
  return null;
};

const validateTransition = (value: unknown, label: string): string | null => {
  if (value === undefined) return null;
  if (!isObject(value) || !oneOf(value.type, TRANSITION_TYPES) || !inRange(value.duration, 0.01, 3600)) {
    return `${label} geçişi geçersiz.`;
  }
  if (value.direction !== undefined && !oneOf(value.direction, DIRECTIONS)) return `${label} geçişinin yönü geçersiz.`;
  if (value.easing !== undefined && !oneOf(value.easing, EASINGS)) return `${label} geçişinin eğrisi geçersiz.`;
  return null;
};

const validateKeyframes = (value: unknown): string | null => {
  if (value === undefined) return null;
  if (!isObject(value)) return 'Keyframe listesi geçersiz.';
  for (const [prop, list] of Object.entries(value)) {
    if (!ANIMATED_PROPS.includes(prop) || !Array.isArray(list) || list.length > LIMITS.maxKeyframes) {
      return `'${prop}' keyframe'leri geçersiz.`;
    }
    for (const k of list) {
      if (!isObject(k) || !inRange(k.time, 0, LIMITS.maxSeconds) || !inRange(k.value, -LIMITS.maxOffset, LIMITS.maxOffset)) {
        return `'${prop}' keyframe değeri geçersiz.`;
      }
      if (k.easing !== undefined && !oneOf(k.easing, EASINGS)) return `'${prop}' keyframe eğrisi geçersiz.`;
    }
  }
  return null;
};

const validateEffect = (value: unknown): string | null => {
  if (value === undefined) return null;
  if (!isObject(value) || !oneOf(value.kind, EFFECT_KINDS)) return 'Efekt türü geçersiz.';
  if (!inRange(value.width, 1, LIMITS.maxOffset) || !inRange(value.height, 1, LIMITS.maxOffset)) return 'Efekt bölgesi geçersiz.';
  if (!optionalRange(value.strength, 0, 1) || !optionalRange(value.strengthEnd, 0, 1) || !optionalRange(value.feather, 0, 1)) {
    return 'Efekt gücü 0-1 arasında olmalı.';
  }
  return null;
};

const validateTransform = (t: unknown): string | null => {
  if (!isObject(t)) return 'Dönüşüm bilgisi eksik.';
  const offsets = [t.x, t.y, t.rotation];
  if (!offsets.every((v) => v === undefined || inRange(v, -LIMITS.maxOffset, LIMITS.maxOffset))) return 'Konum ya da açı geçersiz.';
  if (!optionalRange(t.scaleX, 0.001, 1000) || !optionalRange(t.scaleY, 0.001, 1000)) return 'Ölçek geçersiz.';
  if (!optionalRange(t.opacity, 0, 1)) return 'Opaklık 0-1 arasında olmalı.';
  return null;
};

/** The reason a clip is unusable, or null. The clip has already passed the shape check (id, type, times, transform). */
export const validateClip = (clip: Record<string, unknown>): string | null => {
  const id = String(clip.id).slice(0, 40);
  const fail = (reason: string) => `Klip '${id}': ${reason}`;

  if (!oneOf(clip.type, CLIP_TYPES)) return fail('klip türü geçersiz.');
  if (!inRange(clip.startTime, 0, LIMITS.maxSeconds)) return fail('başlangıç zamanı geçersiz.');
  if (!inRange(clip.duration, 0.001, LIMITS.maxSeconds)) return fail('süre pozitif ve makul olmalı.');
  if (!optionalRange(clip.inPoint, 0, LIMITS.maxSeconds * 10) || !optionalRange(clip.outPoint, 0, LIMITS.maxSeconds * 10)) {
    return fail('kaynak aralığı geçersiz.');
  }
  if (!optionalRange(clip.speed, 0.01, 100)) return fail('hız geçersiz.');
  if (!optionalRange(clip.backdropBlur, 0, 1)) return fail('arka plan bulanıklığı geçersiz.');
  if (clip.fit !== undefined && !oneOf(clip.fit, FIT_MODES)) return fail('sığdırma modu geçersiz.');

  const reason =
    validateTransform(clip.transform) ??
    validateTransition(clip.transitionIn, 'Giriş') ??
    validateTransition(clip.transitionOut, 'Çıkış') ??
    validateKeyframes(clip.keyframes) ??
    validateEffect(clip.effect);
  if (reason) return fail(reason);

  if (isObject(clip.text) && (typeof clip.text.content !== 'string' || !optionalRange(clip.text.fontSize, 1, 5000))) {
    return fail('metin ayarları geçersiz.');
  }
  if (isObject(clip.audio) && !optionalRange(clip.audio.volume, 0, 10)) return fail('ses seviyesi geçersiz.');
  return null;
};

export const validateTrackShape = (track: Record<string, unknown>): string | null =>
  oneOf(track.type, TRACK_TYPES) ? null : `Kanal türü geçersiz: ${String(track.type).slice(0, 20)}`;

export const validateAsset = (asset: Record<string, unknown>): string | null => {
  if (!optionalRange(asset.duration, 0, LIMITS.maxSeconds * 10)) return 'Medya süresi geçersiz.';
  if (!optionalRange(asset.width, 0, 100_000) || !optionalRange(asset.height, 0, 100_000)) return 'Medya boyutu geçersiz.';
  return null;
};
