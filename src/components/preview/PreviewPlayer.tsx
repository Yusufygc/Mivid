import React, { useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { useAssetStore } from '@/stores/useAssetStore';
import { previewEngine } from '@/core/preview/previewEngine';
import { resolveTransform } from '@/core/animation/keyframes';
import { cursorForHandle, rotationFromDrag, scaleFromDrag } from '@/core/preview/handleMath';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';
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
  } = useTimelineStore();
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
      };
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

    // Handles of the already selected clip win over everything under them
    const handle = previewEngine.hitHandle(point.x, point.y);
    const geometry = handle ? previewEngine.getSelectionGeometry() : null;
    if (handle && geometry) {
      const handleClip = tracks.flatMap((t) => t.clips).find((c) => c.id === geometry.clipId);
      const handleTrack = tracks.find((t) => t.id === handleClip?.trackId);
      if (!handleClip || handleTrack?.isLocked) return;

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
      const handle = previewEngine.hitHandle(point.x, point.y);
      if (handle) {
        e.currentTarget.style.cursor = cursorForHandle(handle, previewEngine.getSelectionGeometry()?.rotation ?? 0);
      } else {
        e.currentTarget.style.cursor = previewEngine.hitTest(point.x, point.y) ? 'move' : 'default';
      }
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
    if (!dragRef.current) return;
    dragRef.current = null;
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
    <div className="flex-1 bg-background flex flex-col items-center justify-between p-4 min-w-0 select-none">
      {/* Canvas Viewport */}
      <div ref={containerRef} className="flex-1 w-full flex items-center justify-center relative overflow-hidden">
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
        </div>
      </div>

      {/* Playback Controls Toolbar */}
      <div className="mt-3 w-full max-w-xl bg-surface/90 backdrop-blur border border-surface-border rounded-xl px-4 py-2 flex items-center justify-between shadow-lg">
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
          <span className="text-[10px] font-mono bg-surface-light px-2 py-0.5 rounded text-gray-400 border border-surface-border">
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
