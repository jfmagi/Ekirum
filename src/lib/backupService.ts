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
  dailyBackupCount?: number;
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
  await db.settings.delete('supersededDeviceFiles');
}

/**
 * Directly probe whether the handle can be accessed for reading.
 * On Android SAF or in browsers where queryPermission is absent/unimplemented,
 * successful entry probing confirms that OS-level permission is active and granted.
 */
async function probeHandleAccess(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if (!handle) return false;
  try {
    if (typeof (handle as any).values === 'function') {
      const iterator = (handle as any).values();
      await iterator.next();
      return true;
    }
    if (typeof (handle as any)[Symbol.asyncIterator] === 'function') {
      const iterator = (handle as any)[Symbol.asyncIterator]();
      await iterator.next();
      return true;
    }
    if (typeof (handle as any).entries === 'function') {
      const iterator = (handle as any).entries();
      await iterator.next();
      return true;
    }
    if (typeof (handle as any).getFileHandle === 'function') {
      try {
        await (handle as any).getFileHandle('__ekirum_permission_probe__', { create: false });
        return true;
      } catch (probeErr: any) {
        if (probeErr?.name === 'NotFoundError') {
          return true; // Directory is accessible and inspectable!
        }
        if (probeErr?.name === 'NotAllowedError' || probeErr?.name === 'SecurityError') {
          return false;
        }
      }
    }
    return false;
  } catch (err: any) {
    if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
      return false;
    }
    console.warn('probeHandleAccess check:', err);
    return false;
  }
}

/**
 * Query or request permission on the directory handle with robust feature detection
 * and fallback capability probing for Android SAF / browsers without queryPermission.
 */
export async function verifyHandlePermission(
  handle: FileSystemDirectoryHandle,
  requestIfNeeded = false
): Promise<BackupFolderPermission> {
  if (!handle) return 'denied';

  // 1. Try standard queryPermission if supported
  if (typeof (handle as any).queryPermission === 'function') {
    try {
      const query = await (handle as any).queryPermission({ mode: 'readwrite' });
      if (query === 'granted') return 'granted';
      if (query === 'denied') return 'denied';

      // If 'prompt' and user gesture allows requestPermission
      if (requestIfNeeded && typeof (handle as any).requestPermission === 'function') {
        try {
          const req = await (handle as any).requestPermission({ mode: 'readwrite' });
          if (req === 'granted') return 'granted';
          if (req === 'denied') return 'denied';
        } catch (reqErr) {
          console.warn('requestPermission error:', reqErr);
        }
      }

      // On Android SAF, queryPermission can return 'prompt' even when the handle is already
      // permitted by the OS SAF document tree grant. Probe direct access before giving up.
      const isActuallyAccessible = await probeHandleAccess(handle);
      if (isActuallyAccessible) {
        return 'granted';
      }

      return 'prompt';
    } catch (err: any) {
      console.warn('queryPermission threw error, falling back to direct probe:', err);
    }
  }

  // 2. Fallback for browsers / Android environments where queryPermission is absent or threw:
  // Probe whether the directory can be read directly
  const canAccess = await probeHandleAccess(handle);
  if (canAccess) {
    return 'granted';
  }

  // 3. If direct read failed and requestIfNeeded is true, try requestPermission if available
  if (requestIfNeeded && typeof (handle as any).requestPermission === 'function') {
    try {
      const req = await (handle as any).requestPermission({ mode: 'readwrite' });
      return req === 'granted' ? 'granted' : req === 'denied' ? 'denied' : 'prompt';
    } catch (reqErr) {
      console.warn('requestPermission error in fallback:', reqErr);
    }
  }

  return 'prompt';
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
  let dailyBackupCount = 0;
  if (permission === 'granted') {
    try {
      const entries = await getDirectoryEntries(handle);
      const foreignDeviceIds = new Set<string>();
      for (const entry of entries) {
        if (entry.kind === 'file') {
          const c = classifySyncEntry(entry.name, deviceId);
          if (c.kind === 'device' && !c.isArtifactToClean) {
            const match = entry.name.match(/^device-(.+?)(?:-\d{10,15})?\.json$/i);
            const devId = match ? match[1] : entry.name;
            if (devId && devId.toLowerCase() !== deviceId.toLowerCase()) {
              foreignDeviceIds.add(devId);
            }
          } else if (c.kind === 'snapshot' && !c.isArtifactToClean) {
            dailyBackupCount++;
          }
        }
      }
      foreignDeviceCount = foreignDeviceIds.size;
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
    dailyBackupCount,
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

    // 1. Immediately merge foreign devices and snapshots from the selected folder
    await syncDeviceFiles(handle, true, true);
    // 2. Export local state to device-<id>.json so other devices can sync our data
    await writeDeviceFile(handle, true);
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
export async function reconnectBackupDirectory(): Promise<BackupAndSyncResult> {
  const handle = await getSavedDirectoryHandle();
  if (!handle) {
    return { success: false, totalChanges: 0, filesProcessed: 0, error: 'No backup folder configured.' };
  }

  const perm = await verifyHandlePermission(handle, true);
  if (perm === 'granted') {
    await db.settings.delete('deviceSyncMtimes');
    await db.settings.delete('lastSyncAt');
    await db.settings.delete('supersededDeviceFiles');
    // Perform catch-up sync and backup
    const syncRes = await syncDeviceFiles(handle, true, true);
    const deviceWriteOk = await writeDeviceFile(handle, true);
    await performDailyBackup(handle, false);
    const totalChanges = syncRes.mergeResult?.totalChanges || 0;
    const filesProcessed = syncRes.filesProcessed || 0;
    const syncSuccess = Boolean(syncRes.mergeResult && syncRes.mergeResult.success);
    return {
      success: syncSuccess,
      totalChanges,
      filesProcessed,
      deviceWriteOk,
      error: syncRes.mergeResult?.error,
    };
  }
  return { success: false, totalChanges: 0, filesProcessed: 0, error: 'Folder permission was not granted.' };
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

  try {
    const fileHandle = await handle.getFileHandle(fileName, { create: true });
    const writable = await (fileHandle as any).createWritable();
    await writable.write(content);
    await writable.close();
  } catch (writeErr) {
    if (typeof (handle as any).removeEntry === 'function') {
      await handle.removeEntry(fileName).catch(() => {});
      const fileHandle = await handle.getFileHandle(fileName, { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(content);
      await writable.close();
    } else {
      throw writeErr;
    }
  }

  // Clean up any legacy .tmp file left by older versions
  if (typeof (handle as any).removeEntry === 'function') {
    await handle.removeEntry(`${fileName}.tmp`).catch(() => {});
  }
}

/**
 * Export current local state and write to a fresh write-once device-<deviceId>-<timestamp>.json file
 * whenever local data has changed, removing any superseded own device files.
 * Using a fresh filename avoids macOS Google Drive FileProvider dropping cloud sync (.crswap overwrite bug)
 * and prevents Android SAF from generating " (1)" conflict files.
 */
export async function writeDeviceFile(
  handle: FileSystemDirectoryHandle,
  forceWrite = false
): Promise<boolean> {
  if (!handle || typeof (handle as any).getFileHandle !== 'function') return false;
  try {
    const deviceId = await getOrCreateDeviceId();
    const backupData = await exportAll(deviceId);
    const tablesFingerprint = JSON.stringify(backupData.tables);

    const entries = await getDirectoryEntries(handle);
    const ownEntries = entries.filter(
      (e) => e.kind === 'file' && classifySyncEntry(e.name, deviceId).kind === 'own-device'
    );
    const hasTimestampedOwnFile = ownEntries.some((e) => /^device-.+-\d{10,15}\.json$/i.test(e.name));

    const lastHashRecord = await db.settings.get('lastExportedTablesHash');
    if (!forceWrite && lastHashRecord?.value === tablesFingerprint && hasTimestampedOwnFile) {
      // Data has not changed since last export and our write-once timestamped device file is present
      return true;
    }

    const jsonContent = JSON.stringify(backupData, null, 2);
    const newFileName = `device-${deviceId}-${Date.now()}.json`;
    let writtenFileName = newFileName;
    try {
      await atomicWriteFile(handle, newFileName, jsonContent);
    } catch (timestampedWriteErr) {
      // Fallback for restricted Android SAF providers where creating new timestamped files may fail
      const canonicalFileName = `device-${deviceId}.json`;
      await atomicWriteFile(handle, canonicalFileName, jsonContent);
      writtenFileName = canonicalFileName;
    }

    if (typeof (handle as any).removeEntry === 'function') {
      for (const oldEntry of ownEntries) {
        if (oldEntry.name !== writtenFileName) {
          await handle.removeEntry(oldEntry.name).catch(() => {});
        }
      }
    }

    await db.settings.put({ key: 'lastExportedTablesHash', value: tablesFingerprint });
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

  const todayStr = formatLocalDate();
  const dailyFileName = `backup-${todayStr}.json`;

  try {
    // Check if today's daily snapshot already exists in the folder.
    // Never overwrite an existing daily snapshot in-place because macOS Google Drive FileProvider
    // drops com.google.drivefs.item-id#S when an existing file is overwritten via .crswap.
    const entries = await getDirectoryEntries(handle);
    const existingDaily = entries.some(
      (e) => e.kind === 'file' && e.name.toLowerCase() === dailyFileName.toLowerCase()
    );

    if (!existingDaily) {
      const backupData = await exportAll(deviceId);
      const jsonContent = JSON.stringify(backupData, null, 2);
      await atomicWriteFile(handle, dailyFileName, jsonContent);
    }

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
  const deviceOk = await writeDeviceFile(handle, force);
  const dailyOk = await performDailyBackup(handle, force);
  return deviceOk || dailyOk;
}

/**
 * Safely enumerate directory entries across desktop and mobile browsers,
 * with fallbacks for handle.values(), handle[Symbol.asyncIterator], and handle.entries().
 * Throws when iteration methods fail with permission/system errors so callers do not
 * mistakenly treat failure as an empty folder.
 */
async function getDirectoryEntries(handle: FileSystemDirectoryHandle): Promise<FileSystemHandle[]> {
  const entries: FileSystemHandle[] = [];
  let attemptedMethod = false;
  let lastError: unknown = null;

  // Try standard handle.values()
  if (typeof (handle as any).values === 'function') {
    attemptedMethod = true;
    try {
      for await (const entry of (handle as any).values()) {
        if (entry) entries.push(entry);
      }
      return entries;
    } catch (err) {
      lastError = err;
      console.warn('handle.values() failed, falling back to async iterator:', err);
    }
  }

  // Try handle[Symbol.asyncIterator]()
  if (typeof (handle as any)[Symbol.asyncIterator] === 'function') {
    attemptedMethod = true;
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
      lastError = err;
      console.warn('handle[Symbol.asyncIterator] failed, falling back to entries():', err);
    }
  }

  // Try handle.entries()
  if (typeof (handle as any).entries === 'function') {
    attemptedMethod = true;
    try {
      for await (const [_, entry] of (handle as any).entries()) {
        if (entry) entries.push(entry);
      }
      return entries;
    } catch (err) {
      lastError = err;
      console.warn('handle.entries() failed:', err);
    }
  }

  // If iteration methods were available on handle and all threw errors (e.g. NotAllowedError),
  // throw so caller knows enumeration failed rather than mistaking failure for an empty folder.
  if (attemptedMethod && lastError) {
    throw lastError;
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
  deviceWriteOk?: boolean;
  error?: string;
}

export interface SyncClassification {
  shouldProcess: boolean;
  isArtifactToClean: boolean;
  kind: 'device' | 'snapshot' | 'own-device' | 'own-artifact' | 'none';
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

  // Clean up orphaned Chromium swap files (.crswap)
  if (lower.includes('.crswap')) {
    return { shouldProcess: false, isArtifactToClean: true, kind: 'own-artifact' };
  }

  const ownPrefix = `device-${localDeviceId}`.toLowerCase();
  const ownCanonicalName = `${ownPrefix}.json`;

  // Own primary device file (legacy device-<id>.json or write-once device-<id>-<timestamp>.json)
  if (
    lower === ownCanonicalName ||
    (lower.startsWith(`${ownPrefix}-`) && /^device-[a-z0-9_-]+-\d{10,15}\.json$/.test(lower))
  ) {
    return { shouldProcess: false, isArtifactToClean: false, kind: 'own-device' };
  }

  // Own conflict copy or .tmp artifact (e.g. "device-<localId> (1).json" or "device-<localId>.json.tmp")
  if (lower.startsWith(ownPrefix)) {
    return { shouldProcess: false, isArtifactToClean: true, kind: 'own-artifact' };
  }

  // Canonical foreign device-<id>.json or device-<id>-<timestamp>.json file (or conflict copy)
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
  if (
    (lower.startsWith('backup-') || lower.startsWith('ekirum-backup-')) &&
    (lower.endsWith('.json') || lower.endsWith('.tmp') || /\.json\s*\(\d+\)$/.test(lower))
  ) {
    const isArtifact = !lower.endsWith('.json') || /\(\d+\)\.json$/.test(lower);
    return { shouldProcess: true, isArtifactToClean: isArtifact, kind: 'snapshot' };
  }

  return { shouldProcess: false, isArtifactToClean: false, kind: 'none' };
}

/**
 * Scan the shared backup folder for other device-<id>.json files and backup snapshots and merge them in.
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

    const [syncMtimesRecord, supersededRecord] = await Promise.all([
      forceFullResync ? Promise.resolve(null) : db.settings.get('deviceSyncMtimes'),
      db.settings.get('supersededDeviceFiles'),
    ]);
    const syncMtimes: Record<string, any> =
      syncMtimesRecord?.value && typeof syncMtimesRecord.value === 'object'
        ? { ...syncMtimesRecord.value }
        : {};
    const supersededSet = new Set<string>(
      Array.isArray(supersededRecord?.value) ? supersededRecord.value : []
    );
    let mtimesChanged = false;
    let supersededChanged = false;

    const MAX_DEVICE_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

    const entries = await getDirectoryEntries(handle);

    const candidatesToExamine: {
      entry: FileSystemHandle;
      isArtifactToClean: boolean;
      isSnapshot: boolean;
      isCanonicalForeignDevice: boolean;
    }[] = [];

    for (const entry of entries) {
      if (entry.kind !== 'file') continue;
      const classification = classifySyncEntry(entry.name, localDeviceId);

      if (classification.kind === 'own-artifact') {
        if (typeof (handle as any).removeEntry === 'function') {
          await handle.removeEntry(entry.name).catch(() => {});
        }
        continue;
      }

      if (classification.kind === 'own-device') {
        // Local IndexedDB is already the authoritative state of truth for the local device.
        // We never re-merge our own device files back into the local database.
        continue;
      }

      if (!forceFullResync && supersededSet.has(entry.name)) {
        if (typeof (handle as any).removeEntry === 'function') {
          await handle.removeEntry(entry.name).catch(() => {});
        }
        continue;
      }

      if (!classification.shouldProcess) continue;

      candidatesToExamine.push({
        entry,
        isArtifactToClean: classification.isArtifactToClean,
        isSnapshot: classification.kind === 'snapshot',
        isCanonicalForeignDevice: classification.kind === 'device' && !classification.isArtifactToClean,
      });
    }

    interface ParsedCandidate {
      entry: FileSystemHandle;
      data: any;
      isArtifactToClean: boolean;
      isSnapshot: boolean;
      isCanonicalForeignDevice: boolean;
      currentMtime: number;
      currentSize: number;
      currentExportedAt: string;
      sortTime: number;
      shouldMerge: boolean;
    }

    const parsedCandidates: ParsedCandidate[] = [];

    for (const { entry, isArtifactToClean, isSnapshot, isCanonicalForeignDevice } of candidatesToExamine) {
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

        const currentMtime = typeof file.lastModified === 'number' ? file.lastModified : 0;
        const currentSize = typeof file.size === 'number' && file.size > 0 ? file.size : text.length;
        const currentExportedAt = typeof data?.exportedAt === 'string' ? data.exportedAt : '';
        const exportedMs = currentExportedAt ? Date.parse(currentExportedAt) : NaN;
        const sortTime = !Number.isNaN(exportedMs) ? exportedMs : currentMtime;

        // If a file originated from the local device itself, skip it!
        // Local IndexedDB is already the authoritative state of truth for the local device.
        if (data?.deviceId === localDeviceId) {
          syncMtimes[entry.name] = {
            mtime: currentMtime,
            size: currentSize,
            exportedAt: currentExportedAt,
          };
          mtimesChanged = true;
          continue;
        }

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

        parsedCandidates.push({
          entry,
          data,
          isArtifactToClean,
          isSnapshot,
          isCanonicalForeignDevice,
          currentMtime,
          currentSize,
          currentExportedAt,
          sortTime,
          shouldMerge: !isUnchanged,
        });
      } catch (e) {
        filesFailed++;
        if (isArtifactToClean && typeof (handle as any).removeEntry === 'function') {
          await handle.removeEntry(entry.name).catch(() => {});
        }
        console.warn(`Error reading device sync file ${entry.name}:`, e);
      }
    }

    // Sort candidates chronologically ascending (oldest first, newest last)
    // so newer snapshots and active device files always have the final word on LWW fields.
    parsedCandidates.sort((a, b) => a.sortTime - b.sortTime);

    // Every Ekirum backup/device file is a complete database export (exportAll) from its originating deviceId.
    // Find the newest sortTime per deviceId so we do not re-merge obsolete historical daily snapshots
    // when a newer file from that same deviceId is already present in the folder.
    const newestSortTimeByDevice = new Map<string, number>();
    for (const c of parsedCandidates) {
      const devId = typeof c.data?.deviceId === 'string' && c.data.deviceId ? c.data.deviceId : '';
      if (devId) {
        const prevMax = newestSortTimeByDevice.get(devId) ?? -Infinity;
        if (c.sortTime > prevMax) {
          newestSortTimeByDevice.set(devId, c.sortTime);
        }
      }
    }

    for (const candidate of parsedCandidates) {
      if (!candidate.shouldMerge) continue;
      const { entry, data, isArtifactToClean, isSnapshot, currentMtime, currentSize, currentExportedAt, sortTime } = candidate;
      const devId = typeof data?.deviceId === 'string' && data.deviceId ? data.deviceId : '';
      const newestForDevice = devId ? (newestSortTimeByDevice.get(devId) ?? sortTime) : sortTime;

      // Skip older historical snapshots when a strictly newer full export from the same deviceId exists in the folder
      if (isSnapshot && !isArtifactToClean && devId && sortTime < newestForDevice) {
        if (!supersededSet.has(entry.name)) {
          supersededSet.add(entry.name);
          supersededChanged = true;
        }
        syncMtimes[entry.name] = {
          mtime: currentMtime,
          size: currentSize,
          exportedAt: currentExportedAt,
        };
        mtimesChanged = true;
        continue;
      }

      try {
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
        console.warn(`Error merging device sync file ${entry.name}:`, e);
      }
    }

    // Clean up older superseded files for the SAME foreign deviceId only (never across different deviceIds),
    // and only if all candidates merged without errors.
    if (filesFailed === 0) {
      const foreignByDeviceId = new Map<string, ParsedCandidate[]>();
      for (const c of parsedCandidates) {
        if (!c.isCanonicalForeignDevice) continue;
        const devId = typeof c.data?.deviceId === 'string' && c.data.deviceId ? c.data.deviceId : '';
        if (!devId || devId === localDeviceId) continue;
        const list = foreignByDeviceId.get(devId) || [];
        list.push(c);
        foreignByDeviceId.set(devId, list);
      }

      for (const [, deviceCandidates] of foreignByDeviceId) {
        // Sort descending by sortTime: newest first
        deviceCandidates.sort((a, b) => b.sortTime - a.sortTime);
        const newest = deviceCandidates[0];
        if (newest && supersededSet.has(newest.entry.name)) {
          supersededSet.delete(newest.entry.name);
          supersededChanged = true;
        }
        if (deviceCandidates.length <= 1) continue;
        const olderSuperseded = deviceCandidates.slice(1);
        for (const stale of olderSuperseded) {
          if (typeof (handle as any).removeEntry === 'function') {
            await handle.removeEntry(stale.entry.name).catch(() => {});
          }
          if (!supersededSet.has(stale.entry.name)) {
            supersededSet.add(stale.entry.name);
            supersededChanged = true;
          }
        }
      }
    }

    if (mtimesChanged) {
      await db.settings.put({ key: 'deviceSyncMtimes', value: syncMtimes });
    }
    if (supersededChanged) {
      await db.settings.put({ key: 'supersededDeviceFiles', value: Array.from(supersededSet) });
    }

    const nowIso = new Date(now).toISOString();
    if (filesProcessed > 0 || force) {
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

    // 2. Export our up-to-date state (only writes when local data changed or no write-once file exists yet)
    const deviceWriteOk = await writeDeviceFile(handle, false);

    // 3. Daily backup snapshot (if >=24h or forced)
    await performDailyBackup(handle, force);

    const syncSuccess = Boolean(syncRes.mergeResult && syncRes.mergeResult.success);
    const isSuccess = syncSuccess && (deviceWriteOk || filesProcessed > 0);
    return {
      success: isSuccess,
      totalChanges,
      filesProcessed,
      deviceWriteOk,
      error: syncRes.mergeResult?.error,
    };
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
    let lastDeviceWriteOk: boolean | undefined = undefined;
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
        if (res.deviceWriteOk !== undefined) {
          lastDeviceWriteOk = res.deviceWriteOk;
        }

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
        deviceWriteOk: lastDeviceWriteOk,
      };
    } finally {
      activeSyncPromise = null;
      pendingSyncForce = null;
      pendingSyncFullResync = null;
    }
  })();

  return activeSyncPromise;
}
