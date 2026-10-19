import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PROJECT_FILE_VERSION } from './projectFile';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

const projectText = JSON.stringify({
  version: PROJECT_FILE_VERSION,
  savedAt: 1,
  project: { id: 'p', name: 'Deneme', width: 1080, height: 1920, fps: 30, aspectRatio: '9:16', duration: 10, backgroundColor: '#000' },
  tracks: [],
  assets: [],
});

describe('openProjectFile in the desktop app', () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens the project through the native dialog and names it after the file', async () => {
    invoke.mockResolvedValue({ path: 'C:\\Projeler\\Reels\\parayi-ver.kurgu.json', text: projectText });
    const { openProjectFile } = await import('./projectIO');

    const outcome = await openProjectFile();

    expect(invoke).toHaveBeenCalledWith('open_project_dialog');
    expect(outcome.status).toBe('opened');
    if (outcome.status === 'opened') {
      expect(outcome.fileName).toBe('parayi-ver.kurgu.json');
      expect(outcome.file.project.name).toBe('Deneme');
    }
  });

  it('reports a cancelled dialog', async () => {
    invoke.mockResolvedValue(null);
    const { openProjectFile } = await import('./projectIO');
    expect(await openProjectFile()).toEqual({ status: 'cancelled' });
  });

  it('rejects a file that is not a project', async () => {
    invoke.mockResolvedValue({ path: 'C:/x/y.json', text: '{"hello":1}' });
    const { openProjectFile } = await import('./projectIO');
    await expect(openProjectFile()).rejects.toThrow();
  });
});
