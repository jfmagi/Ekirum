import 'fake-indexeddb/auto';
import assert from 'node:assert';
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
import { syncDeviceFiles } from '../src/lib/backupService';
import { INITIAL_USER } from '../src/lib/seedData';
import { db } from '../src/lib/db';
import type { Task } from '../src/types';

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
console.log('Test 11: triggerBackupAndSync preserves store array identities when totalChanges === 0: PASSED');

console.log('\n🎉 ALL VALIDATION & DATA INTEGRITY TESTS PASSED!');
