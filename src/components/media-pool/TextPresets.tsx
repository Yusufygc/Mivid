import React from 'react';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { TextProperties } from '@/types/timeline';
import { Plus, Sparkles } from 'lucide-react';

interface TextTemplate {
  id: string;
  title: string;
  description: string;
  previewClass: string;
  preset: Partial<TextProperties>;
}

const TEMPLATES: TextTemplate[] = [
  {
    id: 'default-text',
    title: 'Varsayılan Metin',
    description: 'Klasik beyaz metin ve gölge',
    previewClass: 'text-white font-bold',
    preset: {
      content: 'Metin Girin',
      fontFamily: 'Inter',
      fontSize: 54,
      color: '#FFFFFF',
      fontWeight: 'bold',
      stroke: { color: '#000000', width: 2 },
      shadow: { color: 'rgba(0,0,0,0.8)', blur: 6, offsetX: 2, offsetY: 2 },
    },
  },
  {
    id: 'cinematic-title',
    title: 'Sinematik Başlık',
    description: 'Büyük, kalın ve dikkat çekici',
    previewClass: 'text-amber-400 font-extrabold uppercase tracking-wider',
    preset: {
      content: 'SİNEMATİK BAŞLIK',
      fontFamily: 'Impact',
      fontSize: 72,
      color: '#FBBF24',
      fontWeight: '900',
      stroke: { color: '#000000', width: 4 },
      shadow: { color: 'rgba(0,0,0,0.9)', blur: 12, offsetX: 4, offsetY: 6 },
    },
  },
  {
    id: 'boxed-subtitle',
    title: 'Kutulu Altyazı',
    description: 'Arka plan kutulu modern altyazı',
    previewClass: 'text-white bg-black/70 px-2 py-0.5 rounded font-medium',
    preset: {
      content: 'Kutulu Altyazı Metni',
      fontFamily: 'Inter',
      fontSize: 42,
      color: '#FFFFFF',
      fontWeight: 'bold',
      backgroundBox: {
        enabled: true,
        color: 'rgba(0, 0, 0, 0.75)',
        padding: 14,
        borderRadius: 8,
      },
    },
  },
  {
    id: 'neon-glow',
    title: 'Neon Glow Metin',
    description: 'Canlı parlayan siberpunk stili',
    previewClass: 'text-cyan-300 font-black drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]',
    preset: {
      content: 'NEON BAŞLIK',
      fontFamily: 'Montserrat',
      fontSize: 60,
      color: '#22D3EE',
      fontWeight: '900',
      stroke: { color: '#083344', width: 2 },
      shadow: { color: '#06B6D4', blur: 20, offsetX: 0, offsetY: 0 },
    },
  },
  {
    id: 'social-tag',
    title: 'Sosyal Medya Etiketi',
    description: 'Kırmızı vurgulu canlı etiket',
    previewClass: 'text-white bg-rose-600 px-2 py-0.5 rounded-full font-bold',
    preset: {
      content: '🔥 TREND VİDEO',
      fontFamily: 'Inter',
      fontSize: 40,
      color: '#FFFFFF',
      fontWeight: '900',
      backgroundBox: {
        enabled: true,
        color: '#E11D48',
        padding: 12,
        borderRadius: 20,
      },
    },
  },
];

export const TextPresets: React.FC = () => {
  const { addTextClip } = useTimelineStore();

  return (
    <div className="space-y-3 p-3 select-none">
      {/* Quick Add Basic Button */}
      <button
        onClick={() => addTextClip()}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-primary/20 to-primary/10 hover:from-primary/30 hover:to-primary/20 border border-primary/30 text-primary hover:text-white font-semibold text-xs transition-all shadow-sm group"
      >
        <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
        <span>+ Boş Metin Ekle</span>
      </button>

      <div className="pt-2">
        <p className="text-[11px] font-semibold text-gray-400 mb-2.5 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Hazır Metin & Başlık Şablonları</span>
        </p>

        <div className="space-y-2">
          {TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              onClick={() => addTextClip(tmpl.preset)}
              className="bg-surface-light/70 hover:bg-surface-light border border-surface-border/60 hover:border-primary/50 rounded-xl p-3 flex items-center justify-between cursor-pointer group transition-all"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${tmpl.previewClass}`}>{tmpl.title}</span>
                </div>
                <p className="text-[10px] text-gray-500">{tmpl.description}</p>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  addTextClip(tmpl.preset);
                }}
                className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary text-primary group-hover:text-black transition-all"
                title="Zaman Çizelgesine Ekle"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
