import { create } from 'zustand';
import { ProjectSettings, AspectRatio } from '@/types/project';
import { Logger } from '@/core/logger';

interface ProjectState {
  project: ProjectSettings;
  setProjectName: (name: string) => void;
  setAspectRatio: (aspectRatio: AspectRatio) => void;
  setFps: (fps: number) => void;
  setDuration: (duration: number) => void;
  setBackgroundColor: (color: string) => void;
  /** Replaces the whole project settings (opening a project file) */
  loadProject: (project: ProjectSettings) => void;
}

const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1440, height: 1080 },
  '21:9': { width: 2560, height: 1080 },
};

const initialProject: ProjectSettings = {
  id: 'default-project',
  name: 'Adsız Proje',
  width: 1920,
  height: 1080,
  fps: 30,
  aspectRatio: '16:9',
  duration: 30.0,
  backgroundColor: '#000000',
};

export const useProjectStore = create<ProjectState>((set) => ({
  project: initialProject,

  setProjectName: (name) => {
    Logger.info('useProjectStore', `Project renamed to: ${name}`);
    set((state) => ({ project: { ...state.project, name } }));
  },

  setAspectRatio: (aspectRatio) => {
    const { width, height } = ASPECT_RATIO_DIMENSIONS[aspectRatio] || { width: 1920, height: 1080 };
    Logger.info('useProjectStore', `Aspect ratio changed to: ${aspectRatio} (${width}x${height})`);
    set((state) => ({
      project: {
        ...state.project,
        aspectRatio,
        width,
        height,
      },
    }));
  },

  setFps: (fps) => {
    set((state) => ({ project: { ...state.project, fps } }));
  },

  setDuration: (duration) => {
    set((state) => ({ project: { ...state.project, duration: Math.max(5, duration) } }));
  },

  setBackgroundColor: (backgroundColor) => {
    set((state) => ({ project: { ...state.project, backgroundColor } }));
  },

  loadProject: (project) => {
    Logger.info('useProjectStore', `Project loaded: ${project.name}`);
    set({ project: { ...initialProject, ...project } });
  },
}));
