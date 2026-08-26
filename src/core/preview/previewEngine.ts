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
  private mediaContainer: HTMLDivElement | null = null;

  private isPlaying: boolean = false;
  private currentTime: number = 0;
  private lastPerformanceTime: number = 0;
  private animationFrameId: number | null = null;
  private timeListeners: Set<TimeUpdateListener> = new Set();
  private previousActiveClipIds: Set<string> = new Set();

  private currentProject: ProjectSettings | null = null;
  private currentTracks: Track[] = [];
  private currentAssets: Map<string, MediaAsset> = new Map();

  public initialize(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ensureMediaContainer();
    this.startRenderLoop();
    Logger.info('PreviewEngine', 'Canvas & Hardware Media Container initialized');
  }

  private ensureMediaContainer(): HTMLDivElement {
    if (!this.mediaContainer) {
      let el = document.getElementById('preview-engine-media-pool') as HTMLDivElement;
      if (!el) {
        el = document.createElement('div');
        el.id = 'preview-engine-media-pool';
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        el.style.top = '-9999px';
        el.style.width = '1px';
        el.style.height = '1px';
        el.style.overflow = 'hidden';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        document.body.appendChild(el);
      }
      this.mediaContainer = el;
    }
    return this.mediaContainer;
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
      video.preload = 'auto';
      video.playsInline = true;
      video.muted = false;
      const container = this.ensureMediaContainer();
      container.appendChild(video);
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
      const container = this.ensureMediaContainer();
      container.appendChild(audio);
      this.audioPool.set(asset.id, audio);
    }
    return audio;
  }

  /**
   * Seeks all active media elements to the exact target playhead time (when paused or scrubbing)
   */
  public seekTo(time: number): void {
    this.currentTime = Math.max(0, time);
    this.notifyTime(this.currentTime);

    if (!this.currentTracks) return;

    const activeClips = TimelineEngine.getActiveClipsAtTime(this.currentTracks, this.currentTime);

    for (const clip of activeClips) {
      const asset = this.currentAssets.get(clip.assetId);
      if (!asset) continue;

      const mediaTime = Math.max(0, clip.inPoint + (this.currentTime - clip.startTime) * clip.speed);

      if (clip.type === 'video') {
        const video = this.getOrCreateVideoElement(asset);
        const maxDuration = video.duration && !isNaN(video.duration) ? video.duration : asset.duration;
        const targetTime = Math.min(mediaTime, Math.max(0, maxDuration - 0.05));

        if (Math.abs(video.currentTime - targetTime) > 0.02) {
          video.currentTime = targetTime;
        }
      } else if (clip.type === 'audio') {
        const audio = this.getOrCreateAudioElement(asset);
        const maxDuration = audio.duration && !isNaN(audio.duration) ? audio.duration : asset.duration;
        const targetTime = Math.min(mediaTime, Math.max(0, maxDuration - 0.05));

        if (Math.abs(audio.currentTime - targetTime) > 0.02) {
          audio.currentTime = targetTime;
        }
      }
    }
  }

  /**
   * Starts playback with master hardware clock synchronization
   */
  public play(startTime?: number): void {
    if (startTime !== undefined) {
      this.currentTime = startTime;
    }

    this.isPlaying = true;
    this.lastPerformanceTime = performance.now();

    const activeClips = TimelineEngine.getActiveClipsAtTime(this.currentTracks, this.currentTime);
    const activeClipIdSet = new Set<string>();

    for (const clip of activeClips) {
      activeClipIdSet.add(clip.id);
      const asset = this.currentAssets.get(clip.assetId);
      if (!asset) continue;

      const mediaTime = Math.max(0, clip.inPoint + (this.currentTime - clip.startTime) * clip.speed);
      const track = this.currentTracks.find((t) => t.id === clip.trackId);
      const isMuted = track?.isMuted || clip.audio?.muted || false;
      const volume = isMuted ? 0 : Math.min(1, Math.max(0, clip.audio?.volume ?? 1));

      if (clip.type === 'video') {
        const video = this.getOrCreateVideoElement(asset);
        const maxDuration = video.duration && !isNaN(video.duration) ? video.duration : asset.duration;
        const targetTime = Math.min(mediaTime, Math.max(0, maxDuration - 0.05));

        video.playbackRate = clip.speed;
        video.muted = isMuted;
        video.volume = volume;
        video.currentTime = targetTime;
        video.play().catch((err) => console.warn('Video playback warning:', err));
      } else if (clip.type === 'audio') {
        const audio = this.getOrCreateAudioElement(asset);
        const maxDuration = audio.duration && !isNaN(audio.duration) ? audio.duration : asset.duration;
        const targetTime = Math.min(mediaTime, Math.max(0, maxDuration - 0.05));

        audio.muted = isMuted;
        audio.volume = volume;
        audio.playbackRate = clip.speed;
        audio.currentTime = targetTime;
        audio.play().catch((err) => console.warn('Audio playback warning:', err));
      }
    }

    this.previousActiveClipIds = activeClipIdSet;
    Logger.info('PreviewEngine', 'Playback started at time', this.currentTime);
  }

  /**
   * Pauses all media elements
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
   * Continuous animation & composition render loop driven by media hardware clock
   */
  private startRenderLoop(): void {
    if (this.animationFrameId) return;

    const render = (now: number) => {
      if (this.isPlaying && this.currentProject) {
        const activeClips = TimelineEngine.getActiveClipsAtTime(this.currentTracks, this.currentTime);

        // Find primary active video or audio clip to serve as master hardware clock
        let primaryMediaTime: number | null = null;
        const primaryClip = activeClips.find((c) => c.type === 'video' || c.type === 'audio');

        if (primaryClip) {
          const asset = this.currentAssets.get(primaryClip.assetId);
          if (asset) {
            const mediaEl = primaryClip.type === 'video' ? this.videoPool.get(asset.id) : this.audioPool.get(asset.id);
            if (mediaEl && !mediaEl.paused && mediaEl.currentTime > 0) {
              primaryMediaTime = primaryClip.startTime + (mediaEl.currentTime - primaryClip.inPoint) / primaryClip.speed;
            }
          }
        }

        if (primaryMediaTime !== null && !isNaN(primaryMediaTime)) {
          this.currentTime = primaryMediaTime;
          this.lastPerformanceTime = now;
        } else {
          // Fallback to performance delta if in gap between clips
          const delta = (now - this.lastPerformanceTime) / 1000;
          this.currentTime += delta;
          this.lastPerformanceTime = now;
        }

        if (this.currentTime >= this.currentProject.duration) {
          this.pause();
          this.seekTo(0);
        } else {
          this.notifyTime(this.currentTime);
          this.syncActiveClipsDuringPlayback();
        }
      } else {
        this.lastPerformanceTime = now;
      }

      this.drawComposition();
      this.animationFrameId = requestAnimationFrame(render);
    };

    this.animationFrameId = requestAnimationFrame(render);
  }

  private syncActiveClipsDuringPlayback(): void {
    const activeClips = TimelineEngine.getActiveClipsAtTime(this.currentTracks, this.currentTime);
    const currentActiveClipIds = new Set<string>();

    for (const clip of activeClips) {
      currentActiveClipIds.add(clip.id);
      const asset = this.currentAssets.get(clip.assetId);
      if (!asset) continue;

      const mediaTime = Math.max(0, clip.inPoint + (this.currentTime - clip.startTime) * clip.speed);
      const track = this.currentTracks.find((t) => t.id === clip.trackId);
      const isMuted = track?.isMuted || clip.audio?.muted || false;
      const volume = isMuted ? 0 : Math.min(1, Math.max(0, clip.audio?.volume ?? 1));

      const isNewlyActivated = !this.previousActiveClipIds.has(clip.id);

      if (clip.type === 'video') {
        const video = this.getOrCreateVideoElement(asset);
        const maxDuration = video.duration && !isNaN(video.duration) ? video.duration : asset.duration;
        const targetTime = Math.min(mediaTime, Math.max(0, maxDuration - 0.05));

        video.muted = isMuted;
        video.volume = volume;
        video.playbackRate = clip.speed;

        if (isNewlyActivated) {
          // Force explicit hardware seek right at activation if there is drift
          if (Math.abs(video.currentTime - targetTime) > 0.05) {
            video.currentTime = targetTime;
          }
          video.play().catch(() => {});
        } else if (video.paused) {
          video.play().catch(() => {});
        }
      } else if (clip.type === 'audio') {
        const audio = this.getOrCreateAudioElement(asset);
        const maxDuration = audio.duration && !isNaN(audio.duration) ? audio.duration : asset.duration;
        const targetTime = Math.min(mediaTime, Math.max(0, maxDuration - 0.05));

        audio.muted = isMuted;
        audio.volume = volume;
        audio.playbackRate = clip.speed;

        if (isNewlyActivated) {
          if (Math.abs(audio.currentTime - targetTime) > 0.05) {
            audio.currentTime = targetTime;
          }
          audio.play().catch(() => {});
        } else if (audio.paused) {
          audio.play().catch(() => {});
        }
      }
    }

    this.previousActiveClipIds = currentActiveClipIds;

    // Pause clips that have ended or are not active, and pre-seek them for future
    this.videoPool.forEach((video, assetId) => {
      const isActive = activeClips.some((c) => c.assetId === assetId && c.type === 'video');
      if (!isActive) {
        if (!video.paused) {
          video.pause();
        }
        
        // Pre-Seek: Find the next upcoming clip for this asset and buffer its inPoint
        const allClips = this.currentTracks.flatMap(t => t.clips);
        const upcomingClip = allClips
          .filter(c => c.assetId === assetId && c.type === 'video' && c.startTime >= this.currentTime)
          .sort((a, b) => a.startTime - b.startTime)[0];
          
        if (upcomingClip) {
          // Pre-buffer the start frame so GPU decoder is perfectly ready!
          if (Math.abs(video.currentTime - upcomingClip.inPoint) > 0.1) {
            video.currentTime = upcomingClip.inPoint;
          }
        } else {
          // If no upcoming clips, park it at 0
          if (Math.abs(video.currentTime) > 0.1) {
             video.currentTime = 0;
          }
        }
      }
    });

    this.audioPool.forEach((audio, assetId) => {
      const isActive = activeClips.some((c) => c.assetId === assetId && c.type === 'audio');
      if (!isActive) {
        if (!audio.paused) {
          audio.pause();
        }
        
        const allClips = this.currentTracks.flatMap(t => t.clips);
        const upcomingClip = allClips
          .filter(c => c.assetId === assetId && c.type === 'audio' && c.startTime >= this.currentTime)
          .sort((a, b) => a.startTime - b.startTime)[0];
          
        if (upcomingClip) {
          if (Math.abs(audio.currentTime - upcomingClip.inPoint) > 0.1) {
            audio.currentTime = upcomingClip.inPoint;
          }
        }
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

    // 2. Find active clips at playhead
    const activeClips = TimelineEngine.getActiveClipsAtTime(this.currentTracks, this.currentTime);

    // 3. Draw active video / image / overlay clips
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

    // 4. Draw active Text & Subtitle clips on top of video layers
    for (const clip of activeClips) {
      if (clip.type !== 'text' || !clip.text) continue;

      const text = clip.text;
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

      const fontStyle = text.fontStyle || 'normal';
      const fontWeight = text.fontWeight || 'bold';
      const fontSize = text.fontSize || 48;
      const fontFamily = text.fontFamily || 'Inter, sans-serif';

      this.ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
      this.ctx.textAlign = text.textAlign || 'center';
      this.ctx.textBaseline = 'middle';

      const lines = text.content.split('\n');
      const lineHeight = fontSize * 1.25;
      const totalTextHeight = lines.length * lineHeight;

      // Draw background box if enabled
      if (text.backgroundBox?.enabled) {
        let maxLineWidth = 0;
        lines.forEach((l) => {
          const m = this.ctx!.measureText(l);
          if (m.width > maxLineWidth) maxLineWidth = m.width;
        });

        const padding = text.backgroundBox.padding || 12;
        const boxWidth = maxLineWidth + padding * 2;
        const boxHeight = totalTextHeight + padding * 2;
        const boxX = text.textAlign === 'left' ? -padding : text.textAlign === 'right' ? -boxWidth + padding : -boxWidth / 2;
        const boxY = -boxHeight / 2;

        this.ctx.fillStyle = text.backgroundBox.color || 'rgba(0,0,0,0.6)';
        const radius = text.backgroundBox.borderRadius || 8;

        if (this.ctx.roundRect) {
          this.ctx.beginPath();
          this.ctx.roundRect(boxX, boxY, boxWidth, boxHeight, radius);
          this.ctx.fill();
        } else {
          this.ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
        }
      }

      // Draw shadow if configured
      if (text.shadow) {
        this.ctx.shadowColor = text.shadow.color || 'rgba(0,0,0,0.7)';
        this.ctx.shadowBlur = text.shadow.blur ?? 8;
        this.ctx.shadowOffsetX = text.shadow.offsetX ?? 2;
        this.ctx.shadowOffsetY = text.shadow.offsetY ?? 4;
      }

      // Draw lines
      const startY = -(totalTextHeight / 2) + lineHeight / 2;

      lines.forEach((line, index) => {
        const lineY = startY + index * lineHeight;

        // Stroke / Outline
        if (text.stroke && text.stroke.width > 0) {
          this.ctx!.strokeStyle = text.stroke.color || '#000000';
          this.ctx!.lineWidth = text.stroke.width * 2;
          this.ctx!.lineJoin = 'round';
          this.ctx!.strokeText(line, 0, lineY);
        }

        // Main Text Fill
        this.ctx!.fillStyle = text.color || '#FFFFFF';
        this.ctx!.fillText(line, 0, lineY);
      });

      this.ctx.restore();
    }
  }

  public cleanup(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.pause();
    if (this.mediaContainer) {
      this.mediaContainer.remove();
      this.mediaContainer = null;
    }
    this.videoPool.clear();
    this.audioPool.clear();
    this.timeListeners.clear();
    this.previousActiveClipIds.clear();
  }
}

export const previewEngine = new PreviewEngine();
