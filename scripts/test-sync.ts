import 'fake-indexeddb/auto';
import { db, initializeDatabase } from '../src/lib/db';
import { exportAll, importAndMerge } from '../src/lib/syncEngine';
import { syncDeviceFiles } from '../src/lib/backupService';

async function runTests() {
  console.log('🧪 Starting Dexie & Sync Engine verification tests...\n');

  // Test 1: Database Initialization & Seeding Test Fixtures
  console.log('Test 1: Database initialization & seeding test fixtures...');
  await initializeDatabase();

  const nowIso = new Date().toISOString();
  await db.tasks.put({
    id: 'task-1',
    projectId: 'proj-1',
    title: 'Initial Test Task',
    priority: 'p2',
    labels: ['test'],
    completed: false,
    subtasks: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    isDeleted: false,
  });

  await db.habits.put({
    id: 'habit-1',
    title: 'Mindful Walk',
    frequency: 'daily',
    color: '#8B1528',
    icon: 'Sparkle',
    streak: 0,
    longestStreak: 0,
    completedDates: [],
    archived: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    isDeleted: false,
  });

  const initialTaskCount = await db.tasks.count();
  const initialHabitCount = await db.habits.count();
  console.log(`  ✓ Database initialized with ${initialTaskCount} tasks and ${initialHabitCount} habits.`);

  // Test 2: exportAll
  console.log('\nTest 2: exportAll generates valid versioned backup...');
  const exportData = await exportAll('device-test-1');
  console.log(`  ✓ schemaVersion: ${exportData.schemaVersion}, deviceId: ${exportData.deviceId}`);
  console.log(`  ✓ Exported ${exportData.tables.tasks.length} tasks, ${exportData.tables.habits.length} habits.`);
  if (exportData.schemaVersion !== 1 || exportData.tables.tasks.length === 0) {
    throw new Error('exportAll failed to create valid structure.');
  }

  // Test 3: importAndMerge — New Record Insertion
  console.log('\nTest 3: importAndMerge inserts incoming new records...');
  const remoteNewTask = {
    id: 'task-remote-new',
    projectId: 'proj-1',
    title: 'Remote Task created on Device B',
    priority: 'p1' as const,
    labels: ['sync'],
    completed: false,
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false,
  };

  const mergeRes1 = await importAndMerge({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    deviceId: 'device-b',
    tables: {
      tasks: [remoteNewTask],
    },
  });

  const retrievedNew = await db.tasks.get('task-remote-new');
  console.log(`  ✓ Inserted ${mergeRes1.stats.tasks?.inserted} task. Found in DB: "${retrievedNew?.title}"`);
  if (!retrievedNew || retrievedNew.title !== 'Remote Task created on Device B') {
    throw new Error('New task was not inserted.');
  }

  // Test 4: importAndMerge — Last-Write-Wins (Newer update wins)
  console.log('\nTest 4: importAndMerge updates record when incoming updatedAt is newer...');
  const localTask = await db.tasks.get('task-1');
  if (!localTask) throw new Error('task-1 not found');

  const newerTime = new Date(Date.now() + 10000).toISOString();
  const newerRemoteTask = {
    ...localTask,
    title: 'Title Updated on Device B (Newer)',
    updatedAt: newerTime,
  };

  const mergeRes2 = await importAndMerge({
    schemaVersion: 1,
    tables: {
      tasks: [newerRemoteTask],
    },
  });

  const updatedLocal = await db.tasks.get('task-1');
  console.log(`  ✓ Updated ${mergeRes2.stats.tasks?.updated} task. New title: "${updatedLocal?.title}"`);
  if (updatedLocal?.title !== 'Title Updated on Device B (Newer)') {
    throw new Error('Newer incoming record did not overwrite older local record.');
  }

  // Test 5: importAndMerge — Older update is ignored (Local wins)
  console.log('\nTest 5: importAndMerge ignores incoming record when incoming updatedAt is older...');
  const olderTime = new Date(Date.now() - 500000).toISOString();
  const olderRemoteTask = {
    ...updatedLocal,
    title: 'Stale Title from Device B (Older)',
    updatedAt: olderTime,
  };

  const mergeRes3 = await importAndMerge({
    schemaVersion: 1,
    tables: {
      tasks: [olderRemoteTask],
    },
  });

  const preservedLocal = await db.tasks.get('task-1');
  console.log(`  ✓ Skipped ${mergeRes3.stats.tasks?.skipped} task. Title preserved: "${preservedLocal?.title}"`);
  if (preservedLocal?.title !== 'Title Updated on Device B (Newer)') {
    throw new Error('Older incoming record erroneously overwrote newer local record.');
  }

  // Test 6: Soft Delete Tombstone Propagation
  console.log('\nTest 6: Soft delete tombstones propagate correctly...');
  const deletedRemoteTask = {
    ...updatedLocal,
    isDeleted: true,
    deletedAt: new Date(Date.now() + 20000).toISOString(),
    updatedAt: new Date(Date.now() + 20000).toISOString(),
  };

  await importAndMerge({
    schemaVersion: 1,
    tables: {
      tasks: [deletedRemoteTask],
    },
  });

  const tombstoned = await db.tasks.get('task-1');
  console.log(`  ✓ Task soft-deleted in DB: isDeleted = ${tombstoned?.isDeleted}`);
  if (!tombstoned?.isDeleted) {
    throw new Error('Tombstone did not update local record.');
  }

  // Test 7: Habit Events Multi-Device Union and Streak Re-computation
  console.log('\nTest 7: Habit events from multiple devices merge and recalculate streaks...');
  const habit1 = await db.habits.get('habit-1');
  if (!habit1) throw new Error('habit-1 not found');

  // Device B logged a check-in for 10 days ago and 11 days ago
  const d10 = new Date(Date.now() - 86400000 * 10).toISOString().split('T')[0];
  const d11 = new Date(Date.now() - 86400000 * 11).toISOString().split('T')[0];

  const remoteHabitEvents = [
    {
      id: `event-remote-1`,
      habitId: 'habit-1',
      date: d10,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
    },
    {
      id: `event-remote-2`,
      habitId: 'habit-1',
      date: d11,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
    },
  ];

  await importAndMerge({
    schemaVersion: 1,
    tables: {
      habitEvents: remoteHabitEvents,
    },
  });

  const mergedHabit = await db.habits.get('habit-1');
  console.log(`  ✓ Habit-1 completedDates after merge includes ${d10} & ${d11}: ${mergedHabit?.completedDates.includes(d10)}`);
  console.log(`  ✓ Longest streak recomputed: ${mergedHabit?.longestStreak} days`);
  if (!mergedHabit?.completedDates.includes(d10) || !mergedHabit?.completedDates.includes(d11)) {
    throw new Error('Habit events were not unioned into habit.completedDates.');
  }

  // Test 8: Schema sanitization & poisoned input resilience
  console.log('\nTest 8: Resilience against malformed/poisoned payloads in importAndMerge...');
  const poisonedPayload = {
    schemaVersion: 1,
    tables: {
      tasks: [
        null, // null entry
        undefined, // undefined entry
        { notEvenAnId: 'bad' }, // missing id
        { id: '', title: 'Empty id task' }, // empty id
        { id: 'poison-1', title: { malicious: 'object' }, labels: 'not-array', subtasks: 12345 }, // non-string title and non-array fields
        { id: 'poison-2', title: 'Valid String Title', priority: 'invalid-priority', dueDate: 'invalid-date' },
      ],
      userProfile: [
        null,
        { id: 'user-main', name: { nested: 'bad' }, avatar: 'data:image/svg+xml;...script', totalXp: 'not-a-number' },
      ],
    },
  };

  const mergeResPoison = await importAndMerge(poisonedPayload);
  if (!mergeResPoison.success) {
    throw new Error('importAndMerge failed on malformed payload instead of safely handling it.');
  }

  const p1 = await db.tasks.get('poison-1');
  const p2 = await db.tasks.get('poison-2');
  console.log(`  ✓ Malformed task sanitized safely: title="${p1?.title}", labels=${JSON.stringify(p1?.labels)}, subtasks=${JSON.stringify(p1?.subtasks)}`);
  console.log(`  ✓ Invalid priority/dueDate sanitized: priority="${p2?.priority}", dueDate="${p2?.dueDate}"`);

  if (!p1 || typeof p1.title !== 'string' || !Array.isArray(p1.labels) || !Array.isArray(p1.subtasks)) {
    throw new Error('Poisoned task 1 was not sanitized properly.');
  }
  if (!p2 || p2.priority !== 'p4' || p2.dueDate !== undefined) {
    throw new Error('Poisoned task 2 attributes were not sanitized to safe defaults.');
  }

  // Test 9: Character & Progress Preservation on New Device
  console.log('\nTest 9: Monotonic character progress preservation on new device...');
  // Device B has freshly created local user (Level 1, 0 XP, created just now)
  const freshLocalUser = {
    id: 'user-1',
    name: 'Ekirum',
    ekirumLevel: 1,
    ekirumRank: 'Novice',
    totalXp: 0,
    dailyXpDate: '2026-10-12',
    dailyXpEarned: 150,
    achievements: [],
    soundEnabled: true,
    accentColor: 'crimson',
    onboardingCompleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.userProfile.put(freshLocalUser);

  // Incoming backup from Device A exported earlier in the past (e.g. yesterday) with established progress
  const pastTime = new Date(Date.now() - 86400000).toISOString();
  const establishedBackupUser = {
    id: 'user-1',
    name: 'Aurelius',
    ekirumLevel: 30,
    ekirumRank: 'Commander',
    totalXp: 8500,
    dailyXpDate: '2026-10-11',
    dailyXpEarned: 400,
    achievements: ['ach-1', 'ach-2', 'ach-proj-1'],
    soundEnabled: true,
    accentColor: 'crimson',
    onboardingCompleted: true,
    createdAt: pastTime,
    updatedAt: pastTime,
  };

  const establishedAchievements = [
    {
      id: 'ach-1',
      title: 'First Mark',
      description: 'Complete your first task.',
      icon: 'CheckSquare',
      unlocked: true,
      unlockedAt: pastTime,
      progress: 1,
      maxProgress: 1,
      xpReward: 25,
      xpClaimed: true,
      createdAt: pastTime,
      updatedAt: pastTime,
    },
  ];

  await importAndMerge({
    schemaVersion: 1,
    exportedAt: pastTime,
    deviceId: 'device-a',
    tables: {
      userProfile: [establishedBackupUser],
      achievements: establishedAchievements,
    },
  });

  const mergedUser = await db.userProfile.get('user-1');
  const mergedAch1 = await db.achievements.get('ach-1');

  console.log(`  ✓ Merged character level: ${mergedUser?.ekirumLevel} (expected: 30)`);
  console.log(`  ✓ Merged total XP: ${mergedUser?.totalXp} (expected: 8500)`);
  console.log(`  ✓ Merged character name: "${mergedUser?.name}" (expected: "Aurelius")`);
  console.log(`  ✓ Merged achievement ach-1 unlocked: ${Boolean(mergedAch1?.unlockedAt)} (expected: true)`);

  if (!mergedUser || mergedUser.ekirumLevel !== 30 || mergedUser.totalXp !== 8500 || mergedUser.name !== 'Aurelius') {
    throw new Error('Fresh device wiped established character progress during backup sync!');
  }
  if (!mergedAch1?.unlockedAt) {
    throw new Error('Achievement unlock was wiped by fresh device seed!');
  }

  // Test 10: Multi-device character progress merge
  console.log('\nTest 10: Multi-device character progress additive/monotonic merge...');
  const remoteDeviceCUser = {
    id: 'user-1',
    name: 'Aurelius',
    ekirumLevel: 32,
    ekirumRank: 'High Commander',
    totalXp: 9800,
    dailyXpDate: '2026-10-12',
    dailyXpEarned: 350,
    achievements: ['ach-1', 'ach-3'],
    soundEnabled: true,
    accentColor: 'crimson',
    onboardingCompleted: true,
    createdAt: pastTime,
    updatedAt: new Date().toISOString(),
  };

  await importAndMerge({
    schemaVersion: 1,
    tables: {
      userProfile: [remoteDeviceCUser],
    },
  });

  const finalUser = await db.userProfile.get('user-1');
  console.log(`  ✓ Monotonic XP progression: ${finalUser?.totalXp} XP (Level ${finalUser?.ekirumLevel}, Rank: ${finalUser?.ekirumRank})`);
  console.log(`  ✓ Unioned achievements: ${JSON.stringify(finalUser?.achievements)}`);
  console.log(`  ✓ Preserved daily XP cap tracking: ${finalUser?.dailyXpDate} (${finalUser?.dailyXpEarned} XP earned today)`);

  if (!finalUser || finalUser.totalXp !== 9800 || finalUser.ekirumLevel < 32) {
    throw new Error('Multi-device progress did not advance to highest level and XP.');
  }

  if (finalUser.dailyXpDate !== '2026-10-12' || finalUser.dailyXpEarned !== 350) {
    throw new Error(
      `Daily XP cap state lost during multi-device merge: expected 2026-10-12 / 350, got ${finalUser.dailyXpDate} / ${finalUser.dailyXpEarned}`
    );
  }

  // Test 11: syncDeviceFiles forced full resync & snapshot fallback
  console.log('\nTest 11: syncDeviceFiles forced full resync & snapshot fallback...');
  const snapshotTask = {
    id: 'task-from-daily-snapshot',
    projectId: 'proj-1',
    title: 'Task from Daily Snapshot',
    priority: 'p3' as const,
    labels: ['snapshot'],
    completed: false,
    subtasks: [],
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
    isDeleted: false,
  };

  const mockSnapshotFiles = [
    {
      name: 'backup-2026-10-18.json',
      lastModified: 1000,
      content: JSON.stringify({
        schemaVersion: 1,
        deviceId: 'device-foreign-snapshot-creator',
        exportedAt: '2026-10-18T10:00:00.000Z',
        tables: {
          tasks: [snapshotTask],
          projects: [],
          skills: [],
          habits: [],
          habitEvents: [],
          achievements: [],
          userProfile: [],
          libraryItems: [],
        },
      }),
    },
  ];

  const mockDirHandle = {
    values: async function* () {
      for (const f of mockSnapshotFiles) {
        yield {
          kind: 'file',
          name: f.name,
          getFile: async () => ({
            name: f.name,
            size: f.content.length,
            lastModified: f.lastModified,
            text: async () => f.content,
          }),
        };
      }
    },
  } as any;

  // First sync with snapshot fallback imports the task
  const snapSyncRes1 = await syncDeviceFiles(mockDirHandle, true, true);
  if (snapSyncRes1.filesProcessed !== 1 || (snapSyncRes1.mergeResult?.totalChanges || 0) < 1) {
    throw new Error('Snapshot fallback failed to import task when foreign device file was absent.');
  }
  const foundSnapshotTask = await db.tasks.get('task-from-daily-snapshot');
  if (!foundSnapshotTask || foundSnapshotTask.title !== 'Task from Daily Snapshot') {
    throw new Error('Task from daily snapshot was not saved to database.');
  }
  console.log(`  ✓ Snapshot fallback successfully merged task from backup-2026-10-18.json.`);

  // Second sync with forceFullResync=true re-reads candidate file even when mtime is identical
  const snapSyncRes2 = await syncDeviceFiles(mockDirHandle, true, true);
  if (snapSyncRes2.filesProcessed !== 1) {
    throw new Error('forceFullResync=true should have re-evaluated the file.');
  }
  console.log(`  ✓ forceFullResync=true successfully re-evaluated the file without skipping.`);

  // Test 12: Same timestamp with differing content updates record
  console.log('\nTest 12: Same timestamp with differing content applies update...');
  const sameTime = '2026-10-18T10:00:00.000Z';
  const updatedSnapshotTask = {
    ...snapshotTask,
    title: 'Updated Title Same Timestamp',
    updatedAt: sameTime,
  };

  const sameTimeMergeRes = await importAndMerge({
    schemaVersion: 1,
    tables: {
      tasks: [updatedSnapshotTask],
    },
  });

  const retrievedUpdated = await db.tasks.get('task-from-daily-snapshot');
  if (retrievedUpdated?.title !== 'Updated Title Same Timestamp') {
    throw new Error('Same timestamp update with differing content was not applied.');
  }
  console.log(`  ✓ Same timestamp differing content update applied: "${retrievedUpdated.title}".`);

  // Test 13: Lower-progress device with NEWER updatedAt timestamps still receives higher progress
  console.log('\nTest 13: Lower-progress device with newer updatedAt receives higher progress across all tables...');
  const newerLocalTime = '2026-10-19T12:00:00.000Z';
  const olderRemoteTime = '2026-10-18T08:00:00.000Z';

  await db.tasks.put({
    id: 'task-progress-sync',
    projectId: 'proj-1',
    title: 'Important Quest',
    priority: 'p1',
    labels: [],
    completed: false,
    subtasks: [
      { id: 'sub-1', title: 'Step 1', completed: false },
      { id: 'sub-2', title: 'Step 2', completed: false },
    ],
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: newerLocalTime,
    isDeleted: false,
  });

  await db.habits.put({
    id: 'habit-progress-sync',
    title: 'Daily Reading',
    frequency: 'daily',
    streak: 1,
    longestStreak: 1,
    completedDates: ['2026-10-15'],
    xpReward: 15,
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: newerLocalTime,
    isDeleted: false,
  });

  await db.libraryItems.put({
    id: 'lib-progress-sync',
    type: 'book',
    title: 'Deep Work',
    status: 'in-progress',
    xpAwarded: false,
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: newerLocalTime,
    isDeleted: false,
  });

  const higherProgressPayload = {
    schemaVersion: 1,
    deviceId: 'device-higher-progress',
    exportedAt: olderRemoteTime,
    tables: {
      tasks: [
        {
          id: 'task-progress-sync',
          projectId: 'proj-1',
          title: 'Important Quest',
          priority: 'p1',
          labels: [],
          completed: true,
          completedAt: olderRemoteTime,
          subtasks: [
            { id: 'sub-1', title: 'Step 1', completed: true },
            { id: 'sub-2', title: 'Step 2', completed: false },
          ],
          createdAt: '2026-10-15T00:00:00.000Z',
          updatedAt: olderRemoteTime,
          isDeleted: false,
        },
      ],
      habits: [
        {
          id: 'habit-progress-sync',
          title: 'Daily Reading',
          frequency: 'daily',
          streak: 3,
          longestStreak: 3,
          completedDates: ['2026-10-15', '2026-10-16', '2026-10-17'],
          xpReward: 15,
          createdAt: '2026-10-15T00:00:00.000Z',
          updatedAt: olderRemoteTime,
          isDeleted: false,
        },
      ],
      libraryItems: [
        {
          id: 'lib-progress-sync',
          type: 'book',
          title: 'Deep Work',
          status: 'done',
          xpAwarded: true,
          completedAt: olderRemoteTime,
          createdAt: '2026-10-15T00:00:00.000Z',
          updatedAt: olderRemoteTime,
          isDeleted: false,
        },
      ],
    },
  };

  const progressMergeRes = await importAndMerge(higherProgressPayload);
  if (!progressMergeRes.success || progressMergeRes.totalChanges < 3) {
    throw new Error(
      `Expected lower-progress device to apply changes from higher-progress payload, got totalChanges=${progressMergeRes.totalChanges}`
    );
  }

  const mergedProgressTask = await db.tasks.get('task-progress-sync');
  if (!mergedProgressTask?.completed || !mergedProgressTask.subtasks.find((s) => s.id === 'sub-1')?.completed) {
    throw new Error('Task and subtask completion progress was not preserved when local updatedAt was newer.');
  }

  const mergedProgressHabit = await db.habits.get('habit-progress-sync');
  if (!mergedProgressHabit || mergedProgressHabit.completedDates.length !== 3 || mergedProgressHabit.longestStreak < 3) {
    throw new Error(`Habit completedDates were not unioned: got ${JSON.stringify(mergedProgressHabit?.completedDates)}`);
  }

  const mergedProgressLib = await db.libraryItems.get('lib-progress-sync');
  if (!mergedProgressLib || mergedProgressLib.status !== 'done' || !mergedProgressLib.xpAwarded) {
    throw new Error('Library item completion progress was not preserved.');
  }
  console.log('  ✓ Lower-progress device updated tasks, subtasks, habits, and library items despite newer local updatedAt.');

  // Test 14: syncDeviceFiles merges snapshots even when device-*.json files exist, and prunes redundant foreign device files
  console.log('\nTest 14: syncDeviceFiles merges both device files and snapshots & cleans up redundant foreign device files...');
  const removedEntries: string[] = [];
  const multiFiles = [
    {
      name: 'device-foreign-old.json',
      lastModified: 1000,
      content: JSON.stringify({
        schemaVersion: 1,
        deviceId: 'foreign-device-1',
        exportedAt: '2026-10-10T10:00:00.000Z',
        tables: {
          tasks: [
            {
              id: 'task-from-old-device',
              projectId: 'proj-1',
              title: 'Old Device Task',
              priority: 'p2',
              labels: [],
              completed: true,
              completedAt: '2026-10-10T10:00:00.000Z',
              subtasks: [],
              createdAt: '2026-10-10T09:00:00.000Z',
              updatedAt: '2026-10-10T10:00:00.000Z',
              isDeleted: false,
            },
          ],
        },
      }),
    },
    {
      name: 'device-foreign-active.json',
      lastModified: 2000,
      content: JSON.stringify({
        schemaVersion: 1,
        deviceId: 'foreign-device-1',
        exportedAt: '2026-10-18T10:00:00.000Z',
        tables: {
          tasks: [],
        },
      }),
    },
    {
      name: 'device-foreign-other-device.json',
      lastModified: 2500,
      content: JSON.stringify({
        schemaVersion: 1,
        deviceId: 'foreign-device-2',
        exportedAt: '2026-10-18T12:00:00.000Z',
        tables: {
          tasks: [
            {
              id: 'task-from-other-device',
              projectId: 'proj-1',
              title: 'Other Device Task',
              priority: 'p3',
              labels: [],
              completed: false,
              subtasks: [],
              createdAt: '2026-10-18T12:00:00.000Z',
              updatedAt: '2026-10-18T12:00:00.000Z',
              isDeleted: false,
            },
          ],
        },
      }),
    },
    {
      name: 'backup-2026-10-19.json',
      lastModified: 3000,
      content: JSON.stringify({
        schemaVersion: 1,
        deviceId: 'foreign-device-1',
        exportedAt: '2026-10-19T10:00:00.000Z',
        tables: {
          tasks: [
            {
              id: 'task-from-snapshot-alongside-device',
              projectId: 'proj-1',
              title: 'Snapshot Task Alongside Device File',
              priority: 'p1',
              labels: [],
              completed: true,
              completedAt: '2026-10-19T10:00:00.000Z',
              subtasks: [],
              createdAt: '2026-10-19T09:00:00.000Z',
              updatedAt: '2026-10-19T10:00:00.000Z',
              isDeleted: false,
            },
          ],
        },
      }),
    },
  ];

  const multiDirHandle = {
    removeEntry: async (name: string) => {
      removedEntries.push(name);
    },
    values: async function* () {
      for (const f of multiFiles) {
        yield {
          kind: 'file',
          name: f.name,
          getFile: async () => ({
            name: f.name,
            size: f.content.length,
            lastModified: f.lastModified,
            text: async () => f.content,
          }),
        };
      }
    },
  } as any;

  await syncDeviceFiles(multiDirHandle, true, true);
  const taskFromSnapshotAlongside = await db.tasks.get('task-from-snapshot-alongside-device');
  const taskFromOldDevice = await db.tasks.get('task-from-old-device');
  const taskFromOtherDevice = await db.tasks.get('task-from-other-device');
  if (!taskFromSnapshotAlongside || !taskFromOldDevice || !taskFromOtherDevice) {
    throw new Error('Failed to merge both snapshot and device files when both are present in sync folder.');
  }
  if (!removedEntries.includes('device-foreign-old.json') || removedEntries.includes('device-foreign-active.json') || removedEntries.includes('device-foreign-other-device.json')) {
    throw new Error(`Expected redundant device-foreign-old.json to be pruned while preserving active and other device files, got removedEntries=${JSON.stringify(removedEntries)}`);
  }
  console.log('  ✓ Merged both device files and backup snapshots and pruned redundant foreign device file.');

  console.log('\n🎉 ALL TESTS PASSED! Dexie schema, migrations, exportAll, and LWW importAndMerge are verified!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
