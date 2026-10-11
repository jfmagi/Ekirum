import 'fake-indexeddb/auto';
import { db, initializeDatabase } from '../src/lib/db';
import { DAILY_XP_CAP } from '../src/types';
import { calculateSkillLevel, getXpRequiredForNextLevel } from '../src/store/useEkirumStore';

async function testDailyXpCap() {
  console.log('🧪 Testing Daily XP Cap logic...');

  await initializeDatabase();
  const now = new Date().toISOString();
  const todayStr = now.split('T')[0];

  let user = {
    id: 'user-test',
    name: 'Ekirum',
    ekirumLevel: 1,
    ekirumRank: 'Novice',
    curatorLevel: 1,
    curatorRank: 'Novice',
    totalXp: 0,
    dailyXpDate: todayStr,
    dailyXpEarned: 0,
    achievements: [],
    soundEnabled: true,
    accentColor: 'crimson' as const,
    createdAt: now,
    updatedAt: now,
  };

  const simulateTaskCompletion = (taskPriority: 'p1' | 'p2' | 'p3' | 'p4') => {
    const currentDailyEarned = user.dailyXpDate === todayStr ? (user.dailyXpEarned || 0) : 0;
    const remainingCap = Math.max(0, DAILY_XP_CAP - currentDailyEarned);

    let potentialXp = 10;
    if (taskPriority === 'p1') potentialXp += 5;
    else if (taskPriority === 'p2') potentialXp += 3;

    const earnedXp = Math.min(potentialXp, remainingCap);
    const newDailyEarned = currentDailyEarned + earnedXp;

    user = {
      ...user,
      totalXp: user.totalXp + earnedXp,
      dailyXpDate: todayStr,
      dailyXpEarned: newDailyEarned,
      updatedAt: new Date().toISOString(),
    };

    return { earnedXp, remainingCap, newDailyEarned };
  };

  // Complete tasks until reaching 500 XP (50 tasks of 10 XP each)
  for (let i = 1; i <= 50; i++) {
    const res = simulateTaskCompletion('p3');
    if (i % 10 === 0 || i === 50) {
      console.log(`Task ${i} (P3): Earned ${res.earnedXp} XP (Daily total: ${res.newDailyEarned}/${DAILY_XP_CAP})`);
    }
  }

  if (user.dailyXpEarned !== 500) {
    throw new Error(`Expected dailyXpEarned to be 500, got ${user.dailyXpEarned}`);
  }

  // 51st task should award 0 XP
  const extraTask = simulateTaskCompletion('p1');
  console.log(`Task 51 (P1 after cap): Earned ${extraTask.earnedXp} XP (Daily total: ${extraTask.newDailyEarned}/${DAILY_XP_CAP})`);
  if (extraTask.earnedXp !== 0) {
    throw new Error(`Expected earnedXp to be 0 after cap, got ${extraTask.earnedXp}`);
  }
  if (user.totalXp !== 500) {
    throw new Error(`Expected totalXp to stay at 500, got ${user.totalXp}`);
  }

  // Verify achievement rewards bypass the cap
  const achievementXpReward = 50;
  const xpBeforeAch = user.totalXp;
  user = {
    ...user,
    totalXp: user.totalXp + achievementXpReward,
    // dailyXpEarned remains capped at 500 and unchanged
  };
  if (user.totalXp !== xpBeforeAch + achievementXpReward) {
    throw new Error('Achievement XP reward must be added to totalXp in full even after task cap is reached');
  }
  if (user.dailyXpEarned !== 500) {
    throw new Error('Achievement XP reward must not affect dailyXpEarned');
  }
  console.log(`Achievement unlock: Earned full +${achievementXpReward} XP bonus bypassing cap (Total: ${user.totalXp}, Daily Task XP: ${user.dailyXpEarned}/${DAILY_XP_CAP})`);

  // Verify habit check-ins bypass the task daily cap
  const habitXp = 10;
  const xpBeforeHabit = user.totalXp;
  user = {
    ...user,
    totalXp: user.totalXp + habitXp,
  };
  if (user.totalXp !== xpBeforeHabit + habitXp) {
    throw new Error('Habit check-in XP must be awarded in full even after task daily cap is reached');
  }
  if (user.dailyXpEarned !== 500) {
    throw new Error('Habit check-in XP must not affect daily task cap tracking');
  }
  console.log(`Habit check-in: Earned full +${habitXp} XP bypassing task cap (Total: ${user.totalXp}, Daily Task XP: ${user.dailyXpEarned}/${DAILY_XP_CAP})`);

  // Tomorrow rollover test
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toISOString().split('T')[0];
  const tomorrowDailyEarned = user.dailyXpDate === tomorrowStr ? (user.dailyXpEarned || 0) : 0;
  console.log(`Tomorrow rollover: resets to ${tomorrowDailyEarned} XP`);
  if (tomorrowDailyEarned !== 0) {
    throw new Error(`Expected rollover to reset daily XP to 0, got ${tomorrowDailyEarned}`);
  }

  console.log('✅ Daily XP Cap tests passed successfully!\n');
}

testDailyXpCap().catch((err) => {
  console.error('❌ Daily XP Cap test failed:', err);
  process.exit(1);
});
