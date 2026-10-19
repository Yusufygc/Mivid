import React, { useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useAssetStore } from '@/stores/useAssetStore';
import { previewEngine } from '@/core/preview/previewEngine';
import { resolveTransform } from '@/core/animation/keyframes';
import {
  cursorForHandle,
  rectFromCorners,
  regionFromCorner,
  rotationFromDrag,
  scaleFromDrag,
} from '@/core/preview/handleMath';
import { EFFECT_KIND_LABELS, MIN_REGION_SIZE } from '@/core/effects/regionEffects';
import { EffectKind } from '@/types/timeline';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Maximize2, BoxSelect, Diamond, Loader2 } from 'lucide-react';
import { formatTimecode } from '@/utils/time';

export const PreviewPlayer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);

  const { project } = useProjectStore();
  const { assets } = useAssetStore();
  const {
    tracks,
    currentTime,
    isPlaying,
    selectedClipId,
    setIsPlaying,
    setCurrentTime,
    setSelectedClipId,
    updateClipTransform,
    updateClipEffect,
    addEffectClip,
    autoKeyframe,
    setAutoKeyframe,
  } = useTimelineStore();
  /** Shown only when the picture is still not there after a short moment, so quick seeks do not flash a spinner */
  const [showLoading, setShowLoading] = useState(false);
  /** Region tool: drag a rectangle on the preview to add a blur / mosaic / black box there */
  const [regionTool, setRegionTool] = useState<EffectKind | null>(null);
  const [playing, setPlaying] = useState(isPlaying);
  type DragState =
    | { mode: 'move'; clipId: string; startClientX: number; startClientY: number; originX: number; originY: number }
    | {
        mode: 'scale' | 'rotate';
        clipId: string;
        anchor: { x: number; y: number };
        start: { x: number; y: number };
        originScale: number;
        originRotation: number;
      }
    | { mode: 'region'; clipId: string; opposite: { x: number; y: number }; scale: number }
    | { mode: 'draw'; kind: EffectKind; start: { x: number; y: number } };
  const dragRef = useRef<DragState | null>(null);

  // Show the selected clip's outline on the canvas
  useEffect(() => {
    previewEngine.setSelectedClipId(selectedClipId);
  }, [selectedClipId]);

  /** Pointer position in project pixels, plus how many project pixels one screen pixel covers */
  const toProjectPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = project.width / rect.width;
    return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale, scale };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const point = toProjectPoint(e);

    if (regionTool) {
      dragRef.current = { mode: 'draw', kind: regionTool, start: { x: point.x, y: point.y } };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Handles of the already selected clip win over everything under them
    const handle = previewEngine.hitHandle(point.x, point.y);
    const geometry = handle ? previewEngine.getSelectionGeometry() : null;
    if (handle && geometry) {
      const handleClip = tracks.flatMap((t) => t.clips).find((c) => c.id === geometry.clipId);
      const handleTrack = tracks.find((t) => t.id === handleClip?.trackId);
      if (!handleClip || handleTrack?.isLocked) return;

      if (handleClip.type === 'effect' && handle !== 'rotate') {
        // Corners of a region effect resize the region around the opposite corner
        const opposite = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne' }[handle] as 'nw' | 'ne' | 'se' | 'sw';
        dragRef.current = {
          mode: 'region',
          clipId: geometry.clipId,
          opposite: geometry.corners[opposite],
          scale: geometry.scale,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }

      dragRef.current = {
        mode: handle === 'rotate' ? 'rotate' : 'scale',
        clipId: geometry.clipId,
        anchor: geometry.anchor,
        start: { x: point.x, y: point.y },
        originScale: geometry.scale,
        originRotation: geometry.rotation,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const hit = previewEngine.hitTest(point.x, point.y);
    if (!hit) return;

    setSelectedClipId(hit.id);
    const track = tracks.find((t) => t.id === hit.trackId);
    if (track?.isLocked) return;

    const t = resolveTransform(hit, previewEngine.getCurrentTime() - hit.startTime);
    dragRef.current = {
      mode: 'move',
      clipId: hit.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: t.x,
      originY: t.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    const point = toProjectPoint(e);

    if (!drag) {
      if (regionTool) {
        e.currentTarget.style.cursor = 'crosshair';
        return;
      }
      const handle = previewEngine.hitHandle(point.x, point.y);
      if (handle) {
        e.currentTarget.style.cursor = cursorForHandle(handle, previewEngine.getSelectionGeometry()?.rotation ?? 0);
      } else {
        e.currentTarget.style.cursor = previewEngine.hitTest(point.x, point.y) ? 'move' : 'default';
      }
      return;
    }

    if (drag.mode === 'draw') {
      previewEngine.setDraftRegion(rectFromCorners(drag.start, point));
      return;
    }

    if (drag.mode === 'region') {
      const region = regionFromCorner(drag.opposite, point, drag.scale, MIN_REGION_SIZE);
      updateClipTransform(drag.clipId, {
        x: Math.round(region.centerX - project.width / 2),
        y: Math.round(region.centerY - project.height / 2),
      });
      updateClipEffect(drag.clipId, { width: region.width, height: region.height });
      return;
    }

    if (drag.mode !== 'move') {
      if (drag.mode === 'scale') {
        const scale = scaleFromDrag(drag.originScale, drag.anchor, drag.start, point);
        updateClipTransform(drag.clipId, { scaleX: scale, scaleY: scale });
      } else {
        const rotation = rotationFromDrag(
          drag.originRotation,
          drag.anchor,
          drag.start,
          point,
          e.shiftKey ? 15 : undefined
        );
        updateClipTransform(drag.clipId, { rotation });
      }
      return;
    }

    let x = drag.originX + (e.clientX - drag.startClientX) * point.scale;
    let y = drag.originY + (e.clientY - drag.startClientY) * point.scale;

    // Snap to the canvas center lines (hold Alt to move freely)
    const snapThreshold = 8 * point.scale;
    const snapX = !e.altKey && Math.abs(x) < snapThreshold;
    const snapY = !e.altKey && Math.abs(y) < snapThreshold;
    if (snapX) x = 0;
    if (snapY) y = 0;
    previewEngine.setGuides({ x: snapX, y: snapY });

    updateClipTransform(drag.clipId, { x: Math.round(x), y: Math.round(y) });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;

    if (drag.mode === 'draw') {
      previewEngine.setDraftRegion(null);
      const rect = rectFromCorners(drag.start, toProjectPoint(e));
      // A tiny drag is a click: ignore it and keep the tool armed
      if (rect.width >= 12 && rect.height >= 12) {
        addEffectClip(drag.kind, {
          centerX: Math.round(rect.x + rect.width / 2 - project.width / 2),
          centerY: Math.round(rect.y + rect.height / 2 - project.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
        setRegionTool(null);
      }
    }

    previewEngine.setGuides({ x: false, y: false });
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Initialize Canvas
  useEffect(() => {
    if (canvasRef.current) {
      previewEngine.initialize(canvasRef.current);
    }
    return () => {
      previewEngine.cleanup();
    };
  }, []);

  // Loading indicator with a small delay
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = previewEngine.subscribeLoading((loading) => {
      if (timer) clearTimeout(timer);
      if (loading) {
        timer = setTimeout(() => setShowLoading(true), 250);
      } else {
        setShowLoading(false);
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  // Keep PreviewEngine context updated
  useEffect(() => {
    previewEngine.updateContext(project, tracks, assets);
  }, [project, tracks, assets]);

  // Subscribe to 60fps high-performance playback time without React re-render cascades
  useEffect(() => {
    return previewEngine.subscribeTime((time) => {
      if (timecodeRef.current) {
        timecodeRef.current.textContent = formatTimecode(time, project.fps);
      }
      // Throttled store update for inspector & timeline sync
      setCurrentTime(time);
    });
  }, [project.fps, setCurrentTime]);

  const handleTogglePlay = () => {
    const isNowPlaying = previewEngine.togglePlay();
    setPlaying(isNowPlaying);
    setIsPlaying(isNowPlaying);
  };

  const handleSeek = (time: number) => {
    const clamped = Math.max(0, Math.min(project.duration, time));
    previewEngine.seekTo(clamped);
    setCurrentTime(clamped);
    if (timecodeRef.current) {
      timecodeRef.current.textContent = formatTimecode(clamped, project.fps);
    }
  };

  // Leaving the region tool restores the normal cursor; Escape cancels it
  useEffect(() => {
    if (!regionTool) {
      if (canvasRef.current) canvasRef.current.style.cursor = 'default';
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dragRef.current = null;
        previewEngine.setDraftRegion(null);
        setRegionTool(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [regionTool]);

  // Space & Arrow Key Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSeek(previewEngine.getCurrentTime() - 0.1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSeek(previewEngine.getCurrentTime() + 0.1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [project.duration]);

  const getAspectRatioStyle = () => {
    return {
      aspectRatio: `${project.width} / ${project.height}`,
      maxHeight: '100%',
      maxWidth: '100%',
    };
  };

  return (
    <div className="flex-1 bg-background flex flex-col items-center p-2 lg:p-4 gap-2 min-w-0 min-h-0 select-none">
      {/* Tools: region effects and manual keyframing, above the picture so they never cover it */}
      <div className="w-full flex flex-wrap items-center gap-1.5 text-[11px]">
        <div className="flex items-center gap-1 bg-surface/90 border border-surface-border rounded-lg p-1">
          <span className="flex items-center gap-1 px-1.5 text-gray-400" title="Bölge efekti çiz">
            <BoxSelect className="w-3.5 h-3.5 text-cyan-300" />
            <span className="hidden lg:inline">Bölge</span>
          </span>
          {(['blur', 'pixelate', 'blackbox'] as const).map((kind) => (
            <button
              key={kind}
              onClick={() => setRegionTool(regionTool === kind ? null : kind)}
              title={`${EFFECT_KIND_LABELS[kind]}: önizlemede bir dikdörtgen sürükle (Esc: iptal)`}
              className={`px-2 py-1 rounded font-medium transition-all whitespace-nowrap ${
                regionTool === kind
                  ? 'bg-cyan-500 text-black'
                  : 'bg-surface-light text-gray-300 hover:text-white hover:bg-surface-border/60'
              }`}
            >
              {EFFECT_KIND_LABELS[kind]}
            </button>
          ))}
        </div>

        <button
          onClick={() => setAutoKeyframe(!autoKeyframe)}
          title="Oto keyframe: açıkken taşıdığın, ölçeklediğin veya döndürdüğün her şey oynatma çizgisine keyframe yazar. Hareketli bir nesneyi elle takip etmek için: çizgiyi kaydır, bölgeyi taşı, tekrarla."
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border font-medium transition-all whitespace-nowrap ${
            autoKeyframe
              ? 'bg-amber-400 text-black border-amber-300'
              : 'bg-surface/90 text-gray-300 border-surface-border hover:text-white'
          }`}
        >
          <Diamond className={`w-3.5 h-3.5 ${autoKeyframe ? 'fill-black' : 'text-amber-300'}`} />
          <span>Oto keyframe</span>
        </button>
      </div>

      {/* Canvas Viewport */}
      <div ref={containerRef} className="flex-1 min-h-0 w-full flex items-center justify-center relative overflow-hidden">
        <div
          style={getAspectRatioStyle()}
          className="relative bg-black rounded-lg shadow-2xl overflow-hidden border border-surface-border flex items-center justify-center"
        >
          <canvas
            ref={canvasRef}
            width={project.width}
            height={project.height}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
            className="w-full h-full object-contain touch-none"
          />
          {showLoading && (
            <div
              role="status"
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 text-gray-200 text-xs pointer-events-none"
            >
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span>Görüntü yükleniyor…</span>
            </div>
          )}
        </div>
      </div>

      {/* Playback Controls Toolbar */}
      <div className="w-full max-w-xl bg-surface/90 backdrop-blur border border-surface-border rounded-xl px-3 lg:px-4 py-2 flex flex-wrap items-center justify-center sm:justify-between gap-x-3 gap-y-1 shadow-lg">
        {/* Timecode */}
        <div className="flex items-center gap-1.5 font-mono text-xs text-gray-300">
          <span ref={timecodeRef} className="text-primary font-semibold">
            {formatTimecode(currentTime, project.fps)}
          </span>
          <span className="text-gray-500">/</span>
          <span className="text-gray-400">{formatTimecode(project.duration, project.fps)}</span>
        </div>

        {/* Center Control Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSeek(0)}
            title="Başa Dön"
            className="p-1.5 rounded-lg hover:bg-surface-light text-gray-400 hover:text-gray-200 transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleSeek(previewEngine.getCurrentTime() - 1)}
            title="1 sn Geri (Sol Ok)"
            className="p-1.5 rounded-lg hover:bg-surface-light text-gray-400 hover:text-gray-200 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleTogglePlay}
            title="Oynat / Duraklat (Space)"
            className="p-2.5 rounded-full bg-primary hover:bg-primary-hover text-black shadow-md shadow-primary/20 active:scale-95 transition-all"
          >
            {playing ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>
          <button
            onClick={() => handleSeek(previewEngine.getCurrentTime() + 1)}
            title="1 sn İleri (Sağ Ok)"
            className="p-1.5 rounded-lg hover:bg-surface-light text-gray-400 hover:text-gray-200 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Fullscreen / Resolution badge */}
        <div className="flex items-center gap-2">
          <span className="hidden lg:inline text-[10px] font-mono bg-surface-light px-2 py-0.5 rounded text-gray-400 border border-surface-border">
            {project.fps} FPS
          </span>
          <button
            onClick={() => {
              if (containerRef.current) {
                if (document.fullscreenElement) {
                  document.exitFullscreen();
                } else {
                  containerRef.current.requestFullscreen();
                }
              }
            }}
            title="Tam Ekran"
            className="p-1.5 rounded-lg hover:bg-surface-light text-gray-400 hover:text-gray-200 transition-all"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
