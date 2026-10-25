import React, { useState } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { RefreshCw, X, FolderSync, Clock } from 'lucide-react';

import { useShallow } from 'zustand/react/shallow';

export const SyncBanner: React.FC = () => {
  const {
    backupStatus,
    reconnectBackupFolder,
    triggerBackupAndSync,
    setBackupModalOpen,
    isSyncing,
  } = useEkirumStore(
    useShallow((s) => ({
      backupStatus: s.backupStatus,
      reconnectBackupFolder: s.reconnectBackupFolder,
      triggerBackupAndSync: s.triggerBackupAndSync,
      setBackupModalOpen: s.setBackupModalOpen,
      isSyncing: s.isSyncing,
    }))
  );

  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !backupStatus) return null;

  const isPermissionPrompt = backupStatus.permission === 'prompt';
  const isOverdue = backupStatus.isOverdue;

  if (!isPermissionPrompt && !isOverdue) return null;

  return (
    <div className="bg-amber-50/90 border-b border-amber-200/90 px-4 py-2.5 text-xs text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 transition-all select-none z-20">
      <div className="flex items-center gap-2">
        {isPermissionPrompt ? (
          <FolderSync size={14} className="text-amber-700 flex-shrink-0" />
        ) : (
          <Clock size={14} className="text-amber-700 flex-shrink-0" />
        )}

        <span>
          {isPermissionPrompt ? (
            <>
              Folder sync disconnected for <strong>{backupStatus.folderName || 'backup folder'}</strong>. Reconnect to resume automatic backups.
            </>
          ) : (
            <>
              Backup is overdue (last backup was over 48 hours ago).
            </>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
        {isPermissionPrompt ? (
          <button
            onClick={async () => {
              const res = await reconnectBackupFolder();
              if (!res.success) {
                await useEkirumStore.getState().selectBackupFolder();
              }
            }}
            disabled={isSyncing}
            className="min-h-[34px] px-3 py-1.5 text-xs font-medium text-white bg-amber-700 hover:bg-amber-800 rounded-mac shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
            <span>Reconnect</span>
          </button>
        ) : (
          <button
            onClick={() => triggerBackupAndSync(true, true)}
            disabled={isSyncing}
            className="min-h-[34px] px-3 py-1.5 text-xs font-medium text-white bg-amber-700 hover:bg-amber-800 rounded-mac shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
            <span>Back up now</span>
          </button>
        )}

        <button
          onClick={() => setBackupModalOpen(true)}
          className="min-h-[34px] flex items-center text-xs text-amber-800 underline hover:text-amber-950 px-1.5 cursor-pointer"
        >
          Settings
        </button>

        <button
          onClick={() => setDismissed(true)}
          className="min-w-[34px] min-h-[34px] flex items-center justify-center p-1.5 text-amber-600 hover:text-amber-900 rounded cursor-pointer"
          title="Dismiss banner"
          aria-label="Dismiss banner"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
