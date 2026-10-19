import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  serializeProject,
  parseProjectFile,
  findMissingAssetIds,
  isAbsoluteMediaPath,
  ProjectFileError,
  PROJECT_FILE_VERSION,
} from './projectFile';
import {
  applyProjectFile,
  captureProject,
  loadAutosave,
  startAutosave,
  clearAutosave,
  isProjectEmpty,
  AUTOSAVE_KEY,
  AUTOSAVE_DELAY_MS,
} from './projectSession';
import { parseProjectText } from './projectIO';
import { useAssetStore } from '@/stores/useAssetStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { commandManager } from '@/core/command/commandManager';
import { MediaAsset } from '@/types/asset';
import { ProjectSettings } from '@/types/project';
import { Clip, Track } from '@/types/timeline';

const project: ProjectSettings = {
  id: 'p1',
  name: 'Test',
  width: 1280,
  height: 720,
  fps: 25,
  aspectRatio: '16:9',
  duration: 12,
  backgroundColor: '#112233',
};

const nativeAsset: MediaAsset = {
  id: 'a1',
  name: 'clip.mp4',
  path: 'C:/media/clip.mp4',
  url: 'asset://localhost/C%3A%2Fmedia%2Fclip.mp4',
  type: 'video',
  duration: 8,
  size: 100,
  createdAt: 1,
};
const blobAsset: MediaAsset = { ...nativeAsset, id: 'a2', name: 'web.mp4', path: 'web.mp4', url: 'blob:abc' };

const clip = (id: string, assetId: string, type: Clip['type'] = 'video'): Clip => ({
  id,
  trackId: 't1',
  assetId,
  name: id,
  type,
  startTime: 0,
  duration: 4,
  inPoint: 0,
  outPoint: 4,
  speed: 1,
  transform: { x: 5, y: 6, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, zIndex: 1 },
  audio: { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
  keyframes: { x: [{ id: 'k', time: 1, value: 10, easing: 'ease-in-out' }] },
});

const track = (clips: Clip[]): Track => ({
  id: 't1',
  name: 'V1',
  type: 'video',
  isMuted: false,
  isLocked: false,
  isHidden: false,
  clips,
});

describe('projectFile', () => {
  it('serializes without preview URLs and round-trips through JSON', () => {
    const file = serializeProject(project, [track([clip('c1', 'a1')])], [nativeAsset]);
    expect(file.version).toBe(PROJECT_FILE_VERSION);
    expect(file.assets[0]).not.toHaveProperty('url');

    const parsed = parseProjectText(JSON.stringify(file));
    expect(parsed.project).toEqual(project);
    expect(parsed.tracks[0].clips[0].keyframes!.x![0].easing).toBe('ease-in-out');
    expect(parsed.assets[0].path).toBe('C:/media/clip.mp4');
  });

  it('rejects malformed input with a readable error', () => {
    expect(() => parseProjectFile(null)).toThrow(ProjectFileError);
    expect(() => parseProjectFile({})).toThrow('sürümü');
    expect(() => parseProjectFile({ version: 99, project, tracks: [], assets: [] })).toThrow('daha yeni');
    expect(() => parseProjectFile({ version: 1, project: { name: 'x' }, tracks: [], assets: [] })).toThrow('ayarları');
    expect(() => parseProjectFile({ version: 1, project, tracks: 'nope', assets: [] })).toThrow('Kanal');
    expect(() =>
      parseProjectFile({ version: 1, project, tracks: [{ id: 't', clips: [{ id: 'x' }] }], assets: [] })
    ).toThrow('Bozuk klip');
    expect(() => parseProjectFile({ version: 1, project, tracks: [], assets: [{ id: 1 }] })).toThrow('Medya');
    expect(() => parseProjectText('{ not json')).toThrow('JSON');
  });

  it('knows which media paths can be reopened', () => {
    expect(isAbsoluteMediaPath('C:/media/a.mp4')).toBe(true);
    expect(isAbsoluteMediaPath('C:\\media\\a.mp4')).toBe(true);
    expect(isAbsoluteMediaPath('/home/user/a.mp4')).toBe(true);
    expect(isAbsoluteMediaPath('a.mp4')).toBe(false);
  });

  it('reports clips whose media is gone (blob imports, unknown assets) but not text clips', () => {
    const file = serializeProject(
      project,
      [track([clip('c1', 'a1'), clip('c2', 'a2'), clip('c3', 'ghost'), clip('t', 'text-1', 'text')])],
      [nativeAsset, blobAsset]
    );
    expect(findMissingAssetIds(file).sort()).toEqual(['a2', 'ghost']);
  });
});

describe('projectSession', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    vi.useFakeTimers();
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    useAssetStore.setState({ assets: new Map() });
    useTimelineStore.setState({ tracks: [track([])], selectedClipId: null, selectedKeyframeTime: null, currentTime: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('applies a loaded file to every store and resets undo history', async () => {
    commandManager.record({ description: 'old', execute: () => {}, undo: () => {} });
    const file = serializeProject(project, [track([clip('c1', 'a1')])], [nativeAsset]);

    const result = await applyProjectFile(file);

    expect(result.missingAssetIds).toEqual([]);
    expect(useProjectStore.getState().project.name).toBe('Test');
    expect(useProjectStore.getState().project.backgroundColor).toBe('#112233');
    expect(useTimelineStore.getState().tracks[0].clips[0].id).toBe('c1');
    expect(useAssetStore.getState().assets.get('a1')!.url).toBe('C:/media/clip.mp4'); // no Tauri here: raw path
    expect(commandManager.canUndo()).toBe(false);
  });

  it('marks assets without a usable path as unplayable (empty url) and reports them', async () => {
    const file = serializeProject(project, [track([clip('c2', 'a2')])], [blobAsset]);
    const result = await applyProjectFile(file);
    expect(result.missingAssetIds).toEqual(['a2']);
    expect(useAssetStore.getState().assets.get('a2')!.url).toBe('');
  });

  it('captures the current state of all stores', () => {
    useProjectStore.getState().loadProject(project);
    useTimelineStore.setState({ tracks: [track([clip('c1', 'a1')])] });
    useAssetStore.setState({ assets: new Map([['a1', nativeAsset]]) });

    const file = captureProject();
    expect(file.project.name).toBe('Test');
    expect(file.tracks[0].clips).toHaveLength(1);
    expect(file.assets.map((a) => a.id)).toEqual(['a1']);
  });

  it('autosaves shortly after a change, once for a burst of changes', () => {
    const stop = startAutosave();
    useAssetStore.setState({ assets: new Map([['a1', nativeAsset]]) });
    useTimelineStore.setState({ tracks: [track([clip('c1', 'a1')])] });
    expect(store.has(AUTOSAVE_KEY)).toBe(false);

    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS + 10);
    const saved = loadAutosave();
    expect(saved).not.toBeNull();
    expect(saved!.tracks[0].clips[0].id).toBe('c1');
    stop();
  });

  it('never overwrites an autosave with an empty project', () => {
    store.set(AUTOSAVE_KEY, JSON.stringify(serializeProject(project, [track([clip('c1', 'a1')])], [nativeAsset])));
    const stop = startAutosave();
    useTimelineStore.setState({ tracks: [track([])] });
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS + 10);

    expect(loadAutosave()!.tracks[0].clips).toHaveLength(1);
    expect(isProjectEmpty(captureProject())).toBe(true);
    stop();
  });

  it('ignores a corrupted autosave and can clear it', () => {
    store.set(AUTOSAVE_KEY, '{broken');
    expect(loadAutosave()).toBeNull();

    store.set(AUTOSAVE_KEY, JSON.stringify(serializeProject(project, [track([])], [nativeAsset])));
    expect(loadAutosave()).not.toBeNull();
    clearAutosave();
    expect(loadAutosave()).toBeNull();
  });
});
