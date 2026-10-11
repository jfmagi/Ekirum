import { formatLocalDate } from '../src/lib/dateParser';
import { calculateHabitStreak } from '../src/store/useEkirumStore';

async function runTests() {
  console.log('🧪 Starting Local Timezone & Midnight Date verification tests...\n');

  // Test 1: formatLocalDate outputs YYYY-MM-DD using local calendar values
  console.log('Test 1: formatLocalDate outputs YYYY-MM-DD using local calendar values...');
  const dateObj = new Date(2026, 9, 10, 23, 45, 0); // October 10, 2026 local time
  const formatted = formatLocalDate(dateObj);
  if (formatted !== '2026-10-10') {
    throw new Error(`Expected '2026-10-10', got '${formatted}'`);
  }
  console.log(`  ✓ formatLocalDate correctly produced '${formatted}' without timezone drift.`);

  // Test 2: Local Midnight Boundary Check (23:59:59 vs 00:00:01)
  console.log('\nTest 2: Local Midnight boundary checks...');
  const justBeforeMidnight = new Date(2026, 11, 31, 23, 59, 59); // Dec 31, 2026 23:59:59
  const justAfterMidnight = new Date(2027, 0, 1, 0, 0, 1);       // Jan 1, 2027 00:00:01

  const dateEve = formatLocalDate(justBeforeMidnight);
  const dateDay = formatLocalDate(justAfterMidnight);

  if (dateEve !== '2026-12-31') {
    throw new Error(`Expected '2026-12-31', got '${dateEve}'`);
  }
  if (dateDay !== '2027-01-01') {
    throw new Error(`Expected '2027-01-01', got '${dateDay}'`);
  }
  console.log(`  ✓ 23:59:59 resolved to '${dateEve}' and 00:00:01 resolved to '${dateDay}'.`);

  // Test 3: Yesterday date calculation across month and leap-year boundaries
  console.log('\nTest 3: Yesterday calculation across month/leap year boundary...');
  // March 1, 2028 (2028 is a leap year; Feb has 29 days)
  const marchFirstLeap = new Date(2028, 2, 1, 10, 0, 0);
  const leapYesterday = new Date(marchFirstLeap);
  leapYesterday.setDate(leapYesterday.getDate() - 1);
  const leapYesterdayStr = formatLocalDate(leapYesterday);

  if (leapYesterdayStr !== '2028-02-29') {
    throw new Error(`Expected '2028-02-29' for leap year yesterday, got '${leapYesterdayStr}'`);
  }
  console.log(`  ✓ March 1 in leap year -> yesterday correctly calculated as '${leapYesterdayStr}'.`);

  // Non-leap year March 1
  const marchFirstNonLeap = new Date(2027, 2, 1, 10, 0, 0);
  const nonLeapYesterday = new Date(marchFirstNonLeap);
  nonLeapYesterday.setDate(nonLeapYesterday.getDate() - 1);
  const nonLeapYesterdayStr = formatLocalDate(nonLeapYesterday);

  if (nonLeapYesterdayStr !== '2027-02-28') {
    throw new Error(`Expected '2027-02-28' for non-leap year yesterday, got '${nonLeapYesterdayStr}'`);
  }
  console.log(`  ✓ March 1 in standard year -> yesterday correctly calculated as '${nonLeapYesterdayStr}'.`);

  // Test 4: Habit streak evaluation with local dates
  console.log('\nTest 4: Habit streak evaluation with local dates...');
  const today = new Date();
  const todayStr = formatLocalDate(today);

  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const yesterdayStr = formatLocalDate(yest);

  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const twoDaysAgoStr = formatLocalDate(twoDaysAgo);

  const streakResult = calculateHabitStreak([twoDaysAgoStr, yesterdayStr, todayStr]);
  if (streakResult.current !== 3 || streakResult.longest !== 3) {
    throw new Error(`Expected 3-day streak, got current=${streakResult.current}, longest=${streakResult.longest}`);
  }
  console.log(`  ✓ Continuous 3-day local habit streak successfully computed (current: ${streakResult.current}).`);

  console.log('\n🎉 ALL LOCAL TIMEZONE & MIDNIGHT DATE TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
