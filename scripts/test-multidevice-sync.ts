import 'fake-indexeddb/auto';
import assert from 'node:assert';
import { db, initializeDatabase } from '../src/lib/db';
import { useEkirumStore } from '../src/store/useEkirumStore';
import { reconnectBackupDirectory, writeDeviceFile, atomicWriteFile } from '../src/lib/backupService';
import { exportAll } from '../src/lib/syncEngine';
import { Task, UserProfile } from '../src/types';

(globalThis as any).window = (globalThis as any).window || {};
(globalThis as any).window.showDirectoryPicker = () => {};

class MockFileHandle {
  kind = 'file' as const;
  constructor(public name: string, private store: Map<string, { content: string; lastModified: number }>) {}

  async getFile() {
    const item = this.store.get(this.name);
    if (!item) {
      const err = new Error('Not found');
      err.name = 'NotFoundError';
      throw err;
    }
    return {
      name: this.name,
      size: item.content.length,
      lastModified: item.lastModified,
      text: async () => item.content,
    };
  }

  async createWritable() {
    let buffer = '';
    return {
      write: async (chunk: string) => { buffer += chunk; },
      close: async () => {
        this.store.set(this.name, { content: buffer, lastModified: Date.now() });
      },
    };
  }
}

class MockDirectoryHandle {
  kind = 'directory' as const;
  name = 'shared-sync-folder';
  store = new Map<string, { content: string; lastModified: number }>();

  async queryPermission() {
    return 'granted' as PermissionState;
  }

  async requestPermission() {
    return 'granted' as PermissionState;
  }

  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.store.has(name)) {
      if (options?.create) {
        this.store.set(name, { content: '', lastModified: Date.now() });
      } else {
        const err = new Error('File not found: ' + name);
        err.name = 'NotFoundError';
        throw err;
      }
    }
    return new MockFileHandle(name, this.store);
  }

  async removeEntry(name: string) {
    this.store.delete(name);
  }

  async *values() {
    for (const name of this.store.keys()) {
      yield new MockFileHandle(name, this.store);
    }
  }

  async *entries() {
    for (const name of this.store.keys()) {
      yield [name, new MockFileHandle(name, this.store)];
    }
  }
}

async function runTest() {
  console.log('Testing Mobile Reconnect Simulation...');

  const mockDir = new MockDirectoryHandle();

  // Desktop exports a device file with 2 tasks and Level 3 user (200 XP)
  const desktopExport = {
    schemaVersion: 1,
    deviceId: 'desktop-device-123',
    exportedAt: '2026-10-25T14:00:00.000Z',
    tables: {
      tasks: [
        {
          id: 'task-desktop-1',
          title: 'Desktop Task 1',
          completed: true,
          completedAt: '2026-10-25T14:00:00.000Z',
          xpAwarded: 25,
          priority: 'p1',
          labels: [],
          subtasks: [],
          createdAt: '2026-10-25T13:50:00.000Z',
          updatedAt: '2026-10-25T14:00:00.000Z',
          isDeleted: false,
        },
        {
          id: 'task-desktop-2',
          title: 'Desktop Task 2 Active',
          completed: false,
          priority: 'p2',
          labels: [],
          subtasks: [],
          createdAt: '2026-10-25T13:55:00.000Z',
          updatedAt: '2026-10-25T13:55:00.000Z',
          isDeleted: false,
        },
      ],
      userProfile: [
        {
          id: 'user-1',
          name: 'Hero Player',
          ekirumLevel: 3,
          ekirumRank: 'Novice',
          totalXp: 150,
          dailyXpDate: '2026-10-25',
          dailyXpEarned: 25,
          achievements: ['ach-1', 'ach-rank-recruit'],
          createdAt: '2026-10-25T10:00:00.000Z',
          updatedAt: '2026-10-25T14:00:00.000Z',
        },
      ],
      projects: [],
      skills: [],
      habits: [],
      habitEvents: [],
      achievements: [],
      libraryItems: [],
    },
  };

  mockDir.store.set('device-desktop-device-123-1729864800000.json', {
    content: JSON.stringify(desktopExport),
    lastModified: 1729864800000,
  });

  // Now Mobile initializes
  await initializeDatabase();
  await db.settings.put({ key: 'deviceId', value: 'mobile-device-456' });
  await db.settings.put({ key: 'backupDirectoryConfig', value: { folderName: 'shared-sync-folder' } });
  
  // Prevent fake-indexeddb clone from stripping prototype methods from mock directory handle
  const originalGet = db.settings.get.bind(db.settings);
  db.settings.get = async (key: string) => {
    if (key === 'backupDirectoryHandle') {
      return { key, value: mockDir };
    }
    return originalGet(key);
  };

  // Mobile already has the task (uncompleted) and user (level 1) with timestamp later than desktop's
  await db.tasks.put({
    id: 'task-desktop-1',
    title: 'Desktop Task 1',
    completed: false,
    priority: 'p1',
    labels: [],
    subtasks: [],
    createdAt: '2026-10-25T13:50:00.000Z',
    updatedAt: '2026-10-25T14:05:00.000Z',
    isDeleted: false,
  });
  await db.userProfile.put({
    id: 'user-1',
    name: 'Hero Player',
    ekirumLevel: 1,
    ekirumRank: 'Novice',
    totalXp: 0,
    dailyXpDate: '2026-10-25',
    dailyXpEarned: 0,
    achievements: [],
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T14:05:00.000Z',
  });

  // Init store
  await useEkirumStore.getState().initStorage();

  console.log('Mobile store before reconnect:', {
    tasksCount: useEkirumStore.getState().tasks.length,
    userXp: useEkirumStore.getState().user.totalXp,
    userLevel: useEkirumStore.getState().user.ekirumLevel,
  });

  // Now simulate mobile reconnecting
  const res = await useEkirumStore.getState().reconnectBackupFolder();
  console.log('Reconnect result:', res);

  // -------------------------------------------------------------
  // Part 2: Mobile completes task-desktop-2 (+25 XP -> 175 XP)
  // Mobile exports to folder
  // -------------------------------------------------------------
  console.log('\n--- Mobile completes a task and exports ---');
  await useEkirumStore.getState().toggleTaskComplete('task-desktop-2');
  console.log('Mobile after completing task-desktop-2:', {
    userXp: useEkirumStore.getState().user.totalXp,
    task2Completed: useEkirumStore.getState().tasks.find((t) => t.id === 'task-desktop-2')?.completed,
  });

  const mobileExport = await exportAll('mobile-device-456');
  mockDir.store.set('device-mobile-device-456-1729865000000.json', {
    content: JSON.stringify(mobileExport),
    lastModified: 1729865000000,
  });

  // -------------------------------------------------------------
  // Part 3: Desktop merges Mobile's export
  // -------------------------------------------------------------
  console.log('\n--- Desktop merges Mobile export ---');
  // Reconstruct Desktop database state before merge
  await db.tasks.clear();
  await db.userProfile.clear();
  await db.tasks.bulkPut(desktopExport.tables.tasks);
  await db.userProfile.bulkPut(desktopExport.tables.userProfile);
  await db.settings.put({ key: 'deviceId', value: 'desktop-device-123' });

  // Init store as Desktop
  await useEkirumStore.getState().syncWithDatabase();
  console.log('Desktop store before merging Mobile:', {
    tasksCount: useEkirumStore.getState().tasks.length,
    userXp: useEkirumStore.getState().user.totalXp,
    task2Completed: useEkirumStore.getState().tasks.find((t) => t.id === 'task-desktop-2')?.completed,
  });

  const desktopSyncRes = await useEkirumStore.getState().triggerBackupAndSync(true, true);
  console.log('Desktop sync result:', desktopSyncRes);

  console.log('Desktop store after merging Mobile:', {
    tasksCount: useEkirumStore.getState().tasks.length,
    userXp: useEkirumStore.getState().user.totalXp,
    userLevel: useEkirumStore.getState().user.ekirumLevel,
    task2Completed: useEkirumStore.getState().tasks.find((t) => t.id === 'task-desktop-2')?.completed,
  });

  assert.strictEqual(useEkirumStore.getState().user.totalXp, 163, 'Desktop XP should converge to 163');
  assert.strictEqual(useEkirumStore.getState().tasks.find((t) => t.id === 'task-desktop-2')?.completed, true, 'Task 2 should be completed on Desktop');
  console.log('\n🎉 TWO-WAY CONVERGENCE VERIFIED!');

  // -------------------------------------------------------------
  // Part 4: Concurrent modifications on both devices!
  // Desktop completes new task-D-concurrent (+25 XP)
  // Mobile completes new task-M-concurrent (+25 XP)
  // Neither has synced yet.
  // -------------------------------------------------------------
  console.log('\n--- Part 4: Concurrent modifications on both devices ---');
  // Desktop adds and completes task-D-concurrent
  await db.tasks.put({
    id: 'task-D-concurrent',
    title: 'Desktop Concurrent Task',
    completed: true,
    completedAt: '2026-10-25T14:15:00.000Z',
    xpAwarded: 25,
    priority: 'p1',
    labels: [],
    subtasks: [],
    createdAt: '2026-10-25T14:15:00.000Z',
    updatedAt: '2026-10-25T14:15:00.000Z',
    isDeleted: false,
  });
  await db.userProfile.put({
    ...useEkirumStore.getState().user,
    id: 'user-1',
    totalXp: 163 + 25, // 188
    updatedAt: '2026-10-25T14:15:00.000Z',
  });
  const concurrentDesktopExport = await exportAll('desktop-device-123');
  mockDir.store.set('device-desktop-device-123-1729866000000.json', {
    content: JSON.stringify(concurrentDesktopExport),
    lastModified: 1729866000000,
  });

  // Now switch to Mobile database state
  await db.tasks.clear();
  await db.userProfile.clear();
  await db.tasks.bulkPut(mobileExport.tables.tasks);
  await db.userProfile.bulkPut(mobileExport.tables.userProfile);
  await db.settings.put({ key: 'deviceId', value: 'mobile-device-456' });

  // Mobile adds and completes task-M-concurrent
  await db.tasks.put({
    id: 'task-M-concurrent',
    title: 'Mobile Concurrent Task',
    completed: true,
    completedAt: '2026-10-25T14:16:00.000Z',
    xpAwarded: 25,
    priority: 'p1',
    labels: [],
    subtasks: [],
    createdAt: '2026-10-25T14:16:00.000Z',
    updatedAt: '2026-10-25T14:16:00.000Z',
    isDeleted: false,
  });
  await db.userProfile.put({
    ...mobileExport.tables.userProfile[0],
    id: 'user-1',
    totalXp: 163 + 25, // 188
    updatedAt: '2026-10-25T14:16:00.000Z',
  });
  const concurrentMobileExport = await exportAll('mobile-device-456');
  mockDir.store.set('device-mobile-device-456-1729866100000.json', {
    content: JSON.stringify(concurrentMobileExport),
    lastModified: 1729866100000,
  });

  // Mobile syncs from Desktop
  console.log('Mobile merging Desktop concurrent changes...');
  await useEkirumStore.getState().syncWithDatabase();
  const mobileSyncRes = await useEkirumStore.getState().triggerBackupAndSync(true, true);
  console.log('Mobile sync result:', mobileSyncRes);
  const mobileFinalXp = useEkirumStore.getState().user.totalXp;
  console.log('Mobile final XP:', mobileFinalXp);
  assert.strictEqual(mobileFinalXp, 163 + 25 + 25, 'Mobile should have 213 XP (163 + 25 + 25)');

  // Now Desktop syncs Mobile
  console.log('Desktop merging Mobile concurrent changes...');
  // Update mockDir with Mobile's post-merge export
  const mobilePostMergeExport = await exportAll('mobile-device-456');
  mockDir.store.set('device-mobile-device-456-1729866200000.json', {
    content: JSON.stringify(mobilePostMergeExport),
    lastModified: 1729866200000,
  });

  // Switch to Desktop
  await db.tasks.clear();
  await db.userProfile.clear();
  await db.tasks.bulkPut(concurrentDesktopExport.tables.tasks);
  await db.userProfile.bulkPut(concurrentDesktopExport.tables.userProfile);
  await db.settings.put({ key: 'deviceId', value: 'desktop-device-123' });

  await useEkirumStore.getState().syncWithDatabase();
  const desktopFinalRes = await useEkirumStore.getState().triggerBackupAndSync(true, true);
  console.log('Desktop final sync result:', desktopFinalRes);
  const desktopFinalXp = useEkirumStore.getState().user.totalXp;
  console.log('Desktop final XP:', desktopFinalXp);
  assert.strictEqual(desktopFinalXp, 163 + 25 + 25, 'Desktop should have 213 XP (163 + 25 + 25)');

  console.log('\n🎉 ALL CONCURRENT SYNC SCENARIOS FULLY CONVERGED!');
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
