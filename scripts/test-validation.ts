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

console.log('\n🎉 ALL TEXT VALIDATION & CLAMPING TESTS PASSED!');
