import { Track } from '@/types/timeline';
import { useAssetStore } from '@/stores/useAssetStore';
import { Logger } from '@/core/logger';

/**
 * Whether FFmpeg's stream listing (what `ffmpeg -i file` prints) contains an audio stream.
 * Returns undefined when the text is not a stream listing at all (FFmpeg missing, unreadable file).
 */
export const parseHasAudio = (ffmpegOutput: string): boolean | undefined => {
  if (!/Stream #\d+:\d+/.test(ffmpegOutput)) return undefined;
  return /Stream #\d+:\d+[^\n]*: Audio:/.test(ffmpegOutput);
};

/**
 * Asks the desktop app's FFmpeg about a file (the `probe_media` command, which only accepts files picked in a native
 * dialog). Undefined when the answer is unknown: FFmpeg missing, the file unreadable or not picked through a dialog.
 */
export const probeHasAudio = async (path: string): Promise<boolean | undefined> => {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const hasAudio = await invoke<boolean | null>('probe_media', { path });
    return hasAudio ?? undefined;
  } catch (error) {
    Logger.warn('probe', `Could not probe ${path}`, error);
    return undefined;
  }
};

/** Probes every media file used by the timeline that has not been probed yet and stores the answer on the asset */
export const probeUsedAssets = async (tracks: Track[]): Promise<void> => {
  const store = useAssetStore.getState();
  const ids = new Set<string>();
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.type === 'video' || clip.type === 'audio') ids.add(clip.assetId);
    }
  }

  for (const id of ids) {
    const asset = store.assets.get(id);
    if (!asset || asset.hasAudio !== undefined || !asset.path) continue;
    const hasAudio = await probeHasAudio(asset.path);
    if (hasAudio !== undefined) {
      useAssetStore.getState().updateAsset(id, { hasAudio });
      Logger.info('probe', `${asset.name}: ${hasAudio ? 'has audio' : 'no audio stream'}`);
    }
  }
};
