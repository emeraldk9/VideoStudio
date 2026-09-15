import { create } from 'zustand';

import type { AspectRatioOption, ProjectRecord } from '@shared';

interface ProjectState {
  projects: ProjectRecord[];
  activeProjectId: string;
  loading: boolean;
  loadProjects: () => Promise<void>;
  setActiveProject: (projectId: string) => void;
  createProject: (input: { name: string; aspectRatio?: AspectRatioOption; fps?: number }) => Promise<ProjectRecord>;
  renameProject: (projectId: string, name: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  updateSettings: (projectId: string, settings: { aspectRatio?: AspectRatioOption; fps?: number }) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: 'default',
  loading: false,

  loadProjects: async () => {
    set({ loading: true });
    try {
      const list = await window.api.projects.list();
      set({
        projects: list,
        activeProjectId: get().activeProjectId || (list[0]?.id ?? 'default'),
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  setActiveProject: (projectId: string) => {
    set({ activeProjectId: projectId });
  },

  createProject: async (input) => {
    const created = await window.api.projects.create(input);
    set((state) => ({
      projects: [created, ...state.projects],
      activeProjectId: created.id,
    }));
    return created;
  },

  renameProject: async (projectId: string, name: string) => {
    const updated = await window.api.projects.rename(projectId, name);
    if (!updated) return;
    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? updated : p)),
    }));
  },

  deleteProject: async (projectId: string) => {
    await window.api.projects.delete(projectId);
    set((state) => {
      const nextProjects = state.projects.filter((p) => p.id !== projectId);
      return {
        projects: nextProjects,
        activeProjectId: state.activeProjectId === projectId ? nextProjects[0]?.id ?? 'default' : state.activeProjectId,
      };
    });
  },

  updateSettings: async (projectId: string, settings) => {
    const updated = await window.api.projects.updateSettings(projectId, settings);
    if (!updated) return;
    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? updated : p)),
    }));
  },
}));
