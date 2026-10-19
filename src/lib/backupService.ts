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
  let dailyBackupCount = 0;
  if (permission === 'granted') {
    try {
      const supersededRecord = await db.settings.get('supersededDeviceFiles');
      const supersededSet = new Set<string>(
        Array.isArray(supersededRecord?.value) ? supersededRecord.value : []
      );
      const entries = await getDirectoryEntries(handle);
      for (const entry of entries) {
        if (entry.kind === 'file') {
          const c = classifySyncEntry(entry.name, deviceId);
          if (c.kind === 'device' && !c.isArtifactToClean && !supersededSet.has(entry.name)) {
            foreignDeviceCount++;
          } else if (c.kind === 'snapshot' && !c.isArtifactToClean) {
            dailyBackupCount++;
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
    await atomicWriteFile(handle, newFileName, jsonContent);

    if (typeof (handle as any).removeEntry === 'function') {
      for (const oldEntry of ownEntries) {
        if (oldEntry.name !== newFileName) {
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
    (lower.startsWith(`${ownPrefix}-`) && /^device-[a-z0-9-]+-\d{10,15}\.json$/.test(lower))
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
      db.settings.get('deviceSyncMtimes'),
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
        if (forceFullResync) {
          candidatesToExamine.push({
            entry,
            isArtifactToClean: false,
            isSnapshot: false,
            isCanonicalForeignDevice: false,
          });
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

        // If a snapshot originated from the local device itself, skip it during normal sync
        // (during forceFullResync, we still evaluate it in case local DB was reset or behind).
        if (isSnapshot && data?.deviceId === localDeviceId && !forceFullResync) {
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

        if (!isUnchanged && supersededSet.has(entry.name)) {
          supersededSet.delete(entry.name);
          supersededChanged = true;
        }

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

    for (const candidate of parsedCandidates) {
      if (!candidate.shouldMerge) continue;
      const { entry, data, isArtifactToClean, currentMtime, currentSize, currentExportedAt } = candidate;
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

    // If multiple canonical foreign device-<id>.json files exist (e.g. orphaned files from old browser resets),
    // keep the newest foreign device file and clean up older superseded ones once all candidates have been merged.
    const canonicalForeign = parsedCandidates
      .filter((c) => c.isCanonicalForeignDevice)
      .sort((a, b) => b.sortTime - a.sortTime);

    if (canonicalForeign.length > 1 && filesFailed === 0) {
      const newestForeign = canonicalForeign[0];
      if (supersededSet.has(newestForeign.entry.name)) {
        supersededSet.delete(newestForeign.entry.name);
        supersededChanged = true;
      }
      const redundantForeign = canonicalForeign.slice(1);
      for (const stale of redundantForeign) {
        if (typeof (handle as any).removeEntry === 'function') {
          await handle.removeEntry(stale.entry.name).catch(() => {});
        }
        if (!supersededSet.has(stale.entry.name)) {
          supersededSet.add(stale.entry.name);
          supersededChanged = true;
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
