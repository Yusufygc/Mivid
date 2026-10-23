import { describe, it, expect } from 'vitest';
import { FFmpegCommandBuilder } from './ffmpegBuilder';
import { Clip, EffectSettings, Track, Transition } from '@/types/timeline';
import { MediaAsset } from '@/types/asset';
import { ProjectSettings } from '@/types/project';

const project: ProjectSettings = { id: 'p', name: 't', width: 1920, height: 1080, fps: 30, aspectRatio: '16:9', duration: 10, backgroundColor: '#000000' };
const asset: MediaAsset = { id: 'a1', name: 'a.mp4', path: 'C:/m/a.mp4', url: '', type: 'video', duration: 20, size: 1, createdAt: 0, hasAudio: false };
const assets = new Map([['a1', asset]]);

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: 'c1', trackId: 'tv', assetId: 'a1', name: 'c', type: 'video', startTime: 2, duration: 6, inPoint: 0, outPoint: 6, speed: 1,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 },
  audio: { volume: 1, muted: true, fadeIn: 0, fadeOut: 0 },
  ...over,
});
const track = (type: Track['type'], clips: Clip[]): Track => ({ id: `t-${type}`, name: type, type, isMuted: false, isLocked: false, isHidden: false, clips });
const graphOf = (tracks: Track[]) => FFmpegCommandBuilder.buildExportCommand(project, tracks, assets, { outputPath: 'out.mp4' }).filterComplex;
const withTransition = (t: { in?: Transition; out?: Transition }, over: Partial<Clip> = {}) =>
  graphOf([track('video', [clip({ transitionIn: t.in, transitionOut: t.out, ...over })])]);

describe('transitions in the export graph', () => {
  it('keeps FFmpeg fade for a linear dissolve and fade-to-black (unchanged output)', () => {
    const g = withTransition({ in: { type: 'cross-dissolve', duration: 1 }, out: { type: 'fade-to-black', duration: 1 } });
    expect(g).toContain('fade=t=in:st=2.00:d=1.00:alpha=1');
    expect(g).toContain('fade=t=out:st=7.00:d=1.00:alpha=1');
    expect(g).not.toContain('geq');
    expect(g).not.toContain('split=');
  });

  it('runs an eased dissolve through geq for its window only: head, then the rest', () => {
    const g = withTransition({ in: { type: 'cross-dissolve', duration: 1, easing: 'ease-in-out' } });
    expect(g).not.toContain('fade=t=in');
    expect(g).toContain('trim=start=2.000:end=3.000');
    expect(g).toContain("geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*(");
    expect(g).toContain('trim=start=3.000:end=8.000');
    expect(g).toContain("enable='between(t,2.000,3.000)'");
    expect(g).toContain("enable='between(t,3.000,8.000)'");
  });

  it('splits into head, middle and tail when both transitions need pixels', () => {
    const g = withTransition({ in: { type: 'wipe', duration: 1 }, out: { type: 'iris', duration: 2 } });
    expect(g).toMatch(/split=3/);
    expect(g).toContain('gte(X,W*(1-(');
    expect(g).toContain('lt(hypot(X+0.5-W/2,Y+0.5-H/2)');
    expect(g).toContain("enable='between(t,3.000,6.000)'");
  });

  it('wipes with the mask of its direction', () => {
    expect(withTransition({ in: { type: 'wipe', duration: 1, direction: 'down' } })).toContain('lt(Y,H*(');
    expect(withTransition({ in: { type: 'wipe', duration: 1, direction: 'right' } })).toContain('lt(X,W*(');
  });

  it('blurs the head with a constant sigma of 2.5% of the height and fades it in', () => {
    const g = withTransition({ in: { type: 'blur', duration: 1 } });
    expect(g).toContain('gblur=sigma=27:steps=2');
    expect(g).toContain("a='alpha(X,Y)*(");
  });

  it('zoom scales the layer by a factor that is 1 outside the window, and fades it in', () => {
    const g = withTransition({ in: { type: 'zoom', duration: 1 } });
    expect(g).toContain('(1+0.5*(1-(');
    expect(g).toContain('eval=frame');
  });

  it('slides by an offset in parentheses (no "+-" in the expression)', () => {
    const left = withTransition({ in: { type: 'slide', duration: 1 }, out: { type: 'slide', duration: 1 } });
    expect(left).toContain('+(W*(1-(');
    expect(left).toContain('+(-W*(1-(');
    expect(left).not.toContain('+-');
    expect(withTransition({ in: { type: 'slide', duration: 1, direction: 'up' } })).toContain('+(H*(1-(');
  });

  it('lays a white flash layer over the frame for the window', () => {
    const g = withTransition({ in: { type: 'flash', duration: 1 } });
    expect(g).toContain('color=c=white:s=1920x1080:r=30:d=1.000');
    expect(g).toContain("overlay=enable='between(t,2.000,3.000)'");
    expect(g).not.toContain('fade=');
  });

  it('puts an out-flash at the end of the clip', () => {
    expect(withTransition({ out: { type: 'flash', duration: 0.5 } })).toContain("between(t,7.500,8.000)");
  });
});

describe('effects in the export graph', () => {
  const effectClip = (effect: Partial<EffectSettings> & Pick<EffectSettings, 'kind'>, over: Partial<Clip> = {}): Clip =>
    clip({
      id: 'e1', trackId: 'te', assetId: 'effect-1', type: 'effect', startTime: 1, duration: 2, outPoint: 2,
      effect: { shape: 'rect', strength: 0.5, feather: 0, width: 400, height: 200, ...effect },
      ...over,
    });
  const build = (effect: Partial<EffectSettings> & Pick<EffectSettings, 'kind'>, over: Partial<Clip> = {}) =>
    graphOf([track('effect', [effectClip(effect, over)]), track('video', [clip({ startTime: 0, duration: 5 })])]);

  it('inverts the mask: a black shape on a white frame', () => {
    const g = build({ kind: 'blur', invert: true });
    expect(g).toContain("geq=lum='255-lum(X,Y)'");
    expect(g).toContain('color=c=white:s=1920x1080');
  });

  it('draws a normal mask on black', () => {
    const g = build({ kind: 'blur' });
    expect(g).not.toContain("255-lum(X,Y)");
    expect(g).toContain('color=c=black:s=1920x1080');
  });

  it('skips the mask when the effect covers the whole frame', () => {
    const g = build({ kind: 'blur', fullFrame: true });
    expect(g).not.toContain('alphamerge');
    expect(g).not.toContain('fx_mask');
    expect(g).toContain('gblur=sigma=27:steps=2');
  });

  it('renders a strength ramp as constant slices of the same steps the preview plays', () => {
    const g = build({ kind: 'blur', strength: 0, strengthEnd: 1, fullFrame: true }, { duration: 2 });
    // 2 s -> 10 slices of 0.2 s, each with its own sigma
    expect((g.match(/gblur=sigma=/g) ?? []).length).toBe(10);
    expect(g).toContain('split=10');
    // slice 0 is taken at strength 0.05: sigma = 0.05 * 1080 * 0.05
    expect(g).toContain('gblur=sigma=2.7:steps=2');
  });

  it('washes a tint with a color layer at the tint opacity', () => {
    const g = build({ kind: 'tint', strength: 1, color: '#FF0000', fullFrame: true });
    expect(g).toContain('color=c=#ff0000:s=1920x1080');
    expect(g).toContain('colorchannelmixer=aa=0.6');
  });

  it('sharpens RGB planes with the preview kernel', () => {
    const g = build({ kind: 'sharpen', strength: 0.5, fullFrame: true });
    expect(g).toContain("format=gbrp,convolution=0m='0 -0.75 0 -0.75 4 -0.75 0 -0.75 0':1m='0 -0.75 0 -0.75 4 -0.75 0 -0.75 0':2m='0 -0.75 0 -0.75 4 -0.75 0 -0.75 0',format=yuv420p");
  });

  it('adds a vignette as a black alpha layer, whole frame only', () => {
    const g = build({ kind: 'vignette', strength: 0.6 });
    expect(g).toContain('pow(clip(');
    expect(g).toContain('a=\'255*0.6*');
    expect(g).not.toContain('alphamerge');
  });
});
