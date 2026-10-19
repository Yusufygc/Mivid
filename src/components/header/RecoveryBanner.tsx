import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { ProjectFile } from '@/core/project/projectFile';
import { applyProjectFile, clearAutosave, loadAutosave, startAutosave } from '@/core/project/projectSession';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { useAssetStore } from '@/stores/useAssetStore';

const formatSavedAt = (savedAt: number): string =>
  savedAt > 0 ? new Date(savedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : 'bilinmeyen zaman';

/**
 * Starts autosaving and, when the previous session left an autosave while the editor is still empty,
 * offers to restore it. Autosaving waits for that decision so an empty editor never overwrites the backup.
 */
export const RecoveryBanner: React.FC = () => {
  const [pending, setPending] = useState<ProjectFile | null>(() => {
    const hasWork =
      useAssetStore.getState().assets.size > 0 ||
      useTimelineStore.getState().tracks.some((t) => t.clips.length > 0);
    return hasWork ? null : loadAutosave();
  });

  useEffect(() => {
    if (pending) return;
    return startAutosave();
  }, [pending]);

  if (!pending) return null;

  const restore = async () => {
    const file = pending;
    setPending(null);
    await applyProjectFile(file);
  };

  const discard = () => {
    clearAutosave();
    setPending(null);
  };

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 px-4 py-2 bg-primary/10 border-b border-primary/30 text-xs text-gray-200"
    >
      <span className="flex items-center gap-2">
        <History className="w-4 h-4 text-primary" />
        Önceki oturumdan kaydedilmemiş bir proje bulundu: <b>{pending.project.name}</b> ({formatSavedAt(pending.savedAt)})
      </span>
      <span className="flex items-center gap-2">
        <button
          onClick={() => void restore()}
          className="px-3 py-1 rounded bg-primary text-black font-semibold hover:brightness-110"
        >
          Geri Yükle
        </button>
        <button onClick={discard} className="px-3 py-1 rounded bg-surface-light text-gray-300 hover:text-white">
          Yoksay
        </button>
      </span>
    </div>
  );
};
