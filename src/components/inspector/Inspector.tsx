import React from 'react';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { Sliders, Volume2, Move, Clock, RotateCcw } from 'lucide-react';
import { TextInspector } from './TextInspector';

export const Inspector: React.FC = () => {
  const { tracks, selectedClipId, updateClipTransform, updateClipAudio, updateClipTiming } = useTimelineStore();

  let selectedClip = null;
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.id === selectedClipId);
    if (clip) {
      selectedClip = clip;
      break;
    }
  }

  if (!selectedClip) {
    return (
      <div className="w-72 bg-surface border-l border-surface-border p-4 flex flex-col items-center justify-center text-center select-none text-gray-500">
        <Sliders className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-xs font-medium">Klip Seçilmedi</p>
        <p className="text-[11px] mt-1 text-gray-600">Özelliklerini düzenlemek için zaman çizelgesinden bir klip seçin</p>
      </div>
    );
  }

  const { transform, audio } = selectedClip;

  return (
    <div className="w-72 bg-surface border-l border-surface-border flex flex-col h-full overflow-y-auto select-none">
      {/* Header */}
      <div className="p-3 border-b border-surface-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <Sliders className="w-4 h-4 text-primary" />
          <span>Klip Özellikleri</span>
        </div>
        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-surface-light text-primary rounded font-bold">
          {selectedClip.type}
        </span>
      </div>

      <div className="p-4 space-y-6">
        {/* Clip General Info & Timing */}
        <div className="bg-surface-light/40 p-3 rounded-lg border border-surface-border space-y-2.5">
          <p className="text-xs font-semibold text-gray-200 truncate">{selectedClip.name}</p>
          
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-gray-400">
            <div>
              Zaman Çizelgesi: <span className="text-gray-200 font-semibold">{selectedClip.startTime.toFixed(2)}s</span>
            </div>
            <div>
              Klip Süresi: <span className="text-gray-200 font-semibold">{selectedClip.duration.toFixed(2)}s</span>
            </div>
          </div>

          {/* InPoint (Media Start Offset) */}
          {selectedClip.type !== 'text' && (
            <div className="pt-2 border-t border-surface-border/60 flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>Video İçi Başlangıç:</span>
                <span className="font-mono text-primary font-bold">{selectedClip.inPoint.toFixed(2)}s</span>
              </div>
              {selectedClip.inPoint > 0.05 && (
                <button
                  onClick={() => updateClipTiming(selectedClip!.id, selectedClip!.startTime, selectedClip!.duration, 0)}
                  title="Videonun en başına sıfırla (0.00s)"
                  className="flex items-center gap-1 text-[10px] bg-primary/10 hover:bg-primary/20 text-primary px-1.5 py-0.5 rounded transition-all"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Sıfırla</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Text Specific Inspector */}
        {selectedClip.type === 'text' && <TextInspector clip={selectedClip} />}

        {/* Visual Transforms (Video, Overlay & Text) */}
        {selectedClip.type !== 'audio' && (
          <div className="space-y-4 pt-2 border-t border-surface-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
              <Move className="w-3.5 h-3.5 text-primary" />
              <span>Konum & Boyut (Transform)</span>
            </div>

            {/* Scale Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Ölçek (Scale)</span>
                <span className="font-mono text-gray-200">{Math.round((transform?.scaleX ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="3"
                step="0.05"
                value={transform?.scaleX ?? 1}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  updateClipTransform(selectedClip.id, { scaleX: val, scaleY: val });
                }}
                className="w-full h-1.5 bg-surface-light rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Position X & Y */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-gray-400">Konum X (px)</label>
                <input
                  type="number"
                  value={Math.round(transform?.x ?? 0)}
                  onChange={(e) => updateClipTransform(selectedClip.id, { x: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface-light px-2 py-1 rounded text-xs text-gray-200 border border-surface-border focus:border-primary outline-none font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-gray-400">Konum Y (px)</label>
                <input
                  type="number"
                  value={Math.round(transform?.y ?? 0)}
                  onChange={(e) => updateClipTransform(selectedClip.id, { y: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-surface-light px-2 py-1 rounded text-xs text-gray-200 border border-surface-border focus:border-primary outline-none font-mono"
                />
              </div>
            </div>

            {/* Opacity */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Opaklık (Opacity)</span>
                <span className="font-mono text-gray-200">{Math.round((transform?.opacity ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={transform?.opacity ?? 1}
                onChange={(e) => updateClipTransform(selectedClip.id, { opacity: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-surface-light rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            {/* Rotation */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Döndürme (Rotation)</span>
                <span className="font-mono text-gray-200">{transform?.rotation ?? 0}°</span>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                step="5"
                value={transform?.rotation ?? 0}
                onChange={(e) => updateClipTransform(selectedClip.id, { rotation: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-surface-light rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>
        )}

        {/* Transitions Settings (for video & overlay clips) */}
        {selectedClip.type !== 'audio' && selectedClip.type !== 'text' && (
          <div className="space-y-4 pt-2 border-t border-surface-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
                <Sliders className="w-3.5 h-3.5 text-purple-400" />
                <span>Geçiş Efektleri (Transitions)</span>
              </div>
            </div>

            {/* Transition In */}
            <div className="space-y-2 bg-surface-light/30 p-2.5 rounded-lg border border-surface-border/50">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-300">Giriş Geçişi (In)</span>
                {selectedClip.transitionIn && (
                  <button
                    onClick={() => useTimelineStore.getState().removeTransition(selectedClip!.id, 'in')}
                    className="text-[10px] text-rose-400 hover:text-rose-300"
                  >
                    Kaldır
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'cross-dissolve', name: 'Çapraz' },
                  { id: 'fade-to-black', name: 'Kararma' },
                  { id: 'slide', name: 'Kaydırma' },
                  { id: 'wipe', name: 'Silme' },
                ].map((t) => {
                  const isActive = selectedClip!.transitionIn?.type === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() =>
                        useTimelineStore
                          .getState()
                          .addTransition(
                            selectedClip!.id,
                            'in',
                            t.id as 'cross-dissolve' | 'fade-to-black' | 'slide' | 'wipe'
                          )
                      }
                      className={`py-1 px-2 rounded text-[11px] font-medium transition-all ${
                        isActive
                          ? 'bg-purple-600 text-white font-semibold shadow-sm'
                          : 'bg-surface-light text-gray-400 hover:text-gray-200 hover:bg-surface-border/60'
                      }`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Transition Out */}
            <div className="space-y-2 bg-surface-light/30 p-2.5 rounded-lg border border-surface-border/50">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-300">Çıkış Geçişi (Out)</span>
                {selectedClip.transitionOut && (
                  <button
                    onClick={() => useTimelineStore.getState().removeTransition(selectedClip!.id, 'out')}
                    className="text-[10px] text-rose-400 hover:text-rose-300"
                  >
                    Kaldır
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'cross-dissolve', name: 'Çapraz' },
                  { id: 'fade-to-black', name: 'Kararma' },
                  { id: 'slide', name: 'Kaydırma' },
                  { id: 'wipe', name: 'Silme' },
                ].map((t) => {
                  const isActive = selectedClip!.transitionOut?.type === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() =>
                        useTimelineStore
                          .getState()
                          .addTransition(
                            selectedClip!.id,
                            'out',
                            t.id as 'cross-dissolve' | 'fade-to-black' | 'slide' | 'wipe'
                          )
                      }
                      className={`py-1 px-2 rounded text-[11px] font-medium transition-all ${
                        isActive
                          ? 'bg-purple-600 text-white font-semibold shadow-sm'
                          : 'bg-surface-light text-gray-400 hover:text-gray-200 hover:bg-surface-border/60'
                      }`}
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Audio Settings (for video & audio clips) */}
        {selectedClip.type !== 'text' && (
          <div className="space-y-4 pt-2 border-t border-surface-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ses Ayarları (Audio)</span>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Ses Seviyesi (Volume)</span>
                <span className="font-mono text-gray-200">{Math.round((audio?.volume ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={audio?.volume ?? 1}
                onChange={(e) => updateClipAudio(selectedClip.id, { volume: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-surface-light rounded-lg appearance-none cursor-pointer accent-emerald-400"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={audio?.muted ?? false}
                onChange={(e) => updateClipAudio(selectedClip.id, { muted: e.target.checked })}
                className="rounded bg-surface-light border-surface-border text-primary focus:ring-0"
              />
              <span>Sesi Tamamen Kapat (Mute)</span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
};
