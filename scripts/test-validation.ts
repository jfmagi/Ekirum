import 'fake-indexeddb/auto';
import assert from 'node:assert';
import {
  formatLocalDate,
  getTaskEndDateTime,
  isTaskOngoing,
  isTaskOverdue,
  formatDueDateDisplay,
} from '../src/lib/dateParser';
import { MAX_LENGTHS, clampString, clampOptionalString } from '../src/lib/validation';
import {
  sanitizeTask,
  sanitizeProject,
  sanitizeHabit,
  sanitizeSkill,
  sanitizeUserProfile,
  sanitizeLibraryItem,
} from '../src/lib/schemaSanitizers';
import { advanceRecurringTask, useEkirumStore } from '../src/store/useEkirumStore';
import { syncDeviceFiles, getBackupStatus, writeDeviceFile, atomicWriteFile, performDailyBackup } from '../src/lib/backupService';
import { compactTombstones, importAndMerge, exportAll, MAX_RECORDS_PER_TABLE } from '../src/lib/syncEngine';
import { INITIAL_USER } from '../src/lib/seedData';
import { db } from '../src/lib/db';
import type {
  Task,
  Project,
  Skill,
  Habit,
  HabitEvent,
  Achievement,
  UserProfile,
  LibraryItem,
} from '../src/types';

console.log('🧪 Starting Text Input Length & Clamping verification tests...\n');

// Test 1: clampString and clampOptionalString utility tests
const longText = 'A'.repeat(1000);
assert.strictEqual(clampString(longText, 10), 'AAAAAAAAAA');
assert.strictEqual(clampString('short', 10), 'short');
assert.strictEqual(clampString(null, 10, 'fallback'), 'fallback');
assert.strictEqual(clampString(undefined, 10, 'fallback'), 'fallback');
assert.strictEqual(clampOptionalString(longText, 5), 'AAAAA');
assert.strictEqual(clampOptionalString('   ', 10), undefined);
assert.strictEqual(clampOptionalString(null, 10), undefined);
console.log('Test 1: clampString & clampOptionalString utilities: PASSED');

// Test 2: sanitizeTask clamps oversized titles, notes, subtasks, and labels
const oversizedTask = {
  id: 'task-1',
  title: 'T'.repeat(2000),
  notes: 'N'.repeat(50000),
  subtasks: [{ id: 'sub-1', title: 'S'.repeat(1000), completed: false }],
  labels: ['L'.repeat(200), 'normal-tag'],
};
const cleanTask = sanitizeTask(oversizedTask);
assert.ok(cleanTask);
assert.strictEqual(cleanTask.title.length, MAX_LENGTHS.TASK_TITLE);
assert.strictEqual(cleanTask.notes?.length, MAX_LENGTHS.TASK_NOTES);
assert.strictEqual(cleanTask.subtasks[0].title.length, MAX_LENGTHS.SUBTASK_TITLE);
assert.strictEqual(cleanTask.labels[0].length, MAX_LENGTHS.LABEL);
assert.strictEqual(cleanTask.labels[1], 'normal-tag');
console.log('Test 2: sanitizeTask enforces MAX_LENGTHS: PASSED');

// Test 3: sanitizeProject clamps name and description
const oversizedProject = {
  id: 'proj-1',
  name: 'P'.repeat(500),
  description: 'D'.repeat(5000),
};
const cleanProject = sanitizeProject(oversizedProject);
assert.ok(cleanProject);
assert.strictEqual(cleanProject.name.length, MAX_LENGTHS.PROJECT_NAME);
assert.strictEqual(cleanProject.description?.length, MAX_LENGTHS.PROJECT_DESCRIPTION);
console.log('Test 3: sanitizeProject enforces MAX_LENGTHS: PASSED');

// Test 4: sanitizeHabit and sanitizeSkill clamp names
const oversizedHabit = {
  id: 'habit-1',
  title: 'H'.repeat(500),
  description: 'HD'.repeat(2000),
};
const cleanHabit = sanitizeHabit(oversizedHabit);
assert.ok(cleanHabit);
assert.strictEqual(cleanHabit.title.length, MAX_LENGTHS.HABIT_TITLE);
assert.strictEqual(cleanHabit.description?.length, MAX_LENGTHS.HABIT_DESCRIPTION);

const oversizedSkill = {
  id: 'skill-1',
  name: 'SK'.repeat(200),
};
const cleanSkill = sanitizeSkill(oversizedSkill);
assert.ok(cleanSkill);
assert.strictEqual(cleanSkill.name.length, MAX_LENGTHS.SKILL_NAME);
console.log('Test 4: sanitizeHabit & sanitizeSkill enforce MAX_LENGTHS: PASSED');

// Test 5: sanitizeUserProfile clamps user name
const oversizedUser = {
  id: 'user-1',
  name: 'U'.repeat(300),
};
const cleanUser = sanitizeUserProfile(oversizedUser);
assert.ok(cleanUser);
assert.strictEqual(cleanUser.name.length, MAX_LENGTHS.USER_NAME);
console.log('Test 5: sanitizeUserProfile enforces MAX_LENGTHS: PASSED');

// Test 6: sanitizeLibraryItem clamps title, creator, and notes
const oversizedLib = {
  id: 'lib-1',
  title: 'B'.repeat(1000),
  creator: 'C'.repeat(500),
  notes: 'N'.repeat(20000),
};
const cleanLib = sanitizeLibraryItem(oversizedLib);
assert.ok(cleanLib);
assert.strictEqual(cleanLib.title.length, MAX_LENGTHS.LIBRARY_TITLE);
assert.strictEqual(cleanLib.creator?.length, MAX_LENGTHS.LIBRARY_CREATOR);
assert.strictEqual(cleanLib.notes?.length, MAX_LENGTHS.LIBRARY_NOTES);
console.log('Test 6: sanitizeLibraryItem enforces MAX_LENGTHS: PASSED');

// Test 7: advanceRecurringTask deterministic archive ID across multiple calls and timestamps
const recurringTask: Task = {
  id: 'rec-task-1',
  projectId: 'proj-1',
  title: 'Daily Meditation',
  priority: 'p2',
  labels: ['health'],
  completed: false,
  recurrence: 'daily',
  dueDate: '2026-10-12',
  subtasks: [],
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
  isDeleted: false,
};

const res1 = advanceRecurringTask(recurringTask, '2026-10-12', '2026-10-12T09:00:00.000Z');
const res2 = advanceRecurringTask(recurringTask, '2026-10-12', '2026-10-12T15:30:00.000Z');

assert.strictEqual(res1.completedArchiveTask.id, 'task-archive-rec-task-1-2026-10-12');
assert.strictEqual(res1.completedArchiveTask.id, res2.completedArchiveTask.id);
assert.strictEqual(res1.completedArchiveTask.completed, true);
assert.strictEqual(res1.activeRecurringTask.dueDate, '2026-10-13');

// Test dateless recurring fallback uses todayStr deterministically
const datelessRecurring: Task = {
  ...recurringTask,
  id: 'rec-task-2',
  dueDate: undefined,
};
const res3 = advanceRecurringTask(datelessRecurring, '2026-10-12', '2026-10-12T09:00:00.000Z');
assert.strictEqual(res3.completedArchiveTask.id, 'task-archive-rec-task-2-2026-10-12');
console.log('Test 7: advanceRecurringTask deterministic archive ID across devices/times: PASSED');

// Test 8: reorderTasks fractional ordering updates only the moved task
const t1Timestamp = '2026-10-01T10:00:00.000Z';
const t2Timestamp = '2026-10-01T11:00:00.000Z';
const t3Timestamp = '2026-10-01T12:00:00.000Z';

const t1: Task = {
  id: 'task-reorder-1',
  projectId: 'proj-1',
  title: 'Task 1',
  priority: 'p2',
  labels: [],
  completed: false,
  order: 10,
  subtasks: [],
  createdAt: t1Timestamp,
  updatedAt: t1Timestamp,
  isDeleted: false,
};
const t2: Task = {
  id: 'task-reorder-2',
  projectId: 'proj-1',
  title: 'Task 2',
  priority: 'p2',
  labels: [],
  completed: false,
  order: 20,
  subtasks: [],
  createdAt: t2Timestamp,
  updatedAt: t2Timestamp,
  isDeleted: false,
};
const t3: Task = {
  id: 'task-reorder-3',
  projectId: 'proj-1',
  title: 'Task 3',
  priority: 'p2',
  labels: [],
  completed: false,
  order: 30,
  subtasks: [],
  createdAt: t3Timestamp,
  updatedAt: t3Timestamp,
  isDeleted: false,
};

await db.tasks.bulkPut([t1, t2, t3]);
useEkirumStore.setState({ tasks: [t1, t2, t3] });

// Move task 3 between task 1 (order 10) and task 2 (order 20)
useEkirumStore.getState().reorderTasks('task-reorder-3', 'task-reorder-2');

const stateAfterReorder = useEkirumStore.getState();
const movedT3 = stateAfterReorder.tasks.find((t) => t.id === 'task-reorder-3');
const untouchedT1 = stateAfterReorder.tasks.find((t) => t.id === 'task-reorder-1');
const untouchedT2 = stateAfterReorder.tasks.find((t) => t.id === 'task-reorder-2');

assert.ok(movedT3);
assert.strictEqual(movedT3.order, 15, 'Fractional order (10 + 20) / 2 should be 15');
assert.notStrictEqual(movedT3.updatedAt, t3Timestamp, 'Moved task updatedAt should be bumped');

assert.ok(untouchedT1);
assert.strictEqual(untouchedT1.order, 10);
assert.strictEqual(untouchedT1.updatedAt, t1Timestamp, 'Neighbor t1 updatedAt must remain untouched');

assert.ok(untouchedT2);
assert.strictEqual(untouchedT2.order, 20);
assert.strictEqual(untouchedT2.updatedAt, t2Timestamp, 'Neighbor t2 updatedAt must remain untouched');
console.log('Test 8: reorderTasks updates order and updatedAt only on moved task: PASSED');

// Test 9: INITIAL_USER immutability and syncWithDatabase clone guarantee
const initialUserSnapshot = structuredClone(INITIAL_USER);

// Object.freeze INITIAL_USER in the test to verify no in-place mutations occur
Object.freeze(INITIAL_USER);
Object.freeze(INITIAL_USER.achievements);

// Clear userProfile in db to force fallback to INITIAL_USER in syncWithDatabase
await db.userProfile.clear();
await db.tasks.clear();
await db.projects.clear();
await db.skills.clear();
await db.habits.clear();
await db.achievements.clear();

// Trigger syncWithDatabase
await useEkirumStore.getState().syncWithDatabase();

// Assert INITIAL_USER has not been modified
assert.deepStrictEqual(INITIAL_USER, initialUserSnapshot, 'INITIAL_USER must remain strictly unmutated');

const currentUserInStore = useEkirumStore.getState().user;
assert.notStrictEqual(currentUserInStore, INITIAL_USER, 'Store user should be a cloned reference, not INITIAL_USER directly');
console.log('Test 9: INITIAL_USER immutability verified under syncWithDatabase fallback: PASSED');

// Test 10: syncDeviceFiles throttling and lastModified avoidance
const mockRemoteTask = {
  id: 'remote-device-task-1',
  projectId: 'proj-1',
  title: 'Task from Remote Tablet',
  priority: 'p2' as const,
  labels: [],
  completed: false,
  subtasks: [],
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  isDeleted: false,
};

const mockFiles = [
  {
    name: 'device-tablet-xyz.json',
    content: JSON.stringify({
      schemaVersion: 1,
      deviceId: 'device-tablet-xyz',
      exportedAt: '2026-10-01T10:00:00.000Z',
      tables: {
        tasks: [mockRemoteTask],
        projects: [],
        skills: [],
        habits: [],
        habitEvents: [],
        achievements: [],
        userProfile: [],
        libraryItems: [],
      },
    }),
    lastModified: 5000,
  },
];

const mockDirHandle = {
  kind: 'directory',
  name: 'mock-folder',
  values: async function* () {
    for (const f of mockFiles) {
      yield {
        kind: 'file',
        name: f.name,
        getFile: async () => ({
          name: f.name,
          lastModified: f.lastModified,
          text: async () => f.content,
        }),
      };
    }
  },
} as any;

// First forced run processes file and imports remote task
const firstSync = await syncDeviceFiles(mockDirHandle, true);
assert.strictEqual(firstSync.filesProcessed, 1);
assert.strictEqual(firstSync.mergeResult?.totalChanges, 1);
const importedTask = await db.tasks.get('remote-device-task-1');
assert.ok(importedTask);
assert.strictEqual(importedTask.title, 'Task from Remote Tablet');

// Immediate unforced run is throttled (< 30s)
const throttledSync = await syncDeviceFiles(mockDirHandle, false);
assert.strictEqual(throttledSync.filesProcessed, 0);
assert.strictEqual(throttledSync.mergeResult?.totalChanges, 0);

// Forced run with untouched file.lastModified skips reading and parsing
const skippedSync = await syncDeviceFiles(mockDirHandle, true);
assert.strictEqual(skippedSync.filesProcessed, 0, 'Untouched file.lastModified must be skipped');
assert.strictEqual(skippedSync.mergeResult?.totalChanges, 0);

// Bumped file.lastModified processes and merges new data
mockFiles[0].lastModified = 9000;
mockRemoteTask.title = 'Updated Title from Remote Tablet';
mockRemoteTask.updatedAt = '2026-10-02T10:00:00.000Z';
mockFiles[0].content = JSON.stringify({
  schemaVersion: 1,
  deviceId: 'device-tablet-xyz',
  exportedAt: '2026-10-02T10:00:00.000Z',
  tables: {
    tasks: [mockRemoteTask],
    projects: [],
    skills: [],
    habits: [],
    habitEvents: [],
    achievements: [],
    userProfile: [],
    libraryItems: [],
  },
});

const bumpedSync = await syncDeviceFiles(mockDirHandle, true);
assert.strictEqual(bumpedSync.filesProcessed, 1, 'Bumped mtime must be processed');
assert.strictEqual(bumpedSync.mergeResult?.totalChanges, 1);
const updatedTask = await db.tasks.get('remote-device-task-1');
assert.strictEqual(updatedTask?.title, 'Updated Title from Remote Tablet');
console.log('Test 10: syncDeviceFiles throttling and lastModified check verified: PASSED');

// Test 11: triggerBackupAndSync preserves store array identities when no changes merged
const habitsRefBefore = useEkirumStore.getState().habits;
const projectsRefBefore = useEkirumStore.getState().projects;

// triggerBackupAndSync without changes
await useEkirumStore.getState().triggerBackupAndSync(false);

const habitsRefAfter = useEkirumStore.getState().habits;
const projectsRefAfter = useEkirumStore.getState().projects;

assert.strictEqual(habitsRefAfter, habitsRefBefore, 'Habits array identity must be preserved on no-change sync');
assert.strictEqual(projectsRefAfter, projectsRefBefore, 'Projects array identity must be preserved on no-change sync');
// Test 12: Import size bounds and table record count limit
const oversizedPayload = ' '.repeat(25 * 1024 * 1024 + 1);
const oversizedResult = await useEkirumStore.getState().importBackupJson(oversizedPayload);
assert.strictEqual(oversizedResult.success, false, 'Payload > 25MB must be rejected');
assert.ok(oversizedResult.error?.includes('25 MB'));

const limitRes = await importAndMerge({
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  tables: {
    tasks: new Array(MAX_RECORDS_PER_TABLE + 1).fill({ id: 'dummy' }),
  },
});
assert.strictEqual(limitRes.success, false, 'Exceeding MAX_RECORDS_PER_TABLE must return success: false');
assert.ok(limitRes.error?.includes('exceeds maximum allowed record count'));
console.log('Test 12: Import size bounds and table record count limit: PASSED');

// Test 13: compactTombstones purges old tombstones and preserves recent ones
const oldDeletedTask: Task = {
  id: 'task-old-tombstone',
  title: 'Old Deleted Task',
  status: 'todo',
  priority: 'low',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: new Date(Date.now() - 70 * 86400000).toISOString(),
  isDeleted: true,
};
const recentDeletedTask: Task = {
  id: 'task-recent-tombstone',
  title: 'Recent Deleted Task',
  status: 'todo',
  priority: 'low',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  isDeleted: true,
};
const activeTask: Task = {
  id: 'task-active-compact-test',
  title: 'Active Task',
  status: 'todo',
  priority: 'low',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: new Date(Date.now() - 70 * 86400000).toISOString(),
  isDeleted: false,
};

await db.tasks.bulkPut([oldDeletedTask, recentDeletedTask, activeTask]);
const purgedCount = await compactTombstones(60);
assert.ok(purgedCount >= 1, 'Should purge at least 1 old tombstone');

const retrievedOld = await db.tasks.get('task-old-tombstone');
const retrievedRecent = await db.tasks.get('task-recent-tombstone');
const retrievedActive = await db.tasks.get('task-active-compact-test');

assert.strictEqual(retrievedOld, undefined, 'Old tombstone must be removed from Dexie');
assert.ok(retrievedRecent, 'Recent tombstone must be preserved for multi-device sync');
assert.ok(retrievedActive, 'Active task must not be touched');
console.log('Test 13: compactTombstones lifecycle GC: PASSED');

// Test 14: getBackupStatus overdue calculation
await db.settings.delete('lastBackupAt');
const statusNoBackup = await getBackupStatus();
assert.strictEqual(statusNoBackup.isOverdue, false, 'New directory without prior backup must not be overdue');

await db.settings.put({ key: 'lastBackupAt', value: new Date(Date.now() - 50 * 3600 * 1000).toISOString() });
const statusOldBackup = await getBackupStatus();
assert.strictEqual(statusOldBackup.isOverdue, true, 'Backup older than 48h must be overdue');

await db.settings.put({ key: 'lastBackupAt', value: new Date(Date.now() - 2 * 3600 * 1000).toISOString() });
const statusFreshBackup = await getBackupStatus();
assert.strictEqual(statusFreshBackup.isOverdue, false, 'Backup within 48h must not be overdue');
console.log('Test 14: getBackupStatus overdue rule consistency: PASSED');

// Test 15: initStorage promise memoization
const initPromiseA = useEkirumStore.getState().initStorage();
const initPromiseB = useEkirumStore.getState().initStorage();
assert.strictEqual(initPromiseA, initPromiseB, 'Concurrent initStorage calls must share the same memoized promise');
await Promise.all([initPromiseA, initPromiseB]);
console.log('Test 15: initStorage re-entrancy memoization: PASSED');

// Test 16: End-to-End Round-Trip Fidelity (fully-populated records → exportAll → importAndMerge → all fields equal)
const nowIso = new Date().toISOString();

const fullTask: Task = {
  id: 'task-fidelity-1',
  projectId: 'proj-fidelity-1',
  title: 'Full Fidelity Task',
  notes: 'Detailed notes on fidelity',
  dueDate: '2026-10-31',
  dueTime: '14:30',
  recurrence: 'monthly',
  recurrenceAnchorDay: 31,
  priority: 'p1',
  labels: ['fidelity', 'e2e'],
  completed: false,
  subtasks: [
    { id: 'sub-1', title: 'Subtask 1', completed: true },
    { id: 'sub-2', title: 'Subtask 2', completed: false },
  ],
  section: 'In Progress',
  order: 5,
  createdAt: nowIso,
  updatedAt: nowIso,
  isDeleted: false,
};

const fullProject: Project = {
  id: 'proj-fidelity-1',
  name: 'Fidelity Project',
  color: '#8B1528',
  icon: 'Compass',
  skillId: 'skill-fidelity-1',
  description: 'Project for testing round-trip data fidelity',
  createdAt: nowIso,
  updatedAt: nowIso,
  isDeleted: false,
};

const fullSkill: Skill = {
  id: 'skill-fidelity-1',
  projectId: 'proj-fidelity-1',
  name: 'Architecture',
  level: 12,
  xp: 3450,
  xpToNextLevel: 4000,
  icon: 'Layers',
  streak: 7,
  lastCompletedDate: '2026-10-12',
  totalCompleted: 45,
  createdAt: nowIso,
  updatedAt: nowIso,
  isDeleted: false,
};

const todayDateObj = new Date();
const yestDateObj = new Date(todayDateObj);
yestDateObj.setDate(todayDateObj.getDate() - 1);
const twoDaysAgoDateObj = new Date(todayDateObj);
twoDaysAgoDateObj.setDate(todayDateObj.getDate() - 2);
const habitDateToday = formatLocalDate(todayDateObj);
const habitDateYest = formatLocalDate(yestDateObj);
const habitDate2DaysAgo = formatLocalDate(twoDaysAgoDateObj);
const habitFidelityDates = [habitDate2DaysAgo, habitDateYest, habitDateToday];

const fullHabit: Habit = {
  id: 'habit-fidelity-1',
  title: 'Deep Work Habit',
  description: '4 hours daily deep work block',
  projectId: 'proj-fidelity-1',
  frequency: 'daily',
  color: '#8B1528',
  icon: 'Sparkle',
  completedDates: habitFidelityDates,
  streak: 3,
  longestStreak: 14,
  createdAt: nowIso,
  updatedAt: nowIso,
  isDeleted: false,
};

const fullHabitEvents: HabitEvent[] = [
  {
    id: 'event-fidelity-1',
    habitId: 'habit-fidelity-1',
    date: habitDate2DaysAgo,
    completedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    isDeleted: false,
  },
  {
    id: 'event-fidelity-2',
    habitId: 'habit-fidelity-1',
    date: habitDateYest,
    completedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    isDeleted: false,
  },
  {
    id: 'event-fidelity-3',
    habitId: 'habit-fidelity-1',
    date: habitDateToday,
    completedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    isDeleted: false,
  },
];

const fullAchievement: Achievement = {
  id: 'ach-fidelity-1',
  title: 'Master Architect',
  description: 'Reach maximum architecture milestone',
  icon: 'Award',
  progress: 10,
  maxProgress: 10,
  unlockedAt: nowIso,
  xpReward: 250,
  xpClaimed: true,
  projectId: 'proj-fidelity-1',
  createdAt: nowIso,
  updatedAt: nowIso,
  isDeleted: false,
};

const fullUser: UserProfile = {
  id: 'user-fidelity-1',
  name: 'Marcus Aurelius',
  avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ekirumLevel: 15,
  ekirumRank: 'Commander',
  totalXp: 4850,
  dailyXpDate: '2026-10-12',
  dailyXpEarned: 320,
  achievements: ['ach-fidelity-1', 'ach-1'],
  soundEnabled: true,
  accentColor: 'crimson',
  onboardingCompleted: true,
  createdAt: nowIso,
  updatedAt: nowIso,
  isDeleted: false,
};

const fullLibraryItem: LibraryItem = {
  id: 'lib-fidelity-1',
  title: 'Meditations',
  type: 'book',
  creator: 'Marcus Aurelius',
  url: 'https://example.com/meditations',
  notes: 'Stoic philosophy classic',
  difficulty: 2,
  projectId: 'proj-fidelity-1',
  status: 'done',
  review: 'Timeless masterpiece',
  finishedDate: '2026-10-10',
  completedAt: nowIso,
  xpAwarded: true,
  xpEarned: 100,
  createdAt: nowIso,
  updatedAt: nowIso,
  isDeleted: false,
};

// Seed records into Dexie
await Promise.all([
  db.tasks.put(fullTask),
  db.projects.put(fullProject),
  db.skills.put(fullSkill),
  db.habits.put(fullHabit),
  db.habitEvents.bulkPut(fullHabitEvents),
  db.achievements.put(fullAchievement),
  db.userProfile.put(fullUser),
  db.libraryItems.put(fullLibraryItem),
]);

// Export backup
const exportedBackup = await exportAll('fidelity-device');

// Delete the records from Dexie to test clean re-import
await Promise.all([
  db.tasks.delete(fullTask.id),
  db.projects.delete(fullProject.id),
  db.skills.delete(fullSkill.id),
  db.habits.delete(fullHabit.id),
  db.habitEvents.bulkDelete(fullHabitEvents.map((e) => e.id)),
  db.achievements.delete(fullAchievement.id),
  db.userProfile.delete(fullUser.id),
  db.libraryItems.delete(fullLibraryItem.id),
]);

// Import and merge the exported backup
await importAndMerge(exportedBackup);

// Verify exact equality of each restored record
const restoredTask = await db.tasks.get(fullTask.id);
assert.deepStrictEqual(restoredTask, fullTask, 'Task must survive export -> import with all fields identical');

const restoredProject = await db.projects.get(fullProject.id);
assert.deepStrictEqual(restoredProject, fullProject, 'Project must survive export -> import with all fields identical');

const restoredSkill = await db.skills.get(fullSkill.id);
assert.deepStrictEqual(restoredSkill, fullSkill, 'Skill must survive export -> import with all fields identical');

const restoredHabit = await db.habits.get(fullHabit.id);
assert.deepStrictEqual(restoredHabit, fullHabit, 'Habit must survive export -> import with all fields identical');

for (const event of fullHabitEvents) {
  const restoredEvent = await db.habitEvents.get(event.id);
  assert.deepStrictEqual(restoredEvent, event, 'HabitEvent must survive export -> import with all fields identical');
}

const restoredAchievement = await db.achievements.get(fullAchievement.id);
assert.deepStrictEqual(restoredAchievement, fullAchievement, 'Achievement must survive export -> import with all fields identical');

const restoredUser = await db.userProfile.get(fullUser.id);
assert.deepStrictEqual(restoredUser, fullUser, 'UserProfile must survive export -> import with all fields (including dailyXpDate and dailyXpEarned) identical');

const restoredLibraryItem = await db.libraryItems.get(fullLibraryItem.id);
assert.deepStrictEqual(restoredLibraryItem, fullLibraryItem, 'LibraryItem must survive export -> import with all fields identical');

console.log('Test 16: Complete end-to-end round-trip fidelity across all 8 tables: PASSED');

// Test 17: writeDeviceFile writes directly via createWritable (avoiding Android SAF .move() duplicate suffix bugs) and cleans up legacy .tmp files
const writtenFiles: Record<string, string> = {
  'device-legacy.json.tmp': 'stale-tmp',
};
const removedEntries: string[] = [];

const mockAtomicDir = {
  kind: 'directory',
  name: 'mock-atomic-dir',
  getFileHandle: async (name: string, _opts?: any) => {
    return {
      name,
      createWritable: async () => {
        let buffer = '';
        return {
          write: async (chunk: string) => { buffer += chunk; },
          close: async () => { writtenFiles[name] = buffer; },
        };
      },
    };
  },
  removeEntry: async (name: string) => {
    removedEntries.push(name);
    delete writtenFiles[name];
  },
} as any;

// Set lastBackupAt to fresh (< 24h)
await db.settings.put({ key: 'lastBackupAt', value: new Date().toISOString() });

// Daily backup is skipped because < 24h
const dailySkipped = await performDailyBackup(mockAtomicDir, false);
assert.strictEqual(dailySkipped, false, 'Daily backup should skip when fresh (<24h)');

// writeDeviceFile MUST succeed even when daily backup is fresh (<24h)
const deviceWriteOk = await writeDeviceFile(mockAtomicDir);
assert.strictEqual(deviceWriteOk, true, 'writeDeviceFile must run unconditionally on sync');

const writtenKeys = Object.keys(writtenFiles);
const deviceFileKey = writtenKeys.find((k) => k.startsWith('device-') && k.endsWith('.json'));
assert.ok(deviceFileKey, 'device-<id>.json must be written directly to folder');
assert.ok(
  removedEntries.includes(`${deviceFileKey}.tmp`),
  'atomicWriteFile should attempt to remove any leftover .tmp file for the target'
);
const devicePayload = JSON.parse(writtenFiles[deviceFileKey]);
assert.strictEqual(devicePayload.schemaVersion, 1);
assert.ok(devicePayload.tables.tasks.length > 0);

// Test 17b: syncDeviceFiles recovers Android SAF conflict files (`device-xyz.json (1)`) and handles legacy numeric deviceSyncMtimes
const safConflictPayload = JSON.stringify({
  schemaVersion: 1,
  exportedAt: '2026-10-18T16:00:00.000Z',
  tables: {
    tasks: [
      {
        id: 'task-from-android-saf',
        projectId: 'inbox',
        title: 'Synced from Android SAF',
        notes: '',
        recurrence: 'none',
        priority: 'p2',
        labels: [],
        completed: false,
        createdAt: '2026-10-18T15:59:00.000Z',
        updatedAt: '2026-10-18T16:00:00.000Z',
        isDeleted: false,
        subtasks: [],
      },
    ],
    projects: [],
    skills: [],
    habits: [],
    habitEvents: [],
    achievements: [],
    userProfile: [],
    libraryItems: [],
  },
});

// Seed legacy numeric mtime that equals file.lastModified to prove legacy numeric entries no longer skip updated payloads
await db.settings.put({
  key: 'deviceSyncMtimes',
  value: {
    'device-remote-peer.json': 1700000000000,
  },
});

const removedSafArtifacts: string[] = [];
const mockSafSyncDir = {
  kind: 'directory',
  name: 'mock-saf-sync-dir',
  async *values() {
    yield {
      kind: 'file',
      name: 'device-remote-peer.json',
      getFile: async () => ({
        lastModified: 1700000000000, // Same mtime as legacy number in DB!
        size: safConflictPayload.length,
        text: async () => safConflictPayload,
      }),
    };
    yield {
      kind: 'file',
      name: 'device-remote-peer.json (1)',
      getFile: async () => ({
        lastModified: 1700000001000,
        size: safConflictPayload.length,
        text: async () => safConflictPayload,
      }),
    };
  },
  removeEntry: async (name: string) => {
    removedSafArtifacts.push(name);
  },
} as any;

const safSyncRes = await syncDeviceFiles(mockSafSyncDir, true);
assert.ok(safSyncRes.filesProcessed >= 1, 'syncDeviceFiles must process remote file despite legacy numeric mtime');
const safSyncedTask = await db.tasks.get('task-from-android-saf');
assert.ok(safSyncedTask, 'Task from remote peer must be merged into IndexedDB');
assert.strictEqual(safSyncedTask.title, 'Synced from Android SAF');
assert.ok(
  removedSafArtifacts.includes('device-remote-peer.json (1)'),
  'syncDeviceFiles must clean up Android SAF duplicate artifact files after merging'
);
console.log('Test 17: writeDeviceFile direct atomic write, SAF conflict recovery & legacy mtime migration: PASSED');

// Test 18: importAndMerge preserves habit completedDates when tables.habitEvents is omitted
const habitWithoutEventsId = 'habit-no-events-test';
await db.habits.put({
  id: habitWithoutEventsId,
  title: 'Daily Reflection',
  frequency: 'daily',
  streak: 2,
  longestStreak: 2,
  completedDates: ['2026-10-14', '2026-10-15'],
  createdAt: nowIso,
  updatedAt: nowIso,
  isDeleted: false,
});

await importAndMerge({
  schemaVersion: 1,
  tables: {
    tasks: [],
    // Note: habitEvents table completely omitted
  },
});

const preservedHabit = await db.habits.get(habitWithoutEventsId);
assert.ok(preservedHabit);
assert.strictEqual(preservedHabit.completedDates.length, 2, 'Existing habit completedDates must not be wiped when habitEvents table is omitted');
assert.strictEqual(preservedHabit.completedDates[0], '2026-10-14');
assert.strictEqual(preservedHabit.completedDates[1], '2026-10-15');
// Test 19: Long duration multi-day tasks in progress are not overdue and format accurately
const longTask = {
  id: 'task-long-duration',
  dueDate: '2026-10-24',
  dueTime: '18:00',
  duration: 1080, // 18 hours: ends 2026-10-25 12:00
  completed: false,
};

// 19a: End datetime calculation
const endRes = getTaskEndDateTime(longTask.dueDate, longTask.dueTime, longTask.duration);
assert.ok(endRes);
assert.strictEqual(endRes.endDate, '2026-10-25', '18h duration task starting Oct 24 18:00 must end Oct 25');
assert.strictEqual(endRes.endTime, '12:00', '18h duration task must end at 12:00');

// 19b: In-progress / ongoing state during task execution
const duringTime = new Date('2026-10-25T00:30:00');
assert.strictEqual(isTaskOngoing(longTask, duringTime), true, 'Task must be detected as ongoing at 00:30');
assert.strictEqual(isTaskOverdue(longTask, '2026-10-25', duringTime), false, 'Ongoing task must NOT be overdue');
assert.strictEqual(
  formatDueDateDisplay(longTask.dueDate, longTask.dueTime, longTask.duration, duringTime),
  'In Progress, 18-12',
  'Display label must show "In Progress, 18-12" instead of "Yesterday (Overdue)"'
);

// 19c: After duration ends on same day (Oct 25 15:00)
const afternoonTime = new Date('2026-10-25T15:00:00');
assert.strictEqual(isTaskOngoing(longTask, afternoonTime), false, 'Task duration ended at 12:00');
assert.strictEqual(isTaskOverdue(longTask, '2026-10-25', afternoonTime), false, 'Task ending today is not overdue today');
assert.strictEqual(
  formatDueDateDisplay(longTask.dueDate, longTask.dueTime, longTask.duration, afternoonTime),
  'Today, 18-12',
  'Task ending today must show "Today, 18-12"'
);

// 19d: After end date has passed (Oct 26 10:00)
const nextDayTime = new Date('2026-10-26T10:00:00');
assert.strictEqual(isTaskOngoing(longTask, nextDayTime), false);
assert.strictEqual(isTaskOverdue(longTask, '2026-10-26', nextDayTime), true, 'Task is overdue on Oct 26');
assert.strictEqual(
  formatDueDateDisplay(longTask.dueDate, longTask.dueTime, longTask.duration, nextDayTime),
  'Yesterday (Overdue), 18-12',
  'Task ended yesterday must show "Yesterday (Overdue), 18-12"'
);

// 19e: Completed task is never overdue
assert.strictEqual(isTaskOverdue({ ...longTask, completed: true }, '2026-10-26', nextDayTime), false);

console.log('Test 19: Long duration task in-progress, end date calculation & non-overdue display: PASSED');

console.log('\n🎉 ALL VALIDATION & DATA INTEGRITY TESTS PASSED!');


