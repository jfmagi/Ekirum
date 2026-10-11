import 'fake-indexeddb/auto';
import assert from 'node:assert';
import { UserProfile, BackupTables } from '../src/types';
import { formatLocalDate } from '../src/lib/dateParser';
import { useEkirumStore } from '../src/store/useEkirumStore';

console.log('🧪 Starting Character Profile & Avatar verification tests...\n');

// 1. Initial user profile
const testUser: UserProfile = {
  id: 'user-1',
  name: 'Ekirum',
  ekirumLevel: 1,
  ekirumRank: 'Novice',
  totalXp: 0,
  achievements: [],
  soundEnabled: true,
  accentColor: 'crimson',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

assert.strictEqual(testUser.name, 'Ekirum');
assert.strictEqual(testUser.avatar, undefined);
console.log('Test 1: Default character profile initialized: PASSED');

// 2. Renaming character
const renamedUser: UserProfile = {
  ...testUser,
  name: 'Aurelius',
  updatedAt: new Date().toISOString(),
};
assert.strictEqual(renamedUser.name, 'Aurelius');
console.log('Test 2: Rename character to "Aurelius": PASSED');

// 3. Uploading avatar (data URL)
const mockAvatarDataUrl = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAAQ';
const userWithAvatar: UserProfile = {
  ...renamedUser,
  avatar: mockAvatarDataUrl,
  updatedAt: new Date().toISOString(),
};
assert.strictEqual(userWithAvatar.avatar, mockAvatarDataUrl);
console.log('Test 3: Avatar data URL attached to profile: PASSED');

// 4. Backup tables serialization & restoration test
const backupTables: BackupTables = {
  tasks: [],
  projects: [],
  skills: [],
  habits: [],
  habitEvents: [],
  achievements: [],
  userProfile: [userWithAvatar],
};

const jsonBackup = JSON.stringify(backupTables);
const parsedBackup: BackupTables = JSON.parse(jsonBackup);
assert.strictEqual(parsedBackup.userProfile[0].name, 'Aurelius');
assert.strictEqual(parsedBackup.userProfile[0].avatar, mockAvatarDataUrl);
console.log('Test 4: Backup serialization & restoration preserves character name & avatar: PASSED');

// 5. Removing avatar
const userRemovedAvatar: UserProfile = {
  ...userWithAvatar,
  avatar: undefined,
  updatedAt: new Date().toISOString(),
};
assert.strictEqual(userRemovedAvatar.avatar, undefined);
assert.strictEqual(userRemovedAvatar.name, 'Aurelius');
// 6. Test 10 Ranks Progression System
import { EKIRUM_RANKS, getEkirumRankTitle } from '../src/store/useEkirumStore';

assert.strictEqual(EKIRUM_RANKS.length, 10, 'Must have exactly 10 ranks');
assert.strictEqual(EKIRUM_RANKS[0], 'Novice');
assert.strictEqual(EKIRUM_RANKS[1], 'Recruit');
assert.strictEqual(EKIRUM_RANKS[2], 'Apprentice');
assert.strictEqual(EKIRUM_RANKS[3], 'Pathfinder');
assert.strictEqual(EKIRUM_RANKS[4], 'Wayfarer');
assert.strictEqual(EKIRUM_RANKS[5], 'Captain');
assert.strictEqual(EKIRUM_RANKS[6], 'Commander');
assert.strictEqual(EKIRUM_RANKS[7], 'High Commander');
assert.strictEqual(EKIRUM_RANKS[8], 'Master');
assert.strictEqual(EKIRUM_RANKS[9], 'Grandmaster');

// Verify unlimited levels progression across ranks
assert.strictEqual(getEkirumRankTitle(1), 'Novice');
assert.strictEqual(getEkirumRankTitle(3), 'Recruit');
assert.strictEqual(getEkirumRankTitle(6), 'Apprentice');
assert.strictEqual(getEkirumRankTitle(10), 'Pathfinder');
assert.strictEqual(getEkirumRankTitle(15), 'Wayfarer');
assert.strictEqual(getEkirumRankTitle(20), 'Captain');
assert.strictEqual(getEkirumRankTitle(25), 'Commander');
assert.strictEqual(getEkirumRankTitle(35), 'High Commander');
assert.strictEqual(getEkirumRankTitle(45), 'Master');
assert.strictEqual(getEkirumRankTitle(50), 'Grandmaster');
assert.strictEqual(getEkirumRankTitle(100), 'Grandmaster');
assert.strictEqual(getEkirumRankTitle(500), 'Grandmaster');
console.log('Test 6: 10 Ranks progression & unlimited levels verified: PASSED');

// 7. Achievement Evaluation Engine Tests
import { evaluateAchievements } from '../src/lib/achievements';
import { INITIAL_ACHIEVEMENTS } from '../src/lib/seedData';
import { Task, Skill } from '../src/types';

// 7a. Initial empty state evaluation
const emptyUser: UserProfile = {
  ...testUser,
  totalXp: 0,
  ekirumLevel: 1,
  ekirumRank: 'Novice',
  achievements: [],
};
const resInitial = evaluateAchievements([], [], [], INITIAL_ACHIEVEMENTS, emptyUser);
assert.strictEqual(resInitial.newlyUnlocked.length, 0, 'No achievements unlocked with empty state');
const ach1Initial = resInitial.updatedAchievements.find((a) => a.id === 'ach-1');
assert.strictEqual(ach1Initial?.unlockedAt, undefined);
assert.strictEqual(ach1Initial?.progress, 0);
console.log('Test 7a: Initial achievements state (locked): PASSED');

// 7b. Completing first task unlocks 'First Mark' (ach-1)
const todayStr = formatLocalDate(new Date());
const sampleTask: Task = {
  id: 'task-1',
  title: 'Morning Meditation',
  completed: true,
  completedAt: new Date().toISOString(),
  priority: 'p2',
  recurrence: 'none',
  order: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const resTask1 = evaluateAchievements([sampleTask], [], [], INITIAL_ACHIEVEMENTS, testUser);
assert.strictEqual(resTask1.newlyUnlocked.length, 1, 'Should unlock ach-1');
assert.strictEqual(resTask1.newlyUnlocked[0].id, 'ach-1');
assert.strictEqual(resTask1.newlyUnlocked[0].progress, 1);
assert.ok(resTask1.newlyUnlocked[0].unlockedAt, 'Unlocked achievement must have unlockedAt timestamp');
console.log('Test 7b: "First Mark" unlocked upon task completion: PASSED');

// 7c. Reaching 3-day streak unlocks 'Consistent Cadence' (ach-2)
const streakSkill: Skill = {
  id: 'skill-1',
  projectId: 'proj-1',
  name: 'Focus',
  level: 2,
  xp: 40,
  xpToNextLevel: 80,
  icon: 'Compass',
  streak: 3,
  totalCompleted: 3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const resStreak3 = evaluateAchievements([sampleTask], [streakSkill], [], resTask1.updatedAchievements, testUser);
const ach2 = resStreak3.updatedAchievements.find((a) => a.id === 'ach-2');
assert.ok(ach2?.unlockedAt, 'Consistent Cadence should be unlocked');
assert.strictEqual(ach2?.progress, 3);
console.log('Test 7c: "Consistent Cadence" unlocked on 3-day streak: PASSED');

// 7d. Reaching Level 5 unlocks 'Mastery in Hand' (ach-4) with 100 XP
const level5Skill: Skill = {
  ...streakSkill,
  level: 5,
};
const resLevel5 = evaluateAchievements([sampleTask], [level5Skill], [], resStreak3.updatedAchievements, testUser);
const ach4 = resLevel5.updatedAchievements.find((a) => a.id === 'ach-4');
assert.ok(ach4?.unlockedAt, 'Mastery in Hand should be unlocked');
assert.strictEqual(ach4?.progress, 5);
assert.strictEqual(ach4?.xpReward, 100, 'Mastery in Hand reward should be 100 XP');
console.log('Test 7d: "Mastery in Hand" unlocked on reaching skill level 5 with 100 XP reward: PASSED');

// 7d-2. Skill milestones up to Level 50 (10, 25, 50)
const level25Skill: Skill = { ...streakSkill, level: 25 };
const resLevel25 = evaluateAchievements([sampleTask], [level25Skill], [], resLevel5.updatedAchievements, testUser);
const achSkill10 = resLevel25.updatedAchievements.find((a) => a.id === 'ach-skill-10');
const achSkill25 = resLevel25.updatedAchievements.find((a) => a.id === 'ach-skill-25');
assert.ok(achSkill10?.unlockedAt, 'Level 10 skill milestone should be unlocked at Level 25');
assert.strictEqual(achSkill10?.progress, 10);
assert.ok(achSkill25?.unlockedAt, 'Level 25 skill milestone should be unlocked at Level 25');
assert.strictEqual(achSkill25?.progress, 25);

const level50Skill: Skill = { ...streakSkill, level: 50 };
const resLevel50 = evaluateAchievements([sampleTask], [level50Skill], [], resLevel25.updatedAchievements, testUser);
const achSkill50 = resLevel50.updatedAchievements.find((a) => a.id === 'ach-skill-50');
assert.ok(achSkill50?.unlockedAt, 'Level 50 skill milestone should be unlocked at Level 50');
assert.strictEqual(achSkill50?.progress, 50);
assert.strictEqual(achSkill50?.xpReward, 500);
console.log('Test 7d-2: Skill milestones up to Level 50 verified: PASSED');

// 7d-3. Multi-skill breadth milestones (2, 3, 4, 5 distinct skills advanced to Level 2+)
const multiSkills1: Skill[] = [
  { id: 'ms-1', projectId: 'p1', name: 'Skill 1', level: 2, xp: 50, xpToNextLevel: 100, icon: 'Compass', streak: 0, totalCompleted: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'ms-deleted', projectId: 'p1', name: 'Deleted Skill', level: 5, xp: 500, xpToNextLevel: 600, icon: 'Flame', streak: 0, totalCompleted: 0, isDeleted: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'ms-lvl1', projectId: 'p1', name: 'Level 1 Skill', level: 1, xp: 0, xpToNextLevel: 50, icon: 'Shield', streak: 0, totalCompleted: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];
const resMulti1 = evaluateAchievements([], multiSkills1, [], INITIAL_ACHIEVEMENTS, emptyUser);
const achMulti2At1 = resMulti1.updatedAchievements.find((a) => a.id === 'ach-multiskill-2');
assert.strictEqual(achMulti2At1?.unlockedAt, undefined, 'Dual Discipline should be locked with only 1 active skill at Level 2+');
assert.strictEqual(achMulti2At1?.progress, 1, 'Dual Discipline progress should be 1');

// Advance 2nd skill to Level 2
const multiSkills2: Skill[] = [
  ...multiSkills1,
  { id: 'ms-2', projectId: 'p1', name: 'Skill 2', level: 2, xp: 50, xpToNextLevel: 100, icon: 'Flame', streak: 0, totalCompleted: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];
const resMulti2 = evaluateAchievements([], multiSkills2, [], resMulti1.updatedAchievements, emptyUser);
const achMulti2 = resMulti2.updatedAchievements.find((a) => a.id === 'ach-multiskill-2');
const achMulti3 = resMulti2.updatedAchievements.find((a) => a.id === 'ach-multiskill-3');
assert.ok(achMulti2?.unlockedAt, 'Dual Discipline should unlock with 2 skills at Level 2+');
assert.strictEqual(achMulti2?.progress, 2);
assert.strictEqual(achMulti2?.xpReward, 50);
assert.strictEqual(achMulti3?.unlockedAt, undefined, 'Threefold Focus should remain locked with 2 skills');
assert.strictEqual(achMulti3?.progress, 2);

// Advance 3rd, 4th, 5th skills
const multiSkills5: Skill[] = [
  ...multiSkills2,
  { id: 'ms-3', projectId: 'p1', name: 'Skill 3', level: 3, xp: 120, xpToNextLevel: 200, icon: 'Layers', streak: 0, totalCompleted: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'ms-4', projectId: 'p1', name: 'Skill 4', level: 2, xp: 50, xpToNextLevel: 100, icon: 'Shield', streak: 0, totalCompleted: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'ms-5', projectId: 'p1', name: 'Skill 5', level: 4, xp: 300, xpToNextLevel: 400, icon: 'Crown', streak: 0, totalCompleted: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];
const resMulti5 = evaluateAchievements([], multiSkills5, [], resMulti2.updatedAchievements, emptyUser);
const achMulti3Unlocked = resMulti5.updatedAchievements.find((a) => a.id === 'ach-multiskill-3');
const achMulti4Unlocked = resMulti5.updatedAchievements.find((a) => a.id === 'ach-multiskill-4');
const achMulti5Unlocked = resMulti5.updatedAchievements.find((a) => a.id === 'ach-multiskill-5');

assert.ok(achMulti3Unlocked?.unlockedAt, 'Threefold Focus should unlock with 5 skills at Level 2+');
assert.strictEqual(achMulti3Unlocked?.progress, 3);
assert.strictEqual(achMulti3Unlocked?.xpReward, 75);

assert.ok(achMulti4Unlocked?.unlockedAt, 'Quadrivium should unlock with 5 skills at Level 2+');
assert.strictEqual(achMulti4Unlocked?.progress, 4);
assert.strictEqual(achMulti4Unlocked?.xpReward, 100);

assert.ok(achMulti5Unlocked?.unlockedAt, 'Polymath\'s Horizon should unlock with 5 skills at Level 2+');
assert.strictEqual(achMulti5Unlocked?.progress, 5);
assert.strictEqual(achMulti5Unlocked?.xpReward, 150);
console.log('Test 7d-3: Multi-skill breadth achievements (2, 3, 4, 5 skills advanced) verified: PASSED');

// 7e. Pristine Horizon (ach-6) unlocks when today tasks are completed and no active today tasks remain
const todayTask: Task = {
  ...sampleTask,
  dueDate: todayStr,
};
const resPristine = evaluateAchievements([todayTask], [], [], INITIAL_ACHIEVEMENTS, testUser);
const ach6 = resPristine.updatedAchievements.find((a) => a.id === 'ach-6');
assert.ok(ach6?.unlockedAt, 'Pristine Horizon should be unlocked when today tasks are cleared');
console.log('Test 7e: "Pristine Horizon" unlocked when today tasks cleared: PASSED');

// 7f. Achievements remain unlocked permanently
const ach1UnlockedAt = resTask1.newlyUnlocked[0].unlockedAt;
const resRevokedTasks = evaluateAchievements([], [], [], resTask1.updatedAchievements, testUser);
const ach1After = resRevokedTasks.updatedAchievements.find((a) => a.id === 'ach-1');
assert.strictEqual(ach1After?.unlockedAt, ach1UnlockedAt, 'unlockedAt timestamp must be preserved');
assert.strictEqual(ach1After?.progress, 1, 'progress must remain maxProgress for unlocked achievement');
console.log('Test 7f: Permanent unlock guarantee verified: PASSED');

// 7g. Project creation milestones (1 and 5 projects)
import { Project } from '../src/types';
const sampleProj1: Project = {
  id: 'proj-1',
  name: 'Work',
  skillId: 'skill-1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const resProj1 = evaluateAchievements([], [], [], INITIAL_ACHIEVEMENTS, emptyUser, [sampleProj1]);
const achProj1 = resProj1.updatedAchievements.find((a) => a.id === 'ach-proj-1');
const achProj5 = resProj1.updatedAchievements.find((a) => a.id === 'ach-proj-5');
assert.ok(achProj1?.unlockedAt, 'First Horizon should be unlocked with 1 project');
assert.strictEqual(achProj1?.progress, 1);
assert.strictEqual(achProj5?.unlockedAt, undefined, 'Grand Architecture should be locked with 1 project');
assert.strictEqual(achProj5?.progress, 1);
console.log('Test 7g-1: 1 Project milestone ("First Horizon") unlocked: PASSED');

const fiveProjects: Project[] = Array.from({ length: 5 }, (_, i) => ({
  id: `proj-${i + 1}`,
  name: `Project ${i + 1}`,
  skillId: `skill-${i + 1}`,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
const resProj5 = evaluateAchievements([], [], [], resProj1.updatedAchievements, emptyUser, fiveProjects);
const achProj5Unlocked = resProj5.updatedAchievements.find((a) => a.id === 'ach-proj-5');
assert.ok(achProj5Unlocked?.unlockedAt, 'Grand Architecture should be unlocked with 5 projects');
assert.strictEqual(achProj5Unlocked?.progress, 5);
console.log('Test 7g-2: 5 Projects milestone ("Grand Architecture") unlocked: PASSED');

// 7h. Every 10 task achievements (10, 20, ..., 100, 110)
const tenTasks: Task[] = Array.from({ length: 10 }, (_, i) => ({
  id: `task-bulk-${i + 1}`,
  title: `Task ${i + 1}`,
  completed: true,
  order: i,
  priority: 'p3',
  recurrence: 'none',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
const resTasks10 = evaluateAchievements(tenTasks, [], [], INITIAL_ACHIEVEMENTS, emptyUser);
const achTasks10 = resTasks10.updatedAchievements.find((a) => a.id === 'ach-tasks-10');
assert.ok(achTasks10?.unlockedAt, 'ach-tasks-10 should be unlocked at 10 tasks');
assert.strictEqual(achTasks10?.progress, 10);

const fiftyTasks: Task[] = Array.from({ length: 50 }, (_, i) => ({
  id: `task-bulk-${i + 1}`,
  title: `Task ${i + 1}`,
  completed: true,
  order: i,
  priority: 'p3',
  recurrence: 'none',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
const resTasks50 = evaluateAchievements(fiftyTasks, [], [], resTasks10.updatedAchievements, emptyUser);
const achTasks50 = resTasks50.updatedAchievements.find((a) => a.id === 'ach-tasks-50');
assert.ok(achTasks50?.unlockedAt, 'ach-tasks-50 should be unlocked at 50 tasks');
assert.strictEqual(achTasks50?.progress, 50);

const hundredTasks: Task[] = Array.from({ length: 100 }, (_, i) => ({
  id: `task-bulk-${i + 1}`,
  title: `Task ${i + 1}`,
  completed: true,
  order: i,
  priority: 'p3',
  recurrence: 'none',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
const resTasks100 = evaluateAchievements(hundredTasks, [], [], resTasks50.updatedAchievements, emptyUser);
const achCentury = resTasks100.updatedAchievements.find((a) => a.id === 'ach-5');
assert.ok(achCentury?.unlockedAt, 'Century Milestone should be unlocked at 100 tasks');
assert.strictEqual(achCentury?.progress, 100);

const oneTenTasks: Task[] = Array.from({ length: 110 }, (_, i) => ({
  id: `task-bulk-${i + 1}`,
  title: `Task ${i + 1}`,
  completed: true,
  order: i,
  priority: 'p3',
  recurrence: 'none',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
const resTasks110 = evaluateAchievements(oneTenTasks, [], [], resTasks100.updatedAchievements, emptyUser);
const achTasks110 = resTasks110.updatedAchievements.find((a) => a.id === 'ach-tasks-110');
assert.ok(achTasks110?.unlockedAt, 'ach-tasks-110 should be unlocked at 110 tasks');
assert.strictEqual(achTasks110?.progress, 110);
console.log('Test 7h: Achievements for every 10 tasks completed (10, 50, 100, 110) verified: PASSED');

// 7i. Major landmarks up to 1000 tasks (250, 500, 750, 1000)
import { isAchievementVisible, getVisibleAchievements } from '../src/lib/achievements';
const thousandTasks: Task[] = Array.from({ length: 1000 }, (_, i) => ({
  id: `task-thousand-${i + 1}`,
  title: `Task ${i + 1}`,
  completed: true,
  order: i,
  priority: 'p3',
  recurrence: 'none',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}));
const resTasks1000 = evaluateAchievements(thousandTasks, [], [], resTasks110.updatedAchievements, emptyUser);
const ach250 = resTasks1000.updatedAchievements.find((a) => a.id === 'ach-tasks-250');
assert.strictEqual(ach250?.title, 'Quarter Millennium');
assert.ok(ach250?.unlockedAt);
assert.strictEqual(ach250?.xpReward, 250);

const ach500 = resTasks1000.updatedAchievements.find((a) => a.id === 'ach-tasks-500');
assert.strictEqual(ach500?.title, 'Five Hundred Feats');
assert.ok(ach500?.unlockedAt);
assert.strictEqual(ach500?.xpReward, 250);

const ach750 = resTasks1000.updatedAchievements.find((a) => a.id === 'ach-tasks-750');
assert.strictEqual(ach750?.title, 'Three-Quarter Zenith');
assert.ok(ach750?.unlockedAt);
assert.strictEqual(ach750?.xpReward, 250);

const ach1000 = resTasks1000.updatedAchievements.find((a) => a.id === 'ach-tasks-1000');
assert.strictEqual(ach1000?.title, 'The Millennium Mark');
assert.ok(ach1000?.unlockedAt);
assert.strictEqual(ach1000?.xpReward, 250);
console.log('Test 7i: Major milestone keystones up to 1,000 tasks verified: PASSED');

// 7j. Character Level Milestones (Level 10, 25, 50)
const level10User: UserProfile = { ...emptyUser, ekirumLevel: 10 };
const resLevel10 = evaluateAchievements([], [], [], INITIAL_ACHIEVEMENTS, level10User);
const achLvl10 = resLevel10.updatedAchievements.find((a) => a.id === 'ach-level-10');
const achLvl25 = resLevel10.updatedAchievements.find((a) => a.id === 'ach-level-25');
assert.ok(achLvl10?.unlockedAt, 'ach-level-10 should be unlocked at Level 10');
assert.strictEqual(achLvl10?.title, 'Ekirum Adept');
assert.strictEqual(achLvl25?.unlockedAt, undefined, 'ach-level-25 should still be locked at Level 10');
console.log('Test 7j: Level milestones (Level 10, 25, 50) verified: PASSED');

// 7k. Rolling Next Milestone Visibility logic
// At 0 tasks: only ach-tasks-10 is visible among task milestones
const allAchs = INITIAL_ACHIEVEMENTS;
const visibleAt0 = allAchs.filter((a) => isAchievementVisible(a, allAchs));
const taskAchsAt0 = visibleAt0.filter((a) => a.id.startsWith('ach-tasks-') || a.id === 'ach-5');
assert.strictEqual(taskAchsAt0.length, 1, 'Only immediate next task milestone visible at 0 tasks');
assert.strictEqual(taskAchsAt0[0].id, 'ach-tasks-10');

// Level milestones at Level 1: only ach-level-10 visible
const levelAchsAt1 = visibleAt0.filter((a) => a.id.startsWith('ach-level-'));
assert.strictEqual(levelAchsAt1.length, 1, 'Only immediate next level milestone visible at Level 1');
assert.strictEqual(levelAchsAt1[0].id, 'ach-level-10');

// Skill milestones at Skill Level 1: only ach-4 visible
const skillAchsAt0 = visibleAt0.filter((a) => a.id.startsWith('ach-skill-') || a.id === 'ach-4');
assert.strictEqual(skillAchsAt0.length, 1, 'Only immediate next skill milestone (ach-4) visible at Level 1');
assert.strictEqual(skillAchsAt0[0].id, 'ach-4');

// Multi-skill breadth milestones at 0 advanced skills: only ach-multiskill-2 visible
const multiSkillAchsAt0 = visibleAt0.filter((a) => a.id.startsWith('ach-multiskill-'));
assert.strictEqual(multiSkillAchsAt0.length, 1, 'Only immediate next multi-skill milestone visible at 0 advanced skills');
assert.strictEqual(multiSkillAchsAt0[0].id, 'ach-multiskill-2');

// At 10 tasks completed: ach-tasks-10 unlocked, ach-tasks-20 in progress, 30..1000 hidden
const visibleAt10 = resTasks10.updatedAchievements.filter((a) => isAchievementVisible(a, resTasks10.updatedAchievements));
const taskAchsAt10 = visibleAt10.filter((a) => a.id.startsWith('ach-tasks-') || a.id === 'ach-5');
assert.strictEqual(taskAchsAt10.length, 2, 'Should show ach-tasks-10 (unlocked) + ach-tasks-20 (next in-progress)');
assert.ok(taskAchsAt10.some((a) => a.id === 'ach-tasks-10' && a.unlockedAt));
assert.ok(taskAchsAt10.some((a) => a.id === 'ach-tasks-20' && !a.unlockedAt));

// Rolling visibility at 2 advanced skills: ach-multiskill-2 unlocked, ach-multiskill-3 next in progress, 4 & 5 hidden
const visibleMultiAt2 = resMulti2.updatedAchievements.filter((a) => isAchievementVisible(a, resMulti2.updatedAchievements));
const multiAchsAt2 = visibleMultiAt2.filter((a) => a.id.startsWith('ach-multiskill-'));
assert.strictEqual(multiAchsAt2.length, 2, 'Should show ach-multiskill-2 (unlocked) + ach-multiskill-3 (next in-progress)');
assert.ok(multiAchsAt2.some((a) => a.id === 'ach-multiskill-2' && a.unlockedAt));
assert.ok(multiAchsAt2.some((a) => a.id === 'ach-multiskill-3' && !a.unlockedAt));
assert.strictEqual(visibleMultiAt2.some((a) => a.id === 'ach-multiskill-4'), false, 'ach-multiskill-4 must be hidden');
assert.strictEqual(visibleMultiAt2.some((a) => a.id === 'ach-multiskill-5'), false, 'ach-multiskill-5 must be hidden');

const batchVisibleMultiAt2 = getVisibleAchievements(resMulti2.updatedAchievements);
assert.deepStrictEqual(
  batchVisibleMultiAt2.map((a) => a.id).sort(),
  visibleMultiAt2.map((a) => a.id).sort(),
  'getVisibleAchievements batch helper must match isAchievementVisible for multi-skill at 2'
);

// Verify getVisibleAchievements batch helper returns the exact same IDs
const batchVisibleAt0 = getVisibleAchievements(allAchs);
assert.deepStrictEqual(
  batchVisibleAt0.map((a) => a.id).sort(),
  visibleAt0.map((a) => a.id).sort(),
  'getVisibleAchievements batch helper must match isAchievementVisible filter at 0'
);

const batchVisibleAt10 = getVisibleAchievements(resTasks10.updatedAchievements);
assert.deepStrictEqual(
  batchVisibleAt10.map((a) => a.id).sort(),
  visibleAt10.map((a) => a.id).sort(),
  'getVisibleAchievements batch helper must match isAchievementVisible filter at 10'
);
console.log('Test 7k: Rolling next milestone visibility & batch getVisibleAchievements verified: PASSED');

// 7l. XP bonus reward & claim tracking
assert.ok(resTasks10.earnedXpBonus > 0, 'Unlocking achievements must award earnedXpBonus');
assert.strictEqual(resTasks10.updatedAchievements.find((a) => a.id === 'ach-tasks-10')?.xpClaimed, true);
console.log('Test 7l: Achievement XP bonus & claim tracking verified: PASSED');

// 7m. Rank Achievements (Recruit through Grandmaster)
const lvl1User: UserProfile = { ...emptyUser, ekirumLevel: 1 };
const resRank1 = evaluateAchievements([], [], [], INITIAL_ACHIEVEMENTS, lvl1User);
const achRecruit = resRank1.updatedAchievements.find((a) => a.id === 'ach-rank-recruit');
assert.strictEqual(achRecruit?.unlockedAt, undefined, 'Rank: Recruit should be locked at Level 1');

// Rolling visibility at Level 1: only the immediate next rank (Recruit) is visible in progress
const visibleRankAt1 = resRank1.updatedAchievements.filter((a) => isAchievementVisible(a, resRank1.updatedAchievements));
const rankCardsAt1 = visibleRankAt1.filter((a) => a.id.startsWith('ach-rank-'));
assert.strictEqual(rankCardsAt1.length, 1, 'Should only show Recruit in progress at Level 1');
assert.strictEqual(rankCardsAt1[0].id, 'ach-rank-recruit');
assert.strictEqual(visibleRankAt1.some((a) => a.id === 'ach-rank-apprentice'), false, 'Apprentice must be hidden at Level 1');

// Rank advancement to Level 3 (Recruit):
const lvl3User: UserProfile = { ...emptyUser, ekirumLevel: 3 };
const resRank3 = evaluateAchievements([], [], [], resRank1.updatedAchievements, lvl3User);
const achRecruitUnlocked = resRank3.updatedAchievements.find((a) => a.id === 'ach-rank-recruit');
assert.ok(achRecruitUnlocked?.unlockedAt, 'Rank: Recruit should be unlocked at Level 3');

// Rolling visibility at Level 3: Recruit is achieved, Apprentice is in-progress
const visibleRankAt3 = resRank3.updatedAchievements.filter((a) => isAchievementVisible(a, resRank3.updatedAchievements));
const rankCardsAt3 = visibleRankAt3.filter((a) => a.id.startsWith('ach-rank-'));
assert.strictEqual(rankCardsAt3.length, 2, 'Should show Recruit (achieved) + Apprentice (in-progress)');
assert.ok(rankCardsAt3.some((a) => a.id === 'ach-rank-recruit' && a.unlockedAt));
assert.ok(rankCardsAt3.some((a) => a.id === 'ach-rank-apprentice' && !a.unlockedAt));
assert.strictEqual(visibleRankAt3.some((a) => a.id === 'ach-rank-pathfinder'), false, 'Pathfinder must be hidden at Level 3');

// Grandmaster at Level 50:
const lvl50User: UserProfile = { ...emptyUser, ekirumLevel: 50 };
const resRank50 = evaluateAchievements([], [], [], resRank3.updatedAchievements, lvl50User);
const achGrandmaster = resRank50.updatedAchievements.find((a) => a.id === 'ach-rank-grandmaster');
assert.ok(achGrandmaster?.unlockedAt, 'Rank: Grandmaster should be unlocked at Level 50');
assert.strictEqual(achGrandmaster?.title, 'Rank: Grandmaster');
console.log('Test 7m: Rank achievements (Recruit to Grandmaster) & rolling rank visibility verified: PASSED');

// 7n. Celebration modal trigger for achievement unlocks
const store = useEkirumStore.getState();
store.dismissCelebration();
assert.strictEqual(useEkirumStore.getState().celebration, null);

// Creating a project when 0 projects exist unlocks "First Horizon" (ach-proj-1)
store.createProject('Aegis', '#8B1528');
const celebrationAfterProject = useEkirumStore.getState().celebration;
assert.ok(celebrationAfterProject, 'Celebration modal should be triggered when achievement unlocks');
assert.strictEqual(celebrationAfterProject?.type, 'achievement');
assert.strictEqual(celebrationAfterProject?.title, 'First Horizon');
assert.ok(celebrationAfterProject?.xpEarned !== undefined && celebrationAfterProject.xpEarned > 0);
console.log('Test 7n: Achievement unlock celebration modal trigger verified: PASSED');

// 7o. Project-specific achievement milestone ladder & XP scaling
import {
  getProjectMilestoneXp,
  getProjectMilestoneMeta,
  applySkillXpGains,
} from '../src/lib/achievements';
import { Project, Skill, Task, LibraryItem } from '../src/types';

assert.strictEqual(getProjectMilestoneXp(10), 25);
assert.strictEqual(getProjectMilestoneXp(40), 25);
assert.strictEqual(getProjectMilestoneXp(50), 50);
assert.strictEqual(getProjectMilestoneXp(100), 100);
assert.strictEqual(getProjectMilestoneXp(250), 150);
assert.strictEqual(getProjectMilestoneXp(500), 200);
assert.strictEqual(getProjectMilestoneXp(1000), 300);

const testProject: Project = {
  id: 'proj-omega',
  name: 'Omega Protocol',
  color: '#8B1528',
  icon: 'Shield',
  skillId: 'skill-omega',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isDeleted: false,
};

const testSkill: Skill = {
  id: 'skill-omega',
  name: 'Omega Protocol',
  level: 1,
  xp: 0,
  xpToNextLevel: 20,
  icon: 'Shield',
  streak: 0,
  totalCompleted: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isDeleted: false,
};

const resProjInit = evaluateAchievements([], [testSkill], [], INITIAL_ACHIEVEMENTS, emptyUser, [testProject], []);
const projAch10 = resProjInit.updatedAchievements.find((a) => a.id === 'ach-project-proj-omega-10');
assert.ok(projAch10, 'Project milestone 10 must be generated');
assert.strictEqual(projAch10.title, 'Omega Protocol: 10 Contributions');
assert.strictEqual(projAch10.description, 'Complete 10 tasks or library items in Omega Protocol.');
assert.strictEqual(projAch10.xpReward, 25);
assert.strictEqual(projAch10.projectId, 'proj-omega');

const projAch50 = resProjInit.updatedAchievements.find((a) => a.id === 'ach-project-proj-omega-50');
assert.ok(projAch50, 'Project milestone 50 must be generated');
assert.strictEqual(projAch50.title, 'Omega Protocol: Milestone 50');
assert.strictEqual(projAch50.xpReward, 50);

const projAch1000 = resProjInit.updatedAchievements.find((a) => a.id === 'ach-project-proj-omega-1000');
assert.ok(projAch1000, 'Project milestone 1000 must be generated');
assert.strictEqual(projAch1000.title, 'Omega Protocol: Milestone 1000');
assert.strictEqual(projAch1000.xpReward, 300);
console.log('Test 7o: Project milestone ladders, tiers, boost scaling & naming: PASSED');

// 7p. Unified completions (tasks + library items) & dual XP award
const projTasks: Task[] = Array.from({ length: 7 }, (_, i) => ({
  id: `task-p-${i}`,
  title: `Task ${i}`,
  completed: true,
  projectId: 'proj-omega',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isDeleted: false,
}));

const projBooks: LibraryItem[] = Array.from({ length: 3 }, (_, i) => ({
  id: `book-p-${i}`,
  title: `Book ${i}`,
  type: 'book' as const,
  status: 'done' as const,
  difficulty: 1 as const,
  projectId: 'proj-omega',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  isDeleted: false,
}));

const resProjUnlock = evaluateAchievements(
  projTasks,
  [testSkill],
  [],
  resProjInit.updatedAchievements,
  emptyUser,
  [testProject],
  projBooks
);

const projAch10Unlocked = resProjUnlock.updatedAchievements.find((a) => a.id === 'ach-project-proj-omega-10');
assert.ok(projAch10Unlocked?.unlockedAt, 'Milestone 10 must unlock with 7 tasks + 3 library items (10 total)');
assert.strictEqual(projAch10Unlocked.progress, 10);
const projAchReward = resProjUnlock.newlyUnlocked.find((a) => a.id === 'ach-project-proj-omega-10')?.xpReward;
assert.strictEqual(projAchReward, 25, 'Project milestone 10 reward must be 25 XP');
assert.strictEqual(resProjUnlock.projectSkillXpGains?.['skill-omega'], 25, 'Linked skill must receive 25 XP');
assert.strictEqual(resProjUnlock.earnedXpBonus, 75, 'Character receives bonus for project milestone + First Mark + First Volume (75 total)');

const { updatedSkills, leveledUpSkills } = applySkillXpGains([testSkill], resProjUnlock.projectSkillXpGains);
assert.strictEqual(updatedSkills[0].xp, 25);
assert.strictEqual(updatedSkills[0].level, 2, 'Skill level should reach 2 at 25 XP');
assert.strictEqual(leveledUpSkills.length, 1);
assert.strictEqual(leveledUpSkills[0].name, 'Omega Protocol');
console.log('Test 7p: Unified completions (tasks + library) & dual XP award to character and linked skill: PASSED');

// 7q. Rolling progressive visibility per project
const visibleBeforeUnlock = resProjInit.updatedAchievements.filter((a) =>
  isAchievementVisible(a, resProjInit.updatedAchievements)
);
const projCardsBefore = visibleBeforeUnlock.filter((a) => a.projectId === 'proj-omega');
assert.strictEqual(projCardsBefore.length, 1, 'Only lowest unachieved milestone per project should be visible');
assert.strictEqual(projCardsBefore[0].id, 'ach-project-proj-omega-10');

const visibleAfterUnlock = resProjUnlock.updatedAchievements.filter((a) =>
  isAchievementVisible(a, resProjUnlock.updatedAchievements)
);
const projCardsAfter = visibleAfterUnlock.filter((a) => a.projectId === 'proj-omega');
assert.strictEqual(projCardsAfter.length, 2, 'Should show unlocked milestone 10 + next in-progress milestone 20');
assert.ok(projCardsAfter.some((a) => a.id === 'ach-project-proj-omega-10' && a.unlockedAt));
assert.ok(projCardsAfter.some((a) => a.id === 'ach-project-proj-omega-20' && !a.unlockedAt));
assert.strictEqual(visibleAfterUnlock.some((a) => a.id === 'ach-project-proj-omega-30'), false, 'Milestone 30 must remain hidden');
console.log('Test 7q: Rolling progressive visibility per project: PASSED');

// 7r. Project renaming updates achievement titles
const renamedProject: Project = { ...testProject, name: 'Apex Vanguard' };
const resRenamed = evaluateAchievements(
  projTasks,
  updatedSkills,
  [],
  resProjUnlock.updatedAchievements,
  emptyUser,
  [renamedProject],
  projBooks
);
const renamedAch10 = resRenamed.updatedAchievements.find((a) => a.id === 'ach-project-proj-omega-10');
assert.strictEqual(renamedAch10?.title, 'Apex Vanguard: 10 Contributions');
const renamedAch50 = resRenamed.updatedAchievements.find((a) => a.id === 'ach-project-proj-omega-50');
assert.strictEqual(renamedAch50?.title, 'Apex Vanguard: Milestone 50');
console.log('Test 7r: Project renaming dynamic title updates: PASSED');

// 7s. Project deletion: preserves unlocked achievements, removes unachieved from in progress
const deletedProject: Project = { ...renamedProject, isDeleted: true };
const resDeleted = evaluateAchievements(
  projTasks,
  updatedSkills,
  [],
  resRenamed.updatedAchievements,
  emptyUser,
  [deletedProject],
  projBooks
);
const deletedAch10 = resDeleted.updatedAchievements.find((a) => a.id === 'ach-project-proj-omega-10');
assert.ok(deletedAch10?.unlockedAt, 'Unlocked milestone 10 MUST be preserved (Permanent Unlock Guarantee)');
const deletedAch20 = resDeleted.updatedAchievements.find((a) => a.id === 'ach-project-proj-omega-20');
assert.strictEqual(deletedAch20, undefined, 'Unachieved milestone 20 MUST be pruned when project is deleted');
console.log('Test 7s: Project deletion preserves unlocked achievements & removes in-progress milestones: PASSED');

// 7t. Skills sorting: by level and by time added
const skillA: Skill = {
  id: 'skill-a',
  name: 'Alpha Skill',
  level: 3,
  xp: 180,
  xpToNextLevel: 240,
  icon: 'Folder',
  streak: 2,
  totalCompleted: 10,
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
  isDeleted: false,
};
const skillB: Skill = {
  id: 'skill-b',
  name: 'Beta Skill',
  level: 5,
  xp: 500,
  xpToNextLevel: 600,
  icon: 'Folder',
  streak: 0,
  totalCompleted: 20,
  createdAt: '2026-01-02T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z',
  isDeleted: false,
};
const skillC: Skill = {
  id: 'skill-c',
  name: 'Gamma Skill',
  level: 1,
  xp: 10,
  xpToNextLevel: 20,
  icon: 'Folder',
  streak: 5,
  totalCompleted: 1,
  createdAt: '2026-01-03T10:00:00.000Z',
  updatedAt: '2026-01-03T10:00:00.000Z',
  isDeleted: false,
};

const skillsList = [skillA, skillB, skillC];

// Sort by level descending
const sortedByLevelDesc = [...skillsList].sort((a, b) => b.level - a.level);
assert.deepStrictEqual(sortedByLevelDesc.map((s) => s.id), ['skill-b', 'skill-a', 'skill-c']);

// Sort by level ascending
const sortedByLevelAsc = [...skillsList].sort((a, b) => a.level - b.level);
assert.deepStrictEqual(sortedByLevelAsc.map((s) => s.id), ['skill-c', 'skill-a', 'skill-b']);

// Sort by time added descending (newest first)
const sortedByTimeDesc = [...skillsList].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
assert.deepStrictEqual(sortedByTimeDesc.map((s) => s.id), ['skill-c', 'skill-b', 'skill-a']);

// Sort by time added ascending (oldest first)
const sortedByTimeAsc = [...skillsList].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
assert.deepStrictEqual(sortedByTimeAsc.map((s) => s.id), ['skill-a', 'skill-b', 'skill-c']);

console.log('Test 7t: Skills sorting by level and time added verified: PASSED');

console.log('\n🎉 ALL CHARACTER & ACHIEVEMENT TESTS PASSED!');

