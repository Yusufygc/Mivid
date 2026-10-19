import { ICommand } from '@/types/command';
import { Clip, Track } from '@/types/timeline';
import { commandManager } from './commandManager';
import { useTimelineStore } from '@/stores/useTimelineStore';
import { Logger } from '@/core/logger';

/** Edits to the same clips closer together than this are merged into one undo step (drags, sliders) */
export const COALESCE_WINDOW_MS = 800;

const countClips = (tracks: Track[]): number => tracks.reduce((sum, t) => sum + t.clips.length, 0);

/**
 * Ids of everything that differs between two track lists: clips by reference (the store is immutable),
 * tracks by their own flags, tracks and clips that exist on only one side.
 */
export const changedIds = (before: Track[], after: Track[]): string[] => {
  const changed = new Set<string>();

  const beforeTracks = new Map(before.map((t) => [t.id, t]));
  const afterTracks = new Map(after.map((t) => [t.id, t]));
  const beforeClips = new Map<string, Clip>(before.flatMap((t) => t.clips).map((c) => [c.id, c]));
  const afterClips = new Map<string, Clip>(after.flatMap((t) => t.clips).map((c) => [c.id, c]));

  for (const [id, track] of afterTracks) {
    const old = beforeTracks.get(id);
    if (
      !old ||
      old.name !== track.name ||
      old.isMuted !== track.isMuted ||
      old.isHidden !== track.isHidden ||
      old.isLocked !== track.isLocked
    ) {
      changed.add(`track:${id}`);
    }
  }
  for (const id of beforeTracks.keys()) {
    if (!afterTracks.has(id)) changed.add(`track:${id}`);
  }

  for (const [id, clip] of afterClips) {
    if (beforeClips.get(id) !== clip) changed.add(id);
  }
  for (const id of beforeClips.keys()) {
    if (!afterClips.has(id)) changed.add(id);
  }

  return [...changed].sort();
};

export const describeChange = (before: Track[], after: Track[]): string => {
  const beforeClips = countClips(before);
  const afterClips = countClips(after);
  if (after.length > before.length) return 'Kanal ekle';
  if (after.length < before.length) return 'Kanal sil';
  if (afterClips > beforeClips) return afterClips - beforeClips > 1 ? 'Klip böl' : 'Klip ekle';
  if (afterClips < beforeClips) return 'Klip sil';
  return 'Klip düzenle';
};

let suppressed = false;

/** Applies a snapshot without recording it as a new history entry */
const applySnapshot = (tracks: Track[]): void => {
  suppressed = true;
  try {
    useTimelineStore.getState().restoreTracks(tracks);
  } finally {
    suppressed = false;
  }
};

export class TimelineSnapshotCommand implements ICommand {
  public after: Track[];
  public updatedAt: number;

  constructor(
    public readonly description: string,
    public readonly before: Track[],
    after: Track[],
    public readonly signature: string,
    public readonly structure: string
  ) {
    this.after = after;
    this.updatedAt = Date.now();
  }

  execute(): void {
    this.updatedAt = 0; // never merge new edits into an entry that was just redone
    applySnapshot(this.after);
  }

  undo(): void {
    this.updatedAt = 0;
    applySnapshot(this.before);
  }
}

const isTextEditingTarget = (target: EventTarget | null): boolean => {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    return ['text', 'number', 'search', 'email', 'url', 'password', 'tel'].includes(target.type);
  }
  return false;
};

/**
 * Records every change to the timeline tracks into the global CommandManager and wires Ctrl+Z / Ctrl+Y.
 * Returns a cleanup function.
 */
export const initTimelineHistory = (): (() => void) => {
  const unsubscribe = useTimelineStore.subscribe((state, prev) => {
    if (suppressed || state.tracks === prev.tracks) return;

    const signature = changedIds(prev.tracks, state.tracks).join('|');
    const structure = `${state.tracks.length}:${countClips(state.tracks)}`;
    const last = commandManager.peek();

    if (
      last instanceof TimelineSnapshotCommand &&
      !commandManager.canRedo() &&
      last.signature === signature &&
      last.structure === structure &&
      Date.now() - last.updatedAt < COALESCE_WINDOW_MS
    ) {
      last.after = state.tracks;
      last.updatedAt = Date.now();
      commandManager.touch();
      return;
    }

    commandManager.record(
      new TimelineSnapshotCommand(describeChange(prev.tracks, state.tracks), prev.tracks, state.tracks, signature, structure)
    );
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (isTextEditingTarget(e.target)) return; // keep the browser's own undo inside text fields

    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      commandManager.undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      commandManager.redo();
    }
  };

  if (typeof window !== 'undefined') window.addEventListener('keydown', handleKeyDown);
  Logger.info('TimelineHistory', 'Undo/redo history initialized');

  return () => {
    unsubscribe();
    if (typeof window !== 'undefined') window.removeEventListener('keydown', handleKeyDown);
  };
};
