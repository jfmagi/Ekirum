import 'fake-indexeddb/auto';
import { db, initializeDatabase, getOrCreateDeviceId, regenerateDeviceId } from '../src/lib/db';
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

  // Test 15: Concurrency-dependent additive CRDT XP & Skill convergence (RC1)
  console.log('\nTest 15: Concurrency-dependent additive CRDT XP & Skill convergence (RC1)...');
  const projCrdt = {
    id: 'proj-crdt',
    name: 'CRDT Project',
    skillId: 'skill-crdt',
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    isDeleted: false,
  };
  await db.projects.put(projCrdt);

  // Desktop local state: 5300 XP, 1 task completed (+300 XP), customized name 'DesktopCommander'
  await db.userProfile.put({
    id: 'user-1',
    name: 'DesktopCommander',
    totalXp: 5300,
    ekirumLevel: 14,
    ekirumRank: 'Expert',
    achievements: [],
    updatedAt: '2026-10-20T10:00:00.000Z',
  });
  await db.skills.put({
    id: 'skill-crdt',
    projectId: 'proj-crdt',
    name: 'Engineering',
    level: 5,
    xp: 500,
    xpToNextLevel: 500,
    icon: 'Hammer',
    streak: 2,
    totalCompleted: 10,
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
  });
  await db.tasks.put({
    id: 'task-desktop-done',
    projectId: 'proj-crdt',
    title: 'Desktop Work (+300 XP)',
    priority: 'p1',
    labels: [],
    completed: true,
    completedAt: '2026-10-20T10:00:00.000Z',
    xpAwarded: 300,
    subtasks: [],
    createdAt: '2026-10-20T09:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    isDeleted: false,
  });

  // Phone incoming backup payload: 5200 XP, 1 task completed (+200 XP), customized name 'PhoneChampion'
  const phonePayload = {
    schemaVersion: 1,
    deviceId: 'device-phone',
    exportedAt: '2026-10-20T10:05:00.000Z',
    tables: {
      userProfile: [
        {
          id: 'user-1',
          name: 'PhoneChampion',
          avatar: 'phone-avatar.svg',
          totalXp: 5200,
          ekirumLevel: 14,
          ekirumRank: 'Expert',
          achievements: [],
          updatedAt: '2026-10-20T10:05:00.000Z', // Phone edited profile slightly later
        },
      ],
      skills: [
        {
          id: 'skill-crdt',
          projectId: 'proj-crdt',
          name: 'Engineering',
          level: 4,
          xp: 400,
          xpToNextLevel: 320,
          icon: 'Hammer',
          streak: 1,
          totalCompleted: 9,
          createdAt: '2026-10-20T08:00:00.000Z',
          updatedAt: '2026-10-20T09:30:00.000Z',
        },
      ],
      tasks: [
        {
          id: 'task-phone-done',
          projectId: 'proj-crdt',
          title: 'Phone Work (+200 XP)',
          priority: 'p1',
          labels: [],
          completed: true,
          completedAt: '2026-10-20T09:30:00.000Z',
          xpAwarded: 200,
          subtasks: [],
          createdAt: '2026-10-20T09:00:00.000Z',
          updatedAt: '2026-10-20T09:30:00.000Z',
          isDeleted: false,
        },
      ],
    },
  };

  // Step 1: Desktop merges Phone
  const desktopMergeRes = await importAndMerge(phonePayload);
  if (!desktopMergeRes.success) {
    throw new Error(`Desktop failed to merge phone payload: ${desktopMergeRes.error}`);
  }

  const desktopUserAfterMerge = await db.userProfile.get('user-1');
  const desktopSkillAfterMerge = await db.skills.get('skill-crdt');

  // Both devices should converge to 5000 + 300 + 200 = 5500 XP!
  if (desktopUserAfterMerge?.totalXp !== 5500) {
    throw new Error(`Expected Desktop to converge to 5500 XP after merging phone, got ${desktopUserAfterMerge?.totalXp}`);
  }
  // Skill XP should be 500 + 200 = 700 XP, and completions 10 + 1 = 11!
  if (desktopSkillAfterMerge?.xp !== 700 || desktopSkillAfterMerge?.totalCompleted !== 11) {
    throw new Error(
      `Expected Desktop skill to additively merge to 700 XP and 11 completions, got xp=${desktopSkillAfterMerge?.xp}, totalCompleted=${desktopSkillAfterMerge?.totalCompleted}`
    );
  }
  // Since Phone's profile updatedAt (10:05:00) > Desktop's (10:00:00), LWW applies and adopts PhoneChampion
  if (desktopUserAfterMerge?.name !== 'PhoneChampion' || desktopUserAfterMerge?.avatar !== 'phone-avatar.svg') {
    throw new Error(`Expected profile identity to adopt PhoneChampion via LWW, got name=${desktopUserAfterMerge?.name}`);
  }
  console.log('  ✓ Desktop successfully merged phone progress: totalXp=5500, skill.xp=700, completions=11.');

  // Step 2: Simulate reverse merge on Phone
  // Reset DB to represent Phone's state before sync
  await db.userProfile.put({
    id: 'user-1',
    name: 'PhoneChampion',
    avatar: 'phone-avatar.svg',
    totalXp: 5200,
    ekirumLevel: 14,
    ekirumRank: 'Expert',
    achievements: [],
    updatedAt: '2026-10-20T10:05:00.000Z',
  });
  await db.skills.put({
    id: 'skill-crdt',
    projectId: 'proj-crdt',
    name: 'Engineering',
    level: 4,
    xp: 400,
    xpToNextLevel: 320,
    icon: 'Hammer',
    streak: 1,
    totalCompleted: 9,
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T09:30:00.000Z',
  });
  await db.tasks.delete('task-desktop-done');
  await db.tasks.put({
    id: 'task-phone-done',
    projectId: 'proj-crdt',
    title: 'Phone Work (+200 XP)',
    priority: 'p1',
    labels: [],
    completed: true,
    completedAt: '2026-10-20T09:30:00.000Z',
    xpAwarded: 200,
    subtasks: [],
    createdAt: '2026-10-20T09:00:00.000Z',
    updatedAt: '2026-10-20T09:30:00.000Z',
    isDeleted: false,
  });

  // Phone merges Desktop's backup (Desktop had 5300 XP and task-desktop-done)
  const desktopPayload = {
    schemaVersion: 1,
    deviceId: 'device-desktop',
    exportedAt: '2026-10-20T10:00:00.000Z',
    tables: {
      userProfile: [
        {
          id: 'user-1',
          name: 'DesktopCommander',
          totalXp: 5300,
          ekirumLevel: 14,
          ekirumRank: 'Expert',
          achievements: [],
          updatedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
      skills: [
        {
          id: 'skill-crdt',
          projectId: 'proj-crdt',
          name: 'Engineering',
          level: 5,
          xp: 500,
          xpToNextLevel: 500,
          icon: 'Hammer',
          streak: 2,
          totalCompleted: 10,
          createdAt: '2026-10-20T08:00:00.000Z',
          updatedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
      tasks: [
        {
          id: 'task-desktop-done',
          projectId: 'proj-crdt',
          title: 'Desktop Work (+300 XP)',
          priority: 'p1',
          labels: [],
          completed: true,
          completedAt: '2026-10-20T10:00:00.000Z',
          xpAwarded: 300,
          subtasks: [],
          createdAt: '2026-10-20T09:00:00.000Z',
          updatedAt: '2026-10-20T10:00:00.000Z',
          isDeleted: false,
        },
      ],
    },
  };

  const phoneMergeRes = await importAndMerge(desktopPayload);
  if (!phoneMergeRes.success) {
    throw new Error(`Phone failed to merge desktop payload: ${phoneMergeRes.error}`);
  }

  const phoneUserAfterMerge = await db.userProfile.get('user-1');
  const phoneSkillAfterMerge = await db.skills.get('skill-crdt');

  // Phone also converges to 5200 + 300 = 5500 XP!
  if (phoneUserAfterMerge?.totalXp !== 5500) {
    throw new Error(`Expected Phone to converge to 5500 XP after merging desktop, got ${phoneUserAfterMerge?.totalXp}`);
  }
  // Phone's name must NOT be overwritten by Desktop's higher XP (5300) since Phone has newer updatedAt!
  if (phoneUserAfterMerge?.name !== 'PhoneChampion') {
    throw new Error(
      `CRITICAL REGRESSION: Phone's customized profile name was overwritten by Desktop's higher XP! Got ${phoneUserAfterMerge?.name}`
    );
  }
  console.log('  ✓ Phone successfully converged to 5500 XP while preserving customized profile identity.');

  // Test 16: Project custom merger & composite merge updatedAt advancement (RC2 & RC3)
  console.log('\nTest 16: Project custom merger & composite merge updatedAt advancement (RC2 & RC3)...');
  await db.projects.put({
    id: 'proj-custom-merge-test',
    name: 'Original Project Title',
    color: 'crimson',
    icon: 'Book',
    skillId: 'skill-1',
    description: 'Initial description',
    createdAt: '2026-10-20T11:00:00.000Z',
    updatedAt: '2026-10-20T11:00:00.000Z',
    isDeleted: false,
  });

  // Remote device renames project and updates color
  const projectUpdatePayload = {
    schemaVersion: 1,
    deviceId: 'device-remote',
    exportedAt: '2026-10-20T11:05:00.000Z',
    tables: {
      projects: [
        {
          id: 'proj-custom-merge-test',
          name: 'Renamed Project Title',
          color: 'gold',
          icon: 'Star',
          skillId: 'skill-1',
          createdAt: '2026-10-20T11:00:00.000Z',
          updatedAt: '2026-10-20T11:05:00.000Z',
          isDeleted: false,
        },
      ],
    },
  };

  const projMergeRes = await importAndMerge(projectUpdatePayload);
  if (!projMergeRes.success) {
    throw new Error(`Project merge failed: ${projMergeRes.error}`);
  }

  const mergedProj = await db.projects.get('proj-custom-merge-test');
  if (mergedProj?.name !== 'Renamed Project Title' || mergedProj?.color !== 'gold') {
    throw new Error(`Project custom merger failed to adopt rename: got ${mergedProj?.name}, ${mergedProj?.color}`);
  }
  // Composite merge of project preserved description from existing while adopting name and color from incoming
  if (mergedProj?.description !== 'Initial description') {
    throw new Error(`Project custom merger dropped existing description on composite merge`);
  }
  console.log('  ✓ Project custom merger preserved fields and updated name/color.');

  // Test 17: Multi-file foreign device deduplication, superseded retention on forceFullResync, and no own-device self-merging
  console.log('\nTest 17: Multi-file foreign device deduplication, superseded retention, and no own-device self-merging...');
  const localDevId = await getOrCreateDeviceId();

  // 1. Setup a scenario where local device has task-local-1 active
  await db.tasks.put({
    id: 'task-local-1',
    projectId: 'proj-1',
    title: 'Local Device Active Task',
    priority: 'p1',
    labels: [],
    completed: true,
    completedAt: '2026-10-21T10:00:00.000Z',
    subtasks: [],
    createdAt: '2026-10-21T09:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    isDeleted: false,
  });

  await db.settings.put({
    key: 'lastWrittenDeviceFile',
    value: `device-${localDevId}-9999.json`,
  });

  // Directory contains:
  // - Multiple timestamped files from the SAME foreign device 'desktop-peer'
  // - An own-device file with older/stale data (completed: false)
  const test17Files = [
    {
      name: 'device-desktop-peer-1000.json',
      lastModified: 1000,
      content: JSON.stringify({
        schemaVersion: 1,
        deviceId: 'desktop-peer',
        exportedAt: '2026-10-21T10:00:00.000Z',
        tables: {
          tasks: [
            {
              id: 'task-desktop-accumulated',
              projectId: 'proj-1',
              title: 'Old Desktop Version',
              priority: 'p3',
              labels: [],
              completed: false,
              subtasks: [],
              createdAt: '2026-10-21T10:00:00.000Z',
              updatedAt: '2026-10-21T10:00:00.000Z',
              isDeleted: false,
            },
          ],
        },
      }),
    },
    {
      name: 'device-desktop-peer-2000.json',
      lastModified: 2000,
      content: JSON.stringify({
        schemaVersion: 1,
        deviceId: 'desktop-peer',
        exportedAt: '2026-10-21T11:00:00.000Z',
        tables: {
          tasks: [
            {
              id: 'task-desktop-accumulated',
              projectId: 'proj-1',
              title: 'Newest Desktop Version',
              priority: 'p1',
              labels: [],
              completed: true,
              completedAt: '2026-10-21T11:00:00.000Z',
              subtasks: [],
              createdAt: '2026-10-21T10:00:00.000Z',
              updatedAt: '2026-10-21T11:00:00.000Z',
              isDeleted: false,
            },
          ],
        },
      }),
    },
    {
      name: `device-${localDevId}-9999.json`,
      lastModified: 9999,
      content: JSON.stringify({
        schemaVersion: 1,
        deviceId: localDevId,
        exportedAt: '2026-10-21T12:00:00.000Z',
        tables: {
          tasks: [
            {
              id: 'task-local-1',
              projectId: 'proj-1',
              title: 'Stale Local State From Own File',
              priority: 'p3',
              labels: [],
              completed: false, // Stale state!
              subtasks: [],
              createdAt: '2026-10-21T09:00:00.000Z',
              updatedAt: '2026-10-21T12:00:00.000Z',
              isDeleted: false,
            },
          ],
        },
      }),
    },
  ];

  const test17Handle = {
    name: 'test-sync-folder',
    removeEntry: async (_name: string) => {},
    values: async function* () {
      for (const f of test17Files) {
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

  // Run syncDeviceFiles with forceFullResync = true
  const syncPass1 = await syncDeviceFiles(test17Handle, true, true);
  if (!syncPass1.mergeResult?.success) {
    throw new Error(`syncDeviceFiles failed on pass 1: ${syncPass1.mergeResult?.error}`);
  }

  // 1. Check that own-device file was NOT merged into local DB:
  const test17LocalTask = await db.tasks.get('task-local-1');
  if (!test17LocalTask?.completed || test17LocalTask?.title !== 'Local Device Active Task') {
    throw new Error(`Own device file overwrote active local task: got title="${test17LocalTask?.title}", completed=${test17LocalTask?.completed}`);
  }

  // 2. Check that foreign task adopted the NEWEST version:
  const test17ForeignTask = await db.tasks.get('task-desktop-accumulated');
  if (!test17ForeignTask?.completed || test17ForeignTask?.title !== 'Newest Desktop Version') {
    throw new Error(`Foreign task did not adopt newest version: got title="${test17ForeignTask?.title}"`);
  }

  // 3. Check supersededDeviceFiles has 'device-desktop-peer-1000.json'
  const supersededRecord1 = await db.settings.get('supersededDeviceFiles');
  const supersededList1: string[] = supersededRecord1?.value || [];
  if (!supersededList1.includes('device-desktop-peer-1000.json')) {
    throw new Error(`Older foreign file was not marked superseded: ${JSON.stringify(supersededList1)}`);
  }

  // 4. Run second pass with forceFullResync = true: verify superseded files are NOT wiped from supersededDeviceFiles!
  await syncDeviceFiles(test17Handle, true, true);
  const supersededRecord2 = await db.settings.get('supersededDeviceFiles');
  const supersededList2: string[] = supersededRecord2?.value || [];
  if (!supersededList2.includes('device-desktop-peer-1000.json')) {
    throw new Error(`Older foreign file was un-superseded during forceFullResync! Got: ${JSON.stringify(supersededList2)}`);
  }
  console.log('  ✓ Stale foreign files kept in supersededSet, newest foreign version adopted, own-device file never self-merged.');

  // Test 18: Substantive vs timestamp-only change counting & un-superseding rescue
  console.log('\nTest 18: Substantive equality prevents false-positive change counts & rescues un-superseded files...');
  const existingLocalTask = await db.tasks.get('task-desktop-accumulated');
  if (!existingLocalTask) throw new Error('task-desktop-accumulated not found');

  // 18a: Incoming task has identical business data, only newer updatedAt
  const newerSameContentTask = {
    ...existingLocalTask,
    updatedAt: new Date(Date.now() + 5000).toISOString(),
  };

  const mergeResSubstantive = await importAndMerge({
    schemaVersion: 1,
    tables: {
      tasks: [newerSameContentTask],
    },
  });

  if (mergeResSubstantive.totalChanges !== 0 || (mergeResSubstantive.stats.tasks?.updated || 0) !== 0) {
    throw new Error(`Timestamp-only change was counted as substantive update! totalChanges=${mergeResSubstantive.totalChanges}, updated=${mergeResSubstantive.stats.tasks?.updated}`);
  }
  const dbTaskAfterTimestamp = await db.tasks.get('task-desktop-accumulated');
  if (dbTaskAfterTimestamp?.updatedAt !== newerSameContentTask.updatedAt) {
    throw new Error(`Local DB timestamp was not advanced silently: ${dbTaskAfterTimestamp?.updatedAt}`);
  }
  console.log('  ✓ Timestamp-only update advances updatedAt silently with totalChanges = 0 (no false-positive toast).');

  // 18b: Rescuing un-superseded foreign file when newer duplicate is gone
  // Put 'device-desktop-peer-1000.json' as the ONLY file in the folder
  const test18Handle = {
    name: 'test-sync-folder-rescue',
    removeEntry: async (_name: string) => {},
    values: async function* () {
      yield {
        kind: 'file',
        name: 'device-desktop-peer-1000.json',
        getFile: async () => ({
          name: 'device-desktop-peer-1000.json',
          size: 100,
          lastModified: 1000,
          text: async () => JSON.stringify({
            schemaVersion: 1,
            deviceId: 'desktop-peer',
            exportedAt: '2026-10-21T10:00:00.000Z',
            tables: {
              tasks: [
                {
                  id: 'task-rescued-from-superseded',
                  projectId: 'proj-1',
                  title: 'Rescued Task',
                  priority: 'p1',
                  labels: [],
                  completed: true,
                  subtasks: [],
                  createdAt: '2026-10-21T10:00:00.000Z',
                  updatedAt: '2026-10-21T10:00:00.000Z',
                  isDeleted: false,
                },
              ],
            },
          }),
        }),
      };
    },
  } as any;

  // Run full resync: since 'device-desktop-peer-1000.json' is now the ONLY file for desktop-peer, it must be un-superseded and merged!
  const rescueRes = await syncDeviceFiles(test18Handle, true, true);
  if (!rescueRes.mergeResult?.success || rescueRes.filesProcessed !== 1) {
    throw new Error(`Failed to process un-superseded file: processed=${rescueRes.filesProcessed}`);
  }
  const rescuedTask = await db.tasks.get('task-rescued-from-superseded');
  if (!rescuedTask || rescuedTask.title !== 'Rescued Task') {
    throw new Error('Rescued task was not merged from formerly superseded file.');
  }
  const supersededAfterRescue = await db.settings.get('supersededDeviceFiles');
  const supersededListAfterRescue: string[] = supersededAfterRescue?.value || [];
  if (supersededListAfterRescue.includes('device-desktop-peer-1000.json')) {
    throw new Error('device-desktop-peer-1000.json was not removed from supersededDeviceFiles after rescue!');
  }
  console.log('  ✓ Single foreign device file un-superseded and successfully merged on forceFullResync.');

  // Test 19: Automatic collision detection and auto-regeneration of deviceId
  console.log('\nTest 19: Automatic collision detection and auto-regeneration of deviceId...');
  const collidingId = 'colliding-device-abc-123';
  await db.settings.put({ key: 'deviceId', value: collidingId });
  await db.settings.delete('lastWrittenDeviceFile');
  await db.settings.delete('lastExportedTablesHash');

  const test19Files = [
    {
      name: `device-${collidingId}-1729890000000.json`,
      lastModified: 1729890000000,
      content: JSON.stringify({
        schemaVersion: 1,
        deviceId: collidingId,
        exportedAt: '2026-10-25T12:00:00.000Z',
        tables: {
          tasks: [
            {
              id: 'task-from-collided-desktop-1',
              title: 'Collided Desktop Task 1',
              priority: 'p1',
              completed: true,
              createdAt: '2026-10-25T10:00:00.000Z',
              updatedAt: '2026-10-25T12:00:00.000Z',
            },
            {
              id: 'task-from-collided-desktop-2',
              title: 'Collided Desktop Task 2',
              priority: 'p2',
              completed: false,
              createdAt: '2026-10-25T10:00:00.000Z',
              updatedAt: '2026-10-25T12:00:00.000Z',
            },
            {
              id: 'task-from-collided-desktop-3',
              title: 'Collided Desktop Task 3',
              priority: 'p3',
              completed: false,
              createdAt: '2026-10-25T10:00:00.000Z',
              updatedAt: '2026-10-25T12:00:00.000Z',
            },
          ],
          userProfile: [
            {
              id: 'profile-user',
              name: 'Hero',
              totalXp: 5000,
              ekirumLevel: 14,
            },
          ],
        },
      }),
    },
  ];

  const test19Handle = {
    name: 'test-sync-folder-19',
    removeEntry: async () => {},
    values: async function* () {
      for (const f of test19Files) {
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

  const collisionRes = await syncDeviceFiles(test19Handle, true, true);
  if (!collisionRes.mergeResult?.success) {
    throw new Error(`Collision resolution sync failed: ${collisionRes.mergeResult?.error}`);
  }

  // 1. Device ID must have been regenerated to a fresh ID
  const newDeviceId = await getOrCreateDeviceId();
  if (newDeviceId === collidingId) {
    throw new Error(`Device ID was NOT regenerated on collision! Still "${newDeviceId}"`);
  }

  // 2. The tasks from the collided device file must have been merged
  const mergedCollidedTask = await db.tasks.get('task-from-collided-desktop-1');
  if (!mergedCollidedTask || mergedCollidedTask.title !== 'Collided Desktop Task 1') {
    throw new Error('Collided device tasks were not merged into database!');
  }

  // 3. User profile XP must have been adopted
  const updatedProfile = await db.userProfile.toCollection().first();
  if ((updatedProfile?.totalXp || 0) < 5000) {
    throw new Error(`Profile XP was not updated after collision merge: ${updatedProfile?.totalXp}`);
  }
  console.log('  ✓ Live device ID collision auto-detected, unique ID regenerated, and foreign peer tasks merged successfully.');

  // Test 20: Daily snapshot backup-YYYY-MM-DD.json merges even if created with same deviceId
  console.log('\nTest 20: Daily snapshot backup-YYYY-MM-DD.json merges even if created with same deviceId...');
  const activeDevId = await getOrCreateDeviceId();
  const test20Files = [
    {
      name: 'backup-2026-10-25.json',
      lastModified: Date.now(),
      content: JSON.stringify({
        schemaVersion: 1,
        deviceId: activeDevId, // Same device ID!
        exportedAt: '2026-10-25T15:00:00.000Z',
        tables: {
          tasks: [
            {
              id: 'task-snapshot-recovery-item',
              title: 'Recovered From Same-Device Daily Snapshot',
              priority: 'p1',
              completed: true,
              createdAt: '2026-10-25T14:00:00.000Z',
              updatedAt: '2026-10-25T15:00:00.000Z',
            },
          ],
        },
      }),
    },
  ];

  const test20Handle = {
    name: 'test-sync-folder-20',
    removeEntry: async () => {},
    values: async function* () {
      for (const f of test20Files) {
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

  const snapshotRes = await syncDeviceFiles(test20Handle, true, true);
  if (!snapshotRes.mergeResult?.success) {
    throw new Error(`Snapshot sync failed: ${snapshotRes.mergeResult?.error}`);
  }

  const recoveredSnapshotTask = await db.tasks.get('task-snapshot-recovery-item');
  if (!recoveredSnapshotTask || recoveredSnapshotTask.title !== 'Recovered From Same-Device Daily Snapshot') {
    throw new Error('Daily snapshot was skipped because of matching deviceId!');
  }
  console.log('  ✓ Daily backup snapshot with matching deviceId successfully merged without being skipped.');

  console.log('\n🎉 ALL TESTS PASSED! Dexie schema, migrations, exportAll, and LWW importAndMerge are verified!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
