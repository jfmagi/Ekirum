import assert from 'node:assert';
import { UserProfile, Skill, Project, Achievement, Habit } from '../src/types';
import {
  generateCharacterDossierHtml,
  escapeHtml,
} from '../src/lib/pdfExport';

console.log('🧪 Starting Character PDF Export verification tests...\n');

// 1. Test escapeHtml
assert.strictEqual(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
assert.strictEqual(escapeHtml('Jack & Jill'), 'Jack &amp; Jill');
assert.strictEqual(escapeHtml('Zażółć gęślą jaźń'), 'Zażółć gęślą jaźń');
console.log('Test 1: escapeHtml sanitization and UTF-8 preservation: PASSED');

// 2. Setup mock data
const mockUser: UserProfile = {
  id: 'user-test',
  name: 'Miyamoto Musashi',
  avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ekirumLevel: 5,
  ekirumRank: 'Wayfarer',
  totalXp: 1850,
  achievements: ['ach-1'],
  soundEnabled: true,
  accentColor: 'crimson',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
};

const mockProjects: Project[] = [
  {
    id: 'proj-1',
    name: 'Book of Five Rings',
    color: 'crimson',
    skillId: 'skill-swordsmanship',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'proj-2',
    name: 'Calligraphy & Zen',
    color: 'stone',
    skillId: 'skill-calligraphy',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const allSkills: Skill[] = [
  {
    id: 'skill-swordsmanship',
    projectId: 'proj-1',
    name: 'Two Heavens Style',
    level: 7,
    xp: 980,
    xpToNextLevel: 980,
    icon: 'Sword',
    streak: 14,
    totalCompleted: 42,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
  {
    id: 'skill-calligraphy',
    projectId: 'proj-2',
    name: 'Zen Brushwork',
    level: 4,
    xp: 320,
    xpToNextLevel: 320,
    icon: 'PenTool',
    streak: 5,
    totalCompleted: 15,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
  {
    id: 'skill-cooking',
    projectId: 'proj-3',
    name: 'Culinary Art',
    level: 2,
    xp: 80,
    xpToNextLevel: 80,
    icon: 'Utensils',
    streak: 1,
    totalCompleted: 3,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
];

const mockAchievements: Achievement[] = [
  {
    id: 'ach-1',
    title: 'First Step to Mastery',
    description: 'Complete your first 10 focused sessions.',
    icon: 'Award',
    progress: 10,
    maxProgress: 10,
    unlockedAt: '2026-02-15T12:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-15T12:00:00.000Z',
  },
  {
    id: 'ach-2',
    title: 'Grand Master',
    description: 'Reach Level 50.',
    icon: 'Crown',
    progress: 5,
    maxProgress: 50,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockHabits: Habit[] = [
  {
    id: 'habit-1',
    title: 'Morning Meditation',
    frequency: 'daily',
    completedDates: ['2026-10-25', '2026-10-26'],
    streak: 21,
    longestStreak: 45,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  },
];

// 3. Test Full Export with All Chosen Skills
const fullHtml = generateCharacterDossierHtml({
  user: mockUser,
  skills: allSkills,
  projects: mockProjects,
  achievements: mockAchievements,
  habits: mockHabits,
  tasksCompletedCount: 60,
  dossierTitle: 'Wayfarer Musashi Dossier',
  customNote: 'There is nothing outside of yourself that can enable you to get better.',
  includeStats: true,
  includeAchievements: true,
  includeHabits: true,
});

assert(fullHtml.includes('<!DOCTYPE html>'), 'Generated HTML has DOCTYPE');
assert(fullHtml.includes('Miyamoto Musashi'), 'Character name is present');
assert(fullHtml.includes('Wayfarer Musashi Dossier'), 'Custom title is present');
assert(fullHtml.includes('Two Heavens Style'), 'Skill 1 present');
assert(fullHtml.includes('Zen Brushwork'), 'Skill 2 present');
assert(fullHtml.includes('Culinary Art'), 'Skill 3 present');
assert(fullHtml.includes('First Step to Mastery'), 'Unlocked achievement is present');
// In-progress achievement should NOT be in unlocked achievements
assert(!fullHtml.includes('Grand Master'), 'In-progress achievement excluded from unlocked honors');
assert(fullHtml.includes('Morning Meditation'), 'Habit is present');
assert(fullHtml.includes('45 <span style="font-size:12px; font-weight:normal; color:var(--muted)">days</span>'), 'Longest habit streak stat displayed');
assert(fullHtml.includes('data:image/png;base64,'), 'Avatar image is embedded');
assert(!fullHtml.includes('hanko-seal'), 'No hanko seal in generated HTML');
assert(!fullHtml.includes('駅'), 'No foreign kanji in generated HTML');
console.log('Test 2: Full Character Dossier HTML generation: PASSED');

// 4. Test Chosen Skills Filtering (User selects ONLY 1 skill)
const chosenSkillsOnly = [allSkills[0]]; // Only Two Heavens Style
const filteredHtml = generateCharacterDossierHtml({
  user: mockUser,
  skills: chosenSkillsOnly,
  projects: mockProjects,
  tasksCompletedCount: 42,
  includeAchievements: false,
  includeHabits: false,
});

assert(filteredHtml.includes('Two Heavens Style'), 'Chosen skill is present');
assert(!filteredHtml.includes('Zen Brushwork'), 'Unselected skill 2 is excluded');
assert(!filteredHtml.includes('Culinary Art'), 'Unselected skill 3 is excluded');
assert(!filteredHtml.includes('Honors & Milestone Achievements'), 'Achievements section excluded when toggled off');
assert(!filteredHtml.includes('Rituals & Habit Cadence'), 'Habits section excluded when toggled off');
console.log('Test 3: Chosen skills filtering and section toggles: PASSED');

// 5. Test Fallback when avatar is missing
const userWithoutAvatar: UserProfile = {
  ...mockUser,
  avatar: undefined,
  name: 'Tadeusz Kościuszko',
};
const noAvatarHtml = generateCharacterDossierHtml({
  user: userWithoutAvatar,
  skills: [allSkills[0]],
  projects: mockProjects,
});

assert(noAvatarHtml.includes('Tadeusz Kościuszko'), 'Polish name rendered correctly');
assert(noAvatarHtml.includes('avatar-monogram'), 'Monogram rendered when avatar is missing');
assert(noAvatarHtml.includes('TK'), 'Monogram initials computed correctly (TK)');
console.log('Test 4: Monogram fallback and Polish character handling: PASSED');

// 6. Test Print CSS directives
assert(fullHtml.includes('@media print'), 'Print media query present');
assert(fullHtml.includes('page-break-inside: avoid'), 'Page break avoid styling present');
assert(fullHtml.includes('print-color-adjust: exact'), 'Exact print color adjust present');
console.log('Test 5: Print stylesheet directives verified: PASSED');

console.log('\n✅ All Character PDF Export tests passed successfully!\n');
