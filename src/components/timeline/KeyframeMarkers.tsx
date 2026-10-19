import React, { useRef } from 'react';
import { Clip } from '@/types/timeline';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { previewEngine } from '@/core/preview/previewEngine';
import { getKeyframeTimes, KEYFRAME_EPSILON } from '@/core/animation/keyframes';

interface KeyframeMarkersProps {
  clip: Clip;
  zoom: number;
}

/** Diamonds on the selected clip: click = select + jump, drag = retime, Delete = remove (see Timeline shortcuts) */
export const KeyframeMarkers: React.FC<KeyframeMarkersProps> = ({ clip, zoom }) => {
  const selectedKeyframeTime = useTimelineStore((s) => s.selectedKeyframeTime);
  const setSelectedKeyframeTime = useTimelineStore((s) => s.setSelectedKeyframeTime);
  const moveKeyframes = useTimelineStore((s) => s.moveKeyframes);

  const dragRef = useRef<{ startX: number; startTime: number; currentTime: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, time: number) => {
    e.stopPropagation(); // do not start dragging the clip itself
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startTime: time, currentTime: time, moved: false };
    setSelectedKeyframeTime(time);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const deltaPixels = e.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaPixels) < 3) return;
    drag.moved = true;

    const target = Math.min(clip.duration, Math.max(0, drag.startTime + deltaPixels / zoom));
    if (Math.abs(target - drag.currentTime) < 0.001) return;

    moveKeyframes(clip.id, drag.currentTime, target);
    drag.currentTime = target;
    setSelectedKeyframeTime(target);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

    // A plain click jumps the playhead to the keyframe
    if (drag && !drag.moved) previewEngine.seekTo(clip.startTime + drag.startTime);
  };

  return (
    <>
      {getKeyframeTimes(clip.keyframes).map((time) => {
        const isSelected = selectedKeyframeTime !== null && Math.abs(selectedKeyframeTime - time) < KEYFRAME_EPSILON;
        return (
          <button
            key={time}
            title={`Keyframe ${time.toFixed(2)}s (sürükle: taşı, Delete: sil)`}
            style={{ left: `${time * zoom}px` }}
            onPointerDown={(e) => onPointerDown(e, time)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className={`absolute bottom-0.5 w-2.5 h-2.5 -ml-[5px] rotate-45 border border-black/60 z-20 cursor-ew-resize ${
              isSelected ? 'bg-white ring-2 ring-primary' : 'bg-amber-400 hover:bg-white'
            }`}
          />
        );
      })}
    </>
  );
};
