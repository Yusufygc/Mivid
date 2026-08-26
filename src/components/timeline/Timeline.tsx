import React, { useRef, useState, useEffect } from 'react';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { previewEngine } from '@/core/preview/previewEngine';
import { Scissors, Trash2, Magnet, ZoomIn, ZoomOut, Eye, EyeOff, Volume2, VolumeX, Lock, Unlock, Film, Music, Layers } from 'lucide-react';
import { formatTimecode } from '@/utils/time';
import { Clip } from '@/types/timeline';

export const Timeline: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);

  const { project } = useProjectStore();
  const {
    tracks,
    selectedClipId,
    zoom,
    snappingEnabled,
    setCurrentTime,
    setZoom,
    setSelectedClipId,
    toggleSnapping,
    splitSelectedClip,
    removeClip,
    updateClipTiming,
    toggleTrackHide,
    toggleTrackMute,
    toggleTrackLock,
  } = useTimelineStore();

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [draggingClip, setDraggingClip] = useState<{ id: string; startX: number; originalStart: number } | null>(null);
  const [trimmingClip, setTrimmingClip] = useState<{
    id: string;
    handle: 'left' | 'right';
    startX: number;
    originalStart: number;
    originalDuration: number;
    originalInPoint: number;
    originalOutPoint: number;
  } | null>(null);

  // High-performance direct DOM playhead update without React re-rendering all tracks
  useEffect(() => {
    return previewEngine.subscribeTime((time) => {
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${time * zoom}px)`;
      }
    });
  }, [zoom]);

  // Keyboard Shortcuts for Split and Delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        splitSelectedClip();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedClipId) {
          e.preventDefault();
          removeClip(selectedClipId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [splitSelectedClip, removeClip, selectedClipId]);

  // Handle Scrubbing
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    updateTimeFromPointer(e.clientX);
  };

  const updateTimeFromPointer = (clientX: number) => {
    if (!tracksContainerRef.current) return;
    const rect = tracksContainerRef.current.getBoundingClientRect();
    const scrollLeft = tracksContainerRef.current.scrollLeft;
    const offsetX = clientX - rect.left + scrollLeft;
    const newTime = Math.max(0, Math.min(project.duration, offsetX / zoom));

    previewEngine.seekTo(newTime);
    setCurrentTime(newTime);

    if (playheadRef.current) {
      playheadRef.current.style.transform = `translateX(${newTime * zoom}px)`;
    }
  };

  // Global Mouse Handlers for Dragging, Trimming and Scrubbing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        updateTimeFromPointer(e.clientX);
      } else if (draggingClip) {
        const deltaPixels = e.clientX - draggingClip.startX;
        const deltaTime = deltaPixels / zoom;
        const newStart = Math.max(0, draggingClip.originalStart + deltaTime);

        const currentClip = tracks.flatMap((t) => t.clips).find((c) => c.id === draggingClip.id);
        if (currentClip) {
          updateClipTiming(currentClip.id, newStart, currentClip.duration);
        }
      } else if (trimmingClip) {
        const deltaPixels = e.clientX - trimmingClip.startX;
        const deltaTime = deltaPixels / zoom;

        if (trimmingClip.handle === 'left') {
          const maxLeftShift = trimmingClip.originalDuration - 0.2;
          const shift = Math.min(maxLeftShift, deltaTime);
          const newStart = Math.max(0, trimmingClip.originalStart + shift);
          const newDuration = trimmingClip.originalDuration - shift;
          const newInPoint = trimmingClip.originalInPoint + shift;

          updateClipTiming(trimmingClip.id, newStart, newDuration, newInPoint, trimmingClip.originalOutPoint);
        } else {
          // Right handle
          const newDuration = Math.max(0.2, trimmingClip.originalDuration + deltaTime);
          const newOutPoint = trimmingClip.originalInPoint + newDuration;
          updateClipTiming(trimmingClip.id, trimmingClip.originalStart, newDuration, trimmingClip.originalInPoint, newOutPoint);
        }
      }
    };

    const handleMouseUp = () => {
      setIsScrubbing(false);
      setDraggingClip(null);
      setTrimmingClip(null);
    };

    if (isScrubbing || draggingClip || trimmingClip) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isScrubbing, draggingClip, trimmingClip, zoom, tracks, updateClipTiming, project.duration]);

  // Timeline Length in pixels
  const totalTimelineWidth = Math.max(project.duration * zoom, 1200);

  // Generate ruler tick marks
  const renderRulerTicks = () => {
    const ticks = [];
    const step = zoom >= 80 ? 1 : zoom >= 30 ? 2 : 5;
    for (let sec = 0; sec <= project.duration; sec += step) {
      const left = sec * zoom;
      ticks.push(
        <div key={sec} style={{ left: `${left}px` }} className="absolute top-0 flex flex-col items-start h-full">
          <div className="h-2 w-[1px] bg-gray-500" />
          <span className="text-[10px] font-mono text-gray-400 pl-1 -mt-1 select-none">
            {formatTimecode(sec, project.fps)}
          </span>
        </div>
      );
    }
    return ticks;
  };

  const getClipStyle = (clip: Clip) => {
    const isSelected = clip.id === selectedClipId;
    let bgColor = 'bg-timeline-clipVideo border-cyan-500/50';
    if (clip.type === 'audio') bgColor = 'bg-timeline-clipAudio border-emerald-500/50';
    if (clip.trackId === 'track-v2') bgColor = 'bg-timeline-clipText border-purple-500/50';

    return `absolute top-1 bottom-1 rounded-md border flex items-center px-2 cursor-grab active:cursor-grabbing transition-all overflow-hidden ${bgColor} ${
      isSelected ? 'ring-2 ring-primary border-primary shadow-lg brightness-110 z-10' : 'hover:brightness-105'
    }`;
  };

  return (
    <div ref={containerRef} className="h-80 bg-timeline-bg border-t border-surface-border flex flex-col select-none">
      {/* Timeline Controls Header */}
      <div className="h-11 bg-surface px-4 border-b border-surface-border flex items-center justify-between">
        {/* Editing Tools */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => splitSelectedClip()}
            title="Klibi Böl (Ctrl+B)"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-light hover:bg-primary/20 hover:text-primary text-gray-200 text-xs font-medium border border-surface-border transition-all"
          >
            <Scissors className="w-3.5 h-3.5" />
            <span>Böl (Split)</span>
          </button>

          <button
            onClick={() => selectedClipId && removeClip(selectedClipId)}
            disabled={!selectedClipId}
            title="Seçili Klibi Sil (Delete)"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-light hover:bg-rose-500/20 hover:text-rose-400 text-gray-300 text-xs font-medium border border-surface-border disabled:opacity-30 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Sil</span>
          </button>

          <div className="h-4 w-[1px] bg-surface-border mx-1" />

          {/* Magnet / Snapping */}
          <button
            onClick={toggleSnapping}
            title={`Manyetik Yapışma: ${snappingEnabled ? 'Açık' : 'Kapalı'}`}
            className={`p-1.5 rounded-lg border transition-all ${
              snappingEnabled
                ? 'bg-primary/15 border-primary/40 text-primary'
                : 'bg-surface-light border-surface-border text-gray-400'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <ZoomOut className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="range"
            min="15"
            max="180"
            value={zoom}
            onChange={(e) => setZoom(parseInt(e.target.value))}
            className="w-28 h-1 bg-surface-light rounded appearance-none cursor-pointer accent-primary"
          />
          <ZoomIn className="w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>

      {/* Main Timeline Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers (Left sidebar) */}
        <div className="w-56 bg-surface border-r border-surface-border flex flex-col flex-shrink-0 z-20 shadow-md">
          {/* Ruler offset spacer */}
          <div className="h-7 bg-surface-light/60 border-b border-surface-border px-3 flex items-center text-[10px] font-mono text-gray-400">
            KANALLAR
          </div>

          {/* Track Labels */}
          <div className="flex-1 flex flex-col">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="h-16 border-b border-surface-border/70 px-3 flex items-center justify-between bg-surface hover:bg-surface-light/30 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {track.type === 'audio' ? (
                    <Music className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : track.type === 'overlay' ? (
                    <Layers className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  ) : (
                    <Film className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium text-gray-200 truncate">{track.name}</span>
                </div>

                {/* Track Controls (Hide, Mute, Lock) */}
                <div className="flex items-center gap-1 text-gray-400">
                  <button
                    onClick={() => toggleTrackHide(track.id)}
                    title={track.isHidden ? 'Kanalı Göster' : 'Kanalı Gizle'}
                    className="p-1 hover:text-white"
                  >
                    {track.isHidden ? <EyeOff className="w-3.5 h-3.5 text-rose-400" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => toggleTrackMute(track.id)}
                    title={track.isMuted ? 'Sesi Aç' : 'Sesi Kapat'}
                    className="p-1 hover:text-white"
                  >
                    {track.isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => toggleTrackLock(track.id)}
                    title={track.isLocked ? 'Kilidi Aç' : 'Kanalı Kilitle'}
                    className="p-1 hover:text-white"
                  >
                    {track.isLocked ? <Lock className="w-3.5 h-3.5 text-amber-400" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tracks Content & Ruler (Right scrollable container) */}
        <div ref={tracksContainerRef} className="flex-1 overflow-x-auto overflow-y-hidden relative bg-timeline-bg">
          <div style={{ width: `${totalTimelineWidth}px` }} className="relative h-full">
            {/* Time Ruler */}
            <div
              onMouseDown={handleRulerMouseDown}
              className="h-7 bg-surface-light/40 border-b border-surface-border relative cursor-pointer hover:bg-surface-light/60 transition-colors"
            >
              {renderRulerTicks()}
            </div>

            {/* Track Lanes */}
            <div className="relative">
              {tracks.map((track) => (
                <div
                  key={track.id}
                  className={`h-16 border-b border-surface-border/40 relative ${
                    track.isHidden ? 'opacity-30' : ''
                  }`}
                >
                  {/* Clips on this track */}
                  {track.clips.map((clip) => {
                    const left = clip.startTime * zoom;
                    const width = clip.duration * zoom;

                    return (
                      <div
                        key={clip.id}
                        style={{ left: `${left}px`, width: `${width}px` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClipId(clip.id);
                        }}
                        onMouseDown={(e) => {
                          if (track.isLocked) return;
                          setDraggingClip({
                            id: clip.id,
                            startX: e.clientX,
                            originalStart: clip.startTime,
                          });
                        }}
                        className={getClipStyle(clip)}
                      >
                        {/* Left Trim Handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            if (track.isLocked) return;
                            setTrimmingClip({
                              id: clip.id,
                              handle: 'left',
                              startX: e.clientX,
                              originalStart: clip.startTime,
                              originalDuration: clip.duration,
                              originalInPoint: clip.inPoint,
                              originalOutPoint: clip.outPoint,
                            });
                          }}
                          className="absolute left-0 top-0 bottom-0 w-2.5 bg-white/20 hover:bg-primary cursor-ew-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                        />

                        {/* Clip Label */}
                        <span className="text-[11px] font-medium text-white truncate pointer-events-none drop-shadow">
                          {clip.name}
                        </span>

                        {/* Right Trim Handle */}
                        <div
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            if (track.isLocked) return;
                            setTrimmingClip({
                              id: clip.id,
                              handle: 'right',
                              startX: e.clientX,
                              originalStart: clip.startTime,
                              originalDuration: clip.duration,
                              originalInPoint: clip.inPoint,
                              originalOutPoint: clip.outPoint,
                            });
                          }}
                          className="absolute right-0 top-0 bottom-0 w-2.5 bg-white/20 hover:bg-primary cursor-ew-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                        />
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Playhead Scrubber Line - Using GPU Transform */}
              <div
                ref={playheadRef}
                style={{ transform: `translateX(${previewEngine.getCurrentTime() * zoom}px)` }}
                className="absolute top-0 bottom-0 w-[2px] bg-timeline-playhead z-30 pointer-events-none -mt-7 h-[300px] will-change-transform"
              >
                {/* Playhead Needle Head */}
                <div className="w-3.5 h-3.5 bg-timeline-playhead -ml-[6px] -top-1 absolute rotate-45 rounded-sm shadow-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
