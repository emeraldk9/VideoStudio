import { useEffect } from 'react';

import { useProjectStore } from '../entities/project';
import { applyAppearance, useAppSettingsStore } from '../features/settings/model/appSettingsStore';
import { TimelineScreen } from '../screens/timeline/ui/TimelineScreen';
import { useToastStore } from '../shared/model/toastStore';
import { ToastContainer } from '../shared/ui/Toast';

import { useIpcSynchronizer } from './useIpcSynchronizer';

export function App() {
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  // Synchronize background events (render, watermark, story) with stores
  useIpcSynchronizer();

  useEffect(() => {
    // Restore user theme, density, and accent color on boot
    applyAppearance(useAppSettingsStore.getState());
    void loadProjects();
  }, [loadProjects]);

  return (
    <div className="flex h-screen w-screen min-h-0 flex-col overflow-hidden bg-bg-app text-text-primary">
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg-canvas">
        <TimelineScreen />
      </main>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
