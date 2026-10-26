import { MediaAsset } from '@/types/asset';
import { ProjectSettings } from '@/types/project';
import { Clip, Track } from '@/types/timeline';
import { LIMITS, validateAsset, validateClip, validateProjectSettings, validateTrackShape } from './projectValidation';

export const PROJECT_FILE_VERSION = 1;

/** Asset as stored on disk: the preview URL is rebuilt from `path` when the project is opened */
export type PersistedAsset = Omit<MediaAsset, 'url'>;

export interface ProjectFile {
  version: number;
  savedAt: number;
  project: ProjectSettings;
  tracks: Track[];
  assets: PersistedAsset[];
}

export class ProjectFileError extends Error {}

export const serializeProject = (
  project: ProjectSettings,
  tracks: Track[],
  assets: Iterable<MediaAsset>
): ProjectFile => ({
  version: PROJECT_FILE_VERSION,
  savedAt: Date.now(),
  project,
  tracks,
  assets: [...assets].map(({ url: _url, ...rest }) => rest),
});

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isClip = (value: unknown): value is Clip =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.type === 'string' &&
  typeof value.startTime === 'number' &&
  typeof value.duration === 'number' &&
  isObject(value.transform);

/** Validates untrusted JSON (a file the user opened or an autosave) and returns it as a ProjectFile */
export const parseProjectFile = (raw: unknown): ProjectFile => {
  if (!isObject(raw)) throw new ProjectFileError('Geçersiz proje dosyası.');
  if (typeof raw.version !== 'number') throw new ProjectFileError('Proje dosyası sürümü bulunamadı.');
  if (raw.version > PROJECT_FILE_VERSION) {
    throw new ProjectFileError('Bu proje daha yeni bir sürümle kaydedilmiş, uygulamayı güncelleyin.');
  }

  const { project, tracks, assets } = raw;
  if (
    !isObject(project) ||
    typeof project.width !== 'number' ||
    typeof project.height !== 'number' ||
    typeof project.fps !== 'number'
  ) {
    throw new ProjectFileError('Proje ayarları okunamadı.');
  }
  const settingsProblem = validateProjectSettings(project);
  if (settingsProblem) throw new ProjectFileError(settingsProblem);

  if (!Array.isArray(tracks) || !tracks.every((t) => isObject(t) && typeof t.id === 'string' && Array.isArray(t.clips))) {
    throw new ProjectFileError('Kanal listesi okunamadı.');
  }
  if (tracks.length > LIMITS.maxTracks) throw new ProjectFileError('Çok fazla kanal var.');
  let clipCount = 0;
  for (const t of tracks as unknown as Array<Record<string, unknown> & { clips: unknown[] }>) {
    clipCount += t.clips.length;
    if (clipCount > LIMITS.maxClips) throw new ProjectFileError('Çok fazla klip var.');
    for (const c of t.clips) {
      if (!isClip(c)) throw new ProjectFileError('Bozuk klip verisi bulundu.');
      const clipProblem = validateClip(c as unknown as Record<string, unknown>);
      if (clipProblem) throw new ProjectFileError(clipProblem);
    }
    const trackProblem = validateTrackShape(t);
    if (trackProblem) throw new ProjectFileError(trackProblem);
  }
  if (!Array.isArray(assets) || !assets.every((a) => isObject(a) && typeof a.id === 'string' && typeof a.path === 'string')) {
    throw new ProjectFileError('Medya listesi okunamadı.');
  }
  if (assets.length > LIMITS.maxAssets) throw new ProjectFileError('Çok fazla medya dosyası var.');
  for (const a of assets as unknown as Array<Record<string, unknown>>) {
    const assetProblem = validateAsset(a);
    if (assetProblem) throw new ProjectFileError(assetProblem);
  }

  return {
    version: raw.version,
    savedAt: typeof raw.savedAt === 'number' ? raw.savedAt : 0,
    project: project as unknown as ProjectSettings,
    tracks: tracks as unknown as Track[],
    assets: assets as unknown as PersistedAsset[],
  };
};

/** True for a path FFmpeg and the asset protocol can open: `C:/dir/file.mp4` or `/home/file.mp4` (not a bare web file name) */
export const isAbsoluteMediaPath = (path: string): boolean => /^([A-Za-z]:[\\/]|\/)/.test(path);

/** Clips whose media is not available after loading (blob imports or files that cannot be located) */
export const findMissingAssetIds = (file: ProjectFile): string[] => {
  const known = new Map(file.assets.map((a) => [a.id, a]));
  const missing = new Set<string>();
  for (const track of file.tracks) {
    for (const clip of track.clips) {
      // Text and effect clips draw themselves: they have no media file
      if (clip.type === 'text' || clip.type === 'effect') continue;
      const asset = known.get(clip.assetId);
      if (!asset || !isAbsoluteMediaPath(asset.path)) missing.add(clip.assetId);
    }
  }
  return [...missing];
};
