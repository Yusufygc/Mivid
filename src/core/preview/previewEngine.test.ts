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

  it('exposes selection handles at the box corners and a rotation handle above the top edge', () => {
    setup([
      baseClip('v', 'video', {
        transform: { x: 0, y: 0, scaleX: 0.5, scaleY: 0.5, rotation: 0, opacity: 1, zIndex: 1 },
      }),
    ]);
    engine.setSelectedClipId('v');
    const g = engine.getSelectionGeometry()!;
    expect(g.anchor).toEqual({ x: 500, y: 250 });
    expect(g.handles.nw).toEqual({ x: 250, y: 125 });
    expect(g.handles.se).toEqual({ x: 750, y: 375 });
    expect(g.handles.rotate.x).toBeCloseTo(500);
    expect(g.handles.rotate.y).toBeLessThan(125);

    expect(engine.hitHandle(250, 125)).toBe('nw');
    expect(engine.hitHandle(750, 375)).toBe('se');
    expect(engine.hitHandle(g.handles.rotate.x, g.handles.rotate.y)).toBe('rotate');
    expect(engine.hitHandle(500, 250)).toBeNull();
  });

  it('rotates the handles with the clip', () => {
    setup([
      baseClip('v', 'video', {
        transform: { x: 0, y: 0, scaleX: 0.2, scaleY: 0.2, rotation: 90, opacity: 1, zIndex: 1 },
      }),
    ]);
    engine.setSelectedClipId('v');
    const g = engine.getSelectionGeometry()!;
    // local nw corner (-500,-250) * 0.2 = (-100,-50), rotated 90deg -> (50, -100)
    expect(g.handles.nw.x).toBeCloseTo(500 + 50);
    expect(g.handles.nw.y).toBeCloseTo(250 - 100);
    // "up" now points to the right of the screen
    expect(g.handles.rotate.x).toBeGreaterThan(g.topCenter.x);
  });

  it('keeps handles of a full-frame clip on the canvas so they can be grabbed', () => {
    setup([baseClip('v', 'video')]); // fills the 1000x500 canvas exactly
    engine.setSelectedClipId('v');
    const g = engine.getSelectionGeometry()!;
    const margin = engine.getHandleSize() / 2;
    for (const h of Object.values(g.handles)) {
      expect(h.x).toBeGreaterThanOrEqual(margin);
      expect(h.x).toBeLessThanOrEqual(1000 - margin);
      expect(h.y).toBeGreaterThanOrEqual(margin);
      expect(h.y).toBeLessThanOrEqual(500 - margin);
    }
    expect(engine.hitHandle(g.handles.rotate.x, g.handles.rotate.y)).toBe('rotate');
    expect(engine.hitHandle(g.handles.nw.x, g.handles.nw.y)).toBe('nw');
  });

  const effectClip = (id: string, overrides: Partial<Clip> = {}): Clip =>
    baseClip(id, 'effect', {
      effect: { kind: 'blur', shape: 'rect', strength: 0.5, feather: 0, width: 200, height: 100 },
      transform: { x: 100, y: 50, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 3 },
      ...overrides,
    });

  it('hit-tests a region effect by its own size and puts it above the video', () => {
    setup([baseClip('v', 'video'), effectClip('e')]);
    // region center (600, 300), 200x100
    expect(engine.hitTest(600, 300)?.id).toBe('e');
    expect(engine.hitTest(690, 340)?.id).toBe('e');
    expect(engine.hitTest(720, 300)?.id).toBe('v'); // outside the region, the video is hit
  });

  it('scales a region effect with its transform scale', () => {
    setup([
      effectClip('e', { transform: { x: 0, y: 0, scaleX: 2, scaleY: 2, rotation: 0, opacity: 1, zIndex: 3 } }),
    ]);
    expect(engine.hitTest(500 + 190, 250)?.id).toBe('e'); // 200 * 2 / 2 = 200 half width
    expect(engine.hitTest(500 + 210, 250)).toBeNull();
  });

  it('gives a region effect corner handles but no rotation handle', () => {
    setup([effectClip('e')]);
    engine.setSelectedClipId('e');
    const g = engine.getSelectionGeometry()!;
    expect(g.rotatable).toBe(false);
    expect(g.handles.nw).toEqual({ x: 500, y: 250 });
    expect(g.handles.se).toEqual({ x: 700, y: 350 });
    expect(engine.hitHandle(g.handles.rotate.x, g.handles.rotate.y)).toBeNull();
    expect(engine.hitHandle(700, 350)).toBe('se');
  });

  it('limits a fitted video to the picture area when the footage size is known', () => {
    setup([baseClip('v', 'video', { fit: 'contain' })]);
    // Fake a loaded 500x500 video: contain in 1000x500 leaves bars left and right of a 500x500 square
    (engine as unknown as { currentAssets: Map<string, unknown> }).currentAssets.set('asset-v', { id: 'asset-v' });
    (engine as unknown as { videoPool: Map<string, unknown> }).videoPool.set('asset-v', {
      videoWidth: 500,
      videoHeight: 500,
    });
    expect(engine.hitTest(500, 250)?.id).toBe('v');
    expect(engine.hitTest(100, 250)).toBeNull(); // in the left bar
    expect(engine.hitTest(900, 250)).toBeNull(); // in the right bar
  });

  it('uses the loaded size of a sticker to limit its hit area when fitted', () => {
    setup([baseClip('s', 'image', { fit: 'contain' })]);
    (engine as unknown as { currentAssets: Map<string, unknown> }).currentAssets.set('asset-s', { id: 'asset-s' });
    (engine as unknown as { imagePool: Map<string, unknown> }).imagePool.set('asset-s', {
      naturalWidth: 100,
      naturalHeight: 100,
    });
    // 100x100 fitted into 1000x500 -> a 500x500 square in the middle
    expect(engine.hitTest(500, 250)?.id).toBe('s');
    expect(engine.hitTest(100, 250)).toBeNull();
  });

  it('has no handles when nothing is selected or the selected clip is not active', () => {
    setup([baseClip('v', 'video', { startTime: 3 })]);
    expect(engine.getSelectionGeometry()).toBeNull();
    engine.setSelectedClipId('v');
    expect(engine.getSelectionGeometry()).toBeNull(); // not active at t=1
    expect(engine.hitHandle(500, 250)).toBeNull();
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
