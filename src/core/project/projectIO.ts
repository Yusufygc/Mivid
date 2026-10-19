import { ProjectFile, ProjectFileError, parseProjectFile } from './projectFile';

export const PROJECT_EXTENSION = '.kurgu.json';

/** Minimal shape of the File System Access API handles (not in the TypeScript DOM lib) */
interface WritableHandle {
  name: string;
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
}
interface ReadableHandle {
  name: string;
  getFile: () => Promise<File>;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (options: unknown) => Promise<WritableHandle>;
  showOpenFilePicker?: (options: unknown) => Promise<ReadableHandle[]>;
};

const pickerTypes = [{ description: 'Kurgu projesi', accept: { 'application/json': [PROJECT_EXTENSION, '.json'] } }];

const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

const safeFileName = (name: string): string => `${name.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'Adsiz Proje'}${PROJECT_EXTENSION}`;

/** Handle of the file the project was last saved to, so Ctrl+S overwrites it instead of asking again */
let lastSaveHandle: WritableHandle | null = null;

export const forgetSaveTarget = (): void => {
  lastSaveHandle = null;
};

export type SaveOutcome = { status: 'saved'; fileName: string } | { status: 'cancelled' };

/**
 * Saves a project file. With the File System Access API (Chromium / WebView2) the user picks the location
 * once; elsewhere the file is downloaded.
 */
export const saveProjectFile = async (file: ProjectFile, options: { saveAs?: boolean } = {}): Promise<SaveOutcome> => {
  const json = JSON.stringify(file, null, 2);
  const picker = (window as PickerWindow).showSaveFilePicker;

  if (picker) {
    try {
      const handle =
        !options.saveAs && lastSaveHandle
          ? lastSaveHandle
          : await picker.call(window, { suggestedName: safeFileName(file.project.name), types: pickerTypes });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      lastSaveHandle = handle;
      return { status: 'saved', fileName: handle.name };
    } catch (e) {
      if (isAbort(e)) return { status: 'cancelled' };
      throw e;
    }
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = safeFileName(file.project.name);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { status: 'saved', fileName: anchor.download };
};

export const parseProjectText = (text: string): ProjectFile => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectFileError('Dosya geçerli bir JSON değil.');
  }
  return parseProjectFile(raw);
};

export type OpenOutcome = { status: 'opened'; file: ProjectFile; fileName: string } | { status: 'cancelled' };

/** Lets the user pick a project file and parses it */
export const openProjectFile = async (): Promise<OpenOutcome> => {
  const picker = (window as PickerWindow).showOpenFilePicker;

  if (picker) {
    try {
      const [handle] = await picker.call(window, { types: pickerTypes, multiple: false });
      const text = await (await handle.getFile()).text();
      return { status: 'opened', file: parseProjectText(text), fileName: handle.name };
    } catch (e) {
      if (isAbort(e)) return { status: 'cancelled' };
      throw e;
    }
  }

  return new Promise<OpenOutcome>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${PROJECT_EXTENSION},.json,application/json`;
    input.onchange = async () => {
      const picked = input.files?.[0];
      if (!picked) return resolve({ status: 'cancelled' });
      try {
        resolve({ status: 'opened', file: parseProjectText(await picked.text()), fileName: picked.name });
      } catch (e) {
        reject(e);
      }
    };
    input.oncancel = () => resolve({ status: 'cancelled' });
    input.click();
  });
};
