import React from 'react';
import { BoxSelect } from 'lucide-react';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { Clip, EffectKind } from '@/types/timeline';
import {
  DEFAULT_TINT_COLOR,
  EFFECT_KINDS,
  EFFECT_KIND_LABELS,
  EFFECT_SHAPE_LABELS,
  coversWholeFrame,
  kindHasStrength,
} from '@/core/effects/regionEffects';

const STRENGTH_LABELS: Record<EffectKind, string> = {
  blur: 'Bulanıklık',
  pixelate: 'Blok boyutu',
  blackbox: '',
  tint: 'Renk yoğunluğu',
  sharpen: 'Keskinlik',
  vignette: 'Karartma',
};

const choiceClass = (active: boolean, strong = true): string =>
  `py-1 rounded text-[11px] font-medium transition-all ${
    active
      ? `${strong ? 'bg-cyan-500' : 'bg-cyan-500/80'} text-black font-semibold`
      : 'bg-surface-light text-gray-400 hover:text-gray-200 hover:bg-surface-border/60'
  }`;

/** Where a new ramp ends: half a range up, or down when there is no room above */
const rampTarget = (strength: number): number => (strength + 0.5 > 1 ? strength - 0.5 : strength + 0.5);

const slider = 'w-full h-1.5 bg-surface-light rounded-lg appearance-none cursor-pointer accent-cyan-400';

const Toggle: React.FC<{ label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }> = ({
  label,
  hint,
  checked,
  disabled,
  onChange,
}) => (
  <label
    className={`flex items-start gap-2 text-[11px] ${disabled ? 'opacity-60' : 'cursor-pointer'}`}
    title={hint}
  >
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 accent-cyan-400"
    />
    <span className="text-gray-300">
      {label}
      <span className="block text-[10px] text-gray-500">{hint}</span>
    </span>
  </label>
);

/** Effect clip settings: kind, region or whole frame, invert, strength (constant or ramp), tint color */
export const EffectSettingsPanel: React.FC<{ clip: Clip }> = ({ clip }) => {
  const updateClipEffect = useTimelineStore((s) => s.updateClipEffect);
  const effect = clip.effect;
  if (!effect) return null;

  const wholeFrame = coversWholeFrame(effect);
  const hasRamp = effect.strengthEnd !== undefined;
  const set = (patch: Parameters<typeof updateClipEffect>[1]) => updateClipEffect(clip.id, patch);

  return (
    <div className="space-y-3 pt-2 border-t border-surface-border" data-testid="effect-settings">
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
        <BoxSelect className="w-3.5 h-3.5 text-cyan-300" />
        <span>Efekt Ayarları</span>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {EFFECT_KINDS.map((kind) => (
          <button key={kind} onClick={() => set({ kind })} className={choiceClass(effect.kind === kind)}>
            {EFFECT_KIND_LABELS[kind]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Toggle
          label="Tüm kare"
          hint={effect.kind === 'vignette' ? 'Vinyet her zaman tüm kareye uygulanır.' : 'Bölge yerine bütün görüntüye uygula (ayar katmanı gibi).'}
          checked={wholeFrame}
          disabled={effect.kind === 'vignette'}
          onChange={(fullFrame) => set({ fullFrame })}
        />
        {!wholeFrame && (
          <Toggle
            label="Ters (bölge dışı)"
            hint="Bölgeyi koru, geri kalan her yere uygula: yüzü net bırak, çevreyi bulanıklaştır."
            checked={!!effect.invert}
            onChange={(invert) => set({ invert })}
          />
        )}
      </div>

      {!wholeFrame && (
        <div className="grid grid-cols-2 gap-1.5">
          {(['rect', 'ellipse'] as const).map((shape) => (
            <button key={shape} onClick={() => set({ shape })} className={choiceClass(effect.shape === shape, false)}>
              {EFFECT_SHAPE_LABELS[shape]}
            </button>
          ))}
        </div>
      )}

      {effect.kind === 'tint' && (
        <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
          <span>Ton rengi</span>
          <input
            type="color"
            aria-label="Ton rengi"
            value={effect.color || DEFAULT_TINT_COLOR}
            onChange={(e) => set({ color: e.target.value })}
            className="h-6 w-12 rounded border border-surface-border bg-surface-light cursor-pointer"
          />
        </div>
      )}

      {kindHasStrength(effect.kind) && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-400">
              <span>{STRENGTH_LABELS[effect.kind]}{hasRamp ? ' (başlangıç)' : ''}</span>
              <span className="font-mono text-gray-200">{Math.round(effect.strength * 100)}%</span>
            </div>
            <input
              type="range"
              aria-label={hasRamp ? 'Başlangıç gücü' : 'Güç'}
              min="0.02"
              max="1"
              step="0.01"
              value={effect.strength}
              onChange={(e) => set({ strength: parseFloat(e.target.value) })}
              className={slider}
            />
          </div>

          <Toggle
            label="Güç animasyonu"
            hint="Klip boyunca gücü başlangıçtan bitişe değiştir: kademeli sansür, odak geçişi."
            checked={hasRamp}
            onChange={(on) => set(on ? { strengthEnd: rampTarget(effect.strength) } : { strengthEnd: undefined, strengthEasing: undefined })}
          />

          {hasRamp && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{STRENGTH_LABELS[effect.kind]} (bitiş)</span>
                  <span className="font-mono text-gray-200">{Math.round((effect.strengthEnd ?? 0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  aria-label="Bitiş gücü"
                  min="0"
                  max="1"
                  step="0.01"
                  value={effect.strengthEnd ?? 0}
                  onChange={(e) => set({ strengthEnd: parseFloat(e.target.value) })}
                  className={slider}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => set({ strengthEasing: 'linear' })} className={choiceClass((effect.strengthEasing ?? 'linear') === 'linear', false)}>
                  Doğrusal
                </button>
                <button onClick={() => set({ strengthEasing: 'ease-in-out' })} className={choiceClass(effect.strengthEasing === 'ease-in-out', false)}>
                  Yumuşak
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!wholeFrame && (
        <>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Kenar yumuşatma</span>
              <span className="font-mono text-gray-200">{Math.round(effect.feather * 100)}%</span>
            </div>
            <input
              type="range"
              aria-label="Kenar yumuşatma"
              min="0"
              max="1"
              step="0.01"
              value={effect.feather}
              onChange={(e) => set({ feather: parseFloat(e.target.value) })}
              className={slider}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(['width', 'height'] as const).map((key) => (
              <div key={key} className="space-y-1">
                <label className="text-[11px] text-gray-400">{key === 'width' ? 'Genişlik (px)' : 'Yükseklik (px)'}</label>
                <input
                  type="number"
                  value={Math.round(effect[key])}
                  onChange={(e) => set({ [key]: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface-light px-2 py-1 rounded text-xs text-gray-200 border border-surface-border focus:border-primary outline-none font-mono"
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-gray-500">
            Bölgeyi önizlemede köşelerinden boyutlandır, sürükleyerek taşı. Hareketli nesne için Konum / Ölçek
            keyframe'lerini kullan.
          </p>
        </>
      )}
    </div>
  );
};
