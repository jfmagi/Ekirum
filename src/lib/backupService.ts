import { db, getOrCreateDeviceId, regenerateDeviceId, getDevicePlatformLabel } from './db';
import { exportAll, importAndMerge, compactTombstones, MergeResult } from './syncEngine';
import { BackupFolderPermission } from '../types';
import { formatLocalDate } from './dateParser';

const HANDLE_KEY = 'backupDirectoryHandle';
const CONFIG_KEY = 'backupConfig';
const STATUS_CHECK_TIMEOUT_MS = 4000;
const SYNC_IO_TIMEOUT_MS = 15000;

class SyncTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${Math.round(ms / 1000)}s`);
    this.name = 'SyncTimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  return new Promise<T>((resolve, reject) => {
    timerId = setTimeout(() => {
      reject(new SyncTimeoutError(label, ms));
    }, ms);
    promise.then(
      (value) => {
        if (timerId !== null) clearTimeout(timerId);
        resolve(value);
      },
      (err) => {
        if (timerId !== null) clearTimeout(timerId);
        reject(err);
      }
    );
  });
}

export interface BackupStatus {
  hasFileSystemSupport: boolean;
  folderName: string | null;
  lastBackupAt: string | null;
  lastSyncAt: string | null;
  permission: BackupFolderPermission;
  isOverdue: boolean;
  deviceId: string;
  devicePlatform?: string;
  foreignDeviceCount?: number;
  dailyBackupCount?: number;
  lastSyncReport?: SyncReport | null;
  statusWarning?: string | null;
  handleStale?: boolean;
}

/**
 * Check if the browser supports the File System Access API.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

let cachedDirectoryHandle: FileSystemDirectoryHandle | null = null;
let localSyncDirty = true;

export function markLocalSyncDirty(): void {
  localSyncDirty = true;
}

const TAB_INSTANCE_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let broadcastChannel: BroadcastChannel | null = null;

function getSyncBroadcastChannel(): BroadcastChannel | null {
  // Guard with typeof document !== 'undefined' so Node.js test runners never open an unref'd BroadcastChannel handle
  if (typeof document === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!broadcastChannel) {
    try {
      broadcastChannel = new BroadcastChannel('ekirum-sync-v1');
      (broadcastChannel as any).unref?.();
    } catch {
      broadcastChannel = null;
    }
  }
  return broadcastChannel;
}

export function notifyCrossTabSync(reason: 'local-mutation' | 'remote-merged'): void {
  const ch = getSyncBroadcastChannel();
  if (!ch) return;
  try {
    ch.postMessage({ tabId: TAB_INSTANCE_ID, reason, at: Date.now() });
  } catch {
    // ignore broadcast errors
  }
}

export function subscribeCrossTabSync(onRemoteTabUpdate: () => void): () => void {
  const ch = getSyncBroadcastChannel();
  if (!ch) return () => {};
  const handler = (event: MessageEvent) => {
    if (event?.data && event.data.tabId && event.data.tabId !== TAB_INSTANCE_ID) {
      onRemoteTabUpdate();
    }
  };
  ch.addEventListener('message', handler);
  return () => {
    ch.removeEventListener('message', handler);
  };
}

/**
 * Compute a compact 64-char SHA-256 hex digest of exported tables so IndexedDB settings
 * never store a multi-megabyte duplicate copy of the serialized database.
 */
export async function computeTablesHash(tables: unknown): Promise<string> {
  const json = JSON.stringify(tables || {});
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const encoded = new TextEncoder().encode(json);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }
  return json;
}

/**
 * Retrieve the saved FileSystemDirectoryHandle from memory cache or IndexedDB.
 * Keeping the in-memory handle prevents IndexedDB deserialization from resetting
 * transient permission state to 'prompt' within the same session on Android Chrome,
 * and allows synchronous access during user gesture handlers so requestPermission()
 * does not lose transient user activation across IndexedDB awaits.
 */
export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (cachedDirectoryHandle) {
      const record = await db.settings.get(HANDLE_KEY);
      if (!record?.value) {
        cachedDirectoryHandle = null;
        return null;
      }
      return cachedDirectoryHandle;
    }
    const record = await db.settings.get(HANDLE_KEY);
    const handle = (record?.value as FileSystemDirectoryHandle) || null;
    if (handle) {
      cachedDirectoryHandle = handle;
    }
    return handle;
  } catch (err) {
    console.warn('Failed to retrieve directory handle:', err);
    return null;
  }
}

/**
 * Save directory handle into memory cache and IndexedDB.
 */
export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  cachedDirectoryHandle = handle;
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
  const isAndroid = getDevicePlatformLabel() === 'android';

  // When called from a direct user gesture (e.g. clicking "Reconnect" or "Sync Now"),
  // call requestPermission IMMEDIATELY before any other awaits so browsers do not
  // consume or expire the transient user activation!
  if (requestIfNeeded && typeof (handle as any).requestPermission === 'function') {
    try {
      const req = await (handle as any).requestPermission({ mode: 'readwrite' });
      if (req === 'granted') return 'granted';
      if (req === 'denied' && !isAndroid) return 'denied';
    } catch (reqErr) {
      console.warn('requestPermission(readwrite) error:', reqErr);
    }
    if (isAndroid) {
      try {
        const reqRead = await (handle as any).requestPermission({ mode: 'read' });
        if (reqRead === 'granted') return 'granted';
      } catch {
        // ignore
      }
    }
  }

  // 1. Try standard queryPermission if supported
  if (typeof (handle as any).queryPermission === 'function') {
    try {
      const query = await withTimeout(
        (handle as any).queryPermission({ mode: 'readwrite' }),
        STATUS_CHECK_TIMEOUT_MS,
        'Folder permission check'
      );
      if (query === 'granted') return 'granted';
      if (query === 'denied') return 'denied';

      // On desktop Chromium/Edge, queryPermission({ mode: 'readwrite' }) === 'prompt' is authoritative.
      // Do NOT treat read-only permission as granted or probe handle.values() on a desktop 'prompt'
      // handle (which can hang indefinitely on macOS cloud drive FileProvider mounts).
      if (!isAndroid) {
        return 'prompt';
      }

      const queryRead = await withTimeout(
        (handle as any).queryPermission({ mode: 'read' }),
        STATUS_CHECK_TIMEOUT_MS,
        'Folder read permission check'
      );
      if (queryRead === 'granted') return 'granted';

      // On Android SAF, queryPermission can return 'prompt' even when the handle is already
      // permitted by the OS SAF document tree grant. Probe direct access before giving up.
      const isActuallyAccessible = await withTimeout(
        probeHandleAccess(handle),
        STATUS_CHECK_TIMEOUT_MS,
        'Folder access probe'
      );
      if (isActuallyAccessible) {
        return 'granted';
      }

      return 'prompt';
    } catch (err: any) {
      if (err instanceof SyncTimeoutError) {
        throw err;
      }
      console.warn('queryPermission threw error, falling back to direct probe:', err);
    }
  }

  // 2. Fallback for browsers / environments where queryPermission is absent or threw:
  // Probe whether the directory can be read directly (bounded by timeout).
  const canAccess = await withTimeout(
    probeHandleAccess(handle),
    STATUS_CHECK_TIMEOUT_MS,
    'Folder access probe'
  );
  if (canAccess) {
    return 'granted';
  }

  return 'prompt';
}

/**
 * Get current backup and sync status.
 */
export async function getBackupStatus(): Promise<BackupStatus> {
  const hasSupport = isFileSystemAccessSupported();
  const devicePlatform = getDevicePlatformLabel();

  let deviceId = '';
  let lastBackupAt: string | null = null;
  let lastSyncAt: string | null = null;
  let folderName: string | null = null;
  let configHandleStale = false;
  let lastSyncReport: SyncReport | null = null;
  let handle: FileSystemDirectoryHandle | null = null;
  let statusWarning: string | null = null;
  let handleStale = false;

  try {
    const metadata = await withTimeout(
      (async () => {
        const devId = await getOrCreateDeviceId();
        const [lastBackup, lastSync, config, lastReportRecord] = await Promise.all([
          db.settings.get('lastBackupAt'),
          db.settings.get('lastSyncAt'),
          db.settings.get(CONFIG_KEY),
          db.settings.get('lastSyncReport'),
        ]);
        const savedHandle = hasSupport ? await getSavedDirectoryHandle() : null;
        return { devId, lastBackup, lastSync, config, lastReportRecord, savedHandle };
      })(),
      STATUS_CHECK_TIMEOUT_MS + 1000,
      'Local database read'
    );

    deviceId = metadata.devId;
    lastBackupAt = (metadata.lastBackup?.value as string) || null;
    lastSyncAt = (metadata.lastSync?.value as string) || null;
    folderName = (metadata.config?.value?.folderName as string) || null;
    configHandleStale = Boolean(metadata.config?.value?.handleStale);
    lastSyncReport = (metadata.lastReportRecord?.value as SyncReport) || null;
    handle = metadata.savedHandle;
  } catch (err: any) {
    console.warn('getBackupStatus database check failed:', err);
    const fallbackDeviceId =
      typeof localStorage !== 'undefined' ? localStorage.getItem('ekirum-device-id') || '' : '';
    return {
      hasFileSystemSupport: hasSupport,
      folderName: null,
      lastBackupAt: null,
      lastSyncAt: null,
      permission: hasSupport ? 'not-configured' : 'unsupported',
      isOverdue: false,
      deviceId: fallbackDeviceId,
      devicePlatform,
      statusWarning:
        err instanceof SyncTimeoutError
          ? 'Local storage is busy or blocked by another Ekirum tab/window. Quit and reopen your browser if this persists.'
          : `Could not read local sync settings (${err?.message || 'storage error'}).`,
    };
  }

  if (!hasSupport) {
    return {
      hasFileSystemSupport: false,
      folderName: null,
      lastBackupAt,
      lastSyncAt,
      permission: 'unsupported',
      isOverdue: Boolean(lastBackupAt && Date.now() - new Date(lastBackupAt).getTime() > 48 * 3600 * 1000),
      deviceId,
      devicePlatform,
      lastSyncReport,
    };
  }

  if (!handle) {
    if (configHandleStale && folderName) {
      return {
        hasFileSystemSupport: true,
        folderName,
        lastBackupAt,
        lastSyncAt,
        permission: 'prompt',
        isOverdue: Boolean(
          lastBackupAt && (Date.now() - new Date(lastBackupAt).getTime()) > 48 * 3600 * 1000
        ),
        deviceId,
        devicePlatform,
        lastSyncReport,
        handleStale: true,
        statusWarning:
          'Your browser update invalidated the saved folder handle. Click Re-select Folder to re-link your sync folder.',
      };
    }
    return {
      hasFileSystemSupport: true,
      folderName: null,
      lastBackupAt,
      lastSyncAt,
      permission: 'not-configured',
      isOverdue: false,
      deviceId,
      devicePlatform,
      lastSyncReport,
    };
  }

  let permission: BackupFolderPermission = 'prompt';
  try {
    permission = await withTimeout(
      verifyHandlePermission(handle, false),
      STATUS_CHECK_TIMEOUT_MS + 500,
      'Folder permission check'
    );
  } catch (err: any) {
    console.warn('getBackupStatus permission check timed out/failed (stale browser handle):', err);
    permission = 'prompt';
    handleStale = true;
    const preservedName = handle.name || folderName;
    // Clear the hung handle from memory and IndexedDB (Chromium/Edge 158+ bug where serialized
    // handles never settle on queryPermission/requestPermission) so Re-select Folder can create a fresh one.
    cachedDirectoryHandle = null;
    await db.settings.delete(HANDLE_KEY).catch(() => {});
    if (preservedName) {
      await db.settings
        .put({
          key: CONFIG_KEY,
          value: {
            folderName: preservedName,
            updatedAt: new Date().toISOString(),
            handleStale: true,
          },
        })
        .catch(() => {});
    }
    statusWarning =
      'Your browser update invalidated the saved folder handle. Click Re-select Folder to re-link your sync folder.';
  }

  const isOverdue = Boolean(
    lastBackupAt && (Date.now() - new Date(lastBackupAt).getTime()) > 48 * 3600 * 1000
  );

  let foreignDeviceCount = 0;
  let dailyBackupCount = 0;
  if (permission === 'granted') {
    try {
      const entries = await getDirectoryEntries(handle, STATUS_CHECK_TIMEOUT_MS);
      const foreignDeviceIds = new Set<string>();
      for (const entry of entries) {
        if (entry.kind === 'file') {
          const c = classifySyncEntry(entry.name, deviceId);
          if (c.kind === 'device' && !c.isArtifactToClean) {
            const match = entry.name.match(
              /^device-(?:(?:mac|android|ios|windows|linux|web|node)-)?(.+?)(?:-\d{10,15})?\.json$/i
            );
            const devId = match ? match[1] : entry.name;
            if (devId && devId.toLowerCase() !== deviceId.toLowerCase()) {
              foreignDeviceIds.add(devId.toLowerCase());
            }
          } else if (c.kind === 'snapshot' && !c.isArtifactToClean) {
            dailyBackupCount++;
          }
        }
      }
      foreignDeviceCount = foreignDeviceIds.size;
    } catch (err: any) {
      if (err instanceof SyncTimeoutError) {
        statusWarning =
          'Connected sync folder took too long to respond (cloud drive may be paused or offline).';
      }
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
    devicePlatform,
    foreignDeviceCount,
    dailyBackupCount,
    lastSyncReport,
    statusWarning,
    handleStale: handleStale || undefined,
  };
}

/**
 * Open folder picker and save the selected directory.
 */
export async function pickBackupDirectory(): Promise<{
  success: boolean;
  name?: string;
  totalChanges?: number;
  filesProcessed?: number;
  error?: string;
}> {
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
    const syncRes = await syncDeviceFiles(handle, true, true);
    // 2. Export local state to device-<id>.json so other devices can sync our data
    await writeDeviceFile(handle, true);
    // 3. Create initial daily backup snapshot
    await performDailyBackup(handle, true);

    return {
      success: true,
      name: handle.name,
      totalChanges: syncRes.mergeResult?.totalChanges || 0,
      filesProcessed: syncRes.filesProcessed || 0,
    };
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
  // Use cachedDirectoryHandle synchronously if present so requestPermission() is called
  // in the very first microtask of the user's button click without losing user activation!
  const handle = cachedDirectoryHandle || (await getSavedDirectoryHandle());
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
  forceWrite = false,
  options?: { skipIfClean?: boolean; prelistedEntries?: FileSystemHandle[] }
): Promise<boolean> {
  if (!handle || typeof (handle as any).getFileHandle !== 'function') return false;
  try {
    const deviceId = await getOrCreateDeviceId();
    const entries = options?.prelistedEntries ?? (await getDirectoryEntries(handle));
    const ownEntries = entries.filter(
      (e) => e.kind === 'file' && classifySyncEntry(e.name, deviceId).kind === 'own-device'
    );
    const hasTimestampedOwnFile = ownEntries.some((e) => /^device-.+-\d{10,15}\.json$/i.test(e.name));

    if (!forceWrite && options?.skipIfClean && !localSyncDirty && hasTimestampedOwnFile) {
      return true;
    }

    const backupData = await exportAll(deviceId);
    const tablesHash = await computeTablesHash(backupData.tables);

    const lastHashRecord = await db.settings.get('lastExportedTablesHash');
    const prevHash = lastHashRecord?.value;
    const isSameAsPrev =
      prevHash === tablesHash ||
      (typeof prevHash === 'string' && prevHash.startsWith('{') && prevHash === JSON.stringify(backupData.tables));

    if (!forceWrite && isSameAsPrev && hasTimestampedOwnFile) {
      if (prevHash !== tablesHash) {
        // Migrate legacy multi-MB JSON string in settings to compact 64-byte SHA-256 hex digest
        await db.settings.put({ key: 'lastExportedTablesHash', value: tablesHash });
      }
      localSyncDirty = false;
      return true;
    }

    const platform = getDevicePlatformLabel();
    const jsonContent = JSON.stringify(backupData, null, 2);
    const newFileName = `device-${platform}-${deviceId}-${Date.now()}.json`;
    let writtenFileName = newFileName;
    try {
      await atomicWriteFile(handle, newFileName, jsonContent);
    } catch (timestampedWriteErr) {
      // Fallback for restricted Android SAF providers where creating new timestamped files may fail
      const canonicalFileName = `device-${platform}-${deviceId}.json`;
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

    await db.settings.put({ key: 'lastExportedTablesHash', value: tablesHash });
    await db.settings.put({ key: 'lastWrittenDeviceFile', value: writtenFileName });
    localSyncDirty = false;
    return true;
  } catch (err) {
    console.error('Failed to write device sync file:', err);
    return false;
  }
}

/**
 * Write daily archive snapshot backup-YYYY-MM-DD-<platform>-<shortId>.json if >=24h or forced.
 */
export async function performDailyBackup(
  handle: FileSystemDirectoryHandle,
  force = false,
  prelistedEntries?: FileSystemHandle[]
): Promise<boolean> {
  if (!handle || typeof (handle as any).getFileHandle !== 'function') return false;
  const deviceId = await getOrCreateDeviceId();
  const lastBackup = await db.settings.get('lastBackupAt');
  const lastBackupAt = lastBackup?.value as string;

  const hoursSince = lastBackupAt
    ? (Date.now() - new Date(lastBackupAt).getTime()) / (3600 * 1000)
    : 999;

  if (!force && hoursSince < 24) {
    await pruneOldBackups(handle, prelistedEntries).catch(() => {});
    return false; // Backup is fresh (<24h)
  }

  const todayStr = formatLocalDate();
  const platform = getDevicePlatformLabel();
  const shortId = deviceId.slice(0, 8);
  const dailyFileName = `backup-${todayStr}-${platform}-${shortId}.json`;

  try {
    // Check if today's daily snapshot from this device already exists in the folder.
    // Never overwrite an existing daily snapshot in-place because macOS Google Drive FileProvider
    // drops com.google.drivefs.item-id#S when an existing file is overwritten via .crswap.
    const entries = prelistedEntries ?? (await getDirectoryEntries(handle));
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

    // Determine oldest active foreign device export horizon so tombstones aren't compacted prematurely
    let oldestForeignHorizon: string | undefined;
    try {
      const mtimesRecord = await db.settings.get('deviceSyncMtimes');
      const mtimesObj = mtimesRecord?.value;
      if (mtimesObj && typeof mtimesObj === 'object') {
        for (const [fileName, meta] of Object.entries(mtimesObj as Record<string, any>)) {
          if (!fileName.toLowerCase().startsWith('device-')) continue;
          const expIso = typeof meta?.exportedAt === 'string' ? meta.exportedAt : '';
          if (expIso && (!oldestForeignHorizon || expIso < oldestForeignHorizon)) {
            oldestForeignHorizon = expIso;
          }
        }
      }
    } catch {
      // ignore horizon lookup error
    }

    // Compact tombstones older than 60 days (clamped by active foreign device horizon)
    await compactTombstones(60, oldestForeignHorizon).catch((err) =>
      console.warn('Tombstone compaction skipped:', err)
    );

    // Prune old daily backups (keep last 2 as emergency rollback)
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
 * Remove the current device's own device-*.json files from the sync folder
 * before regenerating a new Device ID so retired device files don't clutter the folder.
 */
export async function removeOwnDeviceFilesFromFolder(): Promise<void> {
  try {
    const handle = await getSavedDirectoryHandle();
    if (!handle || typeof (handle as any).removeEntry !== 'function') return;
    const perm = await verifyHandlePermission(handle, false);
    if (perm !== 'granted') return;
    const deviceId = await getOrCreateDeviceId();
    const entries = await getDirectoryEntries(handle);
    for (const entry of entries) {
      if (entry.kind === 'file') {
        const c = classifySyncEntry(entry.name, deviceId);
        if (c.kind === 'own-device' || c.kind === 'own-artifact') {
          await (handle as any).removeEntry(entry.name).catch(() => {});
        }
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

/**
 * Safely enumerate directory entries across desktop and mobile browsers,
 * with fallbacks for handle.values(), handle[Symbol.asyncIterator], and handle.entries().
 * Throws when iteration methods fail with permission/system errors so callers do not
 * mistakenly treat failure as an empty folder.
 */
async function getDirectoryEntriesInner(handle: FileSystemDirectoryHandle): Promise<FileSystemHandle[]> {
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

async function getDirectoryEntries(
  handle: FileSystemDirectoryHandle,
  timeoutMs = SYNC_IO_TIMEOUT_MS
): Promise<FileSystemHandle[]> {
  return withTimeout(getDirectoryEntriesInner(handle), timeoutMs, 'Folder entry listing');
}

/**
 * Keep only the last 2 backup-*.json files as an emergency rollback, deleting older ones.
 */
export async function pruneOldBackups(
  handle: FileSystemDirectoryHandle,
  prelistedEntries?: FileSystemHandle[]
): Promise<number> {
  try {
    const backupFiles: string[] = [];
    const entries = prelistedEntries ?? (await getDirectoryEntries(handle));

    for (const entry of entries) {
      if (entry.kind === 'file' && entry.name.toLowerCase().startsWith('backup-') && entry.name.toLowerCase().endsWith('.json')) {
        backupFiles.push(entry.name);
      }
    }

    // Sort ascending (YYYY-MM-DD lexicographical sorting matches chronological order)
    backupFiles.sort();

    const maxKeep = 2;
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

const KNOWN_PLATFORMS = ['mac', 'android', 'ios', 'windows', 'linux', 'web', 'node'];

export function inferPlatformFromFilename(name: string): string {
  const lower = (name || '').toLowerCase();
  const m = lower.match(
    /^(?:device|backup-\d{4}-\d{2}-\d{2}|ekirum-backup-[^_]+_[^-]+)-(mac|android|ios|windows|linux|web|node)-/
  );
  return m ? m[1] : '';
}

function formatFileOrigin(
  data: any,
  fileName: string,
  localDeviceId: string,
  localPlatform: string
): string {
  const fileDevId = typeof data?.deviceId === 'string' && data.deviceId ? data.deviceId : '';
  const isOwn = Boolean(fileDevId && fileDevId.toLowerCase() === localDeviceId.toLowerCase());
  const filePlatform =
    (typeof data?.devicePlatform === 'string' && data.devicePlatform ? data.devicePlatform : '') ||
    inferPlatformFromFilename(fileName) ||
    (isOwn ? localPlatform : '');
  const shortId = fileDevId ? fileDevId.slice(0, 8) : 'unknown';
  const deviceTag = filePlatform ? `${filePlatform}-${shortId}` : shortId;
  const who = isOwn ? `THIS DEVICE (${deviceTag})` : `OTHER DEVICE (${deviceTag})`;
  const taskCount = Array.isArray(data?.tables?.tasks)
    ? data.tables.tasks.filter((t: any) => !t?.isDeleted).length
    : 0;
  const profile = Array.isArray(data?.tables?.userProfile)
    ? data.tables.userProfile[0]
    : data?.tables?.userProfile;
  const level = profile?.ekirumLevel || 1;
  const xp = profile?.totalXp || 0;
  return `Generated by: ${who} • ${taskCount} tasks • Lv.${level} (${xp} XP)`;
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

  const localIdLower = localDeviceId.toLowerCase();
  const ownPrefixes = [
    `device-${localIdLower}`,
    ...KNOWN_PLATFORMS.map((p) => `device-${p}-${localIdLower}`),
  ];

  for (const ownPrefix of ownPrefixes) {
    const ownCanonicalName = `${ownPrefix}.json`;

    // Own primary device file (legacy device-<id>.json or write-once device-[<platform>-]<id>-<timestamp>.json)
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

  // Daily backup snapshots or exported backups (e.g. backup-YYYY-MM-DD.json, backup-YYYY-MM-DD-mac-25cf9d03.json, or ekirum-backup-*.json)
  if (
    (lower.startsWith('backup-') || lower.startsWith('ekirum-backup-')) &&
    (lower.endsWith('.json') || lower.endsWith('.tmp') || /\.json\s*\(\d+\)$/.test(lower))
  ) {
    const isArtifact = !lower.endsWith('.json') || /\(\d+\)\.json$/.test(lower);
    return { shouldProcess: true, isArtifactToClean: isArtifact, kind: 'snapshot' };
  }

  return { shouldProcess: false, isArtifactToClean: false, kind: 'none' };
}

export interface SyncReport {
  at: string;
  deviceId: string;
  devicePlatform?: string;
  entryCount: number;
  items: { name: string; result: string; origin?: string }[];
  error?: string;
  ran: boolean;
}

/**
 * Scan the shared backup folder for other device-<id>.json files and backup snapshots and merge them in.
 * Every non-throttled pass stores a per-file report under settings key 'lastSyncReport'
 * so the user can see exactly what the device saw in the folder and what happened to each file.
 */
export async function syncDeviceFiles(
  handle: FileSystemDirectoryHandle,
  force = false,
  forceFullResync = false
): Promise<{ filesProcessed: number; mergeResult?: MergeResult; entries?: FileSystemHandle[] }> {
  const report: SyncReport = {
    at: new Date().toISOString(),
    deviceId: '',
    devicePlatform: getDevicePlatformLabel(),
    entryCount: 0,
    items: [],
    ran: false,
  };
  const res = await syncDeviceFilesInner(handle, force, forceFullResync, report);
  if (report.ran) {
    if (res.mergeResult?.error) report.error = res.mergeResult.error;
    await db.settings.put({ key: 'lastSyncReport', value: report }).catch(() => {});
  }
  return res;
}

async function syncDeviceFilesInner(
  handle: FileSystemDirectoryHandle,
  force: boolean,
  forceFullResync: boolean,
  report: SyncReport
): Promise<{ filesProcessed: number; mergeResult?: MergeResult; entries?: FileSystemHandle[] }> {
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

    report.ran = true;
    let localDeviceId = await getOrCreateDeviceId();
    const localPlatform = getDevicePlatformLabel();
    let totalMergedChanges = 0;
    let filesProcessed = 0;
    let filesFailed = 0;
    report.deviceId = localDeviceId;
    report.devicePlatform = localPlatform;

    const [syncMtimesRecord, supersededRecord] = await Promise.all([
      forceFullResync ? Promise.resolve(null) : db.settings.get('deviceSyncMtimes'),
      db.settings.get('supersededDeviceFiles'),
    ]);
    const syncMtimes: Record<string, any> =
      syncMtimesRecord?.value && typeof syncMtimesRecord.value === 'object'
        ? { ...syncMtimesRecord.value }
        : {};
    const rawSuperseded: string[] = Array.isArray(supersededRecord?.value) ? supersededRecord.value : [];
    // Only foreign device files (device-*.json) can ever be marked superseded.
    // Purge any snapshots mistakenly recorded in supersededSet by older versions.
    const supersededSet = new Set<string>(
      rawSuperseded.filter((name) => name.toLowerCase().startsWith('device-'))
    );
    if (supersededSet.size !== rawSuperseded.length) {
      await db.settings.put({ key: 'supersededDeviceFiles', value: Array.from(supersededSet) });
    }
    let mtimesChanged = false;
    let supersededChanged = false;

    const MAX_DEVICE_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

    const entries = await getDirectoryEntries(handle);
    report.entryCount = entries.length;

    // Detect and resolve Device ID collisions:
    // If two devices share the same deviceId (e.g. from an imported backup, Chrome-synced profile,
    // or manual file restore), they cannot see each other's device files.
    // If the sync folder contains a device file with our localDeviceId that was authored by another
    // device (higher task count or higher XP than local, or different fingerprint when this instance
    // never wrote that file), auto-regenerate a fresh unique device ID for this device so both can sync.
    const lastWrittenRecord = await db.settings.get('lastWrittenDeviceFile');
    const lastWrittenFile: string = lastWrittenRecord?.value || '';
    const lastHashRecord = await db.settings.get('lastExportedTablesHash');
    const lastExportedHash: string = lastHashRecord?.value || '';

    const ownDeviceEntries = entries.filter(
      (e) => e.kind === 'file' && classifySyncEntry(e.name, localDeviceId).kind === 'own-device'
    );

    if (ownDeviceEntries.length > 0) {
      let isForeignCollision = false;
      for (const ownEntry of ownDeviceEntries) {
        if (lastWrittenFile && ownEntry.name === lastWrittenFile) {
          continue;
        }
        try {
          const f = await (ownEntry as any).getFile();
          const ownCheckKey = `__own_verified__:${ownEntry.name}`;
          const prevOwnCheck = syncMtimes[ownCheckKey];
          if (
            !forceFullResync &&
            prevOwnCheck &&
            typeof prevOwnCheck === 'object' &&
            prevOwnCheck.mtime === f.lastModified &&
            prevOwnCheck.size === f.size
          ) {
            continue;
          }
          const txt = await f.text();
          if (txt.length > 0) {
            const parsed = JSON.parse(txt);
            const fileHash = await computeTablesHash(parsed?.tables || {});
            const localExport = await exportAll(localDeviceId);
            const localHash = await computeTablesHash(localExport.tables);
            const matchesLastExported =
              fileHash === lastExportedHash ||
              (lastExportedHash.startsWith('{') && JSON.stringify(parsed?.tables || {}) === lastExportedHash);

            if (fileHash !== localHash && !matchesLastExported) {
              const fileTaskCount = Array.isArray(parsed?.tables?.tasks) ? parsed.tables.tasks.length : 0;
              const localTaskCount = localExport.tables.tasks?.length || 0;
              const fileXp = parsed?.tables?.userProfile?.[0]?.totalXp || 0;
              const localXp = localExport.tables.userProfile?.[0]?.totalXp || 0;

              // Collision confirmed if this device never wrote a device file to this folder,
              // or if the external file with our ID has more tasks or XP than local
              if (!lastWrittenFile || fileTaskCount > localTaskCount || fileXp > localXp) {
                isForeignCollision = true;
                break;
              }
            }
            syncMtimes[ownCheckKey] = { mtime: f.lastModified, size: f.size };
            mtimesChanged = true;
          }
        } catch {
          // ignore read errors during collision check
        }
      }

      if (isForeignCollision) {
        const oldId = localDeviceId;
        localDeviceId = await regenerateDeviceId();
        report.deviceId = localDeviceId;
        report.items.push({
          name: `device-${oldId.slice(0, 8)}…`,
          result: `Device ID collision resolved: assigned new unique ID (${localDeviceId.slice(0, 8)}…)`,
        });
      }
    }

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
        report.items.push({ name: entry.name, result: 'leftover from this device (cleaned up)' });
        if (typeof (handle as any).removeEntry === 'function') {
          await handle.removeEntry(entry.name).catch(() => {});
        }
        continue;
      }

      if (classification.kind === 'own-device') {
        // Local IndexedDB is already the authoritative state of truth for the local device.
        // Skip reading/parsing own device files on background polls to save disk/cloud I/O.
        let ownOrigin = `Generated by: THIS DEVICE (${localPlatform}-${localDeviceId.slice(0, 8)})`;
        if (force) {
          try {
            const ownFile = await (entry as any).getFile();
            const ownText = await ownFile.text();
            if (ownText.length > 0 && ownText.length <= MAX_DEVICE_FILE_SIZE) {
              const ownData = JSON.parse(ownText);
              ownOrigin = formatFileOrigin(ownData, entry.name, localDeviceId, localPlatform);
            }
          } catch {
            // fallback to default ownOrigin
          }
        }
        report.items.push({
          name: entry.name,
          result: "this device's own file (skipped)",
          origin: ownOrigin,
        });
        continue;
      }

      if (!forceFullResync && entry.name.toLowerCase().startsWith('device-') && supersededSet.has(entry.name)) {
        report.items.push({ name: entry.name, result: 'older copy (skipped)' });
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
      deviceId: string;
      origin: string;
      isArtifactToClean: boolean;
      isSnapshot: boolean;
      isCanonicalForeignDevice: boolean;
      currentMtime: number;
      currentSize: number;
      hasExplicitSize: boolean;
      currentExportedAt: string;
      taskCount: number;
      totalXp: number;
      sortTime: number;
      shouldMerge: boolean;
    }

    const parsedCandidates: ParsedCandidate[] = [];
    const [localTaskCount, localProfile] =
      candidatesToExamine.length > 0
        ? await Promise.all([db.tasks.count(), db.userProfile.toCollection().first()])
        : [0, undefined];
    const localXp = localProfile?.totalXp || 0;

    for (const { entry, isArtifactToClean, isSnapshot, isCanonicalForeignDevice } of candidatesToExamine) {
      try {
        const file = await (entry as any).getFile();

        // Reject files exceeding max safe payload size
        if (typeof file.size === 'number' && file.size > MAX_DEVICE_FILE_SIZE) {
          console.warn(`Device file ${entry.name} exceeds 25 MB limit (${file.size} bytes). Skipping.`);
          report.items.push({ name: entry.name, result: `FAILED: file too large (${file.size} bytes)` });
          filesFailed++;
          continue;
        }

        const hasExplicitSize = typeof file.size === 'number';
        const statMtime = typeof file.lastModified === 'number' ? file.lastModified : 0;
        const prevMeta = syncMtimes[entry.name];

        // Fast-path before calling file.text() / JSON.parse():
        // Skip reading unchanged files when mtime & size match our structured syncMtimes record
        // (preserving legacy numeric-mtime migration where typeof prevMeta === 'number').
        if (
          !forceFullResync &&
          !isArtifactToClean &&
          prevMeta &&
          typeof prevMeta === 'object' &&
          typeof file.lastModified === 'number' &&
          file.lastModified === prevMeta.mtime &&
          (hasExplicitSize ? file.size === prevMeta.size && file.size > 0 : prevMeta.hasExplicitSize === false)
        ) {
          const cachedTaskCount = typeof prevMeta.taskCount === 'number' ? prevMeta.taskCount : -1;
          const cachedXp = typeof prevMeta.totalXp === 'number' ? prevMeta.totalXp : -1;
          const hasCachedCounts = cachedTaskCount >= 0 && cachedXp >= 0;
          const cachedBehind = cachedTaskCount > localTaskCount || cachedXp > localXp;

          if (hasCachedCounts && !cachedBehind) {
            if (!isSnapshot && prevMeta.deviceId === localDeviceId) {
              report.items.push({
                name: entry.name,
                result: 'device file matched own ID (skipped)',
                origin: prevMeta.origin,
              });
              continue;
            }

            parsedCandidates.push({
              entry,
              data: null,
              deviceId: typeof prevMeta.deviceId === 'string' ? prevMeta.deviceId : '',
              origin: typeof prevMeta.origin === 'string' ? prevMeta.origin : '',
              isArtifactToClean,
              isSnapshot,
              isCanonicalForeignDevice,
              currentMtime: statMtime,
              currentSize: hasExplicitSize ? file.size : (prevMeta.size ?? 0),
              hasExplicitSize,
              currentExportedAt: typeof prevMeta.exportedAt === 'string' ? prevMeta.exportedAt : '',
              taskCount: cachedTaskCount,
              totalXp: cachedXp,
              sortTime: typeof prevMeta.sortTime === 'number' ? prevMeta.sortTime : statMtime,
              shouldMerge: false,
            });
            continue;
          }
        }

        const text = await file.text();
        if (text.length > MAX_DEVICE_FILE_SIZE) {
          console.warn(`Device file ${entry.name} content exceeds 25 MB limit. Skipping.`);
          report.items.push({ name: entry.name, result: 'FAILED: content too large' });
          filesFailed++;
          continue;
        }
        if (text.length === 0) {
          report.items.push({ name: entry.name, result: 'FAILED: file is empty (0 bytes) on this device' });
          filesFailed++;
          continue;
        }

        const data = JSON.parse(text);
        const origin = formatFileOrigin(data, entry.name, localDeviceId, localPlatform);

        const currentMtime = statMtime;
        const currentSize = hasExplicitSize && file.size > 0 ? file.size : text.length;
        const currentExportedAt = typeof data?.exportedAt === 'string' ? data.exportedAt : '';
        const exportedMs = currentExportedAt ? Date.parse(currentExportedAt) : NaN;
        const sortTime = !Number.isNaN(exportedMs) ? exportedMs : currentMtime;
        const candidateDeviceId = typeof data?.deviceId === 'string' ? data.deviceId : '';
        const candidateTaskCount = Array.isArray(data?.tables?.tasks) ? data.tables.tasks.length : 0;
        const candidateXp = data?.tables?.userProfile?.[0]?.totalXp || 0;

        // For device files: If a foreign device file internally claims to have the local device ID,
        // local IndexedDB is already the authoritative state of truth for this device ID.
        // (Snapshots are archive backups and are ALWAYS eligible for CRDT/LWW merge if not unchanged).
        if (!isSnapshot && candidateDeviceId === localDeviceId) {
          report.items.push({
            name: entry.name,
            result: 'device file matched own ID (skipped)',
            origin,
          });
          syncMtimes[entry.name] = {
            mtime: currentMtime,
            size: currentSize,
            hasExplicitSize,
            exportedAt: currentExportedAt,
            deviceId: candidateDeviceId,
            origin,
            taskCount: candidateTaskCount,
            totalXp: candidateXp,
            sortTime,
          };
          mtimesChanged = true;
          continue;
        }

        const prevMtime = typeof prevMeta === 'number' ? prevMeta : (prevMeta?.mtime ?? -1);
        const prevSize = typeof prevMeta === 'object' && prevMeta !== null ? (prevMeta?.size ?? -1) : -1;
        const prevExportedAt =
          typeof prevMeta === 'object' && prevMeta !== null ? (prevMeta?.exportedAt ?? '') : '';

        const isBehindCandidate = candidateTaskCount > localTaskCount || candidateXp > localXp;

        const isUnchanged =
          !isBehindCandidate &&
          !forceFullResync &&
          !isArtifactToClean &&
          prevMeta !== undefined &&
          typeof prevMeta === 'object' &&
          currentMtime === prevMtime &&
          currentSize === prevSize &&
          currentExportedAt === prevExportedAt;

        if (isUnchanged && (prevMeta.taskCount === undefined || prevMeta.hasExplicitSize === undefined)) {
          syncMtimes[entry.name] = {
            mtime: currentMtime,
            size: currentSize,
            hasExplicitSize,
            exportedAt: currentExportedAt,
            deviceId: candidateDeviceId,
            origin,
            taskCount: candidateTaskCount,
            totalXp: candidateXp,
            sortTime,
          };
          mtimesChanged = true;
        }

        parsedCandidates.push({
          entry,
          data,
          deviceId: candidateDeviceId,
          origin,
          isArtifactToClean,
          isSnapshot,
          isCanonicalForeignDevice,
          currentMtime,
          currentSize,
          hasExplicitSize,
          currentExportedAt,
          taskCount: candidateTaskCount,
          totalXp: candidateXp,
          sortTime,
          shouldMerge: !isUnchanged,
        });
      } catch (e: any) {
        filesFailed++;
        report.items.push({
          name: entry.name,
          result: `FAILED to read: ${e?.name || 'Error'}: ${e?.message || String(e)}`,
        });
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
      if (!candidate.shouldMerge) {
        report.items.push({
          name: candidate.entry.name,
          result: 'unchanged since last sync (skipped)',
          origin: candidate.origin,
        });
        continue;
      }
      const {
        entry,
        data,
        deviceId: candidateDeviceId,
        origin,
        isArtifactToClean,
        currentMtime,
        currentSize,
        hasExplicitSize,
        currentExportedAt,
        taskCount,
        totalXp,
        sortTime,
      } = candidate;

      try {
        const mergeRes = await importAndMerge(data);
        if (mergeRes.success) {
          report.items.push({
            name: entry.name,
            result: `merged (${mergeRes.totalChanges} change${mergeRes.totalChanges === 1 ? '' : 's'})`,
            origin,
          });
          filesProcessed++;
          totalMergedChanges += mergeRes.totalChanges;
          if (isArtifactToClean && typeof (handle as any).removeEntry === 'function') {
            await handle.removeEntry(entry.name).catch(() => {});
            delete syncMtimes[entry.name];
          } else {
            syncMtimes[entry.name] = {
              mtime: currentMtime,
              size: currentSize,
              hasExplicitSize,
              exportedAt: currentExportedAt,
              deviceId: candidateDeviceId,
              origin,
              taskCount,
              totalXp,
              sortTime,
            };
          }
          mtimesChanged = true;
        } else {
          filesFailed++;
          report.items.push({
            name: entry.name,
            result: `FAILED merge: ${mergeRes.error || 'Unknown merge error'}`,
            origin,
          });
          console.warn(`Error merging device sync file ${entry.name}:`, mergeRes.error);
        }
      } catch (e: any) {
        filesFailed++;
        report.items.push({
          name: entry.name,
          result: `FAILED merge exception: ${e?.message || String(e)}`,
          origin,
        });
        console.warn(`Error merging device sync file ${entry.name}:`, e);
      }
    }

    // Clean up older superseded files for the SAME foreign deviceId only (never across different deviceIds),
    // and only if all candidates merged without errors.
    if (filesFailed === 0) {
      const foreignByDeviceId = new Map<string, ParsedCandidate[]>();
      for (const c of parsedCandidates) {
        if (!c.isCanonicalForeignDevice) continue;
        const devId = c.deviceId;
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
      entries,
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

    if (totalChanges > 0) {
      localSyncDirty = true;
      notifyCrossTabSync('remote-merged');
    }

    // 2. Export our up-to-date state, reusing the already-listed directory entries on unforced polls
    const deviceWriteOk = await writeDeviceFile(handle, false, {
      skipIfClean: !force,
      prelistedEntries: syncRes.entries,
    });

    // 3. Daily backup snapshot (if >=24h or forced)
    await performDailyBackup(handle, force, syncRes.entries);

    const syncSuccess = Boolean(syncRes.mergeResult && syncRes.mergeResult.success);
    const isSuccess = syncSuccess && (deviceWriteOk || filesProcessed > 0);
    return {
      success: isSuccess,
      totalChanges,
      filesProcessed,
      deviceWriteOk,
      error:
        syncRes.mergeResult?.error ||
        (!deviceWriteOk ? 'Could not write device sync file. Verify write permissions for the sync folder.' : undefined),
    };
  } catch (err) {
    console.warn('maybeBackupAndSync error:', err);
    return {
      success: false,
      totalChanges: 0,
      filesProcessed: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

let pendingSyncFullResync: boolean | null = null;

async function withCrossTabSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request('ekirum-folder-sync', { mode: 'exclusive' }, fn);
  }
  return fn();
}

/**
 * Automated lifecycle check: called on app mount, visibilitychange, and periodic checks.
 * Queues concurrent requests instead of dropping them so manual "Sync Now" or rapid
 * local mutations during an in-flight sync never fail or get lost, and serializes across browser tabs.
 */
export async function maybeBackupAndSync(force = false, forceFullResync = false): Promise<BackupAndSyncResult> {
  if (activeSyncPromise) {
    pendingSyncForce = Boolean(pendingSyncForce || force);
    pendingSyncFullResync = Boolean(pendingSyncFullResync || forceFullResync);
    return await activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    let aggregatedSuccess = false;
    let aggregatedChanges = 0;
    let aggregatedFiles = 0;
    let lastDeviceWriteOk: boolean | undefined = undefined;
    let lastError: string | undefined = undefined;
    let currentForce = force;
    let currentFullResync = forceFullResync;

    try {
      while (true) {
        pendingSyncForce = null;
        pendingSyncFullResync = null;
        const res = await withCrossTabSyncLock(() =>
          executeBackupAndSyncPass(currentForce, currentFullResync)
        );
        aggregatedSuccess = res.success;
        aggregatedChanges += res.totalChanges;
        aggregatedFiles += res.filesProcessed;
        if (res.deviceWriteOk !== undefined) {
          lastDeviceWriteOk = res.deviceWriteOk;
        }
        lastError = res.error;

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
        error: lastError,
      };
    } finally {
      activeSyncPromise = null;
      pendingSyncForce = null;
      pendingSyncFullResync = null;
    }
  })();

  return activeSyncPromise;
}
