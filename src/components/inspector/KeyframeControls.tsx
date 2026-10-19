import React from 'react';
import { ChevronLeft, ChevronRight, Diamond, Spline } from 'lucide-react';
import { AnimatableProp, Clip, ClipKeyframes } from '@/types/timeline';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { previewEngine } from '@/core/preview/previewEngine';
import { findKeyframeAt, nextKeyframeTime, prevKeyframeTime } from '@/core/animation/keyframes';

interface KeyframeControlsProps {
  clip: Clip;
  prop: AnimatableProp;
  /** Playhead position relative to the clip start (unclamped) */
  localTime: number;
}

export const KeyframeControls: React.FC<KeyframeControlsProps> = ({ clip, prop, localTime }) => {
  const toggleKeyframe = useTimelineStore((s) => s.toggleKeyframe);
  const setKeyframeEasing = useTimelineStore((s) => s.setKeyframeEasing);

  const inRange = localTime >= -0.001 && localTime <= clip.duration + 0.001;
  const own: ClipKeyframes | undefined = clip.keyframes?.[prop] ? { [prop]: clip.keyframes[prop] } : undefined;
  const current = inRange ? findKeyframeAt(clip.keyframes, prop, localTime) : undefined;
  const active = !!current;
  const prev = prevKeyframeTime(own, localTime);
  const next = nextKeyframeTime(own, localTime);

  const seekToLocal = (time: number | null) => {
    if (time !== null) previewEngine.seekTo(clip.startTime + time);
  };

  const navButton = 'p-0.5 rounded text-gray-400 hover:text-white disabled:opacity-25 disabled:hover:text-gray-400';

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        disabled={prev === null}
        onClick={() => seekToLocal(prev)}
        title="Önceki keyframe"
        className={navButton}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        disabled={!inRange}
        onClick={() => toggleKeyframe(clip.id, prop)}
        title={active ? 'Keyframe sil' : 'Bu noktaya keyframe ekle'}
        className="p-0.5 rounded hover:bg-surface-light disabled:opacity-25"
      >
        <Diamond className={`w-3.5 h-3.5 ${active ? 'fill-amber-400 text-amber-400' : 'text-gray-400'}`} />
      </button>
      {current && (
        <button
          type="button"
          onClick={() => setKeyframeEasing(clip.id, prop, current.id, current.easing === 'linear' ? 'ease-in-out' : 'linear')}
          title={
            current.easing === 'linear'
              ? 'Geçiş: doğrusal (tıkla: yumuşak)'
              : 'Geçiş: yumuşak giriş/çıkış (tıkla: doğrusal)'
          }
          className={`p-0.5 rounded hover:bg-surface-light ${
            current.easing === 'ease-in-out' ? 'text-primary' : 'text-gray-500'
          }`}
        >
          <Spline className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        disabled={next === null}
        onClick={() => seekToLocal(next)}
        title="Sonraki keyframe"
        className={navButton}
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
