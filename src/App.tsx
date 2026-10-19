import { useCallback, useEffect, useRef, useState } from 'react';
import { initTimelineHistory } from '@/core/command/timelineHistory';
import { Header } from '@/components/header/Header';
import { RecoveryBanner } from '@/components/header/RecoveryBanner';
import { MediaPool } from '@/components/media-pool/MediaPool';
import { PreviewPlayer } from '@/components/preview/PreviewPlayer';
import { Inspector } from '@/components/inspector/Inspector';
import { Timeline } from '@/components/timeline/Timeline';
import { ExportModal } from '@/components/export/ExportModal';

const TIMELINE_HEIGHT_KEY = 'mivid.timelineHeight';
const MIN_TIMELINE_HEIGHT = 200;

/** Default timeline height: about a third of the window, never taller than the old fixed 320 px */
const defaultTimelineHeight = (): number =>
  Math.round(Math.min(320, Math.max(MIN_TIMELINE_HEIGHT, window.innerHeight * 0.36)));

const maxTimelineHeight = (): number => Math.max(MIN_TIMELINE_HEIGHT, Math.round(window.innerHeight * 0.65));

const readTimelineHeight = (): number => {
  try {
    const saved = Number(localStorage.getItem(TIMELINE_HEIGHT_KEY));
    if (saved >= MIN_TIMELINE_HEIGHT) return Math.min(saved, maxTimelineHeight());
  } catch {
    // storage unavailable
  }
  return defaultTimelineHeight();
};

export function App() {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [timelineHeight, setTimelineHeight] = useState<number>(readTimelineHeight);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Keep the timeline inside the window when the window shrinks
  useEffect(() => {
    const onResize = () => setTimelineHeight((h) => Math.min(h, maxTimelineHeight()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const saveTimelineHeight = useCallback((height: number) => {
    try {
      localStorage.setItem(TIMELINE_HEIGHT_KEY, String(height));
    } catch {
      // storage unavailable: the height just is not remembered
    }
  }, []);

  const onSplitterPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startY: e.clientY, startHeight: timelineHeight };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onSplitterPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Dragging the bar up makes the timeline taller
    const next = drag.startHeight + (drag.startY - e.clientY);
    setTimelineHeight(Math.min(maxTimelineHeight(), Math.max(MIN_TIMELINE_HEIGHT, Math.round(next))));
  };
  const onSplitterPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    saveTimelineHeight(timelineHeight);
  };

  // Undo/redo history for timeline edits + Ctrl+Z / Ctrl+Y
  useEffect(() => initTimelineHistory(), []);

  return (
    <div className="flex flex-col h-screen w-screen bg-background overflow-hidden">
      {/* 1. Header Bar */}
      <Header onExportClick={() => setIsExportOpen(true)} />
      <RecoveryBanner />

      {/* 2. Middle Work Area (Media Pool | Preview | Inspector) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Media Pool */}
        <MediaPool />

        {/* Center: Real-Time Preview Canvas */}
        <PreviewPlayer />

        {/* Right: Inspector Properties */}
        <Inspector />
      </div>

      {/* 3. Bottom: Multi-Track Timeline, its height can be dragged (double click: default) */}
      <div
        role="separator"
        aria-orientation="horizontal"
        title="Zaman çizelgesi yüksekliğini ayarla (çift tık: varsayılan)"
        onPointerDown={onSplitterPointerDown}
        onPointerMove={onSplitterPointerMove}
        onPointerUp={onSplitterPointerUp}
        onPointerCancel={onSplitterPointerUp}
        onDoubleClick={() => {
          const height = defaultTimelineHeight();
          setTimelineHeight(height);
          saveTimelineHeight(height);
        }}
        className="h-1.5 flex-shrink-0 bg-surface-border/60 hover:bg-primary/60 cursor-row-resize touch-none transition-colors"
      />
      <div style={{ height: timelineHeight }} className="flex-shrink-0 min-h-0">
        <Timeline />
      </div>

      {/* 4. Export Modal Dialog */}
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
    </div>
  );
}

export default App;
