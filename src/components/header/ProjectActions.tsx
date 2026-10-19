import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Save } from 'lucide-react';
import { applyProjectFile, captureProject } from '@/core/project/projectSession';
import { forgetSaveTarget, openProjectFile, saveProjectFile } from '@/core/project/projectIO';
import { Logger } from '@/core/logger';

type Notice = { kind: 'ok' | 'warn' | 'error'; text: string };

const isTextField = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLInputElement && ['text', 'number', 'search'].includes(target.type));

/** Save / open buttons with Ctrl+S, Ctrl+Shift+S and Ctrl+O */
export const ProjectActions: React.FC = () => {
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: Notice) => {
    setNotice(next);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), next.kind === 'ok' ? 3000 : 7000);
  }, []);

  const save = useCallback(
    async (saveAs = false) => {
      try {
        const outcome = await saveProjectFile(captureProject(), { saveAs });
        if (outcome.status === 'saved') show({ kind: 'ok', text: `Kaydedildi: ${outcome.fileName}` });
      } catch (e) {
        Logger.error('ProjectActions', 'Save failed', e);
        show({ kind: 'error', text: `Kaydedilemedi: ${(e as Error).message}` });
      }
    },
    [show]
  );

  const open = useCallback(async () => {
    try {
      const outcome = await openProjectFile();
      if (outcome.status !== 'opened') return;

      const { missingAssetIds } = await applyProjectFile(outcome.file);
      forgetSaveTarget(); // Ctrl+S must not overwrite the previous project's file
      show(
        missingAssetIds.length > 0
          ? { kind: 'warn', text: `${outcome.fileName} açıldı, ${missingAssetIds.length} medya dosyası bulunamadı (blob olarak içe aktarılmış).` }
          : { kind: 'ok', text: `Açıldı: ${outcome.fileName}` }
      );
    } catch (e) {
      Logger.error('ProjectActions', 'Open failed', e);
      show({ kind: 'error', text: `Açılamadı: ${(e as Error).message}` });
    }
  }, [show]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void save(e.shiftKey);
      } else if (key === 'o' && !isTextField(e.target)) {
        e.preventDefault();
        void open();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save, open]);

  const noticeColor =
    notice?.kind === 'error' ? 'text-rose-400' : notice?.kind === 'warn' ? 'text-amber-300' : 'text-emerald-400';

  return (
    <div className="flex items-center gap-2">
      {notice && (
        <span className={`text-[11px] max-w-[260px] truncate ${noticeColor}`} title={notice.text} role="status">
          {notice.text}
        </span>
      )}
      <div className="flex items-center bg-surface-light rounded-lg p-0.5 border border-surface-border">
        <button
          onClick={() => void open()}
          title="Proje Aç (Ctrl+O)"
          className="p-1.5 rounded hover:bg-surface text-gray-300 transition-all"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        <button
          onClick={() => void save(false)}
          title="Projeyi Kaydet (Ctrl+S, Farklı kaydet: Ctrl+Shift+S)"
          className="p-1.5 rounded hover:bg-surface text-gray-300 transition-all"
        >
          <Save className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
