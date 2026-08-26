import React from 'react';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { Sliders, Volume2, Move } from 'lucide-react';

export const Inspector: React.FC = () => {
  const { tracks, selectedClipId, updateClipTransform, updateClipAudio } = useTimelineStore();

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
        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-surface-light text-primary rounded">
          {selectedClip.type}
        </span>
      </div>

      <div className="p-4 space-y-6">
        {/* Clip General Info */}
        <div className="bg-surface-light/40 p-2.5 rounded-lg border border-surface-border">
          <p className="text-xs font-semibold text-gray-200 truncate">{selectedClip.name}</p>
          <div className="grid grid-cols-2 gap-2 mt-2 text-[11px] font-mono text-gray-400">
            <div>Başlangıç: <span className="text-gray-200">{selectedClip.startTime.toFixed(2)}s</span></div>
            <div>Süre: <span className="text-gray-200">{selectedClip.duration.toFixed(2)}s</span></div>
          </div>
        </div>

        {/* Video / Visual Transforms */}
        {selectedClip.type !== 'audio' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
              <Move className="w-3.5 h-3.5 text-primary" />
              <span>Görsel & Dönüşüm (Transform)</span>
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

        {/* Audio Settings */}
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
      </div>
    </div>
  );
};
