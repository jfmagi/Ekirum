import React, { useState, useRef, useEffect } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { db, regenerateDeviceId } from '../../lib/db';
import { formatLocalDate } from '../../lib/dateParser';
import {
  Download,
  Upload,
  Copy,
  Check,
  HardDrive,
  ShieldCheck,
  RotateCcw,
  AlertCircle,
  X,
  FolderSync,
  RefreshCw,
  FolderOpen,
  Laptop,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { APP_VERSION, APP_CACHE_NAME, APP_BUILD_DATE } from '../../version';

import { useShallow } from 'zustand/react/shallow';

export const BackupModal: React.FC = () => {
  const {
    backupModalOpen,
    setBackupModalOpen,
    tasks,
    projects,
    skills,
    habits,
    user,
    backupStatus,
    isSyncing,
    refreshBackupStatus,
    selectBackupFolder,
    reconnectBackupFolder,
    triggerBackupAndSync,
    exportBackupJson,
    importBackupJson,
    restoreSafetySnapshot,
    clearAllData,
  } = useEkirumStore(
    useShallow((s) => ({
      backupModalOpen: s.backupModalOpen,
      setBackupModalOpen: s.setBackupModalOpen,
      tasks: s.tasks,
      projects: s.projects,
      skills: s.skills,
      habits: s.habits,
      user: s.user,
      backupStatus: s.backupStatus,
      isSyncing: s.isSyncing,
      refreshBackupStatus: s.refreshBackupStatus,
      selectBackupFolder: s.selectBackupFolder,
      reconnectBackupFolder: s.reconnectBackupFolder,
      triggerBackupAndSync: s.triggerBackupAndSync,
      exportBackupJson: s.exportBackupJson,
      importBackupJson: s.importBackupJson,
      restoreSafetySnapshot: s.restoreSafetySnapshot,
      clearAllData: s.clearAllData,
    }))
  );

  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    stats?: { tasks: number; projects: number; habits: number; skills: number };
  } | null>(null);
  const [hasSafetySnapshot, setHasSafetySnapshot] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false;
    const hasCurrent = Boolean(localStorage.getItem('ekirum-safety-snapshot'));
    if (hasCurrent) return true;
    const legacy =
      localStorage.getItem('ekitero-safety-snapshot') ||
      localStorage.getItem('taskocraft-safety-snapshot') ||
      localStorage.getItem('doist-safety-snapshot');
    if (legacy) {
      localStorage.setItem('ekirum-safety-snapshot', legacy);
      localStorage.removeItem('ekitero-safety-snapshot');
      localStorage.removeItem('taskocraft-safety-snapshot');
      localStorage.removeItem('doist-safety-snapshot');
      return true;
    }
    return false;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setBackupModalOpen(false);
    setImportResult(null);
    setImportText('');
    setShowPasteArea(false);
    setActionMessage(null);
  };

  useEffect(() => {
    if (backupModalOpen) {
      refreshBackupStatus();
      // Check if safety snapshot exists in IndexedDB settings table or localStorage
      db.settings.get('safetySnapshot').then((record) => {
        if (record?.value) {
          setHasSafetySnapshot(true);
        } else {
          const hasLocal = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('ekirum-safety-snapshot'));
          setHasSafetySnapshot(hasLocal);
        }
      }).catch(() => {
        const hasLocal = typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('ekirum-safety-snapshot'));
        setHasSafetySnapshot(hasLocal);
      });
    }
  }, [backupModalOpen, refreshBackupStatus]);

  useEffect(() => {
    if (!backupModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [backupModalOpen]);

  if (!backupModalOpen) return null;

  // 1. One-click Download Backup file
  const handleDownloadBackup = async () => {
    try {
      const jsonStr = await exportBackupJson();
      const now = new Date();
      const dateStr = formatLocalDate(now);
      const timeStr = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
      const filename = `ekirum-backup-${dateStr}_${timeStr}.json`;

      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setActionMessage('Backup file downloaded.');
      setTimeout(() => setActionMessage(null), 3000);
    } catch (e) {
      console.error('Download backup error:', e);
    }
  };

  // 2. Copy JSON string to clipboard
  const handleCopyClipboard = async () => {
    try {
      const jsonStr = await exportBackupJson();
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Clipboard copy error:', e);
    }
  };

  // 3. Handle File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_UPLOAD_SIZE = 25 * 1024 * 1024; // 25 MB
    if (file.size > MAX_UPLOAD_SIZE) {
      setImportResult({
        success: false,
        message: `File exceeds maximum allowed size of 25 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`,
      });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      await handleApplyImport(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 4. Apply Import & Merge
  const handleApplyImport = async (jsonStr: string) => {
    const res = await importBackupJson(jsonStr);
    if (res.success && res.stats) {
      setImportResult({
        success: true,
        message: `Merged ${res.stats.tasks} tasks, ${res.stats.projects} projects, ${res.stats.habits} habits, and ${res.stats.skills} skills.`,
        stats: res.stats,
      });
      setHasSafetySnapshot(true);
    } else {
      setImportResult({
        success: false,
        message: res.error || 'Failed to merge backup data.',
      });
    }
  };

  // 5. Restore Safety Snapshot
  const handleRestoreSafety = async () => {
    const ok = await restoreSafetySnapshot();
    if (ok) {
      setImportResult({
        success: true,
        message: 'Reverted to previous safety snapshot.',
      });
    }
  };

  // 6. Select Folder
  const handleSelectFolder = async () => {
    const res = await selectBackupFolder();
    if (res.success) {
      if ((res as any).totalChanges > 0) {
        setActionMessage(
          `Connected "${res.name}" — synced ${(res as any).totalChanges} update${(res as any).totalChanges === 1 ? '' : 's'} from ${(res as any).filesProcessed || 1} file${(res as any).filesProcessed === 1 ? '' : 's'}.`
        );
      } else if ((res as any).filesProcessed > 0) {
        setActionMessage(`Connected "${res.name}" — checked ${(res as any).filesProcessed} file${(res as any).filesProcessed === 1 ? '' : 's'}, already up to date.`);
      } else {
        setActionMessage(`Connected "${res.name}" (no other device files found in this folder).`);
      }
      setTimeout(() => setActionMessage(null), 5000);
    } else if (res.error) {
      setActionMessage(res.error);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  // 7. Reconnect Folder
  const handleReconnect = async () => {
    const res = await reconnectBackupFolder();
    if (res.success) {
      if (res.totalChanges > 0) {
        setActionMessage(`Folder reconnected and synced (${res.totalChanges} update${res.totalChanges === 1 ? '' : 's'} applied).`);
      } else if (res.filesProcessed > 0) {
        setActionMessage(`Folder reconnected — checked ${res.filesProcessed} file${res.filesProcessed === 1 ? '' : 's'}, already up to date.`);
      } else {
        setActionMessage('Folder reconnected (no other device files found in this folder).');
      }
      setTimeout(() => setActionMessage(null), 5000);
    } else {
      // On Android Chrome, stored directory handles often lose OS permission permanently across restarts
      // and require opening the folder picker directly.
      const pickRes = await selectBackupFolder();
      if (pickRes.success) {
        if ((pickRes as any).totalChanges > 0) {
          setActionMessage(
            `Reconnected "${pickRes.name}" — synced ${(pickRes as any).totalChanges} update${(pickRes as any).totalChanges === 1 ? '' : 's'}.`
          );
        } else {
          setActionMessage(`Reconnected folder: ${pickRes.name}`);
        }
        setTimeout(() => setActionMessage(null), 5000);
      } else {
        setActionMessage(pickRes.error || res.error || 'Could not reconnect folder. Please tap Change Folder.');
        setTimeout(() => setActionMessage(null), 4000);
      }
    }
  };

  const [updateChecking, setUpdateChecking] = useState(false);

  const handleCheckForUpdates = async () => {
    setUpdateChecking(true);
    setActionMessage('Clearing cache and checking for updates...');
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update();
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }
    } catch (e) {
      console.warn('Update check failed:', e);
    }
    setTimeout(() => {
      window.location.href = window.location.origin + window.location.pathname + '?_v=' + Date.now();
    }, 800);
  };

  // 8. Manual Sync Trigger
  const handleSyncNow = async () => {
    const res = await triggerBackupAndSync(true, true);
    if (res.success) {
      if (res.totalChanges > 0) {
        setActionMessage(
          `Sync complete (${res.totalChanges} change${res.totalChanges === 1 ? '' : 's'} applied).`
        );
      } else if (res.filesProcessed > 0) {
        setActionMessage('Sync complete — already up to date.');
      } else {
        setActionMessage('Backup saved to sync folder.');
      }
      setTimeout(() => setActionMessage(null), 3500);
    } else {
      setActionMessage('Sync incomplete. Verify folder permissions.');
      setTimeout(() => setActionMessage(null), 3500);
    }
  };

  // 8b. Regenerate Device ID (fixes multi-device ID collision)
  const handleRegenerateId = async () => {
    if (
      window.confirm(
        'Generate a new unique Sync Device ID for this browser? This ensures this device has its own identity and syncs separately from your other devices.'
      )
    ) {
      try {
        await regenerateDeviceId();
        await refreshBackupStatus();
        const res = await triggerBackupAndSync(true, true);
        if (res.success) {
          setActionMessage('New Device ID generated and synced.');
        } else {
          setActionMessage('New Device ID generated.');
        }
        setTimeout(() => setActionMessage(null), 3500);
      } catch (err) {
        console.warn('Regenerate device ID error:', err);
      }
    }
  };

  // Format relative timestamp
  const formatTime = (iso?: string | null) => {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const handleCleanSlate = async () => {
    if (window.confirm('Are you sure you want to delete all tasks, projects, and habits, and start completely fresh? This will reset all data to a clean slate.')) {
      await clearAllData();
      setActionMessage('All data has been cleared. Clean slate active.');
      setTimeout(() => setActionMessage(null), 3000);
    }
  };

  const hasFs = backupStatus?.hasFileSystemSupport ?? false;
  const permission = backupStatus?.permission ?? 'not-configured';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/35 backdrop-blur-xs p-0 sm:p-4 pb-[env(safe-area-inset-bottom,0px)] animate-in fade-in duration-150"
      onClick={close}
    >
      <div
        className="w-full max-w-xl bg-white rounded-t-sheet sm:rounded-sheet border border-stone-200/90 shadow-modal overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-mac bg-stone-100 border border-stone-200 flex items-center justify-center text-charcoal">
              <HardDrive size={14} />
            </div>
            <div>
              <h3 className="font-serif text-base font-semibold text-charcoal">
                Data Safety & Backup
              </h3>
              <span className="text-[11px] text-stone-500 font-sans">
                100% Private Offline Storage • Automatic Cloud Drive Sync
              </span>
            </div>
          </div>
          <button
            onClick={close}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-stone-500 hover:text-stone-800 p-2 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Action toast message */}
          {actionMessage && (
            <div className="p-2.5 rounded-mac bg-stone-900 text-white text-xs font-mono flex items-center justify-between animate-in fade-in duration-150">
              <span>{actionMessage}</span>
              <button onClick={() => setActionMessage(null)} className="opacity-70 hover:opacity-100">
                <X size={12} />
              </button>
            </div>
          )}

          {/* Privacy & Storage Banner */}
          <div className="flex items-start gap-3 p-3.5 bg-stone-50/80 border border-stone-200/80 rounded-card text-xs">
            <ShieldCheck size={16} className="text-emerald-700 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-medium text-charcoal">100% Private & Saved on Your Device</div>
              <p className="text-stone-600 leading-relaxed font-sans">
                Your tasks, projects, habits, and rank progress are saved right on this computer. There are no tracking servers, no passwords, and no subscription lock-in. Your data is 100% yours.
              </p>
            </div>
          </div>

          {/* Why Backups Matter Banner */}
          <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-card space-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
              <HardDrive size={13} className="text-amber-700" />
              <span>Why backups matter</span>
            </div>
            <p className="text-amber-950/80 leading-relaxed font-sans text-[11px]">
              Because your data is stored locally in your browser, <strong>clearing your browsing history or cache will reset your workspace</strong>. Keeping a downloaded backup or connecting an automatic sync folder ensures your tasks, streaks, and character levels are always safe and recoverable.
            </p>
          </div>

          {/* SECTION 1: Automated Sync Folder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <FolderSync size={14} className="text-crimson" />
                <span className="text-xs font-mono uppercase tracking-wider text-stone-600 font-semibold">
                  Automatic Backup & Cloud Sync
                </span>
              </div>
              {backupStatus?.deviceId && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-stone-500 flex items-center gap-1" title="Device ID">
                    <Laptop size={11} />
                    <span>{backupStatus.deviceId.slice(0, 12)}…</span>
                  </span>
                  <button
                    onClick={handleRegenerateId}
                    disabled={isSyncing}
                    title="Regenerate unique Device ID for this browser (fixes sync if two devices share the same ID)"
                    className="text-[10px] text-stone-600 hover:text-charcoal px-1.5 py-0.5 rounded bg-stone-100 hover:bg-stone-200 transition-colors font-mono cursor-pointer disabled:opacity-50"
                  >
                    Reset ID
                  </button>
                </div>
              )}
            </div>

            {hasFs ? (
              <div className="border border-stone-200 rounded-card p-4 bg-stone-50/40 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium text-charcoal flex items-center gap-2">
                      <FolderOpen size={13} className="text-stone-500" />
                      <span>{backupStatus?.folderName || 'No sync folder selected'}</span>
                      {permission === 'granted' && (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-1.5 py-0.2 rounded-full font-mono flex items-center gap-1">
                          <CheckCircle2 size={10} /> Connected
                        </span>
                      )}
                      {permission === 'prompt' && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200/70 px-1.5 py-0.2 rounded-full font-mono">
                          Reconnection needed
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-stone-500 font-mono flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>Last backup: {formatTime(backupStatus?.lastBackupAt)}</span>
                      {backupStatus?.lastSyncAt && (
                        <span>• Synced: {formatTime(backupStatus?.lastSyncAt)}</span>
                      )}
                      {permission === 'granted' && backupStatus?.foreignDeviceCount !== undefined && (
                        <span>
                          • {backupStatus.foreignDeviceCount > 0
                            ? `${backupStatus.foreignDeviceCount} other device file${backupStatus.foreignDeviceCount === 1 ? '' : 's'}`
                            : 'No other device files'}
                        </span>
                      )}
                      {permission === 'granted' && backupStatus?.dailyBackupCount !== undefined && backupStatus.dailyBackupCount > 0 && (
                        <span title="Daily backup archive snapshots (retains the last 14 days)">
                          • {backupStatus.dailyBackupCount} daily snapshot{backupStatus.dailyBackupCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {permission === 'prompt' ? (
                      <button
                        onClick={handleReconnect}
                        disabled={isSyncing}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-mac transition-colors flex items-center gap-1"
                      >
                        <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
                        <span>Reconnect</span>
                      </button>
                    ) : permission === 'granted' ? (
                      <button
                        onClick={handleSyncNow}
                        disabled={isSyncing}
                        className="px-2.5 py-1 text-xs text-stone-600 bg-white border border-stone-200 hover:border-stone-300 rounded-mac shadow-2xs transition-colors flex items-center gap-1"
                        title="Sync now"
                      >
                        <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''} />
                        <span>Sync Now</span>
                      </button>
                    ) : null}

                    <button
                      onClick={handleSelectFolder}
                      disabled={isSyncing}
                      className="px-3 py-1.5 text-xs font-medium text-charcoal bg-white border border-stone-200 hover:border-stone-300 rounded-mac shadow-2xs transition-colors"
                    >
                      {backupStatus?.folderName ? 'Change Folder' : 'Select Folder…'}
                    </button>
                  </div>
                </div>

                {/* Overdue Warning */}
                {backupStatus?.isOverdue && (
                  <div className="p-2.5 rounded-mac bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                    <Clock size={14} className="text-amber-600 flex-shrink-0" />
                    <span>Backup is overdue (last backup was over 48 hours ago). Reconnect or sync now.</span>
                  </div>
                )}

                {/* Last Sync Diagnostics */}
                {backupStatus?.lastSyncReport && (
                  <div className="p-2.5 rounded-mac bg-stone-100/80 border border-stone-200 text-[11px] font-mono space-y-1">
                    <div className="flex items-center justify-between text-stone-600 font-semibold">
                      <span>Folder Scan: {backupStatus.lastSyncReport.entryCount} total files inspected</span>
                      <span className="text-[10px] text-stone-600">ID: {backupStatus.lastSyncReport.deviceId?.slice(0, 8)}…</span>
                    </div>
                    {backupStatus.lastSyncReport.items.length > 0 ? (
                      <ul className="space-y-0.5 max-h-32 overflow-y-auto pt-1 text-stone-600 divide-y divide-stone-200/50">
                        {backupStatus.lastSyncReport.items.map((item, idx) => (
                          <li key={idx} className="pt-0.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span className="truncate max-w-[280px]" title={item.name}>{item.name}</span>
                            <span className="text-stone-700 font-medium text-[10px]">{item.result}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-stone-600 text-[10px] italic">Folder is completely empty or no matching files found.</div>
                    )}
                  </div>
                )}

                {/* Simple Sync Explanation */}
                <div className="pt-2 border-t border-stone-200/70 text-[11px] text-stone-600 leading-relaxed font-sans space-y-1">
                  <div>
                    <strong>How folder sync works:</strong> Choose a folder inside your <em>iCloud Drive</em>, <em>Dropbox</em>, or <em>Google Drive</em>. Your changes are saved locally in your browser immediately. When you open Ekirum or switch back to this tab, it automatically checks the folder for updates from other devices, and writes daily backup snapshots. Click <strong>Sync Now</strong> anytime to immediately push your latest changes to the folder.
                  </div>
                  <div className="text-[10px] text-stone-500 font-mono">
                    Folder sync uses the File System Access API (supported in Chromium browsers on desktop and Android with folder support). In Safari, Firefox, or mobile browsers without folder access, use <em>Download Backup</em> and <em>Restore</em> below.
                  </div>
                </div>
              </div>
            ) : (
              /* Unsupported Browser Notice (Safari/Firefox) */
              <div className="border border-stone-200 rounded-card p-3.5 bg-stone-50/60 text-xs space-y-1.5">
                <div className="font-medium text-stone-700">Automatic folder selection requires the File System Access API</div>
                <p className="text-stone-600 font-sans leading-relaxed text-[11px]">
                  Supported in desktop Chrome, Edge, Brave, and compatible mobile browsers. In Safari, Firefox, or browsers without folder picker support, you can easily save and sync your data anytime using the <strong>Download Backup</strong> and <strong>Restore & Merge</strong> buttons below.
                </p>
              </div>
            )}
          </div>

          {/* SECTION 2: Manual Export */}
          <div className="space-y-3 pt-3 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-stone-600 font-semibold">
                Download or Copy a Backup
              </span>
              <span className="text-[11px] text-stone-500 font-mono font-medium">
                {tasks.length} tasks • {projects.length} projects • {habits.length} habits • {skills.length} skills (Ekirum Level {user.ekirumLevel ?? 1})
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Download JSON Button */}
              <button
                onClick={handleDownloadBackup}
                className="flex items-center justify-center gap-2 p-3 bg-white border border-stone-200 hover:border-stone-400 rounded-card shadow-xs hover:shadow-placard text-xs text-charcoal font-medium transition-all group focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
              >
                <Download size={14} className="text-crimson group-hover:scale-110 transition-transform" />
                <span>Download Backup (.json)</span>
              </button>

              {/* Copy to Clipboard Button */}
              <button
                onClick={handleCopyClipboard}
                className="flex items-center justify-center gap-2 p-3 bg-white border border-stone-200 hover:border-stone-400 rounded-card shadow-xs hover:shadow-placard text-xs text-charcoal font-medium transition-all group focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-emerald-600" />
                    <span className="text-emerald-700 font-medium">Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} className="text-stone-500 group-hover:scale-110 transition-transform" />
                    <span>Toss Jason onto your clipboard</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* SECTION 3: Restore / Merge From Backup */}
          <div className="space-y-3 pt-3 border-t border-stone-100">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-stone-600 font-semibold">
                Restore from a Backup
              </span>
              <button
                onClick={() => setShowPasteArea(!showPasteArea)}
                className="text-[11px] text-stone-600 hover:text-crimson transition-colors focus-visible:ring-1 focus-visible:ring-stone-400 rounded cursor-pointer"
              >
                {showPasteArea ? 'Hide text paste' : 'Paste JSON text instead'}
              </button>
            </div>

            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".json,application/json,text/plain,*/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Upload File Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-stone-200 hover:border-stone-400 hover:bg-stone-50/60 rounded-card p-4 text-center cursor-pointer transition-all group"
            >
              <div className="w-9 h-9 mx-auto rounded-full bg-stone-100 flex items-center justify-center text-stone-500 group-hover:text-charcoal mb-1.5 transition-colors">
                <Upload size={15} />
              </div>
              <div className="text-xs font-medium text-charcoal">
                Select a backup file to restore
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                Smart merge preserves your latest edits and combines tasks safely without losing anything.
              </p>
            </div>

            {/* Optional Paste Text Area */}
            {showPasteArea && (
              <div className="space-y-2 pt-2 animate-in fade-in duration-150">
                <textarea
                  rows={4}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste raw backup JSON text here..."
                  className="w-full text-xs font-mono p-3 bg-stone-50 border border-stone-200 rounded-card text-charcoal focus:bg-white focus:border-stone-400 focus:outline-none transition-colors placeholder-stone-500"
                />
                <div className="flex justify-end">
                  <button
                    disabled={!importText.trim()}
                    onClick={() => handleApplyImport(importText)}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-charcoal hover:bg-stone-800 disabled:opacity-40 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 cursor-pointer"
                  >
                    Merge Pasted JSON
                  </button>
                </div>
              </div>
            )}

            {/* Feedback notification if imported */}
            {importResult && (
              <div
                className={`p-3 rounded-mac border text-xs flex items-start gap-2.5 animate-in fade-in duration-200 ${
                  importResult.success
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                    : 'bg-red-50/70 border-red-200 text-red-800'
                }`}
              >
                {importResult.success ? (
                  <Check size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="font-medium">{importResult.success ? 'Data Merged Successfully' : 'Restore Error'}</div>
                  <div className="text-[11px] opacity-90 mt-0.5">{importResult.message}</div>
                </div>
              </div>
            )}
          </div>

          {/* Safety Snapshot Revert (Undo Restore) */}
          {hasSafetySnapshot && (
            <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
              <span className="text-[11px] text-stone-500 italic">
                Pre-merge safety snapshot preserved
              </span>
              <button
                onClick={handleRestoreSafety}
                className="inline-flex items-center gap-1 text-[11px] text-stone-600 hover:text-crimson font-medium transition-colors focus-visible:ring-1 focus-visible:ring-stone-400 rounded cursor-pointer"
                title="Revert to state before the last restore"
              >
                <RotateCcw size={11} />
                <span>Undo Last Merge</span>
              </button>
            </div>
          )}
          {/* Clean Slate / Reset Data */}
          <div className="pt-4 border-t border-stone-200/80 flex items-center justify-between text-xs">
            <div>
              <div className="font-medium text-stone-700">Clean Slate</div>
              <div className="text-[11px] text-stone-500">
                Purge all tasks, projects, habits, and reset character level.
              </div>
            </div>
            <button
              onClick={handleCleanSlate}
              className="px-2.5 py-1 text-xs font-medium text-red-600 hover:text-white hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-mac transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none"
            >
              Reset All Data
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 bg-stone-50/80 border-t border-stone-200 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-stone-500 font-mono">
            <span title={`Build date: ${APP_BUILD_DATE}`}>v{APP_VERSION} ({APP_CACHE_NAME})</span>
            <span className="text-stone-300">•</span>
            <button
              type="button"
              onClick={handleCheckForUpdates}
              disabled={updateChecking}
              className="text-[11px] text-stone-600 hover:text-stone-900 underline font-sans cursor-pointer flex items-center gap-1"
              title="Check for application updates and reload"
            >
              <RefreshCw size={10} className={updateChecking ? 'animate-spin text-crimson' : ''} />
              <span>{updateChecking ? 'Updating app...' : 'Check for app updates'}</span>
            </button>
          </div>
          <button
            onClick={close}
            className="w-full sm:w-auto px-4 py-1.5 text-xs font-medium text-white bg-charcoal hover:bg-stone-800 rounded-mac shadow-xs transition-colors cursor-pointer text-center"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
