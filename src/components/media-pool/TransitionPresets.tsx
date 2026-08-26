import React from 'react';
import { Layers, Plus } from 'lucide-react';
import { useTimelineStore } from '@/stores/useTimelineStore';

interface TransitionTemplate {
  id: string;
  name: string;
  type: 'cross-dissolve' | 'fade-to-black' | 'slide' | 'wipe';
  description: string;
}

const TRANSITIONS: TransitionTemplate[] = [
  {
    id: 't-cross-dissolve',
    name: 'Çapraz Geçiş',
    type: 'cross-dissolve',
    description: 'Yumuşak bir şekilde iki klibi birleştirir.',
  },
  {
    id: 't-fade-black',
    name: 'Kararma (Fade to Black)',
    type: 'fade-to-black',
    description: 'Siyaha karararak diğer klibe geçer.',
  },
  {
    id: 't-slide',
    name: 'Kaydırma (Slide)',
    type: 'slide',
    description: 'Yeni klip ekrana doğru kayarak girer.',
  },
  {
    id: 't-wipe',
    name: 'Silme (Wipe)',
    type: 'wipe',
    description: 'Yeni klip bir silgi gibi eskini siler.',
  }
];

export const TransitionPresets: React.FC = () => {
  const { selectedClipId, addTransition } = useTimelineStore();

  const handleDragStart = (e: React.DragEvent, transition: TransitionTemplate) => {
    const payload = JSON.stringify({ type: 'transition', transitionType: transition.type });
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.setData('application/json', payload);
    e.dataTransfer.setData('application/x-transition', payload);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleApplyToSelected = (transition: TransitionTemplate) => {
    if (selectedClipId) {
      addTransition(selectedClipId, 'in', transition.type);
    }
  };

  return (
    <div className="p-3 space-y-3">
      <div className="text-xs font-medium text-gray-400 mb-2">Geçiş Efektleri</div>
      <div className="grid grid-cols-2 gap-2">
        {TRANSITIONS.map((transition) => (
          <div
            key={transition.id}
            draggable
            onDragStart={(e) => handleDragStart(e, transition)}
            onClick={() => handleApplyToSelected(transition)}
            className="bg-surface-light border border-surface-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all flex flex-col items-center text-center gap-2 group relative"
          >
            <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <Layers className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-200">{transition.name}</p>
              <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">{transition.description}</p>
            </div>
            
            {/* Quick add button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleApplyToSelected(transition);
              }}
              title="Seçili Klibe Ekle"
              className="absolute top-2 right-2 p-1 rounded bg-primary/10 hover:bg-primary text-primary hover:text-black opacity-0 group-hover:opacity-100 transition-all"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 text-center mt-3 bg-surface-light/40 p-2 rounded border border-surface-border/40">
        💡 Klibin üzerine sürükleyin veya klibi seçip geçişe <b>tıklayın</b>.
      </p>
    </div>
  );
};
