import { Clip, Track } from '@/types/timeline';
import { MediaAsset } from '@/types/asset';
import { ProjectSettings } from '@/types/project';
import { TimelineEngine } from '@/core/timeline/timelineEngine';
import { Logger } from '@/core/logger';
import { resolveTransform } from '@/core/animation/keyframes';
import { previewVolume } from '@/core/audio/fades';
import { canvasFilter } from '@/core/color/colorGrading';
import { backdropSigmaPx } from '@/core/effects/regionEffects';
import { clipToFrame, fitRect } from '@/core/layout/fit';
import { RegionEffectRenderer } from './effectRenderer';

export type TimeUpdateListener = (time: number) => void;

/** Handles drawn on the selected clip: four corners scale it, the round one above rotates it */
export type HandleType = 'nw' | 'ne' | 'se' | 'sw' | 'rotate';

/** Rectangle in clip-local space: origin is the clip anchor (canvas center + x/y), before scale and rotation */
export interface LocalRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

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

  private selectedClipId: string | null = null;
  private guides = { x: false, y: false };
  private effectRenderer = new RegionEffectRenderer();
  /** Rectangle being drawn with the region tool, in project pixels */
  private draftRegion: { x: number; y: number; width: number; height: number } | null = null;

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

  /** Clip outlined on the canvas while it is active at the playhead */
  public setSelectedClipId(id: string | null): void {
    this.selectedClipId = id;
  }

  /** Outline of the region being drawn with the region tool (null to hide) */
  public setDraftRegion(region: { x: number; y: number; width: number; height: number } | null): void {
    this.draftRegion = region;
  }

  /** Center snap guide lines shown while dragging a clip in the preview */
  public setGuides(guides: { x: boolean; y: boolean }): void {
    this.guides = guides;
  }

  /** Bounds of a visual clip in clip-local space (text is measured with its real font) */
  private getClipLocalRect(clip: Clip): LocalRect | null {
    if (!this.currentProject) return null;
    const { width, height } = this.currentProject;

    if (clip.type === 'effect' && clip.effect) {
      return { x0: -clip.effect.width / 2, y0: -clip.effect.height / 2, x1: clip.effect.width / 2, y1: clip.effect.height / 2 };
    }

    if (clip.type === 'video' || clip.type === 'image') {
      // Footage that is fitted or covers the frame occupies only part of it; use the real picture size when known
      const asset = this.currentAssets.get(clip.assetId);
      const video = asset ? this.videoPool.get(asset.id) : undefined;
      if (clip.fit && clip.fit !== 'stretch' && video && video.videoWidth > 0) {
        const r = clipToFrame(fitRect(clip.fit, video.videoWidth, video.videoHeight, width, height), width, height);
        return { x0: r.x - width / 2, y0: r.y - height / 2, x1: r.x + r.w - width / 2, y1: r.y + r.h - height / 2 };
      }
      return { x0: -width / 2, y0: -height / 2, x1: width / 2, y1: height / 2 };
    }

    if (clip.type === 'text' && clip.text && this.ctx) {
      const text = clip.text;
      const fontSize = text.fontSize || 48;
      this.ctx.save();
      this.ctx.font = `${text.fontStyle || 'normal'} ${text.fontWeight || 'bold'} ${fontSize}px ${
        text.fontFamily || 'Inter, sans-serif'
      }`;
      const lines = text.content.split('\n');
      const maxLineWidth = Math.max(...lines.map((l) => this.ctx!.measureText(l).width));
      this.ctx.restore();

      const totalHeight = lines.length * fontSize * 1.25;
      const pad = text.backgroundBox?.enabled ? text.backgroundBox.padding || 12 : 6;
      const align = text.textAlign || 'center';
      const left = align === 'left' ? 0 : align === 'right' ? -maxLineWidth : -maxLineWidth / 2;
      return { x0: left - pad, y0: -totalHeight / 2 - pad, x1: left + maxLineWidth + pad, y1: totalHeight / 2 + pad };
    }

    return null;
  }

  /** Topmost visual clip under a point given in project pixels, or null */
  public hitTest(px: number, py: number): Clip | null {
    if (!this.currentProject) return null;
    const { width, height } = this.currentProject;

    const active = TimelineEngine.getActiveClipsAtTime(this.currentTracks, this.currentTime);
    // Same order as drawComposition: media, then region effects, text on top
    const visuals = [
      ...active.filter((c) => c.type === 'video' || c.type === 'image'),
      ...active.filter((c) => c.type === 'effect'),
      ...active.filter((c) => c.type === 'text'),
    ];

    for (let i = visuals.length - 1; i >= 0; i--) {
      const clip = visuals[i];
      const rect = this.getClipLocalRect(clip);
      if (!rect) continue;

      const t = resolveTransform(clip, this.currentTime - clip.startTime);
      const dx = px - (width / 2 + t.x);
      const dy = py - (height / 2 + t.y);
      const rad = (t.rotation * Math.PI) / 180;
      const lx = (dx * Math.cos(rad) + dy * Math.sin(rad)) / (t.scaleX || 1);
      const ly = (-dx * Math.sin(rad) + dy * Math.cos(rad)) / (t.scaleY || 1);

      if (lx >= rect.x0 && lx <= rect.x1 && ly >= rect.y0 && ly <= rect.y1) return clip;
    }
    return null;
  }

  /** Handle size in project pixels (square side / circle diameter) */
  public getHandleSize(): number {
    return Math.max(14, (this.currentProject?.width ?? 1920) / 90);
  }

  /**
   * World-space geometry (project pixels) of the selected clip when it is active at the playhead:
   * anchor point, the four box corners and the rotation handle above the top edge.
   */
  public getSelectionGeometry(): {
    clipId: string;
    anchor: { x: number; y: number };
    rotation: number;
    scale: number;
    /** Region effects cannot be rotated, so they have no rotation handle */
    rotatable: boolean;
    handles: Record<HandleType, { x: number; y: number }>;
    /** The real box corners, not moved onto the canvas like the handles are */
    corners: Record<'nw' | 'ne' | 'se' | 'sw', { x: number; y: number }>;
    topCenter: { x: number; y: number };
  } | null {
    if (!this.currentProject || !this.selectedClipId) return null;
    const { width, height } = this.currentProject;

    const clip = TimelineEngine.getActiveClipsAtTime(this.currentTracks, this.currentTime).find(
      (c) => c.id === this.selectedClipId
    );
    const rect = clip ? this.getClipLocalRect(clip) : null;
    if (!clip || !rect) return null;

    const t = resolveTransform(clip, this.currentTime - clip.startTime);
    const rad = (t.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const anchor = { x: width / 2 + t.x, y: height / 2 + t.y };
    const toWorld = (lx: number, ly: number) => {
      const sx = lx * t.scaleX;
      const sy = ly * t.scaleY;
      return { x: anchor.x + sx * cos - sy * sin, y: anchor.y + sx * sin + sy * cos };
    };

    const topCenter = toWorld((rect.x0 + rect.x1) / 2, rect.y0);
    // Local "up" rotated into world space, pushed outward by a fixed screen-ish distance
    const offset = this.getHandleSize() * 2.5;
    const upX = sin;
    const upY = -cos;

    // Handles of a clip that fills or leaves the canvas stay on the canvas so they can always be grabbed
    const margin = this.getHandleSize() / 2;
    const onCanvas = (p: { x: number; y: number }) => ({
      x: Math.min(width - margin, Math.max(margin, p.x)),
      y: Math.min(height - margin, Math.max(margin, p.y)),
    });

    return {
      clipId: clip.id,
      anchor,
      rotation: t.rotation,
      scale: t.scaleX,
      rotatable: clip.type !== 'effect',
      topCenter,
      corners: {
        nw: toWorld(rect.x0, rect.y0),
        ne: toWorld(rect.x1, rect.y0),
        se: toWorld(rect.x1, rect.y1),
        sw: toWorld(rect.x0, rect.y1),
      },
      handles: {
        nw: onCanvas(toWorld(rect.x0, rect.y0)),
        ne: onCanvas(toWorld(rect.x1, rect.y0)),
        se: onCanvas(toWorld(rect.x1, rect.y1)),
        sw: onCanvas(toWorld(rect.x0, rect.y1)),
        rotate: onCanvas({ x: topCenter.x + upX * offset, y: topCenter.y + upY * offset }),
      },
    };
  }

  /** Handle of the selected clip under a point given in project pixels, or null */
  public hitHandle(px: number, py: number): HandleType | null {
    const geometry = this.getSelectionGeometry();
    if (!geometry) return null;
    const reach = this.getHandleSize() * 0.75;

    // Rotation first: it sits outside the box, corner handles may overlap on tiny clips
    const order: HandleType[] = geometry.rotatable ? ['rotate', 'nw', 'ne', 'se', 'sw'] : ['nw', 'ne', 'se', 'sw'];
    for (const type of order) {
      const h = geometry.handles[type];
      if (Math.hypot(px - h.x, py - h.y) <= reach) return type;
    }
    return null;
  }

  private drawHandles(lineWidth: number): void {
    const geometry = this.getSelectionGeometry();
    if (!this.ctx || !geometry) return;
    const ctx = this.ctx;
    const size = this.getHandleSize();

    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = lineWidth;
    ctx.setLineDash([]);

    if (geometry.rotatable) {
      // Stem from the top edge to the rotation handle
      ctx.beginPath();
      ctx.moveTo(geometry.topCenter.x, geometry.topCenter.y);
      ctx.lineTo(geometry.handles.rotate.x, geometry.handles.rotate.y);
      ctx.stroke();
    }

    for (const type of ['nw', 'ne', 'se', 'sw'] as const) {
      const h = geometry.handles[type];
      ctx.beginPath();
      ctx.rect(h.x - size / 2, h.y - size / 2, size, size);
      ctx.fill();
      ctx.stroke();
    }

    if (geometry.rotatable) {
      const r = geometry.handles.rotate;
      ctx.beginPath();
      ctx.arc(r.x, r.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSelectionOverlay(activeClips: Clip[]): void {
    if (!this.ctx || !this.currentProject) return;
    const { width, height } = this.currentProject;
    const ctx = this.ctx;
    const lineWidth = Math.max(2, width / 640);

    const selected = activeClips.find((c) => c.id === this.selectedClipId);
    const rect = selected ? this.getClipLocalRect(selected) : null;
    if (selected && rect) {
      const t = resolveTransform(selected, this.currentTime - selected.startTime);
      ctx.save();
      ctx.translate(width / 2 + t.x, height / 2 + t.y);
      if (t.rotation !== 0) ctx.rotate((t.rotation * Math.PI) / 180);
      ctx.scale(t.scaleX, t.scaleY);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = lineWidth / Math.max(0.01, Math.min(Math.abs(t.scaleX), Math.abs(t.scaleY)));
      ctx.setLineDash([lineWidth * 4, lineWidth * 3]);
      ctx.strokeRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
      ctx.restore();

      this.drawHandles(lineWidth);
    }

    if (this.draftRegion) {
      ctx.save();
      ctx.fillStyle = 'rgba(34, 211, 238, 0.18)';
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([lineWidth * 4, lineWidth * 3]);
      const d = this.draftRegion;
      ctx.fillRect(d.x, d.y, d.width, d.height);
      ctx.strokeRect(d.x, d.y, d.width, d.height);
      ctx.restore();
    }

    if (this.guides.x || this.guides.y) {
      ctx.save();
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      if (this.guides.x) {
        ctx.moveTo(width / 2, 0);
        ctx.lineTo(width / 2, height);
      }
      if (this.guides.y) {
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
      }
      ctx.stroke();
      ctx.restore();
    }
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
      const volume = previewVolume(clip.audio, track?.isMuted ?? false, this.currentTime - clip.startTime, clip.duration);

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
      const volume = previewVolume(clip.audio, track?.isMuted ?? false, this.currentTime - clip.startTime, clip.duration);

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

      const { x: posX, y: posY, scaleX, scaleY, opacity, rotation } = resolveTransform(
        clip,
        this.currentTime - clip.startTime
      );

      const timeInClip = this.currentTime - clip.startTime;
      const timeLeftInClip = (clip.startTime + clip.duration) - this.currentTime;

      let transitionAlpha = 1;
      let transitionTranslateX = 0;

      // Transition In
      if (clip.transitionIn && timeInClip >= 0 && timeInClip < clip.transitionIn.duration) {
        const progress = timeInClip / clip.transitionIn.duration;
        if (clip.transitionIn.type === 'cross-dissolve' || clip.transitionIn.type === 'fade-to-black') {
          transitionAlpha = progress;
        } else if (clip.transitionIn.type === 'slide' || clip.transitionIn.type === 'wipe') {
          transitionTranslateX = width * (1 - progress);
        }
      }

      // Transition Out
      if (clip.transitionOut && timeLeftInClip >= 0 && timeLeftInClip < clip.transitionOut.duration) {
        const progress = timeLeftInClip / clip.transitionOut.duration;
        if (clip.transitionOut.type === 'cross-dissolve' || clip.transitionOut.type === 'fade-to-black') {
          transitionAlpha = progress;
        } else if (clip.transitionOut.type === 'slide' || clip.transitionOut.type === 'wipe') {
          transitionTranslateX = -width * (1 - progress);
        }
      }

      // Blurred backdrop: the same footage, cover-fitted and blurred, fills the frame behind the clip
      if (clip.backdropBlur && clip.backdropBlur > 0 && video.videoWidth > 0 && video.videoHeight > 0) {
        const cover = fitRect('cover', video.videoWidth, video.videoHeight, width, height);
        const grow = 1.15; // hides the soft edge a blur leaves at the borders
        this.ctx.save();
        this.ctx.globalAlpha = opacity * transitionAlpha;
        this.ctx.filter = `blur(${backdropSigmaPx(clip.backdropBlur, height).toFixed(2)}px)`;
        this.ctx.drawImage(
          video,
          width / 2 - (cover.w * grow) / 2,
          height / 2 - (cover.h * grow) / 2,
          cover.w * grow,
          cover.h * grow
        );
        this.ctx.restore();
      }

      this.ctx.globalAlpha = opacity * transitionAlpha;

      this.ctx.translate(width / 2 + posX + transitionTranslateX, height / 2 + posY);
      if (rotation !== 0) {
        this.ctx.rotate((rotation * Math.PI) / 180);
      }
      this.ctx.scale(scaleX, scaleY);

      if (video.videoWidth > 0 && video.videoHeight > 0) {
        this.ctx.filter = canvasFilter(clip.colorGrading); // restored by ctx.restore() below
        const fit = clip.fit ?? 'stretch';
        const rect = fitRect(fit, video.videoWidth, video.videoHeight, width, height);
        if (fit === 'cover') {
          // Cover overflows the frame on one axis; only the frame-sized box is visible
          this.ctx.beginPath();
          this.ctx.rect(-width / 2, -height / 2, width, height);
          this.ctx.clip();
        }
        this.ctx.drawImage(video, rect.x - width / 2, rect.y - height / 2, rect.w, rect.h);
      }
      this.ctx.restore();
    }

    // 3b. Region effects (blur, mosaic, black box) act on the video drawn so far; text stays sharp on top
    for (const clip of activeClips) {
      if (clip.type !== 'effect' || !clip.effect) continue;
      const t = resolveTransform(clip, this.currentTime - clip.startTime);
      this.effectRenderer.apply(this.ctx, this.canvas, clip.effect, {
        cx: width / 2 + t.x,
        cy: height / 2 + t.y,
        width: clip.effect.width * t.scaleX,
        height: clip.effect.height * t.scaleY,
      });
    }

    // 4. Draw active Text & Subtitle clips on top of video layers
    for (const clip of activeClips) {
      if (clip.type !== 'text' || !clip.text) continue;

      const text = clip.text;
      this.ctx.save();

      const { x: posX, y: posY, scaleX, scaleY, opacity, rotation } = resolveTransform(
        clip,
        this.currentTime - clip.startTime
      );

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

    // 5. Editing overlay (selection outline + snap guides), preview only
    this.drawSelectionOverlay(activeClips);
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
