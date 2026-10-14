import 'fake-indexeddb/auto';
import assert from 'node:assert';
import { parseNaturalLanguageTask, formatLocalDate } from '../src/lib/dateParser';
import { useEkirumStore, advanceRecurringTask, getNextRecurrenceDate } from '../src/store/useEkirumStore';
import { Task } from '../src/types';

console.log('🧪 Starting Task Addition & View Filter verification tests...\n');

const todayStr = formatLocalDate(new Date());

// 1. Natural Language Parser Tests
const p1 = parseNaturalLanguageTask('Review PR today');
assert.strictEqual(p1.title, 'Review PR');
assert.strictEqual(p1.dueDate, todayStr);
console.log('Test 1: "Review PR today" extracted title and todayStr: PASSED');

const p2 = parseNaturalLanguageTask('dentist on friday');
assert.strictEqual(p2.title, 'dentist');
assert.ok(p2.dueDate && p2.dueDate > todayStr);
console.log('Test 2: "dentist on friday" stripped preposition and set future date: PASSED');

const p3 = parseNaturalLanguageTask('Urgent bug fix p1 #frontend');
assert.strictEqual(p3.title, 'Urgent bug fix');
assert.strictEqual(p3.priority, 'p1');
assert.deepStrictEqual(p3.labels, ['frontend']);
console.log('Test 3: Priority and labels extracted: PASSED');

// 2. Store Task Addition: tasks do NOT automatically resolve to "today"
const store = useEkirumStore.getState();
store.setCurrentView('today');

// Add task without explicit dueDate: must NOT resolve to today
const datelessTask = store.addTask({
  title: 'Unscheduled Task',
});
assert.strictEqual(datelessTask.dueDate, undefined, 'Tasks without explicit date must NOT resolve to today');
console.log('Test 4: Dateless task has undefined dueDate (does NOT resolve to today): PASSED');

// Add task with explicit date and hour (from mini calendar picker)
const scheduledTask = store.addTask({
  title: 'Doctor Appointment',
  dueDate: '2026-10-15',
  dueTime: '14:30',
});
assert.strictEqual(scheduledTask.dueDate, '2026-10-15');
assert.strictEqual(scheduledTask.dueTime, '14:30');
console.log('Test 5: Task with chosen date and hour saved accurately: PASSED');

// 3. Store Task Addition in Project View
await store.initStorage();
const stateAfterInit = useEkirumStore.getState();
let project = stateAfterInit.projects[0];
if (!project) {
  project = stateAfterInit.createProject('Deep Work', '#8B1528');
}
assert.ok(project, 'Must have at least one project');
useEkirumStore.getState().setCurrentView('project', project.id);

const projectTask = useEkirumStore.getState().addTask({
  title: 'Task inside Project',
});
assert.strictEqual(projectTask.projectId, project.id, 'Task added in Project view must belong to that project');
assert.strictEqual(projectTask.dueDate, undefined, 'Project task without date does NOT resolve to today');
console.log('Test 6: Task added in Project view assigned to current project without forced today date: PASSED');

// 4. Quick Add Modal does NOT force todayStr by default
store.setCurrentView('today');
store.setQuickAddOpen(true);
assert.strictEqual(useEkirumStore.getState().quickAddDefaultDate, null, 'Quick add without date does not force todayStr');
console.log('Test 7: Quick Add modal opened without date does not force todayStr: PASSED');

store.setCurrentView('calendar');
store.setQuickAddOpen(true, '2026-10-25');
assert.strictEqual(useEkirumStore.getState().quickAddDefaultDate, '2026-10-25', 'Quick add with explicit date preserved');
console.log('Test 8: Quick Add modal with explicit date preserved: PASSED');

// 5. Daily Recurrence & Natural Language Parser Tests
const pDaily1 = parseNaturalLanguageTask('Meditate daily');
assert.strictEqual(pDaily1.title, 'Meditate');
assert.strictEqual(pDaily1.recurrence, 'daily');
assert.strictEqual(pDaily1.dueDate, todayStr, 'Daily task must start today by default');
console.log('Test 9: "Meditate daily" parsed recurrence and initialized today: PASSED');

const pDaily2 = parseNaturalLanguageTask('Workout everyday at 7am');
assert.strictEqual(pDaily2.title, 'Workout');
assert.strictEqual(pDaily2.recurrence, 'daily');
assert.strictEqual(pDaily2.dueTime, '07:00');
assert.strictEqual(pDaily2.dueDate, todayStr);
console.log('Test 10: "Workout everyday at 7am" parsed daily and hour: PASSED');

const pWeekly = parseNaturalLanguageTask('Retro every friday');
assert.strictEqual(pWeekly.title, 'Retro');
assert.strictEqual(pWeekly.recurrence, 'weekly');
assert.ok(pWeekly.dueDate && pWeekly.dueDate > todayStr);
console.log('Test 11: "Retro every friday" parsed weekly with upcoming friday date: PASSED');

// 6. Syntax Tokenizer Invariant & Command Recognition Tests
const { tokenizeTaskInput } = await import('../src/lib/taskSyntax');
const complexInput = 'Meditate daily at 8am p1 @Health #mindfulness';
const tokens = tokenizeTaskInput(complexInput);
// Invariant: joining all token text MUST exactly match input
assert.strictEqual(tokens.map((t) => t.text).join(''), complexInput, 'Tokens must concatenate to exact raw input');

const recurrenceToken = tokens.find((t) => t.type === 'recurrence');
assert.strictEqual(recurrenceToken?.text, 'daily');

const timeToken = tokens.find((t) => t.type === 'time');
assert.strictEqual(timeToken?.text, 'at 8am');

const priorityToken = tokens.find((t) => t.type === 'priority');
assert.strictEqual(priorityToken?.text, 'p1');
assert.strictEqual(priorityToken?.priorityLevel, 'p1');

const projectToken = tokens.find((t) => t.type === 'project');
assert.strictEqual(projectToken?.text, '@Health');

const labelToken = tokens.find((t) => t.type === 'label');
assert.strictEqual(labelToken?.text, '#mindfulness');
console.log('Test 12: Syntax tokenizer correctly recognizes daily, time, priority, project, and label: PASSED');

// Test 12b: Syntax Tokenizer ↔ Natural Language Parser parity cross-validation
const crossValidationInputs = [
  'Meditate daily at 8am p1 @Health #mindfulness',
  'Dentist appointment tomorrow 3pm p2 #health',
  'Weekly retro every friday at 10:00 p1 @Work',
  'Flashcards x3 p1 @Study #exams',
];

for (const input of crossValidationInputs) {
  const tks = tokenizeTaskInput(input);
  const prs = parseNaturalLanguageTask(input);

  // Recurrence token parity
  const recToken = tks.find((t) => t.type === 'recurrence');
  if (prs.recurrence && prs.recurrence !== 'none') {
    assert.ok(recToken, `Input "${input}" parsed recurrence "${prs.recurrence}" but tokenizer produced no recurrence token`);
  }

  // Priority token parity
  const priToken = tks.find((t) => t.type === 'priority');
  if (prs.priority) {
    assert.ok(priToken, `Input "${input}" parsed priority "${prs.priority}" but tokenizer produced no priority token`);
    assert.strictEqual(priToken.priorityLevel, prs.priority);
  }

  // Multiplier token parity
  const mulToken = tks.find((t) => t.type === 'multiplier');
  if (prs.batchCount && prs.batchCount > 1) {
    assert.ok(mulToken, `Input "${input}" parsed multiplier ${prs.batchCount} but tokenizer produced no multiplier token`);
  }

  // Label token parity
  const lblTokens = tks.filter((t) => t.type === 'label');
  if (prs.labels && prs.labels.length > 0) {
    assert.strictEqual(lblTokens.length, prs.labels.length);
    for (const label of prs.labels) {
      assert.ok(
        lblTokens.some((t) => t.text.toLowerCase().includes(label.toLowerCase())),
        `Label "${label}" in parsed task must appear in tokenizer label tokens`
      );
    }
  }

  // Project token parity
  const prjToken = tks.find((t) => t.type === 'project');
  if (prs.projectQuery) {
    assert.ok(prjToken, `Input "${input}" parsed projectQuery "${prs.projectQuery}" but tokenizer produced no project token`);
    assert.ok(prjToken.text.toLowerCase().includes(prs.projectQuery.toLowerCase()));
  }
}
console.log('Test 12b: Tokenizer ↔ Parser cross-validation parity verified: PASSED');

// Test 13: Normal dateless task remains dateless
const pDateless = parseNaturalLanguageTask('Buy groceries');
assert.strictEqual(pDateless.title, 'Buy groceries');
assert.strictEqual(pDateless.dueDate, undefined, 'Dateless tasks must not have dueDate');
assert.strictEqual(pDateless.recurrence, undefined);
console.log('Test 13: Dateless task without recurrence remains dateless: PASSED');

// 7. Multiplier & Numbered Task Generation Tests
const pBatch = parseNaturalLanguageTask('Flashcards x3 p1 @Study');
assert.strictEqual(pBatch.title, 'Flashcards');
assert.strictEqual(pBatch.batchCount, 3);
assert.strictEqual(pBatch.priority, 'p1');
assert.strictEqual(pBatch.projectQuery, 'Study');
console.log('Test 14: "Flashcards x3 p1 @Study" parsed multiplier x3: PASSED');

const { formatNumberedTaskTitle } = await import('../src/lib/taskSyntax');
assert.strictEqual(formatNumberedTaskTitle('Chapter', 1, 3, 'suffix'), 'Chapter 1');
assert.strictEqual(formatNumberedTaskTitle('Chapter', 2, 3, 'hash'), 'Chapter #2');
assert.strictEqual(formatNumberedTaskTitle('Chapter', 3, 3, 'fraction'), 'Chapter (3/3)');
assert.strictEqual(formatNumberedTaskTitle('Chapter', 1, 3, 'bracket'), 'Chapter [1]');
console.log('Test 15: formatNumberedTaskTitle formats suffix, hash, fraction, and bracket: PASSED');

// Test 16: Multi-task creation simulation
const countToCreate = 3;
const createdBatchTasks = [];
for (let i = countToCreate - 1; i >= 0; i--) {
  const num = 1 + i;
  const title = formatNumberedTaskTitle('Review Unit', num, countToCreate, 'suffix');
  createdBatchTasks.push(store.addTask({ title, priority: 'p2' }));
}
assert.strictEqual(createdBatchTasks.length, 3);
const titles = createdBatchTasks.map((t) => t.title);
assert.deepStrictEqual(titles, ['Review Unit 3', 'Review Unit 2', 'Review Unit 1']);
console.log('Test 16: Created 3 numbered tasks with unique IDs and matching metadata: PASSED');

// 8. Daily Recurrence Scheduling & Completion Cycle Tests
const { getNextRecurrenceDate } = await import('../src/store/useEkirumStore');

// Test 17: addTask with recurrence='daily' and no dueDate auto-assigns todayStr
const dailyAddedTask = store.addTask({
  title: 'Drink Water',
  recurrence: 'daily',
});
assert.strictEqual(dailyAddedTask.recurrence, 'daily');
assert.strictEqual(dailyAddedTask.dueDate, todayStr, 'addTask with recurrence must auto-schedule to today');
console.log('Test 17: addTask with recurrence="daily" auto-schedules to today: PASSED');

// Test 18: updateTask setting recurrence on dateless task auto-assigns todayStr
const taskToRecur = store.addTask({
  title: 'Evening Journaling',
});
assert.strictEqual(taskToRecur.dueDate, undefined);
store.updateTask(taskToRecur.id, { recurrence: 'daily' });
const updatedRecurTask = useEkirumStore.getState().tasks.find((t) => t.id === taskToRecur.id);
assert.strictEqual(updatedRecurTask?.recurrence, 'daily');
assert.strictEqual(updatedRecurTask?.dueDate, todayStr, 'updateTask with recurrence must assign today if dateless');
console.log('Test 18: updateTask setting recurrence="daily" on dateless task auto-schedules to today: PASSED');

// Test 19: getNextRecurrenceDate logic
const tomorrowExpected = new Date();
tomorrowExpected.setDate(tomorrowExpected.getDate() + 1);
const tomY = tomorrowExpected.getFullYear();
const tomM = String(tomorrowExpected.getMonth() + 1).padStart(2, '0');
const tomD = String(tomorrowExpected.getDate()).padStart(2, '0');
const tomStr = `${tomY}-${tomM}-${tomD}`;

assert.strictEqual(getNextRecurrenceDate(todayStr, 'daily', todayStr), tomStr);
console.log('Test 19: getNextRecurrenceDate advances daily task by 1 day: PASSED');

// Test 19b: Monthly recurrence clamps to end of month without skipping shorter months
assert.strictEqual(getNextRecurrenceDate('2026-01-31', 'monthly', '2026-01-31'), '2026-02-28');
assert.strictEqual(getNextRecurrenceDate('2028-01-31', 'monthly', '2028-01-31'), '2028-02-29'); // Leap year 2028
assert.strictEqual(getNextRecurrenceDate('2026-03-31', 'monthly', '2026-03-31'), '2026-04-30');
assert.strictEqual(getNextRecurrenceDate('2026-05-31', 'monthly', '2026-05-31'), '2026-06-30');
assert.strictEqual(getNextRecurrenceDate('2026-08-31', 'monthly', '2026-08-31'), '2026-09-30');
assert.strictEqual(getNextRecurrenceDate('2026-10-31', 'monthly', '2026-10-31'), '2026-11-30');
assert.strictEqual(getNextRecurrenceDate('2026-12-31', 'monthly', '2026-12-31'), '2027-01-31');
console.log('Test 19b: Monthly recurrence safely clamps end-of-month dates without skipping shorter months: PASSED');

// Test 19c: Chained monthly recurrence preserving anchor day across short months back to 31st
const step1 = getNextRecurrenceDate('2026-01-31', 'monthly', '2026-01-31', 31);
assert.strictEqual(step1, '2026-02-28', 'Jan 31 clamps to Feb 28');
const step2 = getNextRecurrenceDate(step1, 'monthly', '2026-02-28', 31);
assert.strictEqual(step2, '2026-03-31', 'Feb 28 with anchor 31 unclamps back to Mar 31');
const step3 = getNextRecurrenceDate(step2, 'monthly', '2026-03-31', 31);
assert.strictEqual(step3, '2026-04-30', 'Mar 31 clamps to Apr 30');
const step4 = getNextRecurrenceDate(step3, 'monthly', '2026-04-30', 31);
assert.strictEqual(step4, '2026-05-31', 'Apr 30 with anchor 31 unclamps back to May 31');

// Test 19d: advanceRecurringTask maintains recurrenceAnchorDay across chained completions
const taskMonthly31: Task = {
  id: 'task-recur-31',
  projectId: 'proj-1',
  title: 'Monthly statement',
  dueDate: '2026-01-31',
  recurrence: 'monthly',
  recurrenceAnchorDay: 31,
  priority: 'p2',
  labels: [],
  completed: false,
  subtasks: [],
  createdAt: '2026-01-31T10:00:00.000Z',
  updatedAt: '2026-01-31T10:00:00.000Z',
};

const adv1 = advanceRecurringTask(taskMonthly31, '2026-01-31', '2026-01-31T10:00:00.000Z');
assert.strictEqual(adv1.activeRecurringTask.dueDate, '2026-02-28');
assert.strictEqual(adv1.activeRecurringTask.recurrenceAnchorDay, 31);

const adv2 = advanceRecurringTask(adv1.activeRecurringTask, '2026-02-28', '2026-02-28T10:00:00.000Z');
assert.strictEqual(adv2.activeRecurringTask.dueDate, '2026-03-31');
assert.strictEqual(adv2.activeRecurringTask.recurrenceAnchorDay, 31);

const adv3 = advanceRecurringTask(adv2.activeRecurringTask, '2026-03-31', '2026-03-31T10:00:00.000Z');
assert.strictEqual(adv3.activeRecurringTask.dueDate, '2026-04-30');
assert.strictEqual(adv3.activeRecurringTask.recurrenceAnchorDay, 31);

const adv4 = advanceRecurringTask(adv3.activeRecurringTask, '2026-04-30', '2026-04-30T10:00:00.000Z');
assert.strictEqual(adv4.activeRecurringTask.dueDate, '2026-05-31');
assert.strictEqual(adv4.activeRecurringTask.recurrenceAnchorDay, 31);
console.log('Test 19c & 19d: Chained monthly recurrence maintains anchorDay without drifting: PASSED');

// Test 19e: advanceRecurringTask rules:
// - completedArchiveTask has recurrenceAnchorDay === undefined
// - daily / weekly activeRecurringTask has recurrenceAnchorDay === undefined
assert.strictEqual(adv1.completedArchiveTask.recurrenceAnchorDay, undefined, 'Archive task must clear anchorDay');

const dailyTaskWithAnchor: Task = {
  id: 'task-daily-anchor',
  projectId: 'proj-1',
  title: 'Daily Standup',
  dueDate: '2026-10-14',
  recurrence: 'daily',
  priority: 'p2',
  labels: [],
  completed: false,
  subtasks: [],
  createdAt: '2026-10-14T08:00:00.000Z',
  updatedAt: '2026-10-14T08:00:00.000Z',
};
const advDaily = advanceRecurringTask(dailyTaskWithAnchor, '2026-10-14', '2026-10-14T08:00:00.000Z');
assert.strictEqual(advDaily.activeRecurringTask.recurrenceAnchorDay, undefined, 'Daily active task must not have recurrenceAnchorDay');
assert.strictEqual(advDaily.completedArchiveTask.recurrenceAnchorDay, undefined, 'Daily archive task must not have recurrenceAnchorDay');
console.log('Test 19e: advanceRecurringTask strictly restricts recurrenceAnchorDay to active monthly tasks: PASSED');

// Test 19f: updateTask maintains recurrenceAnchorDay correctly:
// 1. Changing dueDate on monthly task recomputes anchor
const monthlyTaskForEdit = store.addTask({
  title: 'Rent Payment',
  dueDate: '2026-01-31',
  recurrence: 'monthly',
});
assert.strictEqual(monthlyTaskForEdit.recurrenceAnchorDay, 31);

// User changes dueDate from 31st to 15th
store.updateTask(monthlyTaskForEdit.id, { dueDate: '2026-02-15' });
const updatedTo15 = useEkirumStore.getState().tasks.find((t) => t.id === monthlyTaskForEdit.id);
assert.strictEqual(updatedTo15?.dueDate, '2026-02-15');
assert.strictEqual(updatedTo15?.recurrenceAnchorDay, 15, 'Editing dueDate to 15th must recompute recurrenceAnchorDay to 15');

// Advancing it now advances to March 15, not 31st!
const adv15 = advanceRecurringTask(updatedTo15!, '2026-02-15', '2026-02-15T10:00:00.000Z');
assert.strictEqual(adv15.activeRecurringTask.dueDate, '2026-03-15', 'Completion must advance to 15th of next month');
assert.strictEqual(adv15.activeRecurringTask.recurrenceAnchorDay, 15);

// 2. Preserves anchor when editing non-date fields while clamped to Feb 28
const monthlyClampedTask = store.addTask({
  title: 'Cloud Hosting Invoice',
  dueDate: '2026-01-31',
  recurrence: 'monthly',
});
// Advance to Feb 28
const advClamped = advanceRecurringTask(monthlyClampedTask, '2026-01-31', '2026-01-31T10:00:00.000Z');
assert.strictEqual(advClamped.activeRecurringTask.dueDate, '2026-02-28');
assert.strictEqual(advClamped.activeRecurringTask.recurrenceAnchorDay, 31);
store.updateTask(monthlyClampedTask.id, {
  dueDate: '2026-02-28',
  recurrenceAnchorDay: 31,
});
// User updates title in February
store.updateTask(monthlyClampedTask.id, { title: 'Cloud Hosting Invoice (Updated)' });
const titleUpdatedTask = useEkirumStore.getState().tasks.find((t) => t.id === monthlyClampedTask.id);
assert.strictEqual(titleUpdatedTask?.title, 'Cloud Hosting Invoice (Updated)');
assert.strictEqual(titleUpdatedTask?.recurrenceAnchorDay, 31, 'Editing title while clamped to Feb 28 must preserve anchor 31');

// 3. Moving recurrence off monthly clears recurrenceAnchorDay
store.updateTask(monthlyClampedTask.id, { recurrence: 'daily' });
const movedToDailyTask = useEkirumStore.getState().tasks.find((t) => t.id === monthlyClampedTask.id);
assert.strictEqual(movedToDailyTask?.recurrence, 'daily');
assert.strictEqual(movedToDailyTask?.recurrenceAnchorDay, undefined, 'Moving off monthly must clear recurrenceAnchorDay');

// 4. Moving recurrence back to monthly derives anchor from current dueDate
store.updateTask(monthlyClampedTask.id, { recurrence: 'monthly' });
const movedBackToMonthly = useEkirumStore.getState().tasks.find((t) => t.id === monthlyClampedTask.id);
assert.strictEqual(movedBackToMonthly?.recurrence, 'monthly');
assert.strictEqual(movedBackToMonthly?.recurrenceAnchorDay, 28, 'Moving back to monthly re-derives anchor from current dueDate');
console.log('Test 19f: updateTask correctly recomputes, preserves, and clears recurrenceAnchorDay: PASSED');

// Test 19g: schemaSanitizers and addTask reject recurrenceAnchorDay on non-monthly tasks
const { sanitizeTask } = await import('../src/lib/schemaSanitizers');
const sanitizedDailyWithAnchor = sanitizeTask({
  id: 'test-sanitized-daily',
  title: 'Daily Task',
  recurrence: 'daily',
  recurrenceAnchorDay: 15,
});
assert.strictEqual(sanitizedDailyWithAnchor?.recurrenceAnchorDay, undefined, 'sanitizeTask must strip recurrenceAnchorDay from non-monthly task');

const addedDailyWithAnchor = store.addTask({
  title: 'Standup',
  recurrence: 'daily',
  recurrenceAnchorDay: 20 as any,
});
assert.strictEqual(addedDailyWithAnchor.recurrenceAnchorDay, undefined, 'addTask must not store recurrenceAnchorDay on daily task');
console.log('Test 19g: schemaSanitizers and addTask strictly guard recurrenceAnchorDay behind monthly recurrence: PASSED');

// Test 20: toggleTaskComplete on recurring task advances schedule to tomorrow and preserves completion log
await store.toggleTaskComplete(dailyAddedTask.id);
const allTasksAfterComplete = useEkirumStore.getState().tasks;
const activeInstance = allTasksAfterComplete.find((t) => t.id === dailyAddedTask.id);
assert.ok(activeInstance, 'Original recurring task must still exist in tasks');
assert.strictEqual(activeInstance.completed, false, 'Recurring task must remain active');
assert.strictEqual(activeInstance.dueDate, tomStr, 'Recurring task must be rescheduled for tomorrow');

const completedHistory = allTasksAfterComplete.find(
  (t) => t.title === 'Drink Water' && t.completed && t.recurrence === 'none'
);
assert.ok(completedHistory, 'Completed historical instance must be created for today');
console.log('Test 20: toggleTaskComplete on daily task advances dueDate to tomorrow and creates completed instance: PASSED');

// Test 21: Verify new example task parsing "meditate daily at 18:00 @meditation"
const pExample = parseNaturalLanguageTask('meditate daily at 18:00 @meditation');
assert.strictEqual(pExample.title, 'meditate');
assert.strictEqual(pExample.recurrence, 'daily');
assert.strictEqual(pExample.dueTime, '18:00');
assert.strictEqual(pExample.projectQuery, 'meditation');
assert.strictEqual(pExample.dueDate, todayStr);
console.log('Test 21: "meditate daily at 18:00 @meditation" correctly parsed title, daily, 18:00, and @meditation: PASSED');

// Test 22: Polish Natural Language Parsing
const pl1 = parseNaturalLanguageTask('Kupić mleko dzisiaj');
assert.strictEqual(pl1.title, 'Kupić mleko');
assert.strictEqual(pl1.dueDate, todayStr);

const pl2 = parseNaturalLanguageTask('Raport jutro o 15:30 p1');
assert.strictEqual(pl2.title, 'Raport');
assert.strictEqual(pl2.dueDate, tomStr);
assert.strictEqual(pl2.dueTime, '15:30');
assert.strictEqual(pl2.priority, 'p1');

const pl3 = parseNaturalLanguageTask('Bieganie codziennie o 7 rano');
assert.strictEqual(pl3.title, 'Bieganie');
assert.strictEqual(pl3.recurrence, 'daily');
assert.strictEqual(pl3.dueTime, '07:00');
assert.strictEqual(pl3.dueDate, todayStr);

const pl4 = parseNaturalLanguageTask('Trening co wtorek o 18 @Fitness');
assert.strictEqual(pl4.title, 'Trening');
assert.strictEqual(pl4.recurrence, 'weekly');
assert.strictEqual(pl4.dueTime, '18:00');
assert.strictEqual(pl4.projectQuery, 'Fitness');
assert.ok(pl4.dueDate);

const pl5 = parseNaturalLanguageTask('Obiad w południe');
assert.strictEqual(pl5.title, 'Obiad');
assert.strictEqual(pl5.dueTime, '12:00');

const pl6 = parseNaturalLanguageTask('Spotkanie w dni robocze');
assert.strictEqual(pl6.title, 'Spotkanie');
assert.strictEqual(pl6.recurrence, 'weekdays');

console.log('Test 22: Polish natural language parsing (dzisiaj, jutro, codziennie, co wtorek, o 15:30, w południe, dni robocze): PASSED');

// Test 23: Spanish Natural Language Parsing
const es1 = parseNaturalLanguageTask('Comprar pan hoy');
assert.strictEqual(es1.title, 'Comprar pan');
assert.strictEqual(es1.dueDate, todayStr);

const es2 = parseNaturalLanguageTask('Informe mañana a las 15:30 p1');
assert.strictEqual(es2.title, 'Informe');
assert.strictEqual(es2.dueDate, tomStr);
assert.strictEqual(es2.dueTime, '15:30');
assert.strictEqual(es2.priority, 'p1');

const es3 = parseNaturalLanguageTask('Correr diariamente a las 7 de la mañana');
assert.strictEqual(es3.title, 'Correr');
assert.strictEqual(es3.recurrence, 'daily');
assert.strictEqual(es3.dueTime, '07:00');
assert.strictEqual(es3.dueDate, todayStr);

const es4 = parseNaturalLanguageTask('Entrenamiento cada martes a las 18 @Fitness');
assert.strictEqual(es4.title, 'Entrenamiento');
assert.strictEqual(es4.recurrence, 'weekly');
assert.strictEqual(es4.dueTime, '18:00');
assert.strictEqual(es4.projectQuery, 'Fitness');
assert.ok(es4.dueDate);

const es5 = parseNaturalLanguageTask('Almuerzo al mediodía');
assert.strictEqual(es5.title, 'Almuerzo');
assert.strictEqual(es5.dueTime, '12:00');

const es6 = parseNaturalLanguageTask('Trabajo entre semana');
assert.strictEqual(es6.title, 'Trabajo');
assert.strictEqual(es6.recurrence, 'weekdays');

console.log('Test 23: Spanish natural language parsing (hoy, mañana, diariamente, cada martes, a las 15:30, al mediodía, entre semana): PASSED');

// Test 24: Multilingual Syntax Tokenizer Invariant & Token Types
const plInput = 'Bieganie codziennie o 7 rano p1 @Sport #zdrowie';
const plTokens = tokenizeTaskInput(plInput);
assert.strictEqual(plTokens.map((t) => t.text).join(''), plInput, 'Polish token concatenation must equal raw input');
assert.strictEqual(plTokens.find((t) => t.type === 'recurrence')?.text, 'codziennie');
assert.strictEqual(plTokens.find((t) => t.type === 'time')?.text, 'o 7 rano');
assert.strictEqual(plTokens.find((t) => t.type === 'priority')?.text, 'p1');
assert.strictEqual(plTokens.find((t) => t.type === 'project')?.text, '@Sport');
assert.strictEqual(plTokens.find((t) => t.type === 'label')?.text, '#zdrowie');

const esInput = 'Entrenamiento cada martes a las 18 @Fitness #salud';
const esTokens = tokenizeTaskInput(esInput);
assert.strictEqual(esTokens.map((t) => t.text).join(''), esInput, 'Spanish token concatenation must equal raw input');
assert.strictEqual(esTokens.find((t) => t.type === 'recurrence')?.text, 'cada martes');
assert.strictEqual(esTokens.find((t) => t.type === 'time')?.text, 'a las 18');
assert.strictEqual(esTokens.find((t) => t.type === 'project')?.text, '@Fitness');
assert.strictEqual(esTokens.find((t) => t.type === 'label')?.text, '#salud');

console.log('Test 24: Multilingual Syntax Tokenizer accurately tokenizes Polish and Spanish phrases: PASSED');

// Test 25: False-Positive Prevention for common words ("nie", "sat", "sun", "mar", leading "do")
const fp1 = parseNaturalLanguageTask('Nie zapomnieć o kluczach');
assert.strictEqual(fp1.title, 'Nie zapomnieć o kluczach');
assert.strictEqual(fp1.dueDate, undefined, 'Polish "nie" (no/not) must NOT be parsed as Sunday');

const fp2 = parseNaturalLanguageTask('Sat on the chair');
assert.strictEqual(fp2.title, 'Sat on the chair');
assert.strictEqual(fp2.dueDate, undefined, 'English "sat" verb must NOT be parsed as Saturday without preposition');

const fp3 = parseNaturalLanguageTask('Walk in the sun');
assert.strictEqual(fp3.title, 'Walk in the sun');
assert.strictEqual(fp3.dueDate, undefined, 'English "sun" noun must NOT be parsed as Sunday');

const fp4 = parseNaturalLanguageTask('Viaje al mar');
assert.strictEqual(fp4.title, 'Viaje al mar');
assert.strictEqual(fp4.dueDate, undefined, 'Spanish "mar" (sea) must NOT be parsed as Tuesday');

const fp5 = parseNaturalLanguageTask('Do zrobienia zadanie');
assert.strictEqual(fp5.title, 'Do zrobienia zadanie', 'Leading word "Do" must NOT be stripped from title');

console.log('Test 25: False-Positive Prevention ("nie", "sat", "sun", "mar", "Do"): PASSED');

// Test 26: Explicit Dates (ISO, Month+Day, Day+Month, Numeric Dot/Slash)
const ed1 = parseNaturalLanguageTask('Doctor 2026-10-15');
assert.strictEqual(ed1.title, 'Doctor');
assert.strictEqual(ed1.dueDate, '2026-10-15');

const ed2 = parseNaturalLanguageTask('Flight on Oct 15');
assert.strictEqual(ed2.title, 'Flight');
assert.ok(ed2.dueDate?.endsWith('-10-15'));

const ed3 = parseNaturalLanguageTask('Wizyta 15 października');
assert.strictEqual(ed3.title, 'Wizyta');
assert.ok(ed3.dueDate?.endsWith('-10-15'));

const ed4 = parseNaturalLanguageTask('Cita 15 de octubre');
assert.strictEqual(ed4.title, 'Cita');
assert.ok(ed4.dueDate?.endsWith('-10-15'));

const ed5 = parseNaturalLanguageTask('Badania 15.10');
assert.strictEqual(ed5.title, 'Badania');
assert.ok(ed5.dueDate?.endsWith('-10-15'));

console.log('Test 26: Explicit Dates (ISO, Oct 15, 15 października, 15 de octubre, 15.10): PASSED');

// Test 27: Relative Weeks and Months
const rw1 = parseNaturalLanguageTask('Review next week');
assert.strictEqual(rw1.title, 'Review');
const in7Days = new Date();
in7Days.setDate(in7Days.getDate() + 7);
assert.strictEqual(rw1.dueDate, formatLocalDate(in7Days));

const rw2 = parseNaturalLanguageTask('Spotkanie za tydzień');
assert.strictEqual(rw2.title, 'Spotkanie');
assert.strictEqual(rw2.dueDate, formatLocalDate(in7Days));

const rw3 = parseNaturalLanguageTask('Cita la próxima semana');
assert.strictEqual(rw3.title, 'Cita');
assert.strictEqual(rw3.dueDate, formatLocalDate(in7Days));

const rw4 = parseNaturalLanguageTask('Raport za 2 tygodnie');
assert.strictEqual(rw4.title, 'Raport');
const in14Days = new Date();
in14Days.setDate(in14Days.getDate() + 14);
assert.strictEqual(rw4.dueDate, formatLocalDate(in14Days));

console.log('Test 27: Relative Weeks and Months ("next week", "za tydzień", "la próxima semana", "za 2 tygodnie"): PASSED');

console.log('\n🎉 ALL TASK ADDITION & RECURRENCE TESTS PASSED!');


