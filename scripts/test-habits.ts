import assert from 'node:assert';
import { calculateHabitStreak, formatLocalDate } from '../src/store/useEkirumStore';

console.log('🧪 Starting Habit Check-in & Streak Tracking verification tests...\n');

// 1. Empty check-ins
const emptyStreak = calculateHabitStreak([]);
assert.strictEqual(emptyStreak.current, 0);
assert.strictEqual(emptyStreak.longest, 0);
console.log('Test 1: Empty check-ins produce 0 streak: PASSED');

// 2. Format local date is YYYY-MM-DD
const testDate = new Date(2026, 9, 10); // Oct 10, 2026
assert.strictEqual(formatLocalDate(testDate), '2026-10-10');
console.log('Test 2: formatLocalDate formats YYYY-MM-DD locally without UTC shift: PASSED');

// 3. Single check-in today
const today = new Date();
const todayStr = formatLocalDate(today);
const singleStreak = calculateHabitStreak([todayStr]);
assert.strictEqual(singleStreak.current, 1);
assert.strictEqual(singleStreak.longest, 1);
console.log('Test 3: Check-in today produces streak 1: PASSED');

// 4. Consecutive check-ins (yesterday and today)
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = formatLocalDate(yesterday);
const twoDayStreak = calculateHabitStreak([yesterdayStr, todayStr]);
assert.strictEqual(twoDayStreak.current, 2);
assert.strictEqual(twoDayStreak.longest, 2);
console.log('Test 4: Consecutive check-ins (yesterday + today) produce streak 2: PASSED');

// 5. Streak active from yesterday even if not yet checked in today
const yesterdayOnlyStreak = calculateHabitStreak([yesterdayStr]);
assert.strictEqual(yesterdayOnlyStreak.current, 1, 'Streak must stay active if checked in yesterday (today not yet missed)');
assert.strictEqual(yesterdayOnlyStreak.longest, 1);
console.log('Test 5: Check-in yesterday preserves active streak for today: PASSED');

// 6. Streak broken (last check-in 2 days ago)
const twoDaysAgo = new Date();
twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
const twoDaysAgoStr = formatLocalDate(twoDaysAgo);
const brokenStreak = calculateHabitStreak([twoDaysAgoStr]);
assert.strictEqual(brokenStreak.current, 0, 'Streak should be 0 if missed yesterday and today');
assert.strictEqual(brokenStreak.longest, 1, 'Longest historical streak must be preserved');
console.log('Test 6: Broken streak resets current to 0 while preserving longest streak: PASSED');

// 7. Historical longest streak higher than current streak
const threeDaysAgo = new Date();
threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
const fourDaysAgo = new Date();
fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
const fiveDaysAgo = new Date();
fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

// 3-day streak in past (days -5, -4, -3), missed day -2, then checked in yesterday and today (current = 2)
const pastStreakDates = [
  formatLocalDate(fiveDaysAgo),
  formatLocalDate(fourDaysAgo),
  formatLocalDate(threeDaysAgo),
  yesterdayStr,
  todayStr,
];
const mixedStreak = calculateHabitStreak(pastStreakDates);
assert.strictEqual(mixedStreak.current, 2, 'Current streak should be 2 (yesterday + today)');
assert.strictEqual(mixedStreak.longest, 3, 'Longest streak should be 3 from historical run');
console.log('Test 7: Historical longest streak calculation verified: PASSED');

// 8. Deduplication check
const duplicateDates = [todayStr, todayStr, yesterdayStr, yesterdayStr];
const dedupStreak = calculateHabitStreak(duplicateDates);
assert.strictEqual(dedupStreak.current, 2);
assert.strictEqual(dedupStreak.longest, 2);
console.log('Test 8: Duplicate dates in check-ins are handled safely: PASSED');

console.log('\n🎉 ALL HABIT CHECK-IN TRACKING TESTS PASSED!');
