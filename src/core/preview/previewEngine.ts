import { Track } from '@/types/timeline';
import { MediaAsset } from '@/types/asset';
import { ProjectSettings } from '@/types/project';
import { TimelineEngine } from '@/core/timeline/timelineEngine';
import { Logger } from '@/core/logger';

export type TimeUpdateListener = (time: number) => void;

export class PreviewEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private videoPool: Map<string, HTMLVideoElement> = new Map();
  private audioPool: Map<string, HTMLAudioElement> = new Map();

  private isPlaying: boolean = false;
  private currentTime: number = 0;
  private lastTimeUpdate: number = 0;
  private animationFrameId: number | null = null;
  private timeListeners: Set<TimeUpdateListener> = new Set();

  private currentProject: ProjectSettings | null = null;
  private currentTracks: Track[] = [];
  private currentAssets: Map<string, MediaAsset> = new Map();

  public initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.startRenderLoop();
    Logger.info('PreviewEngine', 'Canvas initialized & render loop started');
  }

  public subscribeTime(listener: TimeUpdateListener): () => void {
    this.timeListeners.add(listener);
    return () => this.timeListeners.delete(listener);
  }

  private notifyTime(time: number): void {
    this.currentTime = time;
    this.timeListeners.forEach((l) => {
      try {
        l(time);
      } catch (e) {
        console.error('Error in time listener', e);
      }
    });
  }

  public updateContext(
    project: ProjectSettings,
    tracks: Track[],
    assets: Map<string, MediaAsset>
  ): void {
    this.currentProject = project;
    this.currentTracks = tracks;
    this.currentAssets = assets;
  }

  public getOrCreateVideoElement(asset: MediaAsset): HTMLVideoElement {
    let video = this.videoPool.get(asset.id);
    if (!video) {
      video = document.createElement('video');
      video.src = asset.url;
      video.crossOrigin = 'anonymous';
      video.preload = 'auto';
      video.playsInline = true;
      video.muted = false; // Enabled for natural video sound
      this.videoPool.set(asset.id, video);
    }
    return video;
  }

  public getOrCreateAudioElement(asset: MediaAsset): HTMLAudioElement {
    let audio = this.audioPool.get(asset.id);
    if (!audio) {
      audio = document.createElement('audio');
      audio.src = asset.url;
      audio.preload = 'auto';
      audio.muted = false;
      this.audioPool.set(asset.id, audio);
    }
    return audio;
  }

  /**
   * Seeks all active media elements to the target playhead time (when user pauses or scrubs)
   */
  public seekTo(time: number): void {
    this.currentTime = Math.max(0, time);
    this.notifyTime(this.currentTime);

    if (!this.currentTracks) return;

    const activeClips = TimelineEngine.getActiveClipsAtTime(this.currentTracks, this.currentTime);

    for (const clip of activeClips) {
      const asset = this.currentAssets.get(clip.assetId);
      if (!asset) continue;

      const mediaTime = clip.inPoint + (this.currentTime - clip.startTime) * clip.speed;

      if (clip.type === 'video') {
        const video = this.getOrCreateVideoElement(asset);
        if (Math.abs(video.currentTime - mediaTime) > 0.03) {
          video.currentTime = Math.max(0, mediaTime);
        }
      } else if (clip.type === 'audio') {
        const audio = this.getOrCreateAudioElement(asset);
        if (Math.abs(audio.currentTime - mediaTime) > 0.03) {
          audio.currentTime = Math.max(0, mediaTime);
        }
      }
    }
  }

  /**
   * Starts playback smoothly with both video audio and music audio
   */
  public play(startTime?: number): void {
    if (startTime !== undefined) {
      this.currentTime = startTime;
    }

    this.isPlaying = true;
    this.lastTimeUpdate = performance.now();

    const activeClips = TimelineEngine.getActiveClipsAtTime(this.currentTracks, this.currentTime);

    for (const clip of activeClips) {
      const asset = this.currentAssets.get(clip.assetId);
      if (!asset) continue;

      const mediaTime = clip.inPoint + (this.currentTime - clip.startTime) * clip.speed;
      const track = this.currentTracks.find((t) => t.id === clip.trackId);
      const isMuted = track?.isMuted || clip.audio?.muted || false;
      const volume = isMuted ? 0 : Math.min(1, Math.max(0, clip.audio?.volume ?? 1));

      if (clip.type === 'video') {
        const video = this.getOrCreateVideoElement(asset);
        video.playbackRate = clip.speed;
        video.muted = isMuted;
        video.volume = volume;
        video.currentTime = Math.max(0, mediaTime);
        video.play().catch((err) => console.warn('Video playback warning:', err));
      } else if (clip.type === 'audio') {
        const audio = this.getOrCreateAudioElement(asset);
        audio.muted = isMuted;
        audio.volume = volume;
        audio.playbackRate = clip.speed;
        audio.currentTime = Math.max(0, mediaTime);
        audio.play().catch((err) => console.warn('Audio playback warning:', err));
      }
    }

    Logger.info('PreviewEngine', 'Playback started at time', this.currentTime);
  }

  /**
   * Pauses all playing media elements
   */
  public pause(): void {
    this.isPlaying = false;
    this.videoPool.forEach((v) => v.pause());
    this.audioPool.forEach((a) => a.pause());
    Logger.info('PreviewEngine', 'Playback paused at time', this.currentTime);
  }

  public togglePlay(): boolean {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
    return this.isPlaying;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  /**
   * Continuous animation & composition render loop running independently of React renders
   */
  private startRenderLoop(): void {
    if (this.animationFrameId) return;

    const render = (now: number) => {
      if (this.isPlaying && this.currentProject) {
        const delta = (now - this.lastTimeUpdate) / 1000;
        this.lastTimeUpdate = now;

        const nextTime = this.currentTime + delta;
        if (nextTime >= this.currentProject.duration) {
          this.pause();
          this.seekTo(0);
        } else {
          this.currentTime = nextTime;
          this.notifyTime(this.currentTime);

          this.syncActiveClipsDuringPlayback();
        }
      } else {
        this.lastTimeUpdate = now;
      }

      this.drawComposition();
      this.animationFrameId = requestAnimationFrame(render);
    };

    this.animationFrameId = requestAnimationFrame(render);
  }

  private syncActiveClipsDuringPlayback(): void {
    const activeClips = TimelineEngine.getActiveClipsAtTime(this.currentTracks, this.currentTime);

    for (const clip of activeClips) {
      const asset = this.currentAssets.get(clip.assetId);
      if (!asset) continue;

      const mediaTime = clip.inPoint + (this.currentTime - clip.startTime) * clip.speed;
      const track = this.currentTracks.find((t) => t.id === clip.trackId);
      const isMuted = track?.isMuted || clip.audio?.muted || false;
      const volume = isMuted ? 0 : Math.min(1, Math.max(0, clip.audio?.volume ?? 1));

      if (clip.type === 'video') {
        const video = this.getOrCreateVideoElement(asset);
        video.muted = isMuted;
        video.volume = volume;
        if (video.paused) {
          video.currentTime = Math.max(0, mediaTime);
          video.playbackRate = clip.speed;
          video.play().catch(() => {});
        }
      } else if (clip.type === 'audio') {
        const audio = this.getOrCreateAudioElement(asset);
        audio.muted = isMuted;
        audio.volume = volume;
        if (audio.paused) {
          audio.currentTime = Math.max(0, mediaTime);
          audio.playbackRate = clip.speed;
          audio.play().catch(() => {});
        }
      }
    }

    // Pause clips that have ended
    this.videoPool.forEach((video, assetId) => {
      const isActive = activeClips.some((c) => c.assetId === assetId && c.type === 'video');
      if (!isActive && !video.paused) {
        video.pause();
      }
    });

    this.audioPool.forEach((audio, assetId) => {
      const isActive = activeClips.some((c) => c.assetId === assetId && c.type === 'audio');
      if (!isActive && !audio.paused) {
        audio.pause();
      }
    });
  }

  private drawComposition(): void {
    if (!this.canvas || !this.ctx || !this.currentProject) return;

    const { width, height } = this.currentProject;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // 1. Draw Background
    this.ctx.fillStyle = this.currentProject.backgroundColor || '#000000';
    this.ctx.fillRect(0, 0, width, height);

    // 2. Find active clips
    const activeClips = TimelineEngine.getActiveClipsAtTime(this.currentTracks, this.currentTime);

    // 3. Draw each active video/overlay
    for (const clip of activeClips) {
      if (clip.type !== 'video' && clip.type !== 'image') continue;

      const asset = this.currentAssets.get(clip.assetId);
      if (!asset) continue;

      const video = this.getOrCreateVideoElement(asset);

      this.ctx.save();

      const scaleX = clip.transform?.scaleX ?? 1;
      const scaleY = clip.transform?.scaleY ?? 1;
      const posX = clip.transform?.x ?? 0;
      const posY = clip.transform?.y ?? 0;
      const opacity = clip.transform?.opacity ?? 1;
      const rotation = clip.transform?.rotation ?? 0;

      this.ctx.globalAlpha = opacity;

      this.ctx.translate(width / 2 + posX, height / 2 + posY);
      if (rotation !== 0) {
        this.ctx.rotate((rotation * Math.PI) / 180);
      }
      this.ctx.scale(scaleX, scaleY);

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        this.ctx.drawImage(video, -width / 2, -height / 2, width, height);
      }
      this.ctx.restore();
    }
  }

  public cleanup(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.pause();
    this.videoPool.clear();
    this.audioPool.clear();
    this.timeListeners.clear();
  }
}

export const previewEngine = new PreviewEngine();
