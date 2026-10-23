/// <reference types="node" />
/**
 * Preview / export parity of transitions, measured on frames of a real FFmpeg render (two solid-color clips).
 * Opt-in because it needs FFmpeg: `FFMPEG_PARITY=1 npx vitest run src/core/export/transitionParity.test.ts`
 * (`FFMPEG_BIN` overrides the FFmpeg path, `QA_DIR` the scratch folder).
 */
import { describe as vitestDescribe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { FFmpegCommandBuilder } from './ffmpegBuilder';
import { Clip, Track, Transition } from '@/types/timeline';
import { MediaAsset } from '@/types/asset';
import { ProjectSettings } from '@/types/project';
import { combineTransitionVisuals } from '@/core/transitions/transitions';

const FF = process.env.FFMPEG_BIN ?? 'C:/ffmpeg/bin/ffmpeg.exe';
const DIR = `${process.env.QA_DIR ?? `${tmpdir()}/mivid-parity`}/trans`;
const describe = vitestDescribe.skipIf(!process.env.FFMPEG_PARITY);
const W = 360;
const H = 640;
const project: ProjectSettings = { id: 'p', name: 't', width: W, height: H, fps: 30, aspectRatio: '9:16', duration: 7, backgroundColor: '#000000' };

const run = (args: string[]) => {
  const r = spawnSync(FF, args, { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(String(r.stderr).slice(-2500));
  return r.stdout as Buffer;
};

beforeAll(() => {
  if (!process.env.FFMPEG_PARITY) return;
  mkdirSync(DIR, { recursive: true });
  if (!existsSync(`${DIR}/red.mp4`)) {
    run(['-y', '-f', 'lavfi', '-i', `color=c=red:s=${W}x${H}:r=30:d=8`, '-pix_fmt', 'yuv420p', `${DIR}/red.mp4`]);
    run([
      '-y', '-f', 'lavfi', '-i',
      `color=c=blue:s=${W}x${H}:r=30:d=8,drawbox=x=170:y=0:w=20:h=${H}:color=white:t=fill`,
      '-pix_fmt', 'yuv420p', `${DIR}/blue.mp4`,
    ]);
  }
});

const asset = (id: string, path: string): MediaAsset => ({ id, name: id, path, url: '', type: 'video', duration: 8, size: 1, createdAt: 0, hasAudio: false });
const assets = new Map([
  ['red', asset('red', `${DIR}/red.mp4`)],
  ['blue', asset('blue', `${DIR}/blue.mp4`)],
]);

const clip = (id: string, trackId: string, assetId: string, start: number, duration: number, over: Partial<Clip> = {}): Clip => ({
  id, trackId, assetId, name: id, type: 'video', startTime: start, duration, inPoint: 0, outPoint: duration, speed: 1,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 },
  audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
  ...over,
});
const track = (id: string, type: Track['type'], clips: Clip[]): Track => ({ id, name: id, type, isMuted: false, isLocked: false, isHidden: false, clips });

/** B (blue + white bar) comes in at 3 s over A (red); or A leaves over B */
const scenario = (side: 'in' | 'out', transition: Transition) => {
  if (side === 'in') {
    return [
      track('v1', 'video', [clip('a', 'v1', 'red', 0, 4)]),
      track('ov', 'overlay', [clip('b', 'ov', 'blue', 3, 4, { transitionIn: transition })]),
    ].reverse(); // lower lane first in the array? (overlay is the upper lane)
  }
  return [
    track('ov', 'overlay', [clip('a', 'ov', 'red', 0, 4, { transitionOut: transition })]),
    track('v1', 'video', [clip('b', 'v1', 'blue', 0, 7)]),
  ];
};

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
const isBlue = (p: number[]) => p[2] > 200 && p[0] < 60;
const isRed = (p: number[]) => p[0] > 200 && p[2] < 60;

const expectedFor = (side: 'in' | 'out', transition: Transition, t: number) => {
  const c = side === 'in'
    ? clip('b', 'ov', 'blue', 3, 4, { transitionIn: transition })
    : clip('a', 'ov', 'red', 0, 4, { transitionOut: transition });
  return combineTransitionVisuals(c, t, W, H);
};

describe('wipe: boundary column matches the preview formula', () => {
  for (const direction of ['left', 'right', 'up', 'down'] as const) {
    for (const easing of ['linear', 'ease-in-out'] as const) {
      it(`in, ${direction}, ${easing}`, () => {
        const transition: Transition = { type: 'wipe', duration: 1, direction, easing };
        const file = exportScenario(`wipe_in_${direction}_${easing}`, scenario('in', transition));
        const t = 3.5;
        const f = frameAt(file, t);
        const { rects } = expectedFor('in', transition, t);
        const r = rects[0];
        // sample inside / outside the visible rectangle along the axis
        const inside = [(r.x0 + r.x1) / 2 * W, (r.y0 + r.y1) / 2 * H];
        expect(isBlue(px(f, inside[0], inside[1])) || px(f, inside[0], inside[1])[1] > 200).toBe(true);
        // a point clearly outside the rectangle shows A (red)
        const outsideX = r.x0 > 0.1 ? (r.x0 / 2) * W : r.x1 < 0.9 ? ((r.x1 + 1) / 2) * W : W / 2;
        const outsideY = r.y0 > 0.1 ? (r.y0 / 2) * H : r.y1 < 0.9 ? ((r.y1 + 1) / 2) * H : H / 2;
        expect(isRed(px(f, outsideX, outsideY))).toBe(true);
        // edge position within 3 px
        if (direction === 'left' || direction === 'right') {
          const y = 100;
          let edge = -1;
          for (let x = 0; x < W; x++) {
            const blue = isBlue(px(f, x, y)) || px(f, x, y)[1] > 200;
            if (direction === 'left' && blue) { edge = x; break; }
            if (direction === 'right' && !blue && x > 5) { edge = x; break; }
          }
          const expected = direction === 'left' ? r.x0 * W : r.x1 * W;
          expect(Math.abs(edge - expected)).toBeLessThanOrEqual(3);
        }
      });
    }
  }

  it('out, left: the red clip is erased from the right edge', () => {
    const transition: Transition = { type: 'wipe', duration: 1, direction: 'left', easing: 'linear' };
    const file = exportScenario('wipe_out_left', scenario('out', transition));
    const f = frameAt(file, 3.5);
    const { rects } = expectedFor('out', transition, 3.5);
    const edgeExpected = rects[0].x1 * W; // red kept for x < x1*W
    let edge = -1;
    for (let x = 0; x < W; x++) if (!isRed(px(f, x, 100))) { edge = x; break; }
    expect(Math.abs(edge - edgeExpected)).toBeLessThanOrEqual(3);
  });
});

describe('iris', () => {
  it('opens a circle of the expected radius', () => {
    const transition: Transition = { type: 'iris', duration: 1, easing: 'ease-in-out' };
    const file = exportScenario('iris_in', scenario('in', transition));
    const t = 3.4;
    const f = frameAt(file, t);
    const radius = expectedFor('in', transition, t).irisRadii[0];
    // walk from the center along the x axis (away from the white bar at 170..190) until A (red) shows
    let hit = -1;
    for (let d = 20; d < W / 2; d++) {
      if (isRed(px(f, W / 2 + d, H / 2))) { hit = d; break; }
    }
    expect(hit).toBeGreaterThan(0);
    expect(Math.abs(hit - radius)).toBeLessThanOrEqual(3);
  });
});

describe('dissolve', () => {
  it('mixes with the eased alpha', () => {
    const transition: Transition = { type: 'cross-dissolve', duration: 1, easing: 'ease-in-out' };
    const file = exportScenario('dissolve_eased', scenario('in', transition));
    const f = frameAt(file, 3.25);
    const alpha = expectedFor('in', transition, 3.25).visual.alpha;
    const p = px(f, 40, 300);
    expect(Math.abs(p[2] / 255 - alpha)).toBeLessThan(0.06);
    expect(Math.abs(p[0] / 255 - (1 - alpha))).toBeLessThan(0.06);
  });

  it('the linear dissolve still uses the fade filter', () => {
    const { filterComplex } = FFmpegCommandBuilder.buildExportCommand(project, scenario('in', { type: 'cross-dissolve', duration: 1 }), assets, { outputPath: 'x.mp4' });
    expect(filterComplex).toContain('fade=t=in');
    expect(filterComplex).not.toContain('geq');
  });
});

describe('slide', () => {
  for (const direction of ['left', 'right', 'up', 'down'] as const) {
    it(`in, ${direction}`, () => {
      const transition: Transition = { type: 'slide', duration: 1, direction, easing: 'ease-in-out' };
      const file = exportScenario(`slide_in_${direction}`, scenario('in', transition));
      const t = 3.4;
      const f = frameAt(file, t);
      const v = expectedFor('in', transition, t).visual;
      if (direction === 'left' || direction === 'right') {
        // the blue clip spans [dx, dx+W] horizontally
        const dx = v.dx;
        const sample = dx > 0 ? dx + 8 : W + dx - 8;
        expect(isBlue(px(f, Math.min(W - 1, Math.max(0, sample)), 100)) || px(f, Math.min(W - 1, Math.max(0, sample)), 100)[1] > 200).toBe(true);
        const outside = dx > 0 ? dx - 8 : W + dx + 8;
        expect(isRed(px(f, Math.min(W - 1, Math.max(0, outside)), 100))).toBe(true);
      } else {
        const dy = v.dy;
        const sample = dy > 0 ? dy + 8 : H + dy - 8;
        expect(isBlue(px(f, 40, Math.min(H - 1, Math.max(0, sample))))).toBe(true);
        const outside = dy > 0 ? dy - 8 : H + dy + 8;
        expect(isRed(px(f, 40, Math.min(H - 1, Math.max(0, outside))))).toBe(true);
      }
    });
  }
});

describe('zoom', () => {
  it('scales the clip from 1.5x to 1x', () => {
    const transition: Transition = { type: 'zoom', duration: 1, easing: 'linear' };
    const file = exportScenario('zoom_in', scenario('in', transition));
    const t = 3.5;
    const f = frameAt(file, t);
    const v = expectedFor('in', transition, t).visual;
    // white bar (20 px) of the incoming clip, blended at alpha 0.5 over red: measure G above 60
    let count = 0;
    for (let x = 0; x < W; x++) if (px(f, x, 100)[1] > 60) count++;
    expect(Math.abs(count - 20 * v.scale)).toBeLessThanOrEqual(3);
  });
});

describe('blur', () => {
  it('softens the incoming clip: the bar is wider and dimmer than the unblurred bar', () => {
    const transition: Transition = { type: 'blur', duration: 1, easing: 'linear' };
    const file = exportScenario('blur_in', scenario('in', transition));
    const f = frameAt(file, 3.9);
    let maxG = 0;
    let wide = 0;
    for (let x = 0; x < W; x++) {
      const g = px(f, x, 100)[1];
      maxG = Math.max(maxG, g);
      if (g > 20) wide++;
    }
    expect(maxG).toBeLessThan(250);
    expect(wide).toBeGreaterThan(22);
  });
});

describe('flash', () => {
  it('lays white of alpha 1 - e over the frame', () => {
    const transition: Transition = { type: 'flash', duration: 1, easing: 'linear' };
    const file = exportScenario('flash_in', scenario('in', transition));
    const f = frameAt(file, 3.25);
    const flash = expectedFor('in', transition, 3.25).flashes[0];
    // blue clip is fully visible under the flash: color = blue*(1-flash) + white*flash
    const p = px(f, 40, 300);
    expect(Math.abs(p[0] / 255 - flash)).toBeLessThan(0.07);
    expect(Math.abs(p[2] / 255 - 1)).toBeLessThan(0.07);
    // outside the window it is gone
    expect(px(frameAt(file, 4.5), 40, 300)[0]).toBeLessThan(20);
  });
});

describe('in + out on one clip', () => {
  it('runs a wipe in and an iris out without breaking the graph', () => {
    const tracks = [
      track('ov', 'overlay', [clip('b', 'ov', 'blue', 2, 4, { transitionIn: { type: 'wipe', duration: 1, direction: 'down' }, transitionOut: { type: 'iris', duration: 1 } })]),
      track('v1', 'video', [clip('a', 'v1', 'red', 0, 7)]),
    ];
    const file = exportScenario('both', tracks);
    expect(isRed(px(frameAt(file, 1), 40, 300))).toBe(true);
    expect(isBlue(px(frameAt(file, 4), 40, 300))).toBe(true);
    expect(isRed(px(frameAt(file, 6.5), 40, 300))).toBe(true);
  });
});
