/// <reference types="node" />
/**
 * Preview / export parity of the effects, measured on frames of a real FFmpeg render.
 * Opt-in because it needs FFmpeg: `FFMPEG_PARITY=1 npx vitest run src/core/export/effectParity.test.ts`
 * (`FFMPEG_BIN` overrides the FFmpeg path, `QA_DIR` the scratch folder).
 */
import { describe as vitestDescribe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { FFmpegCommandBuilder } from './ffmpegBuilder';
import { Clip, EffectSettings, Track } from '@/types/timeline';
import { MediaAsset } from '@/types/asset';
import { ProjectSettings } from '@/types/project';
import { sharpenKernel, tintAlpha, vignetteAlpha, effectStrengthAt } from '@/core/effects/regionEffects';

const FF = process.env.FFMPEG_BIN ?? 'C:/ffmpeg/bin/ffmpeg.exe';
const DIR = `${process.env.QA_DIR ?? `${tmpdir()}/mivid-parity`}/effects`;
const describe = vitestDescribe.skipIf(!process.env.FFMPEG_PARITY);
const W = 360;
const H = 640;
const project: ProjectSettings = { id: 'p', name: 't', width: W, height: H, fps: 30, aspectRatio: '9:16', duration: 6, backgroundColor: '#000000' };

const run = (args: string[]) => {
  const r = spawnSync(FF, args, { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(String(r.stderr).slice(-2500));
  return r.stdout as Buffer;
};

beforeAll(() => {
  if (!process.env.FFMPEG_PARITY) return;
  mkdirSync(DIR, { recursive: true });
  if (!existsSync(`${DIR}/stripes.mp4`)) {
    // 10 px black / white stripes (levels 40 and 215) so blur and sharpen are easy to measure
    run([
      '-y', '-f', 'lavfi', '-i',
      `color=c=gray:s=${W}x${H}:r=30:d=7,format=yuv420p,geq=lum='if(lt(mod(floor(X/10),2),1),40,215)':cb=128:cr=128`,
      '-pix_fmt', 'yuv420p', `${DIR}/stripes.mp4`,
    ]);
    run(['-y', '-f', 'lavfi', '-i', `color=c=gray:s=${W}x${H}:r=30:d=7`, '-pix_fmt', 'yuv420p', `${DIR}/gray.mp4`]);
  }
});

const asset = (id: string, path: string): MediaAsset => ({ id, name: id, path, url: '', type: 'video', duration: 7, size: 1, createdAt: 0, hasAudio: false });
const assets = new Map([
  ['stripes', asset('stripes', `${DIR}/stripes.mp4`)],
  ['gray', asset('gray', `${DIR}/gray.mp4`)],
]);

const baseClip = (id: string, trackId: string, assetId: string, type: Clip['type'], start: number, duration: number, over: Partial<Clip> = {}): Clip => ({
  id, trackId, assetId, name: id, type, startTime: start, duration, inPoint: 0, outPoint: duration, speed: 1,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 },
  audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
  ...over,
});
const track = (id: string, type: Track['type'], clips: Clip[]): Track => ({ id, name: id, type, isMuted: false, isLocked: false, isHidden: false, clips });

const effectScenario = (source: 'stripes' | 'gray', effect: Partial<EffectSettings> & Pick<EffectSettings, 'kind'>, duration = 4): Track[] => [
  track('fx', 'effect', [
    baseClip('e', 'fx', 'effect-1', 'effect', 1, duration, {
      effect: { shape: 'rect', strength: 0.8, feather: 0, width: 120, height: 200, ...effect },
    }),
  ]),
  track('v1', 'video', [baseClip('v', 'v1', source, 'video', 0, 6)]),
];

const exportScenario = (name: string, tracks: Track[]) => {
  const { args } = FFmpegCommandBuilder.buildExportCommand(project, tracks, assets, { outputPath: `${DIR}/${name}.mp4`, preset: 'ultrafast' });
  run(args);
  return `${DIR}/${name}.mp4`;
};

const frameAt = (file: string, t: number): Buffer =>
  run(['-v', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);

const px = (f: Buffer, x: number, y: number): [number, number, number] => {
  const i = (Math.round(y) * W + Math.round(x)) * 3;
  return [f[i], f[i + 1], f[i + 2]];
};

/** Max - min of the red channel over a horizontal span: high for sharp stripes, low when smeared */
const contrast = (f: Buffer, x0: number, x1: number, y: number) => {
  let lo = 255;
  let hi = 0;
  for (let x = x0; x < x1; x++) {
    const v = px(f, x, y)[0];
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return hi - lo;
};

const CENTER = { x0: 150, x1: 210, y: 320 }; // inside the 120 x 200 region
const OUTSIDE = { x0: 10, x1: 70, y: 320 };

describe('region effects', () => {
  it('blurs only inside the region', () => {
    const f = frameAt(exportScenario('blur_region', effectScenario('stripes', { kind: 'blur', strength: 1 })), 2);
    expect(contrast(f, CENTER.x0, CENTER.x1, CENTER.y)).toBeLessThan(100);
    expect(contrast(f, OUTSIDE.x0, OUTSIDE.x1, OUTSIDE.y)).toBeGreaterThan(150);
  });

  it('inverts the region: blurs everything except it', () => {
    const f = frameAt(exportScenario('blur_invert', effectScenario('stripes', { kind: 'blur', strength: 1, invert: true })), 2);
    expect(contrast(f, CENTER.x0, CENTER.x1, CENTER.y)).toBeGreaterThan(150);
    expect(contrast(f, OUTSIDE.x0, OUTSIDE.x1, OUTSIDE.y)).toBeLessThan(100);
  });

  it('covers the whole frame without a region', () => {
    const f = frameAt(exportScenario('blur_full', effectScenario('stripes', { kind: 'blur', strength: 1, fullFrame: true })), 2);
    expect(contrast(f, CENTER.x0, CENTER.x1, CENTER.y)).toBeLessThan(100);
    expect(contrast(f, OUTSIDE.x0, OUTSIDE.x1, OUTSIDE.y)).toBeLessThan(100);
  });

  it('is off before and after the effect time range', () => {
    const file = exportScenario('blur_range', effectScenario('stripes', { kind: 'blur', strength: 1, fullFrame: true }, 2));
    expect(contrast(frameAt(file, 0.5), OUTSIDE.x0, OUTSIDE.x1, OUTSIDE.y)).toBeGreaterThan(150);
    expect(contrast(frameAt(file, 2), OUTSIDE.x0, OUTSIDE.x1, OUTSIDE.y)).toBeLessThan(100);
    expect(contrast(frameAt(file, 4), OUTSIDE.x0, OUTSIDE.x1, OUTSIDE.y)).toBeGreaterThan(150);
  });
});

describe('strength ramp', () => {
  it('blurs more and more over the clip, in steps', () => {
    const effect: Partial<EffectSettings> & Pick<EffectSettings, 'kind'> = { kind: 'blur', strength: 0.02, strengthEnd: 0.3, fullFrame: true };
    const file = exportScenario('blur_ramp', effectScenario('stripes', effect, 4));
    const early = contrast(frameAt(file, 1.1), OUTSIDE.x0, OUTSIDE.x1, OUTSIDE.y);
    const middle = contrast(frameAt(file, 2), OUTSIDE.x0, OUTSIDE.x1, OUTSIDE.y);
    const late = contrast(frameAt(file, 3.4), OUTSIDE.x0, OUTSIDE.x1, OUTSIDE.y);
    expect(early).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(late);
    // the steps are the ones the preview plays: the strength is the same inside one 0.2 s slice
    const full = { shape: 'rect' as const, feather: 0, width: 120, height: 200, ...effect } as EffectSettings;
    expect(effectStrengthAt(full, 0.05, 4)).toBe(effectStrengthAt(full, 0.15, 4));
    const a = contrast(frameAt(file, 1.02), OUTSIDE.x0, OUTSIDE.x1, OUTSIDE.y);
    const b = contrast(frameAt(file, 1.1), OUTSIDE.x0, OUTSIDE.x1, OUTSIDE.y);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
  });
});

describe('tint', () => {
  it('washes the color over the frame at the preview opacity', () => {
    const f = frameAt(exportScenario('tint_full', effectScenario('gray', { kind: 'tint', strength: 1, color: '#ff0000', fullFrame: true })), 2);
    const alpha = tintAlpha(1);
    const [r, g, b] = px(f, 100, 100);
    expect(Math.abs(r - (128 * (1 - alpha) + 255 * alpha))).toBeLessThan(10);
    expect(Math.abs(g - 128 * (1 - alpha))).toBeLessThan(10);
    expect(Math.abs(b - 128 * (1 - alpha))).toBeLessThan(10);
  });

  it('stays inside the region', () => {
    const f = frameAt(exportScenario('tint_region', effectScenario('gray', { kind: 'tint', strength: 1, color: '#ff0000' })), 2);
    expect(px(f, 180, 320)[0]).toBeGreaterThan(160);
    expect(Math.abs(px(f, 40, 320)[0] - 128)).toBeLessThan(6);
  });
});

describe('sharpen', () => {
  it('applies the 3x3 kernel of the preview to the RGB frame', () => {
    const strength = 0.7;
    const sharp = frameAt(exportScenario('sharpen_full', effectScenario('stripes', { kind: 'sharpen', strength, fullFrame: true })), 2);
    const plain = frameAt(exportScenario('sharpen_none', effectScenario('stripes', { kind: 'sharpen', strength: 0, fullFrame: true })), 2);
    const k = sharpenKernel(strength);
    let worst = 0;
    for (const x of [49, 50, 51, 59, 60, 61, 149, 150, 151]) {
      const y = 320;
      let expected = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expected += k[(dy + 1) * 3 + (dx + 1)] * px(plain, x + dx, y + dy)[0];
      expected = Math.min(255, Math.max(0, expected));
      worst = Math.max(worst, Math.abs(expected - px(sharp, x, y)[0]));
    }
    expect(worst).toBeLessThanOrEqual(8);
    // and it really overshoots the stripe levels
    expect(contrast(sharp, 40, 80, 320)).toBeGreaterThan(contrast(plain, 40, 80, 320));
  });
});

describe('vignette', () => {
  it('darkens by vignetteAlpha() along a radius', () => {
    const strength = 0.8;
    const f = frameAt(exportScenario('vignette', effectScenario('gray', { kind: 'vignette', strength })), 2);
    const half = Math.hypot(W / 2, H / 2);
    for (const r of [0.2, 0.5, 0.7, 0.9]) {
      const d = r * half;
      // a point at distance d from the center on the line to the top-left corner
      const x = W / 2 - (d * (W / 2)) / half;
      const y = H / 2 - (d * (H / 2)) / half;
      const expected = 128 * (1 - vignetteAlpha(r, strength));
      expect(Math.abs(px(f, x, y)[0] - expected)).toBeLessThan(7);
    }
  });
});
