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
  foreignDeviceCount?: number;
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
  await db.settings.delete('deviceSyncMtimes');
  await db.settings.delete('lastSyncAt');
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

  let foreignDeviceCount = 0;
  if (permission === 'granted') {
    try {
      const entries = await getDirectoryEntries(handle);
      for (const entry of entries) {
        if (entry.kind === 'file') {
          const c = classifySyncEntry(entry.name, deviceId);
          if (c.shouldProcess) {
            foreignDeviceCount++;
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    hasFileSystemSupport: true,
    folderName: handle.name || folderName,
    lastBackupAt,
    lastSyncAt,
    permission,
    isOverdue,
    deviceId,
    foreignDeviceCount,
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
    let handle: FileSystemDirectoryHandle | null = null;
    try {
      handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents',
      });
    } catch (pickerErr: any) {
      if (pickerErr.name === 'AbortError') throw pickerErr;
      handle = await (window as any).showDirectoryPicker();
    }

    if (!handle) {
      return { success: false, error: 'No directory selected.' };
    }

    await saveDirectoryHandle(handle);

    // 1. Immediately merge foreign devices from the selected folder
    await syncDeviceFiles(handle, true);
    // 2. Export local state to device-<id>.json so other devices can sync our data
    await writeDeviceFile(handle);
    // 3. Create initial daily backup snapshot
    await performDailyBackup(handle, true);

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
    await db.settings.delete('deviceSyncMtimes');
    await db.settings.delete('lastSyncAt');
    // Perform catch-up sync and backup
    await syncDeviceFiles(handle, true, true);
    await writeDeviceFile(handle);
    await performDailyBackup(handle, false);
    return true;
  }
  return false;
}

/**
 * Write a file using FileSystemFileHandle.createWritable().
 * Note: Chromium's createWritable() natively streams to an internal swap file and
 * commits atomically on close(). Writing directly to the target handle avoids
 * Android SAF renameDocument (.move) creating " (1)" duplicate files and avoids
 * cloud sync provider lock conflicts on .tmp files.
 */
export async function atomicWriteFile(
  handle: FileSystemDirectoryHandle,
  fileName: string,
  content: string
): Promise<void> {
  if (!handle || typeof (handle as any).getFileHandle !== 'function') return;

  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await (fileHandle as any).createWritable();
  await writable.write(content);
  await writable.close();

  // Clean up any legacy .tmp file left by older versions
  if (typeof (handle as any).removeEntry === 'function') {
    await handle.removeEntry(`${fileName}.tmp`).catch(() => {});
  }
}

/**
 * Export current local state and write atomically to device-<deviceId>.json.
 * This file is read by other devices to synchronize recent changes.
 */
export async function writeDeviceFile(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (!handle || typeof (handle as any).getFileHandle !== 'function') return false;
  try {
    const deviceId = await getOrCreateDeviceId();
    const backupData = await exportAll(deviceId);
    const jsonContent = JSON.stringify(backupData, null, 2);
    const deviceFileName = `device-${deviceId}.json`;
    await atomicWriteFile(handle, deviceFileName, jsonContent);
    return true;
  } catch (err) {
    console.error('Failed to write device sync file:', err);
    return false;
  }
}

/**
 * Write daily archive snapshot backup-YYYY-MM-DD.json if >=24h or forced.
 */
export async function performDailyBackup(
  handle: FileSystemDirectoryHandle,
  force = false
): Promise<boolean> {
  if (!handle || typeof (handle as any).getFileHandle !== 'function') return false;
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

  try {
    await atomicWriteFile(handle, dailyFileName, jsonContent);

    // Update timestamp
    const nowIso = new Date().toISOString();
    await db.settings.put({ key: 'lastBackupAt', value: nowIso });

    // Compact tombstones older than 60 days to keep tables bounded
    await compactTombstones(60).catch((err) => console.warn('Tombstone compaction skipped:', err));

    // Prune old daily backups (keep last 14)
    await pruneOldBackups(handle);

    return true;
  } catch (err) {
    console.error('Daily backup write failed:', err);
    return false;
  }
}

/**
 * Execute both device file update and daily snapshot backup.
 */
export async function performBackup(
  handle: FileSystemDirectoryHandle,
  force = false
): Promise<boolean> {
  const deviceOk = await writeDeviceFile(handle);
  const dailyOk = await performDailyBackup(handle, force);
  return deviceOk || dailyOk;
}

/**
 * Safely enumerate directory entries across desktop and mobile browsers,
 * with fallbacks for handle.values(), handle[Symbol.asyncIterator], and handle.entries().
 */
async function getDirectoryEntries(handle: FileSystemDirectoryHandle): Promise<FileSystemHandle[]> {
  const entries: FileSystemHandle[] = [];

  // Try standard handle.values()
  if (typeof (handle as any).values === 'function') {
    try {
      for await (const entry of (handle as any).values()) {
        if (entry) entries.push(entry);
      }
      return entries;
    } catch (err) {
      console.warn('handle.values() failed, falling back to async iterator:', err);
    }
  }

  // Try handle[Symbol.asyncIterator]()
  if (typeof (handle as any)[Symbol.asyncIterator] === 'function') {
    try {
      for await (const item of (handle as any)) {
        if (Array.isArray(item) && item[1]) {
          entries.push(item[1]);
        } else if (item && typeof item === 'object') {
          entries.push(item);
        }
      }
      return entries;
    } catch (err) {
      console.warn('handle[Symbol.asyncIterator] failed, falling back to entries():', err);
    }
  }

  // Try handle.entries()
  if (typeof (handle as any).entries === 'function') {
    try {
      for await (const [_, entry] of (handle as any).entries()) {
        if (entry) entries.push(entry);
      }
      return entries;
    } catch (err) {
      console.warn('handle.entries() failed:', err);
    }
  }

  return entries;
}

/**
 * Keep the last 14 backup-YYYY-MM-DD.json files, deleting older ones.
 */
export async function pruneOldBackups(handle: FileSystemDirectoryHandle): Promise<number> {
  try {
    const backupFiles: string[] = [];
    const entries = await getDirectoryEntries(handle);

    for (const entry of entries) {
      if (entry.kind === 'file' && entry.name.toLowerCase().startsWith('backup-') && entry.name.toLowerCase().endsWith('.json')) {
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

export const SYNC_THROTTLE_MS = 3 * 1000;
let activeSyncPromise: Promise<BackupAndSyncResult> | null = null;
let pendingSyncForce: boolean | null = null;

export interface BackupAndSyncResult {
  success: boolean;
  totalChanges: number;
  filesProcessed: number;
}

export interface SyncClassification {
  shouldProcess: boolean;
  isArtifactToClean: boolean;
  kind: 'device' | 'snapshot' | 'none';
}

/**
 * Determine if a directory file entry is a candidate sync file or a recoverable SAF/conflict artifact.
 */
function classifySyncEntry(
  name: string,
  localDeviceId: string
): SyncClassification {
  if (!name || name.startsWith('.')) {
    return { shouldProcess: false, isArtifactToClean: false, kind: 'none' };
  }

  const lower = name.toLowerCase();
  const ownCanonicalName = `device-${localDeviceId}.json`.toLowerCase();

  // Skip own primary device file
  if (lower === ownCanonicalName) {
    return { shouldProcess: false, isArtifactToClean: false, kind: 'none' };
  }

  // Canonical foreign device-<id>.json file
  if (lower.startsWith('device-') && lower.endsWith('.json') && !lower.includes('.tmp')) {
    const isConflictCopy = /\(\d+\)\.json$/.test(lower);
    return { shouldProcess: true, isArtifactToClean: isConflictCopy, kind: 'device' };
  }

  // Recoverable Android SAF rename / .tmp artifact (e.g. "device-xyz.json (1)" or "device-xyz.json.tmp")
  if (
    lower.startsWith('device-') &&
    (lower.endsWith('.tmp') || /\.json\s*\(\d+\)$/.test(lower) || /\.tmp\s*\(\d+\)$/.test(lower))
  ) {
    return { shouldProcess: true, isArtifactToClean: true, kind: 'device' };
  }

  // Daily backup snapshots or exported backups (e.g. backup-YYYY-MM-DD.json or ekirum-backup-*.json)
  if ((lower.startsWith('backup-') || lower.startsWith('ekirum-backup-')) && lower.endsWith('.json')) {
    return { shouldProcess: true, isArtifactToClean: false, kind: 'snapshot' };
  }

  return { shouldProcess: false, isArtifactToClean: false, kind: 'none' };
}

/**
 * Scan the shared backup folder for other device-<id>.json files (or fallback snapshot) and merge them in.
 */
export async function syncDeviceFiles(
  handle: FileSystemDirectoryHandle,
  force = false,
  forceFullResync = false
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
    const syncMtimes: Record<string, any> =
      syncMtimesRecord?.value && typeof syncMtimesRecord.value === 'object'
        ? { ...syncMtimesRecord.value }
        : {};
    let mtimesChanged = false;

    const MAX_DEVICE_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

    const entries = await getDirectoryEntries(handle);

    // Group foreign device files and foreign snapshot files
    const deviceCandidates: FileSystemHandle[] = [];
    const snapshotCandidates: FileSystemHandle[] = [];

    for (const entry of entries) {
      if (entry.kind !== 'file') continue;
      const classification = classifySyncEntry(entry.name, localDeviceId);
      if (!classification.shouldProcess) continue;
      if (classification.kind === 'device') {
        deviceCandidates.push(entry);
      } else if (classification.kind === 'snapshot') {
        snapshotCandidates.push(entry);
      }
    }

    // Process all foreign device files first.
    // If no foreign device files are present in the folder, process the newest snapshot backup.
    const candidatesToProcess: { entry: FileSystemHandle; isArtifactToClean: boolean; isSnapshot: boolean }[] = [];

    for (const entry of deviceCandidates) {
      const { isArtifactToClean } = classifySyncEntry(entry.name, localDeviceId);
      candidatesToProcess.push({ entry, isArtifactToClean, isSnapshot: false });
    }

    if (deviceCandidates.length === 0 && snapshotCandidates.length > 0) {
      // Sort snapshots descending so the newest snapshot is evaluated
      snapshotCandidates.sort((a, b) => b.name.localeCompare(a.name));
      const newestSnapshot = snapshotCandidates[0];
      candidatesToProcess.push({ entry: newestSnapshot, isArtifactToClean: false, isSnapshot: true });
    }

    for (const { entry, isArtifactToClean, isSnapshot } of candidatesToProcess) {
      try {
        const file = await (entry as any).getFile();

        // Reject files exceeding max safe payload size
        if (typeof file.size === 'number' && file.size > MAX_DEVICE_FILE_SIZE) {
          console.warn(`Device file ${entry.name} exceeds 25 MB limit (${file.size} bytes). Skipping.`);
          filesFailed++;
          continue;
        }

        const text = await file.text();
        if (text.length > MAX_DEVICE_FILE_SIZE) {
          console.warn(`Device file ${entry.name} content exceeds 25 MB limit. Skipping.`);
          filesFailed++;
          continue;
        }

        const data = JSON.parse(text);

        // If snapshot originated from the local device itself, skip it
        if (isSnapshot && data?.deviceId === localDeviceId) {
          continue;
        }

        const currentMtime = typeof file.lastModified === 'number' ? file.lastModified : 0;
        const currentSize = typeof file.size === 'number' && file.size > 0 ? file.size : text.length;
        const currentExportedAt = typeof data?.exportedAt === 'string' ? data.exportedAt : '';

        const prevMeta = syncMtimes[entry.name];
        const prevMtime = typeof prevMeta === 'number' ? prevMeta : (prevMeta?.mtime ?? -1);
        const prevSize = typeof prevMeta === 'object' && prevMeta !== null ? (prevMeta?.size ?? -1) : -1;
        const prevExportedAt =
          typeof prevMeta === 'object' && prevMeta !== null ? (prevMeta?.exportedAt ?? '') : '';

        const isUnchanged =
          !forceFullResync &&
          !isArtifactToClean &&
          prevMeta !== undefined &&
          currentMtime === prevMtime &&
          currentSize === prevSize &&
          currentExportedAt === prevExportedAt;

        if (isUnchanged) {
          continue;
        }

        const mergeRes = await importAndMerge(data);
        if (mergeRes.success) {
          filesProcessed++;
          totalMergedChanges += mergeRes.totalChanges;
          if (isArtifactToClean && typeof (handle as any).removeEntry === 'function') {
            await handle.removeEntry(entry.name).catch(() => {});
            delete syncMtimes[entry.name];
          } else {
            syncMtimes[entry.name] = {
              mtime: currentMtime,
              size: currentSize,
              exportedAt: currentExportedAt,
            };
          }
          mtimesChanged = true;
        } else {
          filesFailed++;
          console.warn(`Error merging device sync file ${entry.name}:`, mergeRes.error);
        }
      } catch (e) {
        filesFailed++;
        if (isArtifactToClean && typeof (handle as any).removeEntry === 'function') {
          await handle.removeEntry(entry.name).catch(() => {});
        }
        console.warn(`Error reading device sync file ${entry.name}:`, e);
      }
    }

    if (mtimesChanged) {
      await db.settings.put({ key: 'deviceSyncMtimes', value: syncMtimes });
    }

    const nowIso = new Date(now).toISOString();
    if (filesProcessed > 0) {
      await db.settings.put({ key: 'lastSyncAt', value: nowIso });
    }
    await db.settings.put({ key: 'lastSyncCheckAt', value: nowIso });

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
    return {
      filesProcessed: 0,
      mergeResult: {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        stats: {},
        totalChanges: 0,
      },
    };
  }
}

async function executeBackupAndSyncPass(force: boolean, forceFullResync = false): Promise<BackupAndSyncResult> {
  try {
    if (!isFileSystemAccessSupported()) return { success: false, totalChanges: 0, filesProcessed: 0 };

    const handle = await getSavedDirectoryHandle();
    if (!handle) return { success: false, totalChanges: 0, filesProcessed: 0 };

    const perm = await verifyHandlePermission(handle, force);
    if (perm !== 'granted') {
      return { success: false, totalChanges: 0, filesProcessed: 0 };
    }

    // 1. Sync other devices' files from the shared folder into local Dexie
    const syncRes = await syncDeviceFiles(handle, force, forceFullResync);
    const totalChanges = syncRes.mergeResult?.totalChanges || 0;
    const filesProcessed = syncRes.filesProcessed || 0;

    // 2. Export our up-to-date state (including any new local changes or merged foreign records) to device-<id>.json
    const deviceWriteOk = await writeDeviceFile(handle);

    // 3. Daily backup snapshot (if >=24h or forced)
    await performDailyBackup(handle, force);

    const isSuccess = Boolean(syncRes.mergeResult && syncRes.mergeResult.success) && deviceWriteOk;
    return { success: isSuccess, totalChanges, filesProcessed };
  } catch (err) {
    console.warn('maybeBackupAndSync error:', err);
    return { success: false, totalChanges: 0, filesProcessed: 0 };
  }
}

let pendingSyncFullResync: boolean | null = null;

/**
 * Automated lifecycle check: called on app mount, visibilitychange, and periodic checks.
 * Queues concurrent requests instead of dropping them so manual "Sync Now" or rapid
 * local mutations during an in-flight sync never fail or get lost.
 */
export async function maybeBackupAndSync(force = false, forceFullResync = false): Promise<BackupAndSyncResult> {
  if (activeSyncPromise) {
    pendingSyncForce = Boolean(pendingSyncForce || force);
    pendingSyncFullResync = Boolean(pendingSyncFullResync || forceFullResync);
    const firstRes = await activeSyncPromise;
    if (activeSyncPromise) {
      return await activeSyncPromise;
    }
    return firstRes;
  }

  activeSyncPromise = (async () => {
    let aggregatedSuccess = false;
    let aggregatedChanges = 0;
    let aggregatedFiles = 0;
    let currentForce = force;
    let currentFullResync = forceFullResync;

    try {
      while (true) {
        pendingSyncForce = null;
        pendingSyncFullResync = null;
        const res = await executeBackupAndSyncPass(currentForce, currentFullResync);
        aggregatedSuccess = res.success;
        aggregatedChanges += res.totalChanges;
        aggregatedFiles += res.filesProcessed;

        if (pendingSyncForce !== null || pendingSyncFullResync !== null) {
          currentForce = Boolean(pendingSyncForce);
          currentFullResync = Boolean(pendingSyncFullResync);
          continue;
        }
        break;
      }
      return {
        success: aggregatedSuccess,
        totalChanges: aggregatedChanges,
        filesProcessed: aggregatedFiles,
      };
    } finally {
      activeSyncPromise = null;
      pendingSyncForce = null;
      pendingSyncFullResync = null;
    }
  })();

  return activeSyncPromise;
}
