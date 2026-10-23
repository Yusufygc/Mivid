import React from 'react';
import { Sliders } from 'lucide-react';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { Clip, TransitionDirection } from '@/types/timeline';
import {
  MAX_TRANSITION_SECONDS,
  MIN_TRANSITION_SECONDS,
  TRANSITION_LABELS,
  TRANSITION_TYPES,
  TransitionSide,
  transitionUsesDirection,
} from '@/core/transitions/transitions';

const DIRECTIONS: Array<{ id: TransitionDirection; label: string; title: string }> = [
  { id: 'left', label: '←', title: 'Sola' },
  { id: 'up', label: '↑', title: 'Yukarı' },
  { id: 'down', label: '↓', title: 'Aşağı' },
  { id: 'right', label: '→', title: 'Sağa' },
];

const choiceClass = (active: boolean): string =>
  `py-1 px-2 rounded text-[11px] font-medium transition-all ${
    active
      ? 'bg-purple-600 text-white font-semibold shadow-sm'
      : 'bg-surface-light text-gray-400 hover:text-gray-200 hover:bg-surface-border/60'
  }`;

const SideEditor: React.FC<{ clip: Clip; side: TransitionSide }> = ({ clip, side }) => {
  const { addTransition, updateTransition, removeTransition } = useTimelineStore();
  const transition = side === 'in' ? clip.transitionIn : clip.transitionOut;
  const title = side === 'in' ? 'Giriş Geçişi (In)' : 'Çıkış Geçişi (Out)';

  return (
    <div className="space-y-2 bg-surface-light/30 p-2.5 rounded-lg border border-surface-border/50" data-testid={`transition-${side}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-300">{title}</span>
        {transition && (
          <button onClick={() => removeTransition(clip.id, side)} className="text-[10px] text-rose-400 hover:text-rose-300">
            Kaldır
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {TRANSITION_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => (transition ? updateTransition(clip.id, side, { type }) : addTransition(clip.id, side, type))}
            className={choiceClass(transition?.type === type)}
          >
            {TRANSITION_LABELS[type]}
          </button>
        ))}
      </div>

      {transition && (
        <div className="space-y-2 pt-1">
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-gray-400">
              <span>Süre</span>
              <span className="font-mono text-gray-200">{transition.duration.toFixed(2)} sn</span>
            </div>
            <input
              type="range"
              aria-label={`${title} süresi`}
              min={MIN_TRANSITION_SECONDS}
              max={MAX_TRANSITION_SECONDS}
              step="0.05"
              value={transition.duration}
              onChange={(e) => updateTransition(clip.id, side, { duration: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-surface-light rounded-lg appearance-none cursor-pointer accent-purple-400"
            />
          </div>

          {transitionUsesDirection(transition.type) && (
            <div className="space-y-1">
              <span className="text-[11px] text-gray-400">
                {transition.type === 'slide' ? 'Kayma yönü' : 'Silme yönü'}
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {DIRECTIONS.map((d) => (
                  <button
                    key={d.id}
                    title={d.title}
                    aria-label={d.title}
                    onClick={() => updateTransition(clip.id, side, { direction: d.id })}
                    className={choiceClass((transition.direction ?? 'left') === d.id)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <span className="text-[11px] text-gray-400">Eğri</span>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => updateTransition(clip.id, side, { easing: 'linear' })} className={choiceClass((transition.easing ?? 'linear') === 'linear')}>
                Doğrusal
              </button>
              <button onClick={() => updateTransition(clip.id, side, { easing: 'ease-in-out' })} className={choiceClass(transition.easing === 'ease-in-out')}>
                Yumuşak
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Transitions of a video / image clip: type, length, direction and curve for the way in and the way out */
export const TransitionPanel: React.FC<{ clip: Clip }> = ({ clip }) => (
  <div className="space-y-4 pt-2 border-t border-surface-border">
    <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
      <Sliders className="w-3.5 h-3.5 text-purple-400" />
      <span>Geçiş Efektleri (Transitions)</span>
    </div>
    <SideEditor clip={clip} side="in" />
    <SideEditor clip={clip} side="out" />
  </div>
);
