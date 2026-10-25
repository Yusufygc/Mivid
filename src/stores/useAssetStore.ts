import { create } from 'zustand';
import { MediaAsset, AssetType } from '@/types/asset';
import { Logger } from '@/core/logger';

interface AssetState {
  assets: Map<string, MediaAsset>;
  addAsset: (asset: MediaAsset) => void;
  removeAsset: (id: string) => void;
  updateAsset: (id: string, updates: Partial<MediaAsset>) => void;
  getAsset: (id: string) => MediaAsset | undefined;
  importFile: (file: File) => Promise<MediaAsset>;
  importFromPath: (filePath: string) => Promise<MediaAsset>;
}

// Timeout helper to guarantee import never hangs
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, defaultValue: T): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(defaultValue), timeoutMs)),
  ]);
};

export const useAssetStore = create<AssetState>((set, get) => ({
  assets: new Map<string, MediaAsset>(),

  addAsset: (asset) => {
    Logger.info('useAssetStore', `Asset added: ${asset.name} (${asset.type})`, {
      id: asset.id,
      path: asset.path,
      duration: asset.duration,
    });
    set((state) => {
      const updated = new Map(state.assets);
      updated.set(asset.id, asset);
      return { assets: updated };
    });
  },

  updateAsset: (id, updates) => {
    set((state) => {
      const current = state.assets.get(id);
      if (!current) return state;
      const updated = new Map(state.assets);
      updated.set(id, { ...current, ...updates });
      return { assets: updated };
    });
  },

  removeAsset: (id) => {
    Logger.info('useAssetStore', `Asset removed: ${id}`);
    set((state) => {
      const updated = new Map(state.assets);
      updated.delete(id);
      return { assets: updated };
    });
  },

  getAsset: (id) => {
    return get().assets.get(id);
  },

  importFromPath: async (filePath: string): Promise<MediaAsset> => {
    Logger.info('useAssetStore', `Importing from native path: ${filePath}`);

    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const cleanPath = filePath.replace(/\\/g, '/');
    const fileName = cleanPath.split('/').pop() || 'media';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    let type: AssetType = 'video';
    if (['mp3', 'wav', 'aac', 'm4a', 'ogg', 'flac'].includes(ext)) {
      type = 'audio';
    } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
      type = 'image';
    }

    // Convert file path to Tauri asset URL
    let url = filePath;
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        url = convertFileSrc(filePath);
      } catch (e) {
        console.warn('Could not convert Tauri file src', e);
      }
    }

    let duration = 10.0;
    let width: number | undefined = 1920;
    let height: number | undefined = 1080;
    let thumbnail: string | undefined;

    if (type === 'video') {
      try {
        const inspectVideo = async () => {
          const video = document.createElement('video');
          video.crossOrigin = 'anonymous'; // the Tauri asset protocol taints the thumbnail canvas without it
          video.src = url;
          video.preload = 'metadata';
          video.muted = true;
          video.playsInline = true;

          await new Promise((resolve) => {
            video.onloadedmetadata = () => {
              if (video.duration && !isNaN(video.duration) && video.duration > 0) {
                duration = video.duration;
              }
              if (video.videoWidth) width = video.videoWidth;
              if (video.videoHeight) height = video.videoHeight;
              resolve(true);
            };
            video.onerror = () => resolve(false);
          });

          // Thumbnail capture
          video.currentTime = Math.min(1.0, duration / 2);
          await new Promise((resolve) => {
            video.onseeked = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = 160;
                canvas.height = 90;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0, 160, 90);
                  thumbnail = canvas.toDataURL('image/jpeg', 0.7);
                }
              } catch (e) {
                console.warn('Thumbnail generation failed', e);
              }
              resolve(true);
            };
            video.onerror = () => resolve(false);
          });
        };

        // 1.5s timeout max for inspection so it never hangs
        await withTimeout(inspectVideo(), 1500, null);
      } catch (err) {
        Logger.warn('useAssetStore', 'Fast video metadata fallback used', err);
      }
    } else if (type === 'audio') {
      try {
        const inspectAudio = async () => {
          const audio = document.createElement('audio');
          audio.src = url;
          audio.preload = 'metadata';
          await new Promise((resolve) => {
            audio.onloadedmetadata = () => {
              if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
                duration = audio.duration;
              }
              resolve(true);
            };
            audio.onerror = () => resolve(false);
          });
        };

        await withTimeout(inspectAudio(), 1500, null);
      } catch (err) {
        Logger.warn('useAssetStore', 'Fast audio metadata fallback used', err);
      }
    }

    // A still is its own thumbnail
    if (type === 'image') thumbnail = url;

    const asset: MediaAsset = {
      id,
      name: fileName,
      path: cleanPath, // Absolute disk path for FFmpeg
      url,
      type,
      duration: Math.max(1, duration),
      width,
      height,
      size: 0,
      thumbnail,
      createdAt: Date.now(),
    };

    get().addAsset(asset);
    return asset;
  },

  importFile: async (file: File): Promise<MediaAsset> => {
    Logger.info('useAssetStore', `Importing file object: ${file.name}, size: ${file.size}`);

    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${file.name}`;
    const url = URL.createObjectURL(file);
    let type: AssetType = 'video';

    if (file.type.startsWith('audio/')) {
      type = 'audio';
    } else if (file.type.startsWith('image/')) {
      type = 'image';
    }

    let duration = 10.0;
    let width: number | undefined = 1920;
    let height: number | undefined = 1080;
    let thumbnail: string | undefined;

    if (type === 'video') {
      try {
        const inspectVideo = async () => {
          const video = document.createElement('video');
          video.src = url;
          video.preload = 'metadata';
          video.muted = true;
          video.playsInline = true;

          await new Promise((resolve) => {
            video.onloadedmetadata = () => {
              if (video.duration && !isNaN(video.duration) && video.duration > 0) {
                duration = video.duration;
              }
              if (video.videoWidth) width = video.videoWidth;
              if (video.videoHeight) height = video.videoHeight;
              resolve(true);
            };
            video.onerror = () => resolve(false);
          });

          video.currentTime = Math.min(1.0, duration / 2);
          await new Promise((resolve) => {
            video.onseeked = () => {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = 160;
                canvas.height = 90;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(video, 0, 0, 160, 90);
                  thumbnail = canvas.toDataURL('image/jpeg', 0.7);
                }
              } catch (e) {
                console.warn('Thumbnail generation failed', e);
              }
              resolve(true);
            };
            video.onerror = () => resolve(false);
          });
        };

        await withTimeout(inspectVideo(), 1500, null);
      } catch (err) {
        Logger.warn('useAssetStore', 'Could not read video metadata', err);
      }
    } else if (type === 'audio') {
      try {
        const inspectAudio = async () => {
          const audio = document.createElement('audio');
          audio.src = url;
          audio.preload = 'metadata';
          await new Promise((resolve) => {
            audio.onloadedmetadata = () => {
              if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
                duration = audio.duration;
              }
              resolve(true);
            };
            audio.onerror = () => resolve(false);
          });
        };

        await withTimeout(inspectAudio(), 1500, null);
      } catch (err) {
        Logger.warn('useAssetStore', 'Could not read audio metadata', err);
      }
    }

    // A still is its own thumbnail
    if (type === 'image') thumbnail = url;

    const nativePath = (file as unknown as { path?: string }).path;

    const asset: MediaAsset = {
      id,
      name: file.name,
      path: nativePath ? nativePath.replace(/\\/g, '/') : file.name,
      url,
      type,
      duration: Math.max(1, duration),
      width,
      height,
      size: file.size,
      thumbnail,
      createdAt: Date.now(),
    };

    get().addAsset(asset);
    return asset;
  },
}));
