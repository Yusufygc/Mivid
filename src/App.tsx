import { useEffect, useState } from 'react';
import { initTimelineHistory } from '@/core/command/timelineHistory';
import { Header } from '@/components/header/Header';
import { RecoveryBanner } from '@/components/header/RecoveryBanner';
import { MediaPool } from '@/components/media-pool/MediaPool';
import { PreviewPlayer } from '@/components/preview/PreviewPlayer';
import { Inspector } from '@/components/inspector/Inspector';
import { Timeline } from '@/components/timeline/Timeline';
import { ExportModal } from '@/components/export/ExportModal';

export function App() {
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Undo/redo history for timeline edits + Ctrl+Z / Ctrl+Y
  useEffect(() => initTimelineHistory(), []);

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden">
      {/* 1. Header Bar */}
      <Header onExportClick={() => setIsExportOpen(true)} />
      <RecoveryBanner />

      {/* 2. Middle Work Area (Media Pool | Preview | Inspector) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Media Pool */}
        <MediaPool />

        {/* Center: Real-Time Preview Canvas */}
        <PreviewPlayer />

        {/* Right: Inspector Properties */}
        <Inspector />
      </div>

      {/* 3. Bottom: Multi-Track Timeline */}
      <Timeline />

      {/* 4. Export Modal Dialog */}
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
    </div>
  );
}

export default App;
