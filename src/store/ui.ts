import { create } from 'zustand';

export type ActiveTab = 'import' | 'settings' | 'graph' | 'scripts' | 'review' | 'export';

export interface UIState {
  activeTab: ActiveTab;
  selectedScriptId: string | null;
  graphLayoutDone: boolean;
  notification: { type: 'success' | 'error' | 'info'; message: string } | null;

  setActiveTab: (tab: ActiveTab) => void;
  setSelectedScript: (id: string | null) => void;
  setGraphLayoutDone: (done: boolean) => void;
  showNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  clearNotification: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'import',
  selectedScriptId: null,
  graphLayoutDone: false,
  notification: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedScript: (id) => set({ selectedScriptId: id }),
  setGraphLayoutDone: (done) => set({ graphLayoutDone: done }),
  showNotification: (type, message) => set({ notification: { type, message } }),
  clearNotification: () => set({ notification: null }),
}));
