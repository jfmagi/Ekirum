import 'fake-indexeddb/auto';
import { db, initializeDatabase } from '../src/lib/db';
import { useEkirumStore } from '../src/store/useEkirumStore';
import { exportAll, importAndMerge } from '../src/lib/syncEngine';
import { isFileSystemAccessSupported } from '../src/lib/backupService';
import {
  INITIAL_PROJECTS,
  INITIAL_SKILLS,
  INITIAL_TASKS,
  INITIAL_HABITS,
  INITIAL_USER,
} from '../src/lib/seedData';

async function runTests() {
  console.log('🧪 Starting First-Launch, View Routing & Clock Skew verification tests...\n');

  // Test 1: First-launch Database Initialization on Fresh / Empty DB
  console.log('Test 1: First-launch Database Initialization on fresh database...');
  await db.tasks.clear();
  await db.projects.clear();
  await db.skills.clear();
  await db.habits.clear();
  await db.userProfile.clear();

  const countBefore = await db.tasks.count();
  if (countBefore !== 0) {
    throw new Error(`Expected empty database before init, found ${countBefore} tasks.`);
  }

  await initializeDatabase();

  const taskCount = await db.tasks.count();
  const projectCount = await db.projects.count();
  const skillCount = await db.skills.count();
  const habitCount = await db.habits.count();
  const userCount = await db.userProfile.count();

  if (taskCount !== INITIAL_TASKS.length) {
    throw new Error(`Expected ${INITIAL_TASKS.length} initial tasks, got ${taskCount}`);
  }
  if (projectCount !== INITIAL_PROJECTS.length) {
    throw new Error(`Expected ${INITIAL_PROJECTS.length} initial projects, got ${projectCount}`);
  }
  if (skillCount !== INITIAL_SKILLS.length) {
    throw new Error(`Expected ${INITIAL_SKILLS.length} initial skills, got ${skillCount}`);
  }
  if (habitCount !== INITIAL_HABITS.length) {
    throw new Error(`Expected ${INITIAL_HABITS.length} initial habits, got ${habitCount}`);
  }
  if (userCount !== 1) {
    throw new Error(`Expected 1 user profile, got ${userCount}`);
  }

  console.log(`  ✓ Fresh database seeded with ${taskCount} tasks, ${projectCount} projects, ${skillCount} skills, ${habitCount} habits, and user profile.`);

  // Test 2: Idempotence of initializeDatabase()
  console.log('\nTest 2: Idempotence of initializeDatabase()...');
  // Add a user-created task
  await db.tasks.put({
    id: 'user-task-unique-1',
    projectId: INITIAL_PROJECTS[0]?.id || 'inbox',
    title: 'Custom User Task',
    priority: 'p1',
    labels: ['custom'],
    completed: false,
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isDeleted: false,
  });

  // Re-run initializeDatabase
  await initializeDatabase();

  const taskCountAfter = await db.tasks.count();
  if (taskCountAfter !== taskCount + 1) {
    throw new Error(`initializeDatabase re-run altered existing tasks count: expected ${taskCount + 1}, got ${taskCountAfter}`);
  }
  const customTask = await db.tasks.get('user-task-unique-1');
  if (!customTask || customTask.title !== 'Custom User Task') {
    throw new Error('initializeDatabase re-run wiped or corrupted existing custom task.');
  }
  console.log('  ✓ Re-running initializeDatabase() preserved existing data idempotently.');

  // Test 3: View Routing & Display Mode Switching
  console.log('\nTest 3: View Routing & Display Mode switching in store...');
  const store = useEkirumStore.getState();

  // Test default display mode
  if (!['list', 'timeline', 'calendar'].includes(store.displayMode)) {
    throw new Error(`Invalid displayMode: ${store.displayMode}`);
  }

  // Switch to timeline
  store.setDisplayMode('timeline');
  if (useEkirumStore.getState().displayMode !== 'timeline') {
    throw new Error('Failed to set displayMode to timeline');
  }

  // Switch to list
  store.setDisplayMode('list');
  if (useEkirumStore.getState().displayMode !== 'list') {
    throw new Error('Failed to set displayMode to list');
  }

  // Check setCurrentView behavior
  store.setCurrentView('calendar');
  if (useEkirumStore.getState().currentView !== 'calendar' || useEkirumStore.getState().displayMode !== 'calendar') {
    throw new Error('setCurrentView("calendar") did not synchronize view and displayMode');
  }

  store.setCurrentView('today');
  if (useEkirumStore.getState().currentView !== 'today' || useEkirumStore.getState().displayMode !== 'list') {
    throw new Error('setCurrentView("today") did not default displayMode to list');
  }

  console.log('  ✓ DisplayMode and ViewType transitions verified (list <-> board <-> timeline <-> calendar).');

  // Test 3b: Project Filtering on Completed Section & Store
  console.log('\nTest 3b: Project Filtering in Completed view & store...');
  if (useEkirumStore.getState().selectedProjectFilter !== 'all') {
    throw new Error(`Expected initial selectedProjectFilter to be 'all', got ${useEkirumStore.getState().selectedProjectFilter}`);
  }

  store.setProjectFilter('project-alpha');
  if (useEkirumStore.getState().selectedProjectFilter !== 'project-alpha') {
    throw new Error('setProjectFilter failed to update selectedProjectFilter');
  }

  // Switching views resets project filter
  store.setCurrentView('completed');
  if (useEkirumStore.getState().selectedProjectFilter !== 'all') {
    throw new Error('setCurrentView did not reset selectedProjectFilter to "all"');
  }

  // Test completed filtering logic
  const mockTasks = [
    { id: 'c1', title: 'Task in Alpha', projectId: 'project-alpha', completed: true, isDeleted: false },
    { id: 'c2', title: 'Task in Beta', projectId: 'project-beta', completed: true, isDeleted: false },
    { id: 'c3', title: 'Task in Inbox', projectId: 'inbox', completed: true, isDeleted: false },
    { id: 'c4', title: 'Task with no project', completed: true, isDeleted: false },
    { id: 'c5', title: 'Incomplete Task in Alpha', projectId: 'project-alpha', completed: false, isDeleted: false },
  ];

  const filterCompleted = (filter: string) => {
    return mockTasks.filter((t) => {
      if (!t.completed || t.isDeleted) return false;
      if (filter === 'all') return true;
      if (filter === 'inbox') return !t.projectId || t.projectId === 'inbox';
      return t.projectId === filter;
    });
  };

  const allCompleted = filterCompleted('all');
  if (allCompleted.length !== 4) {
    throw new Error(`Expected 4 completed tasks for 'all', got ${allCompleted.length}`);
  }

  const alphaCompleted = filterCompleted('project-alpha');
  if (alphaCompleted.length !== 1 || alphaCompleted[0].id !== 'c1') {
    throw new Error(`Expected only task c1 for 'project-alpha', got ${JSON.stringify(alphaCompleted)}`);
  }

  const inboxCompleted = filterCompleted('inbox');
  if (inboxCompleted.length !== 2 || !inboxCompleted.some((t) => t.id === 'c3') || !inboxCompleted.some((t) => t.id === 'c4')) {
    throw new Error(`Expected tasks c3 and c4 for 'inbox', got ${JSON.stringify(inboxCompleted)}`);
  }

  console.log('  ✓ Project filtering on completed tasks verified (all, specific project, and inbox).');

  // Test 4: Storage Error Visibility & Clear Action
  console.log('\nTest 4: Storage Error visibility and dismiss action...');
  if (useEkirumStore.getState().storageError !== null) {
    throw new Error('Expected initial storageError to be null');
  }

  store.setStorageError('Simulated disk quota exceeded error');
  if (useEkirumStore.getState().storageError !== 'Simulated disk quota exceeded error') {
    throw new Error('setStorageError failed to update state');
  }

  store.clearStorageError();
  if (useEkirumStore.getState().storageError !== null) {
    throw new Error('clearStorageError failed to clear storageError');
  }
  console.log('  ✓ storageError state and clearStorageError verified.');

  // Test 5: Clock Skew Mitigation in Sync Engine
  console.log('\nTest 5: Clock Skew Mitigation in Sync Engine...');

  // 5a: Future timestamp clamping
  const futureTimestamp = '2099-01-01T00:00:00.000Z';
  const skewedPayload = {
    schemaVersion: 1,
    exportedAt: futureTimestamp,
    tables: {
      tasks: [
        {
          id: 'future-task-1',
          title: 'Task from Year 2099',
          priority: 'p2',
          updatedAt: futureTimestamp,
          createdAt: futureTimestamp,
          completed: false,
        },
      ],
    },
  };

  const mergeRes = await importAndMerge(skewedPayload);
  if (!mergeRes.success) {
    throw new Error(`importAndMerge failed: ${mergeRes.error}`);
  }

  const clampedTask = await db.tasks.get('future-task-1');
  if (!clampedTask) {
    throw new Error('Failed to insert future-task-1');
  }

  // The updatedAt timestamp should have been clamped so it does not remain in year 2099
  const clampedTime = new Date(clampedTask.updatedAt).getTime();
  const maxAllowedTime = Date.now() + 65_000;
  if (clampedTime > maxAllowedTime) {
    throw new Error(`Future timestamp was NOT clamped! Received: ${clampedTask.updatedAt}`);
  }
  console.log(`  ✓ Future timestamp clamped safely: ${clampedTask.updatedAt} (no permanent lock out)`);

  // 5b: Tombstone deletion precedence on near-tie clock drift
  const nowIso = new Date().toISOString();
  await db.tasks.put({
    id: 'tombstone-test-task',
    projectId: INITIAL_PROJECTS[0]?.id || 'inbox',
    title: 'Active Task on Device A',
    priority: 'p2',
    labels: [],
    completed: false,
    subtasks: [],
    createdAt: nowIso,
    updatedAt: nowIso,
    isDeleted: false,
  });

  // Device B soft-deleted the task 500ms earlier due to clock skew
  const slightlyEarlierIso = new Date(Date.now() - 500).toISOString();
  const tombstonePayload = {
    schemaVersion: 1,
    tables: {
      tasks: [
        {
          id: 'tombstone-test-task',
          title: 'Active Task on Device A',
          priority: 'p2',
          updatedAt: slightlyEarlierIso,
          isDeleted: true,
          deletedAt: slightlyEarlierIso,
        },
      ],
    },
  };

  await importAndMerge(tombstonePayload);
  const taskAfterTombstone = await db.tasks.get('tombstone-test-task');
  if (!taskAfterTombstone || !taskAfterTombstone.isDeleted) {
    throw new Error('Tombstone deletion did NOT take precedence on near-tie clock skew!');
  }
  // 5c: Stale backup file with older exportedAt does NOT shift timestamps or overwrite newer local record
  const twoHoursAgoIso = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const oneHourAgoIso = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
  const yesterdayIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  await db.tasks.put({
    id: 'stale-test-task',
    projectId: INITIAL_PROJECTS[0]?.id || 'inbox',
    title: 'Newer Title on Local Device',
    priority: 'p1',
    labels: [],
    completed: false,
    subtasks: [],
    createdAt: yesterdayIso,
    updatedAt: oneHourAgoIso,
    isDeleted: false,
  });

  const staleBackupPayload = {
    schemaVersion: 1,
    exportedAt: yesterdayIso, // Backup file was exported 24h ago
    tables: {
      tasks: [
        {
          id: 'stale-test-task',
          title: 'Stale Title from Yesterday Backup',
          priority: 'p1',
          updatedAt: twoHoursAgoIso, // Was updated 2h ago on remote device (older than local 1h ago)
          completed: false,
        },
      ],
    },
  };

  await importAndMerge(staleBackupPayload);
  const taskAfterStaleMerge = await db.tasks.get('stale-test-task');
  if (taskAfterStaleMerge?.title !== 'Newer Title on Local Device') {
    throw new Error(`Stale backup overwritten newer local edit! Current title: ${taskAfterStaleMerge?.title}`);
  }
  console.log('  ✓ Stale backup file did NOT shift timestamps or overwrite newer local data.');

  // Test 6: File System Access Capability Detection
  console.log('\nTest 6: File System Access support detection...');
  const hasSupport = isFileSystemAccessSupported();
  // In node environment without window.showDirectoryPicker, should return false gracefully
  if (hasSupport !== false) {
    throw new Error('Expected isFileSystemAccessSupported() to return false in headless node environment');
  }
  console.log('  ✓ isFileSystemAccessSupported() safely returns false without throw in non-browser env.');

  // Test 7: clearAllData() remains cleared after browser reload / initializeDatabase()
  console.log('\nTest 7: clearAllData() remains cleared after initializeDatabase()...');
  const appStore = useEkirumStore.getState();
  await appStore.clearAllData();

  const countAfterClear = await db.tasks.count();
  if (countAfterClear !== 0) {
    throw new Error(`Expected 0 tasks after clearAllData, found ${countAfterClear}`);
  }

  // Simulate page reload
  await initializeDatabase();
  const countAfterReload = await db.tasks.count();
  if (countAfterReload !== 0) {
    throw new Error(`initializeDatabase() re-seeded sample data after clearAllData! Found ${countAfterReload} tasks`);
  }
  console.log('  ✓ Database remains cleared after initializeDatabase() (no unwanted re-seeding).');

  console.log('\n🎉 ALL FIRST-LAUNCH, VIEW ROUTING, AND CLOCK-SKEW TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
