import { describe, it, expect, beforeEach } from 'vitest';
import { parseProjectFile, ProjectFileError, PROJECT_FILE_VERSION } from './projectFile';
import { loadAutosave, AUTOSAVE_KEY } from './projectSession';

const settings = { id: 'p', name: 'x', width: 1080, height: 1920, fps: 30, aspectRatio: '9:16', duration: 10, backgroundColor: '#000' };

const clip = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  trackId: 't1',
  assetId: 'a1',
  name: 'c',
  type: 'video',
  startTime: 0,
  duration: 4,
  inPoint: 0,
  outPoint: 4,
  speed: 1,
  transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 },
  audio: { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
  ...over,
});

const file = (over: Record<string, unknown> = {}, clips: unknown[] = [clip()], assets: unknown[] = [{ id: 'a1', path: 'C:/m/a.mp4', duration: 8 }]) => ({
  version: PROJECT_FILE_VERSION,
  savedAt: 1,
  project: settings,
  tracks: [{ id: 't1', name: 'V1', type: 'video', isMuted: false, isLocked: false, isHidden: false, clips }],
  assets,
  ...over,
});

const parse = (value: unknown) => () => parseProjectFile(value);

describe('project file validation: settings', () => {
  it('accepts a normal project', () => {
    expect(parse(file())).not.toThrow();
  });

  it.each([
    ['fps 0', { fps: 0 }],
    ['negative fps', { fps: -30 }],
    ['absurd fps', { fps: 100000 }],
    ['width 0', { width: 0 }],
    ['width too big (gigabytes of canvas)', { width: 100000 }],
    ['height too small', { height: 4 }],
    ['negative duration', { duration: -5 }],
  ])('rejects %s', (_name, override) => {
    expect(parse(file({ project: { ...settings, ...override } }))).toThrow(ProjectFileError);
  });

  it('rejects numbers that JSON turned into null (NaN, Infinity)', () => {
    const text = JSON.stringify({ ...file(), project: { ...settings, fps: NaN } });
    expect(parse(JSON.parse(text))).toThrow(ProjectFileError);
  });
});

describe('project file validation: clips', () => {
  it.each([
    ['zero duration', { duration: 0 }],
    ['negative duration', { duration: -5 }],
    ['negative start', { startTime: -1 }],
    ['huge start', { startTime: 1e12 }],
    ['unknown clip type', { type: 'hologram' }],
    ['zero speed', { speed: 0 }],
    ['opacity above 1', { transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 4, zIndex: 1 } }],
    ['zero scale', { transform: { x: 0, y: 0, scaleX: 0, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 } }],
    ['infinite position', { transform: { x: 1e300, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 } }],
    ['unknown fit mode', { fit: 'zoom' }],
    ['backdrop blur out of range', { backdropBlur: 7 }],
  ])('rejects %s', (_name, override) => {
    expect(parse(file({}, [clip(override)]))).toThrow(ProjectFileError);
  });

  it('names the clip in the message', () => {
    expect(parse(file({}, [clip({ id: 'intro', duration: -1 })]))).toThrow(/intro/);
  });

  it('checks transitions', () => {
    expect(parse(file({}, [clip({ transitionIn: { type: 'cross-dissolve', duration: 1 } })]))).not.toThrow();
    expect(parse(file({}, [clip({ transitionIn: { type: 'teleport', duration: 1 } })]))).toThrow('geçiş');
    expect(parse(file({}, [clip({ transitionIn: { type: 'slide', duration: -1 } })]))).toThrow('geçiş');
    expect(parse(file({}, [clip({ transitionOut: { type: 'wipe', duration: 1, direction: 'sideways' } })]))).toThrow('yön');
  });

  it('checks keyframes', () => {
    const good = { x: [{ id: 'k', time: 1, value: 10, easing: 'linear' }] };
    expect(parse(file({}, [clip({ keyframes: good })]))).not.toThrow();
    expect(parse(file({}, [clip({ keyframes: { x: [{ id: 'k', time: -1, value: 10 }] } })]))).toThrow('keyframe');
    expect(parse(file({}, [clip({ keyframes: { wobble: [] } })]))).toThrow('keyframe');
    expect(parse(file({}, [clip({ keyframes: { x: 'nope' } })]))).toThrow('keyframe');
  });

  it('checks effect settings', () => {
    const effect = { kind: 'blur', shape: 'rect', strength: 0.5, feather: 0.1, width: 300, height: 200 };
    expect(parse(file({}, [clip({ type: 'effect', effect })]))).not.toThrow();
    expect(parse(file({}, [clip({ type: 'effect', effect: { ...effect, kind: 'laser' } })]))).toThrow('Efekt');
    expect(parse(file({}, [clip({ type: 'effect', effect: { ...effect, width: 0 } })]))).toThrow('Efekt');
    expect(parse(file({}, [clip({ type: 'effect', effect: { ...effect, strength: 5 } })]))).toThrow('Efekt');
  });

  it('keeps the old shape error for a clip without the basics', () => {
    expect(parse(file({}, [{ id: 'x' }]))).toThrow('Bozuk klip');
  });
});

describe('project file validation: tracks and assets', () => {
  it('rejects an unknown track type and too many tracks or clips', () => {
    const base = file();
    expect(parse({ ...base, tracks: [{ ...base.tracks[0], type: 'smell' }] })).toThrow('Kanal türü');
    expect(parse({ ...base, tracks: Array.from({ length: 201 }, (_, i) => ({ ...base.tracks[0], id: `t${i}` })) })).toThrow('kanal');
    const many = Array.from({ length: 20001 }, (_, i) => clip({ id: `c${i}` }));
    expect(parse(file({}, many))).toThrow('klip');
  });

  it('rejects a media entry with an impossible duration or size', () => {
    expect(parse(file({}, [clip()], [{ id: 'a1', path: 'C:/m/a.mp4', duration: -1 }]))).toThrow('Medya');
    expect(parse(file({}, [clip()], [{ id: 'a1', path: 'C:/m/a.mp4', width: 1e9 }]))).toThrow('Medya');
  });
});

describe('a corrupted autosave', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  });

  it('is dropped once instead of failing on every start', () => {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(file({ project: { ...settings, fps: 0 } })));
    expect(loadAutosave()).toBeNull();
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull();
  });

  it('keeps a healthy autosave', () => {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(file()));
    expect(loadAutosave()).not.toBeNull();
    expect(localStorage.getItem(AUTOSAVE_KEY)).not.toBeNull();
  });
});
