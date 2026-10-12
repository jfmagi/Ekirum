import { db, getOrCreateDeviceId } from './db';
import { exportAll, importAndMerge, compactTombstones, MergeResult } from './syncEngine';
import { BackupFolderPermission } from '../types';
import { formatLocalDate } from './dateParser';

const HANDLE_KEY = 'backupDirectoryHandle';
const CONFIG_KEY = 'backupConfig';

export interface BackupStatus {
  hasFileSystemSupport: boolean;
  folderName: string | null;
  lastBackupAt: string | null;
  lastSyncAt: string | null;
  permission: BackupFolderPermission;
  isOverdue: boolean;
  deviceId: string;
}

/**
 * Check if the browser supports the File System Access API.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Retrieve the saved FileSystemDirectoryHandle from IndexedDB.
 */
export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const record = await db.settings.get(HANDLE_KEY);
    return record?.value as FileSystemDirectoryHandle || null;
  } catch (err) {
    console.warn('Failed to retrieve directory handle:', err);
    return null;
  }
}

/**
 * Save directory handle into IndexedDB.
 */
export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await db.settings.put({ key: HANDLE_KEY, value: handle });
  await db.settings.put({
    key: CONFIG_KEY,
    value: {
      folderName: handle.name,
      updatedAt: new Date().toISOString(),
    },
  });
}

/**
 * Query or request permission on the directory handle.
 */
export async function verifyHandlePermission(
  handle: FileSystemDirectoryHandle,
  requestIfNeeded = false
): Promise<BackupFolderPermission> {
  try {
    const query = await (handle as any).queryPermission({ mode: 'readwrite' });
    if (query === 'granted') return 'granted';
    if (!requestIfNeeded) return 'prompt';

    const req = await (handle as any).requestPermission({ mode: 'readwrite' });
    return req === 'granted' ? 'granted' : 'denied';
  } catch (err) {
    console.warn('Handle permission check error:', err);
    return 'prompt';
  }
}

/**
 * Get current backup and sync status.
 */
export async function getBackupStatus(): Promise<BackupStatus> {
  const hasSupport = isFileSystemAccessSupported();
  const deviceId = await getOrCreateDeviceId();
  const lastBackup = await db.settings.get('lastBackupAt');
  const lastSync = await db.settings.get('lastSyncAt');
  const config = await db.settings.get(CONFIG_KEY);

  const lastBackupAt = (lastBackup?.value as string) || null;
  const lastSyncAt = (lastSync?.value as string) || null;
  const folderName = (config?.value?.folderName as string) || null;

  if (!hasSupport) {
    return {
      hasFileSystemSupport: false,
      folderName: null,
      lastBackupAt,
      lastSyncAt,
      permission: 'unsupported',
      isOverdue: Boolean(lastBackupAt && Date.now() - new Date(lastBackupAt).getTime() > 48 * 3600 * 1000),
      deviceId,
    };
  }

  const handle = await getSavedDirectoryHandle();
  if (!handle) {
    return {
      hasFileSystemSupport: true,
      folderName: null,
      lastBackupAt,
      lastSyncAt,
      permission: 'not-configured',
      isOverdue: false,
      deviceId,
    };
  }

  const permission = await verifyHandlePermission(handle, false);
  const isOverdue = Boolean(
    lastBackupAt && (Date.now() - new Date(lastBackupAt).getTime()) > 48 * 3600 * 1000
  );

  return {
    hasFileSystemSupport: true,
    folderName: handle.name || folderName,
    lastBackupAt,
    lastSyncAt,
    permission,
    isOverdue,
    deviceId,
  };
}

/**
 * Open folder picker and save the selected directory.
 */
export async function pickBackupDirectory(): Promise<{ success: boolean; name?: string; error?: string }> {
  if (!isFileSystemAccessSupported()) {
    return { success: false, error: 'File System Access API is not supported in this browser.' };
  }

  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });

    if (!handle) {
      return { success: false, error: 'No directory selected.' };
    }

    await saveDirectoryHandle(handle);

    // Immediately trigger initial backup and sync
    await performBackup(handle, true);
    await syncDeviceFiles(handle);

    return { success: true, name: handle.name };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Folder selection was canceled.' };
    }
    return { success: false, error: err.message || 'Failed to select directory.' };
  }
}

/**
 * Prompt user to reconnect permission for the existing directory handle.
 */
export async function reconnectBackupDirectory(): Promise<boolean> {
  const handle = await getSavedDirectoryHandle();
  if (!handle) return false;

  const perm = await verifyHandlePermission(handle, true);
  if (perm === 'granted') {
    // Perform catch-up backup and sync
    await performBackup(handle, false);
    await syncDeviceFiles(handle);
    return true;
  }
  return false;
}

/**
 * Execute backup write to the directory handle.
 */
async function performBackup(
  handle: FileSystemDirectoryHandle,
  force = false
): Promise<boolean> {
  const deviceId = await getOrCreateDeviceId();
  const lastBackup = await db.settings.get('lastBackupAt');
  const lastBackupAt = lastBackup?.value as string;

  const hoursSince = lastBackupAt
    ? (Date.now() - new Date(lastBackupAt).getTime()) / (3600 * 1000)
    : 999;

  if (!force && hoursSince < 24) {
    return false; // Backup is fresh (<24h)
  }

  const backupData = await exportAll(deviceId);
  const jsonContent = JSON.stringify(backupData, null, 2);

  const todayStr = formatLocalDate();
  const dailyFileName = `backup-${todayStr}.json`;
  const deviceFileName = `device-${deviceId}.json`;

  try {
    // 1. Write daily snapshot: backup-YYYY-MM-DD.json
    const dailyFileHandle = await handle.getFileHandle(dailyFileName, { create: true });
    const dailyWritable = await (dailyFileHandle as any).createWritable();
    await dailyWritable.write(jsonContent);
    await dailyWritable.close();

    // 2. Write device-specific file: device-<deviceId>.json for serverless sync
    const deviceFileHandle = await handle.getFileHandle(deviceFileName, { create: true });
    const deviceWritable = await (deviceFileHandle as any).createWritable();
    await deviceWritable.write(jsonContent);
    await deviceWritable.close();

    // Update timestamp
    const nowIso = new Date().toISOString();
    await db.settings.put({ key: 'lastBackupAt', value: nowIso });

    // 3. Compact tombstones older than 60 days to keep tables bounded
    await compactTombstones(60).catch((err) => console.warn('Tombstone compaction skipped:', err));

    // 4. Prune old daily backups (keep last 14)
    await pruneOldBackups(handle);

    return true;
  } catch (err) {
    console.error('Backup write failed:', err);
    return false;
  }
}

/**
 * Keep the last 14 backup-YYYY-MM-DD.json files, deleting older ones.
 */
export async function pruneOldBackups(handle: FileSystemDirectoryHandle): Promise<number> {
  try {
    const backupFiles: string[] = [];

    // Iterate directory entries
    for await (const entry of (handle as any).values()) {
      if (entry.kind === 'file' && entry.name.startsWith('backup-') && entry.name.endsWith('.json')) {
        backupFiles.push(entry.name);
      }
    }

    // Sort ascending (YYYY-MM-DD lexicographical sorting matches chronological order)
    backupFiles.sort();

    const maxKeep = 14;
    let prunedCount = 0;

    if (backupFiles.length > maxKeep) {
      const filesToRemove = backupFiles.slice(0, backupFiles.length - maxKeep);
      for (const fileName of filesToRemove) {
        try {
          await handle.removeEntry(fileName);
          prunedCount++;
        } catch (e) {
          console.warn(`Could not prune old backup ${fileName}:`, e);
        }
      }
    }

    return prunedCount;
  } catch (err) {
    console.warn('Pruning old backups error:', err);
    return 0;
  }
}

export const SYNC_THROTTLE_MS = 30 * 1000;
let isBackupSyncRunning = false;

export interface BackupAndSyncResult {
  success: boolean;
  totalChanges: number;
}

/**
 * Scan the shared backup folder for other device-<id>.json files and merge them in.
 */
export async function syncDeviceFiles(
  handle: FileSystemDirectoryHandle,
  force = false
): Promise<{ filesProcessed: number; mergeResult?: MergeResult }> {
  try {
    const now = Date.now();
    if (!force) {
      const lastSyncRecord = await db.settings.get('lastSyncAt');
      if (lastSyncRecord && typeof lastSyncRecord.value === 'string') {
        const elapsed = now - new Date(lastSyncRecord.value).getTime();
        if (elapsed < SYNC_THROTTLE_MS) {
          return {
            filesProcessed: 0,
            mergeResult: {
              success: true,
              stats: {},
              totalChanges: 0,
            },
          };
        }
      }
    }

    const localDeviceId = await getOrCreateDeviceId();
    let totalMergedChanges = 0;
    let filesProcessed = 0;
    let filesFailed = 0;

    const syncMtimesRecord = await db.settings.get('deviceSyncMtimes');
    const syncMtimes: Record<string, number> =
      syncMtimesRecord?.value && typeof syncMtimesRecord.value === 'object'
        ? { ...syncMtimesRecord.value }
        : {};
    let mtimesChanged = false;

    const MAX_DEVICE_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

    for await (const entry of (handle as any).values()) {
      if (
        entry.kind === 'file' &&
        entry.name.startsWith('device-') &&
        entry.name.endsWith('.json') &&
        entry.name !== `device-${localDeviceId}.json` &&
        !entry.name.startsWith('.') &&
        !entry.name.includes('.tmp')
      ) {
        try {
          const file = await entry.getFile();
          const prevMtime = syncMtimes[entry.name] || 0;

          // Reject files exceeding max safe payload size
          if (file.size > MAX_DEVICE_FILE_SIZE) {
            console.warn(`Device file ${entry.name} exceeds 25 MB limit (${file.size} bytes). Skipping.`);
            filesFailed++;
            continue;
          }

          // If the file was not modified since last successful import, skip reading and parsing
          if (file.lastModified <= prevMtime) {
            continue;
          }

          const text = await file.text();
          const data = JSON.parse(text);

          const mergeRes = await importAndMerge(data);
          if (mergeRes.success) {
            filesProcessed++;
            totalMergedChanges += mergeRes.totalChanges;
            syncMtimes[entry.name] = file.lastModified;
            mtimesChanged = true;
          } else {
            filesFailed++;
            console.warn(`Error merging device sync file ${entry.name}:`, mergeRes.error);
          }
        } catch (e) {
          filesFailed++;
          console.warn(`Error reading device sync file ${entry.name}:`, e);
        }
      }
    }

    if (mtimesChanged) {
      await db.settings.put({ key: 'deviceSyncMtimes', value: syncMtimes });
    }

    const nowIso = new Date(now).toISOString();
    await db.settings.put({ key: 'lastSyncAt', value: nowIso });

    return {
      filesProcessed,
      mergeResult: {
        success: filesFailed === 0,
        stats: {},
        totalChanges: totalMergedChanges,
      },
    };
  } catch (err) {
    console.warn('syncDeviceFiles error:', err);
    return { filesProcessed: 0 };
  }
}

/**
 * Automated lifecycle check: called on app mount and on visibilitychange.
 */
export async function maybeBackupAndSync(force = false): Promise<BackupAndSyncResult> {
  if (isBackupSyncRunning) {
    return { success: false, totalChanges: 0 };
  }

  isBackupSyncRunning = true;
  try {
    if (!isFileSystemAccessSupported()) return { success: false, totalChanges: 0 };

    const handle = await getSavedDirectoryHandle();
    if (!handle) return { success: false, totalChanges: 0 };

    const perm = await verifyHandlePermission(handle, false);
    if (perm !== 'granted') {
      return { success: false, totalChanges: 0 };
    }

    // 1. Check if backup is needed or forced
    await performBackup(handle, force);

    // 2. Sync with other devices in the shared folder
    const syncRes = await syncDeviceFiles(handle, force);
    const totalChanges = syncRes.mergeResult?.totalChanges || 0;

    return { success: true, totalChanges };
  } catch (err) {
    console.warn('maybeBackupAndSync error:', err);
    return { success: false, totalChanges: 0 };
  } finally {
    isBackupSyncRunning = false;
  }
}
