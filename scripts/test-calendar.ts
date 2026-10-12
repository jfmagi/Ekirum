import assert from 'node:assert';
import { Task } from '../src/types';
import { isTaskScheduledOnDate } from '../src/components/tasks/TaskCalendarView';

console.log('🧪 Starting Ekirum Calendar Logic & Recurrence Projection verification tests...\n');

const createDate = (y: number, m: number, d: number) => new Date(y, m - 1, d);

// Test 1: Non-recurring scheduled task only matches its exact dueDate
const singleTask: Task = {
  id: 'task-single',
  projectId: 'proj-1',
  title: 'Dentist appointment',
  dueDate: '2026-10-15',
  priority: 'p3',
  labels: [],
  completed: false,
  subtasks: [],
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

assert.strictEqual(
  isTaskScheduledOnDate(singleTask, '2026-10-15', createDate(2026, 10, 15), '2026-10-10'),
  true,
  'Single task must match its exact dueDate'
);
assert.strictEqual(
  isTaskScheduledOnDate(singleTask, '2026-10-16', createDate(2026, 10, 16), '2026-10-10'),
  false,
  'Single task must not match subsequent days'
);
assert.strictEqual(
  isTaskScheduledOnDate(singleTask, '2026-10-14', createDate(2026, 10, 14), '2026-10-10'),
  false,
  'Single task must not match preceding days'
);
console.log('Test 1: Non-recurring task matches exact date only: PASSED');

// Test 2: Dateless tasks are never projected onto any calendar day
const datelessTask: Task = {
  id: 'task-backlog',
  projectId: 'proj-1',
  title: 'Read paper',
  priority: 'p4',
  labels: [],
  completed: false,
  subtasks: [],
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};
assert.strictEqual(
  isTaskScheduledOnDate(datelessTask, '2026-10-15', createDate(2026, 10, 15), '2026-10-10'),
  false,
  'Dateless non-recurring task must not be projected'
);
console.log('Test 2: Dateless backlog task is excluded from calendar days: PASSED');

// Test 3: Completed tasks only show on their historical dueDate, never projected forward
const completedDailyTask: Task = {
  id: 'task-completed-daily',
  projectId: 'proj-1',
  title: 'Morning Run',
  dueDate: '2026-10-10',
  recurrence: 'daily',
  priority: 'p2',
  labels: [],
  completed: true,
  completedAt: '2026-10-10T09:00:00.000Z',
  subtasks: [],
  createdAt: '2026-10-10T08:00:00.000Z',
  updatedAt: '2026-10-10T09:00:00.000Z',
};
assert.strictEqual(
  isTaskScheduledOnDate(completedDailyTask, '2026-10-10', createDate(2026, 10, 10), '2026-10-10'),
  true,
  'Completed task matches its historical dueDate'
);
assert.strictEqual(
  isTaskScheduledOnDate(completedDailyTask, '2026-10-11', createDate(2026, 10, 11), '2026-10-10'),
  false,
  'Completed recurring task must not project into future dates'
);
console.log('Test 3: Completed task matches historical date and stops projecting forward: PASSED');

// Test 4: Daily recurring task projects every day from startDate onwards and excludes prior days
const activeDaily: Task = {
  id: 'task-daily',
  projectId: 'proj-1',
  title: 'Meditate',
  dueDate: '2026-10-10',
  recurrence: 'daily',
  priority: 'p2',
  labels: [],
  completed: false,
  subtasks: [],
  createdAt: '2026-10-10T08:00:00.000Z',
  updatedAt: '2026-10-10T08:00:00.000Z',
};
assert.strictEqual(isTaskScheduledOnDate(activeDaily, '2026-10-09', createDate(2026, 10, 9), '2026-10-10'), false);
assert.strictEqual(isTaskScheduledOnDate(activeDaily, '2026-10-10', createDate(2026, 10, 10), '2026-10-10'), true);
assert.strictEqual(isTaskScheduledOnDate(activeDaily, '2026-10-11', createDate(2026, 10, 11), '2026-10-10'), true);
assert.strictEqual(isTaskScheduledOnDate(activeDaily, '2026-10-12', createDate(2026, 10, 12), '2026-10-10'), true);
console.log('Test 4: Daily task correctly projects from startDate forward: PASSED');

// Test 5: Weekdays task projects Mon-Fri and excludes weekends
const weekdaysTask: Task = {
  id: 'task-weekdays',
  projectId: 'proj-1',
  title: 'Engineering Standup',
  dueDate: '2026-10-12', // Monday
  recurrence: 'weekdays',
  priority: 'p1',
  labels: [],
  completed: false,
  subtasks: [],
  createdAt: '2026-10-10T08:00:00.000Z',
  updatedAt: '2026-10-10T08:00:00.000Z',
};
assert.strictEqual(isTaskScheduledOnDate(weekdaysTask, '2026-10-12', createDate(2026, 10, 12), '2026-10-10'), true); // Mon
assert.strictEqual(isTaskScheduledOnDate(weekdaysTask, '2026-10-14', createDate(2026, 10, 14), '2026-10-10'), true); // Wed
assert.strictEqual(isTaskScheduledOnDate(weekdaysTask, '2026-10-16', createDate(2026, 10, 16), '2026-10-10'), true); // Fri
assert.strictEqual(isTaskScheduledOnDate(weekdaysTask, '2026-10-17', createDate(2026, 10, 17), '2026-10-10'), false); // Sat
assert.strictEqual(isTaskScheduledOnDate(weekdaysTask, '2026-10-18', createDate(2026, 10, 18), '2026-10-10'), false); // Sun
console.log('Test 5: Weekdays task includes Mon-Fri and excludes weekends: PASSED');

// Test 6: Weekly recurring task projects on same day-of-week every 7 days
const weeklyTask: Task = {
  id: 'task-weekly',
  projectId: 'proj-1',
  title: 'Weekly Retrospective',
  dueDate: '2026-10-16', // Friday
  recurrence: 'weekly',
  priority: 'p2',
  labels: [],
  completed: false,
  subtasks: [],
  createdAt: '2026-10-10T08:00:00.000Z',
  updatedAt: '2026-10-10T08:00:00.000Z',
};
assert.strictEqual(isTaskScheduledOnDate(weeklyTask, '2026-10-16', createDate(2026, 10, 16), '2026-10-10'), true); // 1st Fri
assert.strictEqual(isTaskScheduledOnDate(weeklyTask, '2026-10-23', createDate(2026, 10, 23), '2026-10-10'), true); // 2nd Fri
assert.strictEqual(isTaskScheduledOnDate(weeklyTask, '2026-10-30', createDate(2026, 10, 30), '2026-10-10'), true); // 3rd Fri
assert.strictEqual(isTaskScheduledOnDate(weeklyTask, '2026-10-24', createDate(2026, 10, 24), '2026-10-10'), false); // Sat
assert.strictEqual(isTaskScheduledOnDate(weeklyTask, '2026-10-15', createDate(2026, 10, 15), '2026-10-10'), false); // Thu
console.log('Test 6: Weekly task projects on matching day of week: PASSED');

// Test 7: Monthly recurring task projects on matching day-of-month and clamps on short months
const monthlyTaskEndMonth: Task = {
  id: 'task-monthly-31',
  projectId: 'proj-1',
  title: 'End of Month Review',
  dueDate: '2026-01-31',
  recurrence: 'monthly',
  recurrenceAnchorDay: 31,
  priority: 'p2',
  labels: [],
  completed: false,
  subtasks: [],
  createdAt: '2026-01-01T08:00:00.000Z',
  updatedAt: '2026-01-01T08:00:00.000Z',
};
// January has 31 days -> Jan 31 matches
assert.strictEqual(isTaskScheduledOnDate(monthlyTaskEndMonth, '2026-01-31', createDate(2026, 1, 31), '2026-01-01'), true);
// February 2026 has 28 days -> Feb 28 matches (clamped), Feb 27 does not
assert.strictEqual(isTaskScheduledOnDate(monthlyTaskEndMonth, '2026-02-28', createDate(2026, 2, 28), '2026-01-01'), true);
assert.strictEqual(isTaskScheduledOnDate(monthlyTaskEndMonth, '2026-02-27', createDate(2026, 2, 27), '2026-01-01'), false);
// Leap year Feb 2028 has 29 days -> Feb 29 matches, Feb 28 does not
assert.strictEqual(isTaskScheduledOnDate(monthlyTaskEndMonth, '2028-02-29', createDate(2028, 2, 29), '2026-01-01'), true);
assert.strictEqual(isTaskScheduledOnDate(monthlyTaskEndMonth, '2028-02-28', createDate(2028, 2, 28), '2026-01-01'), false);
// March 2026 has 31 days -> Mar 31 matches, Mar 28 does not
assert.strictEqual(isTaskScheduledOnDate(monthlyTaskEndMonth, '2026-03-31', createDate(2026, 3, 31), '2026-01-01'), true);
assert.strictEqual(isTaskScheduledOnDate(monthlyTaskEndMonth, '2026-03-28', createDate(2026, 3, 28), '2026-01-01'), false);
// April 2026 has 30 days -> Apr 30 matches, Apr 29 does not
assert.strictEqual(isTaskScheduledOnDate(monthlyTaskEndMonth, '2026-04-30', createDate(2026, 4, 30), '2026-01-01'), true);
console.log('Test 7: Monthly task projects and clamps correctly across 28/29/30/31-day months: PASSED');

// Test 8: Year-boundary transitions
const yearBoundaryDaily: Task = {
  id: 'task-yb-daily',
  projectId: 'proj-1',
  title: 'Year end transition',
  dueDate: '2026-12-30',
  recurrence: 'daily',
  priority: 'p1',
  labels: [],
  completed: false,
  subtasks: [],
  createdAt: '2026-12-30T08:00:00.000Z',
  updatedAt: '2026-12-30T08:00:00.000Z',
};
assert.strictEqual(isTaskScheduledOnDate(yearBoundaryDaily, '2026-12-31', createDate(2026, 12, 31), '2026-12-30'), true);
assert.strictEqual(isTaskScheduledOnDate(yearBoundaryDaily, '2027-01-01', createDate(2027, 1, 1), '2026-12-30'), true);
assert.strictEqual(isTaskScheduledOnDate(yearBoundaryDaily, '2027-01-02', createDate(2027, 1, 2), '2026-12-30'), true);

const yearBoundaryWeekly: Task = {
  id: 'task-yb-weekly',
  projectId: 'proj-1',
  title: 'Weekly Sunday report',
  dueDate: '2026-12-27', // Sunday
  recurrence: 'weekly',
  priority: 'p2',
  labels: [],
  completed: false,
  subtasks: [],
  createdAt: '2026-12-27T08:00:00.000Z',
  updatedAt: '2026-12-27T08:00:00.000Z',
};
assert.strictEqual(isTaskScheduledOnDate(yearBoundaryWeekly, '2027-01-03', createDate(2027, 1, 3), '2026-12-27'), true); // Next Sunday in new year
assert.strictEqual(isTaskScheduledOnDate(yearBoundaryWeekly, '2027-01-04', createDate(2027, 1, 4), '2026-12-27'), false);
console.log('Test 8: Year boundary transitions for daily and weekly recurring tasks: PASSED');

console.log('\n🎉 ALL CALENDAR & RECURRENCE TESTS PASSED!');
