/// <reference types="node" />
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { FFmpegCommandBuilder } from './ffmpegBuilder';
import { ProjectSettings } from '@/types/project';
import { Clip, Track } from '@/types/timeline';
import { MediaAsset } from '@/types/asset';

/**
 * Contract between the export builder and the Rust argument guard (`src-tauri/src/export_guard.rs`).
 *
 * The guard only lets through FFmpeg calls of the kind this builder produces. This test builds one command per feature
 * and writes them to `src-tauri/tests/fixtures/export_args.json`; the Rust tests feed every one of them to the guard.
 * When the builder starts to use a new filter or flag, this fixture changes and the Rust test fails until the guard's
 * allowed lists are updated on purpose.
 */

const FIXTURE_PATH = resolve(__dirname, '../../../src-tauri/tests/fixtures/export_args.json');

const project: ProjectSettings = {
  id: 'p1',
  name: 'Guard fixtures',
  width: 1080,
  height: 1920,
  fps: 30,
  aspectRatio: '9:16',
  duration: 30,
  backgroundColor: '#000000',
};

const asset = (id: string, type: MediaAsset['type'], path: string, hasAudio?: boolean): MediaAsset => ({
  id,
  name: path.split('/').pop() as string,
  path,
  url: 'blob:x',
  type,
  duration: 40,
  size: 1,
  createdAt: 0,
  hasAudio,
});

const assets = new Map<string, MediaAsset>([
  ['v1', asset('v1', 'video', 'C:/media/video one.mp4')],
  ['v2', asset('v2', 'video', 'C:/media/video2.mp4')],
  ['silent', asset('silent', 'video', 'C:/media/silent.mp4', false)],
  ['img', asset('img', 'image', 'C:/media/sticker.png')],
  ['aud', asset('aud', 'audio', 'C:/media/music.mp3')],
]);

const baseClip = (id: string, trackId: string, assetId: string, type: Clip['type'], over: Partial<Clip> = {}): Clip => ({
  id,
  trackId,
  assetId,
  name: id,
  type,
  startTime: 0,
  duration: 6,
  inPoint: 0,
  outPoint: 6,
  speed: 1,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 },
  audio: { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
  ...over,
});

const track = (id: string, type: Track['type'], clips: Clip[]): Track => ({
  id,
  name: id,
  type,
  isMuted: false,
  isLocked: false,
  isHidden: false,
  clips,
});

const kf = (time: number, value: number, easing: 'linear' | 'ease-in-out' = 'linear') => ({ id: `k${time}${value}`, time, value, easing });

const textProps = (over: Partial<NonNullable<Clip['text']>> = {}): NonNullable<Clip['text']> => ({
  content: "Merhaba: 'dünya' 100% \\ çok satır",
  fontFamily: 'Impact, sans-serif',
  fontSize: 64,
  color: '#FFD400',
  fontWeight: 'bold',
  textAlign: 'center',
  ...over,
});

const scenarios: Record<string, Track[]> = {
  plain_video: [track('t1', 'video', [baseClip('c1', 't1', 'v1', 'video', { inPoint: 1, outPoint: 7 })])],

  everything_on_a_video: [
    track('t1', 'video', [
      baseClip('c1', 't1', 'v1', 'video', {
        speed: 1.5,
        outPoint: 9,
        fit: 'contain',
        backdropBlur: 0.55,
        chromaKey: { color: '#00ff00', similarity: 0.3, blend: 0.1 },
        colorGrading: { brightness: -0.04, contrast: 1.25, saturation: 0.9 },
        audio: { volume: 0.6, muted: false, fadeIn: 1, fadeOut: 2, denoise: true },
        keyframes: {
          x: [kf(0, 0), kf(3, 120, 'ease-in-out')],
          y: [kf(0, 0), kf(3, -80)],
          scale: [kf(0, 1), kf(5, 1.3)],
          opacity: [kf(0, 1), kf(5, 0.4)],
          rotation: [kf(0, 0), kf(5, 15)],
        },
        transitionOut: { type: 'cross-dissolve', duration: 1 },
      }),
      baseClip('c2', 't1', 'v2', 'video', {
        startTime: 5,
        fit: 'cover',
        transitionIn: { type: 'cross-dissolve', duration: 1 },
        transitionOut: { type: 'fade-to-black', duration: 1 },
      }),
      baseClip('c3', 't1', 'v2', 'video', {
        startTime: 11,
        transitionIn: { type: 'slide', duration: 1 },
        transitionOut: { type: 'wipe', duration: 1 },
      }),
    ]),
  ],

  rotated_and_scaled_overlay: [
    track('t1', 'video', [baseClip('c1', 't1', 'v1', 'video')]),
    track('t2', 'overlay', [
      baseClip('c2', 't2', 'v2', 'video', {
        startTime: 1,
        transform: { x: 200, y: -300, scaleX: 0.5, scaleY: 0.5, rotation: 20, opacity: 0.8, zIndex: 2 },
      }),
    ]),
  ],

  text_variants: [
    track('t1', 'video', [baseClip('c1', 't1', 'v1', 'video', { duration: 12, outPoint: 12 })]),
    track('tt', 'text', [
      baseClip('x1', 'tt', '', 'text', { text: textProps(), startTime: 1, duration: 3 }),
      baseClip('x2', 'tt', '', 'text', {
        text: textProps({
          fontFamily: '"Courier New", monospace',
          fontStyle: 'italic',
          fontWeight: '900',
          stroke: { color: '#000000', width: 3 },
          shadow: { color: '#000000', blur: 4, offsetX: 2, offsetY: 2 },
          backgroundBox: { enabled: true, color: '#00000099', padding: 12, borderRadius: 8 },
          animation: { in: 'typewriter', out: 'fade', duration: 0.5 },
        }),
        startTime: 4,
        duration: 3,
      }),
      baseClip('x3', 'tt', '', 'text', {
        text: textProps({ animation: { in: 'slide', out: 'none', duration: 0.5 } }),
        startTime: 7,
        duration: 2,
        transform: { x: 0, y: 100, scaleX: 1, scaleY: 1, rotation: 12, opacity: 0.9, zIndex: 3 },
      }),
      baseClip('x4', 'tt', '', 'text', {
        text: textProps({ animation: { in: 'zoom', out: 'fade', duration: 0.5 } }),
        startTime: 9,
        duration: 2,
      }),
    ]),
  ],

  region_effects: [
    track('t1', 'video', [baseClip('c1', 't1', 'v1', 'video', { duration: 12, outPoint: 12 })]),
    track('te', 'effect', [
      baseClip('e1', 'te', 'effect-1', 'effect', {
        startTime: 1,
        duration: 3,
        effect: { kind: 'blur', shape: 'rect', strength: 0.5, feather: 0, width: 400, height: 200 },
        audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
      }),
      baseClip('e2', 'te', 'effect-2', 'effect', {
        startTime: 4,
        duration: 3,
        effect: { kind: 'pixelate', shape: 'ellipse', strength: 0.6, feather: 0.3, width: 300, height: 300 },
        keyframes: { x: [kf(0, 0), kf(2, 150)], y: [kf(0, 0), kf(2, -60)], scale: [kf(0, 1), kf(2, 1.4)] },
        audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
      }),
      baseClip('e3', 'te', 'effect-3', 'effect', {
        startTime: 8,
        duration: 2,
        effect: { kind: 'blackbox', shape: 'rect', strength: 1, feather: 0, width: 250, height: 120 },
        audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
      }),
    ]),
  ],

  all_transitions: [
    track('t1', 'video', [
      baseClip('c1', 't1', 'v1', 'video', {
        duration: 8,
        outPoint: 8,
        transitionOut: { type: 'wipe', duration: 1, direction: 'down', easing: 'ease-in-out' },
      }),
      baseClip('c2', 't1', 'v2', 'video', {
        startTime: 7,
        duration: 8,
        outPoint: 8,
        transitionIn: { type: 'iris', duration: 1, easing: 'ease-in-out' },
        transitionOut: { type: 'zoom', duration: 1, easing: 'ease-in-out' },
      }),
      baseClip('c3', 't1', 'v1', 'video', {
        startTime: 14,
        duration: 8,
        outPoint: 8,
        transitionIn: { type: 'blur', duration: 1 },
        transitionOut: { type: 'flash', duration: 0.5, easing: 'ease-in-out' },
      }),
      baseClip('c4', 't1', 'v2', 'video', {
        startTime: 22,
        duration: 8,
        outPoint: 8,
        transitionIn: { type: 'slide', duration: 1, direction: 'up', easing: 'ease-in-out' },
        transitionOut: { type: 'cross-dissolve', duration: 1, easing: 'ease-in-out' },
      }),
    ]),
  ],

  new_effects: [
    track('t1', 'video', [baseClip('c1', 't1', 'v1', 'video', { duration: 20, outPoint: 20 })]),
    track('te', 'effect', [
      baseClip('e1', 'te', 'effect-1', 'effect', {
        startTime: 1,
        duration: 3,
        effect: { kind: 'blur', shape: 'ellipse', strength: 0.1, strengthEnd: 0.9, strengthEasing: 'ease-in-out', feather: 0.3, width: 300, height: 300, invert: true },
        audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
      }),
      baseClip('e2', 'te', 'effect-2', 'effect', {
        startTime: 5,
        duration: 2,
        effect: { kind: 'tint', shape: 'rect', strength: 0.7, feather: 0, width: 400, height: 400, color: '#FF9F40', fullFrame: true },
        audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
      }),
      baseClip('e3', 'te', 'effect-3', 'effect', {
        startTime: 8,
        duration: 2,
        effect: { kind: 'sharpen', shape: 'rect', strength: 0.6, feather: 0.1, width: 400, height: 400 },
        audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
      }),
      baseClip('e4', 'te', 'effect-4', 'effect', {
        startTime: 11,
        duration: 3,
        effect: { kind: 'vignette', shape: 'rect', strength: 0.6, strengthEnd: 0.2, feather: 0, width: 400, height: 400, fullFrame: true },
        audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
      }),
    ]),
  ],

  image_freeze_silent_audio: [
    track('t1', 'video', [
      baseClip('c1', 't1', 'v1', 'video', { duration: 4, outPoint: 4 }),
      baseClip('c2', 't1', 'v1', 'video', { startTime: 4, duration: 2, inPoint: 3, outPoint: 3, freeze: true }),
      baseClip('c3', 't1', 'silent', 'video', { startTime: 6, duration: 4, outPoint: 4 }),
    ]),
    track('t2', 'overlay', [
      baseClip('c4', 't2', 'img', 'image', {
        startTime: 1,
        duration: 5,
        transform: { x: 100, y: 200, scaleX: 0.4, scaleY: 0.4, rotation: 0, opacity: 1, zIndex: 2 },
        keyframes: { opacity: [kf(0, 0), kf(1, 1)] },
      }),
    ]),
    track('ta', 'audio', [baseClip('a1', 'ta', 'aud', 'audio', { startTime: 0, duration: 8, outPoint: 24, speed: 3, audio: { volume: 0.8, muted: false, fadeIn: 0.5, fadeOut: 0.5 } })]),
  ],
};

/** Splits on `separator` outside single quotes and parentheses; a backslash keeps the next character with the current part */
const splitTopLevel = (text: string, separator: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      current += ch + (text[i + 1] ?? '');
      i++;
      continue;
    }
    if (ch === "'") quoted = !quoted;
    if (!quoted) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === separator && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  parts.push(current);
  return parts;
};

/** Filter names used in a filter graph: `[in]name=options,name2=options[out]; ...` */
const filterNames = (graph: string): string[] => {
  const names = new Set<string>();
  for (const segment of splitTopLevel(graph, ';')) {
    const chain = segment.replace(/^\s*(\[[^\]]*\])*/, '');
    for (const element of splitTopLevel(chain, ',')) {
      const match = /^\s*([A-Za-z0-9_]+)/.exec(element);
      if (match) names.add(match[1]);
    }
  }
  return [...names].sort();
};

describe('export guard fixtures', () => {
  const built = Object.entries(scenarios).map(([name, tracks]) => {
    const { args, filterComplex } = FFmpegCommandBuilder.buildExportCommand(project, tracks, assets, {
      outputPath: 'C:/out/export.mp4',
      preset: 'fast',
    });
    return { name, args, filterComplex };
  });

  it('writes every scenario for the Rust guard tests', () => {
    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    const fixture = built.map(({ name, args }) => ({ name, args }));
    writeFileSync(FIXTURE_PATH, JSON.stringify({ inputs: [...assets.values()].map((a) => a.path), output: 'C:/out/export.mp4', scenarios: fixture }, null, 2) + '\n');
    expect(fixture).toHaveLength(Object.keys(scenarios).length);
  });

  it('uses only the filters and flags the guard allows', () => {
    const filters = new Set<string>();
    const flags = new Set<string>();
    for (const { args, filterComplex } of built) {
      for (const f of filterNames(filterComplex)) filters.add(f);
      args.filter((a) => a.startsWith('-') && a.length > 1 && /[A-Za-z]/.test(a[1])).forEach((a) => flags.add(a));
    }
    // Keep in sync with ALLOWED_FILTERS / ALLOWED_FLAGS in src-tauri/src/export_guard.rs
    expect([...filters].sort()).toMatchSnapshot();
    expect([...flags].sort()).toMatchSnapshot();
  });
});
