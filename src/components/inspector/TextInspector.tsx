import React from 'react';
import { Clip } from '@/types/timeline';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { Type, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Palette, Square, Sparkles } from 'lucide-react';

interface TextInspectorProps {
  clip: Clip;
}

const POPULAR_FONTS = [
  'Inter',
  'Arial',
  'Roboto',
  'Impact',
  'Montserrat',
  'Georgia',
  'Courier New',
  'Trebuchet MS',
  'Verdana',
];

export const TextInspector: React.FC<TextInspectorProps> = ({ clip }) => {
  const { updateClipText } = useTimelineStore();
  const text = clip.text;

  if (!text) return null;

  const handleChange = (field: keyof typeof text, value: any) => {
    updateClipText(clip.id, { [field]: value });
  };

  const handleStrokeChange = (field: 'color' | 'width', value: any) => {
    const current = text.stroke || { color: '#000000', width: 0 };
    updateClipText(clip.id, { stroke: { ...current, [field]: value } });
  };

  const handleShadowChange = (field: 'color' | 'blur' | 'offsetX' | 'offsetY', value: any) => {
    const current = text.shadow || { color: 'rgba(0,0,0,0.7)', blur: 8, offsetX: 2, offsetY: 4 };
    updateClipText(clip.id, { shadow: { ...current, [field]: value } });
  };

  const handleBoxChange = (field: 'enabled' | 'color' | 'padding' | 'borderRadius', value: any) => {
    const current = text.backgroundBox || { enabled: false, color: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 8 };
    updateClipText(clip.id, { backgroundBox: { ...current, [field]: value } });
  };

  return (
    <div className="space-y-5">
      {/* Text Header */}
      <div className="flex items-center gap-2 text-xs font-semibold text-gray-300">
        <Type className="w-3.5 h-3.5 text-primary" />
        <span>Metin & Tipografi</span>
      </div>

      {/* Content Textarea */}
      <div className="space-y-1.5">
        <label className="text-[11px] text-gray-400 font-medium">Metin İçeriği</label>
        <textarea
          rows={3}
          value={text.content}
          onChange={(e) => handleChange('content', e.target.value)}
          placeholder="Metninizi buraya yazın..."
          className="w-full bg-surface-light px-3 py-2 rounded-lg text-xs text-gray-200 border border-surface-border focus:border-primary outline-none resize-none font-medium leading-relaxed"
        />
      </div>

      {/* Font Family & Size */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <label className="text-[11px] text-gray-400">Yazı Tipi</label>
          <select
            value={text.fontFamily || 'Inter'}
            onChange={(e) => handleChange('fontFamily', e.target.value)}
            className="w-full bg-surface-light px-2 py-1.5 rounded-lg text-xs text-gray-200 border border-surface-border focus:border-primary outline-none"
          >
            {POPULAR_FONTS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-gray-400">Boyut ({text.fontSize}px)</label>
          <input
            type="number"
            min="12"
            max="250"
            value={text.fontSize || 48}
            onChange={(e) => handleChange('fontSize', parseInt(e.target.value) || 24)}
            className="w-full bg-surface-light px-2 py-1.5 rounded-lg text-xs text-gray-200 border border-surface-border focus:border-primary outline-none font-mono"
          />
        </div>
      </div>

      {/* Text Styles & Alignment Toolbar */}
      <div className="flex items-center justify-between p-1.5 bg-surface-light rounded-lg border border-surface-border">
        {/* Alignment */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleChange('textAlign', 'left')}
            className={`p-1.5 rounded text-xs transition-all ${
              text.textAlign === 'left' ? 'bg-primary text-black font-bold' : 'text-gray-400 hover:text-white'
            }`}
            title="Sola Hizala"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleChange('textAlign', 'center')}
            className={`p-1.5 rounded text-xs transition-all ${
              text.textAlign === 'center' ? 'bg-primary text-black font-bold' : 'text-gray-400 hover:text-white'
            }`}
            title="Ortala"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleChange('textAlign', 'right')}
            className={`p-1.5 rounded text-xs transition-all ${
              text.textAlign === 'right' ? 'bg-primary text-black font-bold' : 'text-gray-400 hover:text-white'
            }`}
            title="Sağa Hizala"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-surface-border" />

        {/* Bold / Italic */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleChange('fontWeight', text.fontWeight === 'bold' ? 'normal' : 'bold')}
            className={`p-1.5 rounded text-xs transition-all ${
              text.fontWeight === 'bold' || text.fontWeight === '900'
                ? 'bg-primary text-black font-bold'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Kalın (Bold)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleChange('fontStyle', text.fontStyle === 'italic' ? 'normal' : 'italic')}
            className={`p-1.5 rounded text-xs transition-all ${
              text.fontStyle === 'italic' ? 'bg-primary text-black font-bold' : 'text-gray-400 hover:text-white'
            }`}
            title="İtalik"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Text Color */}
      <div className="space-y-1.5">
        <label className="text-[11px] text-gray-400">Yazı Rengi</label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={text.color || '#FFFFFF'}
            onChange={(e) => handleChange('color', e.target.value)}
            className="w-8 h-8 rounded border border-surface-border bg-transparent cursor-pointer"
          />
          <input
            type="text"
            value={text.color || '#FFFFFF'}
            onChange={(e) => handleChange('color', e.target.value)}
            className="flex-1 bg-surface-light px-2.5 py-1.5 rounded-lg text-xs text-gray-200 border border-surface-border focus:border-primary outline-none font-mono uppercase"
          />
        </div>
      </div>

      {/* Stroke / Outline */}
      <div className="space-y-2 p-3 bg-surface-light/40 rounded-xl border border-surface-border">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-primary" />
            <span>Kenarlık (Stroke)</span>
          </span>
          <span className="text-[11px] font-mono text-gray-400">{text.stroke?.width || 0}px</span>
        </div>

        <div className="grid grid-cols-3 gap-2 items-center">
          <input
            type="color"
            value={text.stroke?.color || '#000000'}
            onChange={(e) => handleStrokeChange('color', e.target.value)}
            className="w-full h-7 rounded border border-surface-border bg-transparent cursor-pointer"
          />
          <input
            type="range"
            min="0"
            max="15"
            step="1"
            value={text.stroke?.width || 0}
            onChange={(e) => handleStrokeChange('width', parseInt(e.target.value) || 0)}
            className="col-span-2 h-1.5 bg-surface-light rounded-lg appearance-none cursor-pointer accent-primary"
          />
        </div>
      </div>

      {/* Background Box */}
      <div className="space-y-2 p-3 bg-surface-light/40 rounded-xl border border-surface-border">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
            <Square className="w-3.5 h-3.5 text-amber-400" />
            <span>Arka Plan Kutusu</span>
          </span>
          <input
            type="checkbox"
            checked={text.backgroundBox?.enabled ?? false}
            onChange={(e) => handleBoxChange('enabled', e.target.checked)}
            className="rounded bg-surface-light border-surface-border text-primary focus:ring-0 cursor-pointer"
          />
        </div>

        {text.backgroundBox?.enabled && (
          <div className="space-y-2 pt-1 animate-in fade-in duration-150">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400">Kutu Dolgusu (px)</label>
                <input
                  type="number"
                  min="4"
                  max="40"
                  value={text.backgroundBox?.padding || 12}
                  onChange={(e) => handleBoxChange('padding', parseInt(e.target.value) || 8)}
                  className="w-full bg-surface-light px-2 py-1 rounded text-xs text-gray-200 border border-surface-border font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-gray-400">Köşe Yuvarlama</label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={text.backgroundBox?.borderRadius || 8}
                  onChange={(e) => handleBoxChange('borderRadius', parseInt(e.target.value) || 0)}
                  className="w-full bg-surface-light px-2 py-1 rounded text-xs text-gray-200 border border-surface-border font-mono"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Shadow */}
      <div className="space-y-2 p-3 bg-surface-light/40 rounded-xl border border-surface-border">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Gölge (Shadow)</span>
          </span>
          <span className="text-[11px] font-mono text-gray-400">Bulanıklık: {text.shadow?.blur || 0}px</span>
        </div>

        <input
          type="range"
          min="0"
          max="30"
          step="2"
          value={text.shadow?.blur || 0}
          onChange={(e) => handleShadowChange('blur', parseInt(e.target.value) || 0)}
          className="w-full h-1.5 bg-surface-light rounded-lg appearance-none cursor-pointer accent-sky-400"
        />
      </div>
    </div>
  );
};
