import React, { useRef } from 'react';
import { useAssetStore } from '@/stores/useAssetStore';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { Upload, Plus, Film, Music, Image as ImageIcon, Trash2, Clock } from 'lucide-react';
import { formatTimecode } from '@/utils/time';
import { MediaAsset } from '@/types/asset';

export const MediaPool: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { assets, importFile, importFromPath, removeAsset } = useAssetStore();
  const { addClipFromAsset } = useTimelineStore();
  const [isDragging, setIsDragging] = React.useState(false);

  const assetList = Array.from(assets.values());

  const handleImportClick = async () => {
    // Check if running in Tauri desktop environment
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const selectedPaths: string[] = await invoke('select_media_files');
        for (const filePath of selectedPaths) {
          await importFromPath(filePath);
        }
        return;
      } catch (err) {
        console.warn('Failed to invoke Tauri select_media_files, falling back to browser picker', err);
      }
    }

    // Web fallback
    fileInputRef.current?.click();
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const nativePath = (file as unknown as { path?: string }).path;
      if (nativePath) {
        await importFromPath(nativePath);
      } else {
        await importFile(file);
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleAddClip = (asset: MediaAsset) => {
    addClipFromAsset(asset);
  };

  return (
    <div className="w-80 bg-surface border-r border-surface-border flex flex-col h-full select-none">
      {/* Panel Header */}
      <div className="p-3 border-b border-surface-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <Film className="w-4 h-4 text-primary" />
          <span>Medya Havuzu ({assetList.length})</span>
        </div>
        <button
          onClick={handleImportClick}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-light hover:bg-surface-border text-xs text-gray-200 font-medium transition-all"
        >
          <Upload className="w-3.5 h-3.5 text-primary" />
          <span>İçe Aktar</span>
        </button>
        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept="video/*,audio/*,image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Asset List & Drag-Drop Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`flex-1 p-3 overflow-y-auto space-y-2 transition-colors ${
          isDragging ? 'bg-primary/5 border-2 border-dashed border-primary' : ''
        }`}
      >
        {assetList.length === 0 ? (
          <div
            onClick={handleImportClick}
            className="h-48 border-2 border-dashed border-surface-border rounded-xl flex flex-col items-center justify-center text-center p-4 cursor-pointer hover:border-primary/50 hover:bg-surface-light/30 transition-all group"
          >
            <div className="p-3 rounded-full bg-surface-light group-hover:bg-primary/10 text-gray-400 group-hover:text-primary transition-all mb-2">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-xs font-semibold text-gray-300">Medya Yükleyin</p>
            <p className="text-[11px] text-gray-500 mt-1">Video, Ses veya Resim dosyalarını buraya sürükleyin</p>
          </div>
        ) : (
          assetList.map((asset) => (
            <div
              key={asset.id}
              className="bg-surface-light/70 hover:bg-surface-light border border-surface-border/60 hover:border-surface-border rounded-lg p-2 flex items-center gap-3 group transition-all"
            >
              {/* Thumbnail / Icon */}
              <div className="w-16 h-12 rounded bg-background overflow-hidden relative flex-shrink-0 flex items-center justify-center">
                {asset.thumbnail ? (
                  <img src={asset.thumbnail} alt={asset.name} className="w-full h-full object-cover" />
                ) : asset.type === 'video' ? (
                  <Film className="w-5 h-5 text-gray-500" />
                ) : asset.type === 'audio' ? (
                  <Music className="w-5 h-5 text-emerald-400" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-amber-400" />
                )}
                {asset.type === 'video' && (
                  <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] px-1 rounded text-white font-mono">
                    {formatTimecode(asset.duration)}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-200 truncate" title={asset.path}>{asset.name}</p>
                <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                  <span className="flex items-center gap-1 font-mono">
                    <Clock className="w-3 h-3 text-gray-500" />
                    {asset.duration.toFixed(1)}s
                  </span>
                  <span className="uppercase text-[10px] px-1 bg-background/50 rounded text-gray-400 font-mono">
                    {asset.type}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleAddClip(asset)}
                  title="Zaman Çizelgesine Ekle"
                  className="p-1.5 rounded bg-primary/10 hover:bg-primary text-primary hover:text-black transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => removeAsset(asset.id)}
                  title="Sil"
                  className="p-1.5 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
