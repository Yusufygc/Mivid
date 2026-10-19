import React, { useRef, useState, useEffect } from 'react';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { previewEngine } from '@/core/preview/previewEngine';
import { TimelineEngine } from '@/core/timeline/timelineEngine';
import { KeyframeMarkers } from './KeyframeMarkers';
import { ClipVisuals } from './ClipVisuals';
import { useAssetStore } from '@/stores/useAssetStore';
import {
  Scissors,
  Snowflake,
  Copy,
  Trash2,
  Magnet,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  Film,
  Music,
  Layers,
  Type,
  X,
  BoxSelect,
} from 'lucide-react';
import { formatTimecode } from '@/utils/time';
import { Clip } from '@/types/timeline';

export const Timeline: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const rulerScrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  /** True once a clip drag moved far enough to count as a drag, so the click that ends it does not reset the selection */
  const dragMovedRef = useRef(false);

  const { project } = useProjectStore();
  const assets = useAssetStore((s) => s.assets);
  const {
    tracks,
    selectedClipId,
    extraSelectedIds,
    zoom,
    snappingEnabled,
    currentTime,
    setCurrentTime,
    setZoom,
    setSelectedClipId,
    toggleClipSelection,
    toggleSnapping,
    splitSelectedClip,
    removeSelectedClips,
    duplicateSelectedClips,
    deleteTrack,
    updateClipTiming,
    toggleTrackHide,
    toggleTrackMute,
    toggleTrackLock,
    addTextClip,
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

  // Synchronize horizontal scrolling between Ruler and Tracks
  const handleHorizontalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (rulerScrollRef.current) {
      rulerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // Helper to gather all magnetic snap points (0s, playhead, all clip starts, all clip ends)
  const getAllSnapPoints = (ignoreClipId?: string): number[] => {
    const points = new Set<number>([0, currentTime]);
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.id === ignoreClipId) continue;
        points.add(clip.startTime);
        points.add(clip.startTime + clip.duration);
      }
    }
    return Array.from(points);
  };

  // Keyboard shortcuts: split, delete (Shift = ripple), copy / cut / paste / duplicate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const store = useTimelineStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'b') {
        e.preventDefault();
        store.splitSelectedClip();
      } else if (mod && key === 'c') {
        if (store.copySelectedClips() > 0) e.preventDefault();
      } else if (mod && key === 'x') {
        if (store.copySelectedClips() > 0) {
          e.preventDefault();
          store.removeSelectedClips(false);
        }
      } else if (mod && key === 'v') {
        if (store.pasteClips() > 0) e.preventDefault();
      } else if (mod && key === 'd') {
        e.preventDefault();
        store.duplicateSelectedClips();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selectedClipId && store.selectedKeyframeTime !== null) {
          // A selected keyframe marker is deleted instead of the whole clip
          e.preventDefault();
          store.removeKeyframesAt(store.selectedClipId, store.selectedKeyframeTime);
        } else if (store.getSelectedClipIds().length > 0) {
          e.preventDefault();
          store.removeSelectedClips(e.shiftKey);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle Scrubbing with Magnetic Snapping to Clip Boundaries
  const handleRulerMouseDown = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    updateTimeFromPointer(e.clientX);
  };

  const updateTimeFromPointer = (clientX: number) => {
    if (!tracksContainerRef.current) return;
    const rect = tracksContainerRef.current.getBoundingClientRect();
    const scrollLeft = tracksContainerRef.current.scrollLeft;
    const offsetX = clientX - rect.left + scrollLeft;
    let rawTime = Math.max(0, Math.min(project.duration, offsetX / zoom));

    // Magnetic Snapping for Playhead
    if (snappingEnabled) {
      const snapThresholdSec = 14 / zoom; // 14 pixels snap magnetic radius
      const snapPoints = getAllSnapPoints();
      const snapResult = TimelineEngine.calculateSnap(rawTime, snapPoints, snapThresholdSec);
      if (snapResult.isSnapped) {
        rawTime = snapResult.snappedTime;
      }
    }

    previewEngine.seekTo(rawTime);
    setCurrentTime(rawTime);

    if (playheadRef.current) {
      playheadRef.current.style.transform = `translateX(${rawTime * zoom}px)`;
    }
  };

  // Global Mouse Handlers for Dragging, Trimming and Scrubbing with Full Magnetic Snapping
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isScrubbing) {
        updateTimeFromPointer(e.clientX);
      } else if (draggingClip) {
        const deltaPixels = e.clientX - draggingClip.startX;
        if (Math.abs(deltaPixels) > 3) dragMovedRef.current = true;
        const deltaTime = deltaPixels / zoom;
        let candidateStart = Math.max(0, draggingClip.originalStart + deltaTime);

        const currentClip = tracks.flatMap((t) => t.clips).find((c) => c.id === draggingClip.id);
        if (currentClip) {
          // Magnetic Snapping for Dragged Clip (snaps left edge or right edge to other clips or playhead)
          if (snappingEnabled) {
            const snapThresholdSec = 14 / zoom;
            const snapPoints = getAllSnapPoints(currentClip.id);

            // 1. Try snapping left edge
            const leftSnap = TimelineEngine.calculateSnap(candidateStart, snapPoints, snapThresholdSec);
            if (leftSnap.isSnapped) {
              candidateStart = leftSnap.snappedTime;
            } else {
              // 2. Try snapping right edge
              const rightEdgeCandidate = candidateStart + currentClip.duration;
              const rightSnap = TimelineEngine.calculateSnap(rightEdgeCandidate, snapPoints, snapThresholdSec);
              if (rightSnap.isSnapped) {
                candidateStart = Math.max(0, rightSnap.snappedTime - currentClip.duration);
              }
            }
          }

          const selectedIds = useTimelineStore.getState().getSelectedClipIds();
          if (selectedIds.length > 1 && selectedIds.includes(currentClip.id)) {
            // A clip of a multi-selection drags the whole selection with it
            useTimelineStore.getState().moveClipsBy(selectedIds, candidateStart - currentClip.startTime);
          } else {
            updateClipTiming(currentClip.id, candidateStart, currentClip.duration);
          }
        }
      } else if (trimmingClip) {
        const deltaPixels = e.clientX - trimmingClip.startX;
        const deltaTime = deltaPixels / zoom;

        if (trimmingClip.handle === 'left') {
          let candidateStart = trimmingClip.originalStart + deltaTime;

          if (snappingEnabled) {
            const snapThresholdSec = 14 / zoom;
            const snapPoints = getAllSnapPoints(trimmingClip.id);
            const snapRes = TimelineEngine.calculateSnap(candidateStart, snapPoints, snapThresholdSec);
            if (snapRes.isSnapped) {
              candidateStart = snapRes.snappedTime;
            }
          }

          const maxLeftShift = trimmingClip.originalDuration - 0.2;
          const shift = Math.min(maxLeftShift, candidateStart - trimmingClip.originalStart);
          const newStart = Math.max(0, trimmingClip.originalStart + shift);
          const newDuration = trimmingClip.originalDuration - shift;
          const trimSpeed = tracks.flatMap((t) => t.clips).find((c) => c.id === trimmingClip.id)?.speed ?? 1;
          const newInPoint = trimmingClip.originalInPoint + shift * trimSpeed;

          updateClipTiming(trimmingClip.id, newStart, newDuration, newInPoint, trimmingClip.originalOutPoint);
        } else {
          // Right handle trimming with magnetic snap
          let candidateEnd = trimmingClip.originalStart + trimmingClip.originalDuration + deltaTime;

          if (snappingEnabled) {
            const snapThresholdSec = 14 / zoom;
            const snapPoints = getAllSnapPoints(trimmingClip.id);
            const snapRes = TimelineEngine.calculateSnap(candidateEnd, snapPoints, snapThresholdSec);
            if (snapRes.isSnapped) {
              candidateEnd = snapRes.snappedTime;
            }
          }

          const newDuration = Math.max(0.2, candidateEnd - trimmingClip.originalStart);
          const trimSpeed = tracks.flatMap((t) => t.clips).find((c) => c.id === trimmingClip.id)?.speed ?? 1;
          const newOutPoint = trimmingClip.originalInPoint + newDuration * trimSpeed;
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
  }, [isScrubbing, draggingClip, trimmingClip, zoom, tracks, updateClipTiming, project.duration, snappingEnabled, currentTime]);

  // Timeline Length in pixels
  const totalTimelineWidth = Math.max(project.duration * zoom, 1400);

  // Generate ruler tick marks
  const renderRulerTicks = () => {
    const ticks = [];
    const step = zoom >= 80 ? 1 : zoom >= 30 ? 2 : 5;
    for (let sec = 0; sec <= project.duration; sec += step) {
      const left = sec * zoom;
      ticks.push(
        <div key={sec} style={{ left: `${left}px` }} className="absolute top-0 flex flex-col items-start h-full pointer-events-none">
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
    const isExtraSelected = extraSelectedIds.includes(clip.id);
    let bgColor = 'bg-timeline-clipVideo border-cyan-500/50';
    if (clip.type === 'audio') bgColor = 'bg-timeline-clipAudio border-emerald-500/50';
    if (clip.type === 'text') bgColor = 'bg-amber-600/70 border-amber-400/80';
    if (clip.type === 'effect') bgColor = 'bg-cyan-700/70 border-cyan-400/70';
    if (clip.trackId === 'track-v2') bgColor = 'bg-timeline-clipText border-purple-500/50';

    return `absolute top-1 bottom-1 rounded-md border flex items-center px-2 cursor-grab active:cursor-grabbing transition-all overflow-hidden ${bgColor} ${
      isSelected
        ? 'ring-2 ring-primary border-primary shadow-lg brightness-110 z-10'
        : isExtraSelected
        ? 'ring-2 ring-primary/60 border-primary/70 brightness-110 z-10'
        : 'hover:brightness-105'
    }`;
  };

  return (
    <div ref={containerRef} className="h-full bg-timeline-bg border-t border-surface-border flex flex-col select-none">
      {/* Timeline Controls Header */}
      <div className="h-11 bg-surface px-2 lg:px-4 gap-3 border-b border-surface-border flex items-center justify-between flex-shrink-0 z-40 overflow-x-auto whitespace-nowrap">
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
            onClick={() => removeSelectedClips(false)}
            disabled={!selectedClipId}
            title="Seçili Klipleri Sil (Delete, Shift+Delete: boşluğu kapat)"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-light hover:bg-rose-500/20 hover:text-rose-400 text-gray-300 text-xs font-medium border border-surface-border disabled:opacity-30 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Sil</span>
          </button>

          <button
            onClick={() => useTimelineStore.getState().insertFreezeFrame()}
            disabled={!selectedClipId}
            title="Kareyi Dondur: playhead'deki kareyi 2 sn'lik bir klip olarak araya ekler"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-light hover:bg-sky-500/20 hover:text-sky-300 text-gray-300 text-xs font-medium border border-surface-border disabled:opacity-30 transition-all"
          >
            <Snowflake className="w-3.5 h-3.5" />
            <span>Dondur</span>
          </button>

          <button
            onClick={() => duplicateSelectedClips()}
            disabled={!selectedClipId}
            title="Seçili Klipleri Çoğalt (Ctrl+D). Kopyala: Ctrl+C, Yapıştır: Ctrl+V"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-light hover:bg-primary/20 hover:text-primary text-gray-300 text-xs font-medium border border-surface-border disabled:opacity-30 transition-all"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Çoğalt</span>
          </button>

          <button
            onClick={() => addTextClip()}
            title="Metin Ekle"
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 text-xs font-medium border border-amber-500/30 transition-all"
          >
            <Type className="w-3.5 h-3.5" />
            <span>+ Metin Ekle</span>
          </button>

          <div className="h-4 w-[1px] bg-surface-border mx-1" />

          {/* Magnet / Snapping Toggle with Visual State */}
          <button
            onClick={toggleSnapping}
            title={`Manyetik Yapışma (Mıknatıs): ${snappingEnabled ? 'Açık (Otomatik Yapışır)' : 'Kapalı'}`}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-all text-xs font-medium ${
              snappingEnabled
                ? 'bg-primary/20 border-primary text-primary shadow-sm'
                : 'bg-surface-light border-surface-border text-gray-400 hover:text-gray-200'
            }`}
          >
            <Magnet className={`w-3.5 h-3.5 ${snappingEnabled ? 'text-primary' : ''}`} />
            <span>{snappingEnabled ? 'Manyetik Açık' : 'Manyetik'}</span>
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

      {/* Main Timeline Workspace with Synchronized Vertical & Horizontal Scrolling */}
      <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden relative">
        {/* Sticky Ruler Row */}
        <div className="sticky top-0 z-30 flex border-b border-surface-border bg-surface shadow-sm flex-shrink-0">
          <div className="w-56 h-7 bg-surface-light/80 border-r border-surface-border px-3 flex items-center text-[10px] font-mono text-gray-400 flex-shrink-0">
            KANALLAR ({tracks.length})
          </div>
          <div
            ref={rulerScrollRef}
            onMouseDown={handleRulerMouseDown}
            className="flex-1 overflow-x-hidden h-7 bg-surface-light/40 relative cursor-pointer hover:bg-surface-light/60 transition-colors"
          >
            <div style={{ width: `${totalTimelineWidth}px` }} className="relative h-full">
              {renderRulerTicks()}
            </div>
          </div>
        </div>

        {/* Track Rows Container */}
        <div className="flex flex-1 relative min-h-0">
          {/* Left Track Headers */}
          <div className="w-56 bg-surface border-r border-surface-border flex flex-col flex-shrink-0 z-20 shadow-md sticky left-0">
            {tracks.map((track) => (
              <div
                key={track.id}
                className="h-14 border-b border-surface-border/70 px-3 flex items-center justify-between bg-surface hover:bg-surface-light/30 transition-colors group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {track.type === 'audio' ? (
                    <Music className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : track.type === 'text' ? (
                    <Type className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  ) : track.type === 'effect' ? (
                    <BoxSelect className="w-4 h-4 text-cyan-300 flex-shrink-0" />
                  ) : track.type === 'overlay' ? (
                    <Layers className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  ) : (
                    <Film className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                  <span className="text-xs font-medium text-gray-200 truncate">{track.name}</span>
                </div>

                {/* Track Controls */}
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
                  {/* Delete Track button for extra tracks */}
                  {tracks.length > 3 && track.clips.length === 0 && (
                    <button
                      onClick={() => deleteTrack(track.id)}
                      title="Boş Kanalı Kaldır"
                      className="p-1 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Right Track Lanes */}
          <div
            ref={tracksContainerRef}
            onScroll={handleHorizontalScroll}
            className="flex-1 overflow-x-auto relative bg-timeline-bg min-h-0"
          >
            <div style={{ width: `${totalTimelineWidth}px` }} className="relative">
              {tracks.map((track) => (
                <div
                  key={track.id}
                  className={`h-14 border-b border-surface-border/40 relative ${
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
                          if (dragMovedRef.current) {
                            dragMovedRef.current = false;
                            return; // the click that ends a drag keeps the selection as it is
                          }
                          if (e.ctrlKey || e.metaKey || e.shiftKey) {
                            toggleClipSelection(clip.id);
                          } else {
                            setSelectedClipId(clip.id);
                          }
                        }}
                        onMouseDown={(e) => {
                          dragMovedRef.current = false;
                          // Grabbing an unselected clip selects it right away (the click that ends a drag is ignored)
                          if (
                            !e.ctrlKey &&
                            !e.metaKey &&
                            !e.shiftKey &&
                            !useTimelineStore.getState().getSelectedClipIds().includes(clip.id)
                          ) {
                            setSelectedClipId(clip.id);
                          }
                          if (track.isLocked) return;
                          setDraggingClip({
                            id: clip.id,
                            startX: e.clientX,
                            originalStart: clip.startTime,
                          });
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'copy';
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const rawData =
                            e.dataTransfer.getData('application/x-transition') ||
                            e.dataTransfer.getData('application/json') ||
                            e.dataTransfer.getData('text/plain');
                          if (rawData) {
                            try {
                              const parsed = JSON.parse(rawData);
                              const transType = parsed.transitionType || parsed.type;
                              if (transType && transType !== 'transition') {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const clickX = e.clientX - rect.left;
                                const isLeft = clickX < rect.width / 2;
                                useTimelineStore.getState().addTransition(clip.id, isLeft ? 'in' : 'out', transType);
                              }
                            } catch (err) {
                              console.warn('Transition drop error:', err);
                            }
                          }
                        }}
                        className={getClipStyle(clip)}
                      >
                        {/* Left Trim Handle & Drop Zone */}
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
                          className="absolute left-0 top-0 bottom-0 w-4 bg-white/20 hover:bg-primary cursor-ew-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity z-20"
                        />
                        
                        {/* Transition In Visual */}
                        {clip.transitionIn && (
                          <div 
                            className="absolute left-0 top-0 bottom-0 bg-purple-500/70 flex flex-col items-center justify-center z-10 border-r border-purple-300 shadow-inner group/trans" 
                            style={{ width: `${clip.transitionIn.duration * zoom}px` }}
                          >
                             <Layers className="w-3 h-3 text-white/90" />
                             <button 
                               onClick={(e) => { e.stopPropagation(); useTimelineStore.getState().removeTransition(clip.id, 'in'); }}
                               className="absolute -top-2 text-rose-500 opacity-0 group-hover/trans:opacity-100 bg-black/50 rounded-full p-0.5"
                             ><X className="w-2 h-2"/></button>
                          </div>
                        )}

                        {/* Frames / waveform of the media behind the label */}
                        <ClipVisuals clip={clip} asset={assets.get(clip.assetId)} zoom={zoom} />

                        {/* Clip Label */}
                        <span className="text-[11px] font-medium text-white truncate pointer-events-none drop-shadow flex items-center gap-1 z-10 relative">
                          {clip.type === 'text' && <Type className="w-3 h-3 text-amber-300 flex-shrink-0" />}
                          {clip.type === 'effect' && <BoxSelect className="w-3 h-3 text-cyan-200 flex-shrink-0" />}
                          {clip.freeze && <Snowflake className="w-3 h-3 text-sky-200 flex-shrink-0" />}
                          {clip.name}
                          {Math.abs(clip.speed - 1) > 0.001 && (
                            <span className="text-[9px] font-mono bg-black/40 text-amber-300 px-1 rounded flex-shrink-0">
                              {clip.speed}x
                            </span>
                          )}
                        </span>

                        {/* Keyframe markers (selected clip only) */}
                        {clip.id === selectedClipId && <KeyframeMarkers clip={clip} zoom={zoom} />}

                        {/* Transition Out Visual */}
                        {clip.transitionOut && (
                          <div 
                            className="absolute right-0 top-0 bottom-0 bg-purple-500/70 flex flex-col items-center justify-center z-10 border-l border-purple-300 shadow-inner group/trans" 
                            style={{ width: `${clip.transitionOut.duration * zoom}px` }}
                          >
                             <Layers className="w-3 h-3 text-white/90" />
                             <button 
                               onClick={(e) => { e.stopPropagation(); useTimelineStore.getState().removeTransition(clip.id, 'out'); }}
                               className="absolute -top-2 text-rose-500 opacity-0 group-hover/trans:opacity-100 bg-black/50 rounded-full p-0.5"
                             ><X className="w-2 h-2"/></button>
                          </div>
                        )}

                        {/* Right Trim Handle & Drop Zone */}
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
                          className="absolute right-0 top-0 bottom-0 w-4 bg-white/20 hover:bg-primary cursor-ew-resize opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity z-20"
                        />
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Playhead Scrubber Line */}
              <div
                ref={playheadRef}
                style={{ transform: `translateX(${previewEngine.getCurrentTime() * zoom}px)` }}
                className="absolute top-0 bottom-0 w-[2px] bg-timeline-playhead z-30 pointer-events-none h-full will-change-transform"
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
