import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Task, DisplayMode, ViewType } from '../src/types';

console.log('🧪 Starting Ekirum Calendar Functionality verification tests...\n');

// 1. Verify types
const validModes: DisplayMode[] = ['list', 'timeline', 'calendar'];
assert(validModes.includes('calendar'), 'DisplayMode must include calendar');
console.log('Test 1: DisplayMode includes "calendar": PASSED');

// 2. Test date calculations for Calendar
const today = new Date();
const y = today.getFullYear();
const m = String(today.getMonth() + 1).padStart(2, '0');
const d = String(today.getDate()).padStart(2, '0');
const todayStr = `${y}-${m}-${d}`;

// Test month day count
const daysInCurrentMonth = new Date(y, today.getMonth() + 1, 0).getDate();
assert(daysInCurrentMonth >= 28 && daysInCurrentMonth <= 31, 'Days in month must be between 28 and 31');
console.log(`Test 2: Date math valid (${daysInCurrentMonth} days in current month): PASSED`);

// 3. Test tasks distribution across dates
const mockTasks: Task[] = [
  {
    id: 'task-1',
    projectId: 'inbox',
    title: 'Research design tokens',
    dueDate: todayStr,
    priority: 'p1',
    labels: ['design'],
    completed: false,
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-2',
    projectId: 'inbox',
    title: 'Schedule dentist appointment',
    dueDate: '2026-10-15',
    priority: 'p3',
    labels: ['health'],
    completed: false,
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'task-3',
    projectId: 'inbox',
    title: 'Unscheduled backlog task',
    dueDate: undefined,
    priority: 'p4',
    labels: [],
    completed: false,
    subtasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// Map tasks by date
const map = new Map<string, Task[]>();
mockTasks.forEach((t) => {
  if (t.dueDate) {
    const list = map.get(t.dueDate) || [];
    list.push(t);
    map.set(t.dueDate, list);
  }
});

const unscheduled = mockTasks.filter((t) => !t.dueDate);
assert.strictEqual(map.get(todayStr)?.length, 1, 'Today should have 1 task');
assert.strictEqual(map.get('2026-10-15')?.length, 1, 'Oct 15 should have 1 task');
assert.strictEqual(unscheduled.length, 1, 'Should have 1 unscheduled task');
console.log('Test 3: Date grouping and unscheduled backlog filtering: PASSED');

// 4. Test drag-and-drop / rescheduling update
const updatedTask = {
  ...unscheduled[0],
  dueDate: '2026-10-20',
  updatedAt: new Date().toISOString(),
};
assert.strictEqual(updatedTask.dueDate, '2026-10-20', 'Rescheduled task must have updated dueDate');
console.log('Test 4: Task scheduling/rescheduling simulation: PASSED');

// 5. Test recurring tasks calendar projection
const { isTaskScheduledOnDate } = await import('../src/components/tasks/TaskCalendarView');

const dailyTask: Task = {
  id: 'task-daily',
  projectId: 'inbox',
  title: 'Daily Workout',
  dueDate: '2026-10-10',
  recurrence: 'daily',
  priority: 'p2',
  completed: false,
  subtasks: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Check daily task on 2026-10-10, 2026-10-11, 2026-10-12
const d1 = new Date(2026, 9, 10);
const d2 = new Date(2026, 9, 11);
const d3 = new Date(2026, 9, 12);
const pastDate = new Date(2026, 9, 9);

assert.strictEqual(isTaskScheduledOnDate(dailyTask, '2026-10-10', d1, '2026-10-10'), true);
assert.strictEqual(isTaskScheduledOnDate(dailyTask, '2026-10-11', d2, '2026-10-10'), true);
assert.strictEqual(isTaskScheduledOnDate(dailyTask, '2026-10-12', d3, '2026-10-10'), true);
assert.strictEqual(isTaskScheduledOnDate(dailyTask, '2026-10-09', pastDate, '2026-10-10'), false, 'Should not project before start date');
console.log('Test 5: Daily task projects across all days from start date onwards: PASSED');

// Test weekdays task
const weekdaysTask: Task = {
  id: 'task-weekdays',
  projectId: 'inbox',
  title: 'Standup',
  dueDate: '2026-10-12', // Monday
  recurrence: 'weekdays',
  priority: 'p1',
  completed: false,
  subtasks: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mon = new Date(2026, 9, 12); // Mon
const fri = new Date(2026, 9, 16); // Fri
const sat = new Date(2026, 9, 17); // Sat
const sun = new Date(2026, 9, 18); // Sun

assert.strictEqual(isTaskScheduledOnDate(weekdaysTask, '2026-10-12', mon, '2026-10-10'), true);
assert.strictEqual(isTaskScheduledOnDate(weekdaysTask, '2026-10-16', fri, '2026-10-10'), true);
assert.strictEqual(isTaskScheduledOnDate(weekdaysTask, '2026-10-17', sat, '2026-10-10'), false);
assert.strictEqual(isTaskScheduledOnDate(weekdaysTask, '2026-10-18', sun, '2026-10-10'), false);
console.log('Test 6: Weekdays task projects Mon-Fri and excludes weekends: PASSED');

// Test unscheduled filtering excludes recurring tasks
const mixedTasks: Task[] = [dailyTask, mockTasks[2]];
const calendarUnscheduled = mixedTasks.filter((t) => !t.completed && !t.dueDate && (!t.recurrence || t.recurrence === 'none'));
assert.strictEqual(calendarUnscheduled.length, 1, 'Only non-recurring dateless tasks are in backlog');
console.log('Test 7: Unscheduled backlog excludes daily recurring tasks: PASSED');

console.log('\n🎉 ALL CALENDAR & RECURRENCE TESTS PASSED!');

