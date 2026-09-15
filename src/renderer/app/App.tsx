import { useEffect } from 'react';

import { useProjectStore } from '../entities/project';
import { TimelineScreen } from '../screens/timeline/ui/TimelineScreen';
import { useToastStore } from '../shared/model/toastStore';
import { ToastContainer } from '../shared/ui/Toast';

export function App() {
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  useEffect(() => {
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
