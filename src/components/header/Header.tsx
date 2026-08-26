import React from 'react';
import { useProjectStore } from '@/stores/useProjectStore';
import { commandManager } from '@/core/command/commandManager';
import { AspectRatio } from '@/types/project';
import { Video, Undo2, Redo2, Download, Film } from 'lucide-react';

interface HeaderProps {
  onExportClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onExportClick }) => {
  const { project, setProjectName, setAspectRatio } = useProjectStore();
  const [canUndo, setCanUndo] = React.useState(commandManager.canUndo());
  const [canRedo, setCanRedo] = React.useState(commandManager.canRedo());

  React.useEffect(() => {
    return commandManager.subscribe(() => {
      setCanUndo(commandManager.canUndo());
      setCanRedo(commandManager.canRedo());
    });
  }, []);

  return (
    <header className="h-14 bg-surface border-b border-surface-border px-4 flex items-center justify-between select-none">
      {/* Brand & Project Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-primary font-bold text-lg tracking-wider">
          <div className="p-1.5 bg-primary/10 rounded-lg text-primary border border-primary/20">
            <Film className="w-5 h-5" />
          </div>
          <span>CAPCUT <span className="text-white text-xs font-normal px-2 py-0.5 bg-surface-light rounded">PRO</span></span>
        </div>

        <div className="h-5 w-[1px] bg-surface-border" />

        <input
          type="text"
          value={project.name}
          onChange={(e) => setProjectName(e.target.value)}
          className="bg-transparent text-sm font-medium text-gray-200 hover:bg-surface-light focus:bg-surface-light px-2 py-1 rounded border border-transparent focus:border-surface-border outline-none transition-all w-48"
          placeholder="Proje Adı..."
        />
      </div>

      {/* Center Tools: Aspect Ratio & Undo/Redo */}
      <div className="flex items-center gap-3">
        {/* Undo / Redo */}
        <div className="flex items-center bg-surface-light rounded-lg p-0.5 border border-surface-border">
          <button
            onClick={() => commandManager.undo()}
            disabled={!canUndo}
            title="Geri Al (Ctrl+Z)"
            className="p-1.5 rounded hover:bg-surface text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => commandManager.redo()}
            disabled={!canRedo}
            title="İleri Al (Ctrl+Y)"
            className="p-1.5 rounded hover:bg-surface text-gray-300 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="flex items-center gap-1.5 bg-surface-light px-2 py-1 rounded-lg border border-surface-border text-xs text-gray-300">
          <Video className="w-3.5 h-3.5 text-primary" />
          <select
            value={project.aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
            className="bg-transparent text-xs text-gray-200 outline-none cursor-pointer"
          >
            <option value="16:9" className="bg-surface text-white">16:9 (Yatay / YouTube)</option>
            <option value="9:16" className="bg-surface text-white">9:16 (Dikey / TikTok / Reels)</option>
            <option value="1:1" className="bg-surface text-white">1:1 (Kare / Post)</option>
            <option value="4:3" className="bg-surface text-white">4:3 (Klasik)</option>
            <option value="21:9" className="bg-surface text-white">21:9 (Sinematik)</option>
          </select>
        </div>
      </div>

      {/* Right Actions: Export Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onExportClick}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-primary to-primary-hover text-black font-semibold text-xs shadow-lg shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
        >
          <Download className="w-4 h-4" />
          <span>Dışa Aktar (Export)</span>
        </button>
      </div>
    </header>
  );
};
