import { describe, it, expect, beforeEach } from 'vitest';
import { PreviewEngine } from './previewEngine';
import { Clip, Track } from '@/types/timeline';
import { ProjectSettings } from '@/types/project';

const project: ProjectSettings = {
  id: 'p',
  name: 'p',
  width: 1000,
  height: 500,
  fps: 30,
  aspectRatio: '16:9',
  duration: 10,
  backgroundColor: '#000000',
};

const baseClip = (id: string, type: Clip['type'], overrides: Partial<Clip> = {}): Clip => ({
  id,
  trackId: 't1',
  assetId: `asset-${id}`,
  name: id,
  type,
  startTime: 0,
  duration: 5,
  inPoint: 0,
  outPoint: 5,
  speed: 1,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 },
  audio: { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
  ...overrides,
});

const textClip = (id: string, overrides: Partial<Clip> = {}): Clip =>
  baseClip(id, 'text', {
    text: {
      content: 'Hello',
      fontFamily: 'Inter',
      fontSize: 40,
      color: '#fff',
      fontWeight: 'bold',
      textAlign: 'center',
    },
    ...overrides,
  });

describe('PreviewEngine.hitTest', () => {
  let engine: PreviewEngine;

  const setup = (clips: Clip[]) => {
    const tracks: Track[] = [
      { id: 't1', name: 'T', type: 'video', isMuted: false, isLocked: false, isHidden: false, clips },
    ];
    engine.updateContext(project, tracks, new Map());
    // Fake 2D context: every character is 10px wide
    (engine as unknown as { ctx: unknown }).ctx = {
      save: () => {},
      restore: () => {},
      measureText: (s: string) => ({ width: s.length * 10 }),
      font: '',
    };
    engine.seekTo(1);
  };

  beforeEach(() => {
    engine = new PreviewEngine();
  });

  it('hits a full-frame video anywhere and returns null outside the clip time range', () => {
    setup([baseClip('v', 'video', { startTime: 2 })]);
    expect(engine.hitTest(500, 250)).toBeNull(); // not active at t=1

    engine.seekTo(3);
    expect(engine.hitTest(10, 10)?.id).toBe('v');
    expect(engine.hitTest(990, 490)?.id).toBe('v');
  });

  it('follows position and scale of a video clip', () => {
    // scale 0.5 -> 500x250 box centered at (500+100, 250)
    setup([
      baseClip('v', 'video', {
        transform: { x: 100, y: 0, scaleX: 0.5, scaleY: 0.5, rotation: 0, opacity: 1, zIndex: 1 },
      }),
    ]);
    expect(engine.hitTest(600, 250)?.id).toBe('v');
    expect(engine.hitTest(340, 250)).toBeNull(); // left of 350
    expect(engine.hitTest(860, 250)).toBeNull(); // right of 850
    expect(engine.hitTest(600, 100)).toBeNull(); // above 125
  });

  it('measures text bounds (width from measureText, 1.25 line height) around the anchor', () => {
    // "Hello" = 50px wide, 40px font -> 50 line height. Box with 6px margin: x 469..531, y 219..281
    setup([textClip('t')]);
    expect(engine.hitTest(500, 250)?.id).toBe('t');
    expect(engine.hitTest(540, 250)).toBeNull();
    expect(engine.hitTest(500, 290)).toBeNull();
  });

  it('puts text above video when both are under the pointer', () => {
    setup([baseClip('v', 'video'), textClip('t')]);
    expect(engine.hitTest(500, 250)?.id).toBe('t');
    expect(engine.hitTest(50, 50)?.id).toBe('v');
  });

  it('applies rotation when hit testing', () => {
    // 50x50 text box (approx) rotated 90deg is still centered; a wide video rotated 90deg becomes tall
    setup([
      baseClip('v', 'video', {
        transform: { x: 0, y: 0, scaleX: 0.2, scaleY: 0.2, rotation: 90, opacity: 1, zIndex: 1 },
      }),
    ]);
    // local box is 1000x500 scaled by 0.2 = 200x100, rotated 90deg -> 100 wide x 200 tall on screen
    expect(engine.hitTest(500, 340)).not.toBeNull(); // 90 above center is inside the tall axis
    expect(engine.hitTest(590, 250)).toBeNull(); // 90 to the right is outside the narrow axis
    expect(engine.hitTest(500 + 40, 250)?.id).toBe('v');
  });

  it('uses the animated position when the clip has keyframes', () => {
    setup([
      textClip('t', {
        keyframes: {
          x: [
            { id: 'a', time: 0, value: 0, easing: 'linear' },
            { id: 'b', time: 2, value: 200, easing: 'linear' },
          ],
        },
      }),
    ]);
    // at t=1 (clip-local 1) x = 100
    expect(engine.hitTest(600, 250)?.id).toBe('t');
    expect(engine.hitTest(500, 250)).toBeNull();
  });
});
