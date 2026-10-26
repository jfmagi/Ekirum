import React, { useEffect } from 'react';
import { useEkirumStore } from './store/useEkirumStore';
import { WindowHeader } from './components/layout/WindowHeader';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNavBar } from './components/layout/MobileNavBar';
import { TaskListView } from './components/tasks/TaskListView';
import { TaskCalendarView } from './components/tasks/TaskCalendarView';
import { TaskTimelineView } from './components/tasks/TaskTimelineView';
import { CharacterView } from './components/character/CharacterView';
import { HabitTrackerView } from './components/habits/HabitTrackerView';
import { LibraryView } from './components/library/LibraryView';
import { QuickAddBar } from './components/tasks/QuickAddBar';
import { TaskDetailModal } from './components/tasks/TaskDetailModal';
import { CommandPalette } from './components/modals/CommandPalette';
import { NewProjectModal } from './components/modals/NewProjectModal';
import { EditProjectModal } from './components/modals/EditProjectModal';
import { HabitModal } from './components/modals/HabitModal';
import { BackupModal } from './components/modals/BackupModal';
import { CelebrationModal } from './components/modals/CelebrationModal';
import { HelpModal } from './components/modals/HelpModal';
import { OnboardingModal } from './components/modals/OnboardingModal';
import { ExportCharacterPdfModal } from './components/modals/ExportCharacterPdfModal';
import { SyncBanner } from './components/common/SyncBanner';
import { X, AlertTriangle } from 'lucide-react';

import { useShallow } from 'zustand/react/shallow';

export const App: React.FC = () => {
  const {
    currentView,
    displayMode,
    quickAddOpen,
    quickAddDefaultDate,
    deletedTaskToast,
    undoDeleteTask,
    dismissDeletedTaskToast,
    setQuickAddOpen,
    setHelpModalOpen,
    setCurrentView,
    initStorage,
    triggerBackupAndSync,
    refreshBackupStatus,
    reconnectBackupFolder,
    backupStatus,
    storageError,
    clearStorageError,
    taskDetailId,
    newProjectModalOpen,
    editingProjectId,
    newHabitModalOpen,
    editingHabitId,
    backupModalOpen,
    celebration,
    helpModalOpen,
    exportPdfModalOpen,
    onboardingModalOpen,
  } = useEkirumStore(
    useShallow((s) => ({
      currentView: s.currentView,
      displayMode: s.displayMode,
      quickAddOpen: s.quickAddOpen,
      quickAddDefaultDate: s.quickAddDefaultDate,
      deletedTaskToast: s.deletedTaskToast,
      undoDeleteTask: s.undoDeleteTask,
      dismissDeletedTaskToast: s.dismissDeletedTaskToast,
      setQuickAddOpen: s.setQuickAddOpen,
      setHelpModalOpen: s.setHelpModalOpen,
      setCurrentView: s.setCurrentView,
      initStorage: s.initStorage,
      triggerBackupAndSync: s.triggerBackupAndSync,
      refreshBackupStatus: s.refreshBackupStatus,
      reconnectBackupFolder: s.reconnectBackupFolder,
      backupStatus: s.backupStatus,
      storageError: s.storageError,
      clearStorageError: s.clearStorageError,
      taskDetailId: s.taskDetailId,
      newProjectModalOpen: s.newProjectModalOpen,
      editingProjectId: s.editingProjectId,
      newHabitModalOpen: s.newHabitModalOpen,
      editingHabitId: s.editingHabitId,
      backupModalOpen: s.backupModalOpen,
      celebration: s.celebration,
      helpModalOpen: s.helpModalOpen,
      exportPdfModalOpen: s.exportPdfModalOpen,
      onboardingModalOpen: s.onboardingModalOpen,
    }))
  );

  // Storage Initialization & Automated Sync Lifecycle
  useEffect(() => {
    initStorage();

    const handleSync = () => {
      triggerBackupAndSync(false);
      refreshBackupStatus();
      if ('serviceWorker' in navigator && (document.visibilityState === 'visible' || !document.hidden)) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          reg?.update().catch(() => {});
        }).catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleSync);
    window.addEventListener('focus', handleSync);
    window.addEventListener('blur', handleSync);
    window.addEventListener('pageshow', handleSync);
    window.addEventListener('pagehide', handleSync);

    // Periodic check every 15s to pick up changes from other devices while app is open
    const periodicInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        triggerBackupAndSync(false);
      }
    }, 15000);

    return () => {
      document.removeEventListener('visibilitychange', handleSync);
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('blur', handleSync);
      window.removeEventListener('pageshow', handleSync);
      window.removeEventListener('pagehide', handleSync);
      clearInterval(periodicInterval);
    };
  }, [initStorage, triggerBackupAndSync, refreshBackupStatus]);

  // Automatically request directory handle permission on the user's first tap/touch/key press
  // when a sync folder is configured in IndexedDB but browser session permission is 'prompt'
  useEffect(() => {
    if (!backupStatus?.folderName || backupStatus.permission !== 'prompt') return;
    let triggered = false;
    const handleFirstGesture = () => {
      if (triggered) return;
      triggered = true;
      cleanup();
      void reconnectBackupFolder();
    };
    const cleanup = () => {
      window.removeEventListener('click', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('touchstart', handleFirstGesture);
    };
    window.addEventListener('click', handleFirstGesture, { once: true, passive: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true, passive: true });
    window.addEventListener('pointerdown', handleFirstGesture, { once: true, passive: true });
    window.addEventListener('touchstart', handleFirstGesture, { once: true, passive: true });
    return cleanup;
  }, [backupStatus?.folderName, backupStatus?.permission, reconnectBackupFolder]);

  // Global Keyboard shortcuts with strict modifier protection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is holding modifiers (Cmd/Ctrl/Alt) or typing inside inputs
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      if (e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setQuickAddOpen(true);
      } else if (e.key === '1') {
        setCurrentView('today');
      } else if (e.key === '2') {
        setCurrentView('calendar');
      } else if (e.key === '3') {
        setCurrentView('habits');
      } else if (e.key === '4') {
        setCurrentView('completed');
      } else if (e.key === '5') {
        setCurrentView('character');
      } else if (e.key === '?') {
        setHelpModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setQuickAddOpen, setHelpModalOpen, setCurrentView]);

  const renderMainContent = () => {
    if (currentView === 'habits') {
      return <HabitTrackerView />;
    }

    if (currentView === 'library') {
      return <LibraryView />;
    }

    if (currentView === 'character') {
      return <CharacterView />;
    }

    if (currentView === 'calendar' || currentView === 'upcoming') {
      return <TaskCalendarView />;
    }

    if (currentView === 'completed') {
      return <TaskListView />;
    }

    if (displayMode === 'timeline') {
      return <TaskTimelineView />;
    }

    return <TaskListView />;
  };

  return (
    <div className="h-[100dvh] min-h-[100dvh] w-screen flex flex-col bg-[#FBFBF9] text-[#1C1917] overflow-hidden font-sans">
      {/* Native macOS Window Header */}
      <WindowHeader />

      {/* Persistence Error Banner */}
      {storageError && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-900 flex items-center justify-between transition-all select-none z-20">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-700 flex-shrink-0" />
            <span className="font-sans text-[11px] leading-tight">{storageError}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                clearStorageError();
                initStorage();
              }}
              className="px-2 py-0.5 text-[11px] font-sans font-medium text-amber-900 bg-amber-200/80 hover:bg-amber-200 rounded-mac transition-colors cursor-pointer"
            >
              Retry
            </button>
            <button
              onClick={() => clearStorageError()}
              className="p-1 text-amber-700 hover:text-amber-900 hover:bg-amber-200/50 rounded transition-colors cursor-pointer"
              title="Dismiss error"
              aria-label="Dismiss storage error"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Reconnect / Overdue Sync Banner */}
      <SyncBanner />

      {/* Main Container: Sidebar + Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Finder-style Sidebar */}
        <Sidebar />

        {/* Content canvas with generous negative space & readable text selection */}
        <main className="flex-1 overflow-y-auto bg-[#FBFBF9] relative select-text pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          {renderMainContent()}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileNavBar />

      {/* Standalone Quick Add Modal (Triggered by 'Q', header, or bottom nav button) */}
      {quickAddOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:pt-24 bg-black/35 backdrop-blur-xs p-0 sm:p-4 pb-[env(safe-area-inset-bottom,0px)] animate-in fade-in duration-150"
          onClick={() => setQuickAddOpen(false)}
        >
          <div className="w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
            <QuickAddBar
              defaultDueDate={quickAddDefaultDate || undefined}
              onClose={() => setQuickAddOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Gallery-Grade Undo Toast */}
      {deletedTaskToast && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-3 px-4 py-2 bg-stone-900 text-stone-100 rounded-sheet shadow-modal border border-stone-800 text-xs font-sans">
            <span className="truncate max-w-[200px] sm:max-w-[320px]">
              Task deleted
            </span>
            <div className="flex items-center gap-2.5 border-l border-stone-700/80 pl-3">
              <button
                onClick={undoDeleteTask}
                className="text-amber-400 hover:text-amber-300 font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:underline min-h-[32px] flex items-center"
              >
                Undo
              </button>
              <button
                onClick={dismissDeletedTaskToast}
                className="p-1 text-stone-400 hover:text-stone-200 transition-colors cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Slide-over / Modal */}
      {taskDetailId && <TaskDetailModal />}

      {/* Command Palette (Cmd+K) */}
      <CommandPalette />

      {/* Project & Linked Skill Modal */}
      {newProjectModalOpen && <NewProjectModal />}

      {/* Edit Project Modal */}
      {editingProjectId && <EditProjectModal />}

      {/* Habit Creation & Editing Modal */}
      {(newHabitModalOpen || editingHabitId) && <HabitModal />}

      {/* Local Storage & Backup Modal */}
      {backupModalOpen && <BackupModal />}

      {/* Celebration & Level-Up Modal */}
      {celebration && <CelebrationModal />}

      {/* System Guide & Syntax Reference Modal */}
      {helpModalOpen && <HelpModal />}

      {/* First-Time Welcome & Character Setup Modal */}
      {onboardingModalOpen && <OnboardingModal />}

      {/* Character Profile & Chosen Skills PDF Export Modal */}
      {exportPdfModalOpen && <ExportCharacterPdfModal />}
    </div>
  );
};

export default App;
