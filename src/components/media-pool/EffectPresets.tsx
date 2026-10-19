import React from 'react';
import { BoxSelect, EyeOff, Grid3x3, Plus } from 'lucide-react';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { EffectKind } from '@/types/timeline';
import { EFFECT_KIND_LABELS } from '@/core/effects/regionEffects';

interface EffectTemplate {
  kind: EffectKind;
  description: string;
  icon: React.ReactNode;
}

const EFFECTS: EffectTemplate[] = [
  {
    kind: 'blur',
    description: 'Seçili bölgeyi bulanıklaştırır: yüz, plaka, ekran yazısı.',
    icon: <BoxSelect className="w-5 h-5 text-cyan-300" />,
  },
  {
    kind: 'pixelate',
    description: 'Bölgeyi büyük karelere böler (sansür mozaiği).',
    icon: <Grid3x3 className="w-5 h-5 text-cyan-300" />,
  },
  {
    kind: 'blackbox',
    description: 'Bölgeyi tamamen siyah kutuyla kapatır.',
    icon: <EyeOff className="w-5 h-5 text-cyan-300" />,
  },
];

/** Region effects: click to add one at the playhead, then drag its corners in the preview */
export const EffectPresets: React.FC = () => {
  const addEffectClip = useTimelineStore((s) => s.addEffectClip);

  return (
    <div className="p-3 space-y-3">
      <div className="text-xs font-medium text-gray-400">Bölge Efektleri</div>
      <p className="text-[11px] text-gray-500">
        Tıkla: playhead'e eklenir. Ya da önizlemenin sol üstündeki <b>Bölge</b> aracıyla doğrudan bir dikdörtgen çiz.
      </p>

      <div className="space-y-2">
        {EFFECTS.map((effect) => (
          <button
            key={effect.kind}
            onClick={() => addEffectClip(effect.kind)}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-surface-light/40 hover:bg-surface-light border border-surface-border text-left transition-all group"
          >
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
              {effect.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gray-200">{EFFECT_KIND_LABELS[effect.kind]}</div>
              <div className="text-[11px] text-gray-500 leading-snug">{effect.description}</div>
            </div>
            <Plus className="w-4 h-4 text-gray-500 group-hover:text-primary flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};
