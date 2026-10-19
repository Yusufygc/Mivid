import { MediaAsset } from '@/types/asset';
import { useAssetStore } from '@/stores/useAssetStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { commandManager } from '@/core/command/commandManager';
import { Logger } from '@/core/logger';
import { ProjectFile, findMissingAssetIds, isAbsoluteMediaPath, parseProjectFile, serializeProject } from './projectFile';

export const AUTOSAVE_KEY = 'kurgu.autosave.v1';
export const AUTOSAVE_DELAY_MS = 1500;

/** Snapshot of everything that makes up the open project */
export const captureProject = (): ProjectFile =>
  serializeProject(
    useProjectStore.getState().project,
    useTimelineStore.getState().tracks,
    useAssetStore.getState().assets.values()
  );

/** URL the preview can load for a file on disk: Tauri asset protocol in the desktop app, the raw path elsewhere */
const resolveAssetUrl = async (path: string): Promise<string> => {
  if (!isAbsoluteMediaPath(path)) return '';
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    try {
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      return convertFileSrc(path);
    } catch (e) {
      Logger.warn('projectSession', 'Could not convert file path to an asset URL', e);
    }
  }
  return path;
};

export interface ApplyResult {
  /** Asset ids whose media could not be located; their clips stay on the timeline but cannot play */
  missingAssetIds: string[];
}

/** Replaces the current project (settings, media pool, timeline) with a loaded file and resets undo history */
export const applyProjectFile = async (file: ProjectFile): Promise<ApplyResult> => {
  const assets = new Map<string, MediaAsset>();
  for (const persisted of file.assets) {
    assets.set(persisted.id, { ...persisted, url: await resolveAssetUrl(persisted.path) });
  }

  useAssetStore.setState({ assets });
  useProjectStore.getState().loadProject(file.project);
  useTimelineStore.setState({ currentTime: 0, selectedClipId: null, selectedKeyframeTime: null, isPlaying: false });
  useTimelineStore.getState().restoreTracks(file.tracks);
  commandManager.clear(); // the history of the previous project does not apply

  Logger.info('projectSession', `Project applied: ${file.project.name}`, {
    tracks: file.tracks.length,
    assets: file.assets.length,
  });
  return { missingAssetIds: findMissingAssetIds(file) };
};

const readAutosaveRaw = (): string | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(AUTOSAVE_KEY);
  } catch {
    return null;
  }
};

/** The last autosave, or null when there is none or it is unreadable */
export const loadAutosave = (): ProjectFile | null => {
  const raw = readAutosaveRaw();
  if (!raw) return null;
  try {
    return parseProjectFile(JSON.parse(raw));
  } catch (e) {
    Logger.warn('projectSession', 'Ignoring unreadable autosave', e);
    return null;
  }
};

export const clearAutosave = (): void => {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
};

/** An empty timeline and media pool is not worth saving over a real autosave */
export const isProjectEmpty = (file: Pick<ProjectFile, 'tracks' | 'assets'>): boolean =>
  file.assets.length === 0 && file.tracks.every((t) => t.clips.length === 0);

/**
 * Writes the project to localStorage shortly after every change to the timeline, media pool or settings.
 * Returns a cleanup function.
 */
export const startAutosave = (): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const save = () => {
    timer = null;
    const file = captureProject();
    if (isProjectEmpty(file)) return;
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(file));
    } catch (e) {
      Logger.warn('projectSession', 'Autosave failed (storage full or unavailable)', e);
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, AUTOSAVE_DELAY_MS);
  };

  const unsubscribers = [
    useTimelineStore.subscribe((state, prev) => {
      if (state.tracks !== prev.tracks) schedule();
    }),
    useProjectStore.subscribe((state, prev) => {
      if (state.project !== prev.project) schedule();
    }),
    useAssetStore.subscribe((state, prev) => {
      if (state.assets !== prev.assets) schedule();
    }),
  ];

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribers.forEach((u) => u());
  };
};
