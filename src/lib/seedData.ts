import { Project, Skill, Task, Achievement, UserProfile, Habit, HabitEvent } from '../types';

// Fixed baseline epoch timestamp for default initial seed records.
// Guarantees any real backup from any device will always have updatedAt > SEED_EPOCH_ISO.
export const SEED_EPOCH_ISO = '2026-01-01T00:00:00.000Z';
const nowIso = SEED_EPOCH_ISO;

export const INITIAL_PROJECTS: Project[] = [];
export const INITIAL_SKILLS: Skill[] = [];
export const INITIAL_HABITS: Habit[] = [];
export const INITIAL_HABIT_EVENTS: HabitEvent[] = [];
export const INITIAL_TASKS: Task[] = [];

export function getTaskMilestoneMeta(count: number): {
  title: string;
  description: string;
  icon: string;
  xpReward: number;
} {
  if (count === 10) return { title: 'First Decade', description: 'Complete 10 tasks across all projects.', icon: 'CheckSquare', xpReward: 25 };
  if (count === 20) return { title: 'Double Decade', description: 'Complete 20 tasks across all projects.', icon: 'CheckSquare', xpReward: 25 };
  if (count === 30) return { title: 'Dedicated Rhythm', description: 'Complete 30 tasks across all projects.', icon: 'CheckSquare', xpReward: 25 };
  if (count === 40) return { title: 'Resolute Momentum', description: 'Complete 40 tasks across all projects.', icon: 'CheckSquare', xpReward: 25 };
  if (count === 50) return { title: 'Half-Century', description: 'Complete 50 tasks across all projects.', icon: 'Award', xpReward: 50 };
  if (count === 60) return { title: 'Deep Consistency', description: 'Complete 60 tasks across all projects.', icon: 'CheckSquare', xpReward: 25 };
  if (count === 70) return { title: 'Seasoned Focus', description: 'Complete 70 tasks across all projects.', icon: 'CheckSquare', xpReward: 25 };
  if (count === 80) return { title: 'Iron Discipline', description: 'Complete 80 tasks across all projects.', icon: 'Shield', xpReward: 25 };
  if (count === 90) return { title: 'Approaching the Zenith', description: 'Complete 90 tasks across all projects.', icon: 'Sparkles', xpReward: 25 };
  if (count === 100) return { title: 'Century Milestone', description: 'Complete 100 tasks across all projects.', icon: 'ShieldCheck', xpReward: 100 };
  if (count === 250) return { title: 'Quarter Millennium', description: 'Complete 250 tasks across all projects.', icon: 'Sparkles', xpReward: 250 };
  if (count === 500) return { title: 'Five Hundred Feats', description: 'Complete 500 tasks across all projects.', icon: 'Crown', xpReward: 250 };
  if (count === 750) return { title: 'Three-Quarter Zenith', description: 'Complete 750 tasks across all projects.', icon: 'Flame', xpReward: 250 };
  if (count === 1000) return { title: 'The Millennium Mark', description: 'Complete 1,000 tasks across all projects.', icon: 'Trophy', xpReward: 250 };

  return {
    title: `${count} Tasks Completed`,
    description: `Complete ${count} tasks across all projects.`,
    icon: 'ShieldCheck',
    xpReward: 25,
  };
}

const generatedTaskAchievements: Achievement[] = [];
for (let c = 10; c <= 1000; c += 10) {
  const meta = getTaskMilestoneMeta(c);
  generatedTaskAchievements.push({
    id: c === 100 ? 'ach-5' : `ach-tasks-${c}`,
    title: meta.title,
    description: meta.description,
    icon: meta.icon,
    unlockedAt: undefined,
    progress: 0,
    maxProgress: c,
    xpReward: meta.xpReward,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}

export const LEVEL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-level-10',
    title: 'Ekirum Adept',
    description: 'Ascend to Ekirum Character Level 10.',
    icon: 'Compass',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 10,
    xpReward: 50,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-level-25',
    title: 'Ekirum Commander',
    description: 'Ascend to Ekirum Character Level 25.',
    icon: 'Shield',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 25,
    xpReward: 100,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-level-50',
    title: 'Grand Ascendant',
    description: 'Ascend to Ekirum Character Level 50.',
    icon: 'Crown',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 50,
    xpReward: 250,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

export const SKILL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-4',
    title: 'Mastery in Hand',
    description: 'Advance any skill to Level 5.',
    icon: 'Award',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 5,
    xpReward: 100,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-skill-10',
    title: 'Disciplined Craft',
    description: 'Advance any skill to Level 10.',
    icon: 'Compass',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 10,
    xpReward: 150,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-skill-15',
    title: 'Refined Technique',
    description: 'Advance any skill to Level 15.',
    icon: 'Sparkles',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 15,
    xpReward: 200,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-skill-20',
    title: "Virtuoso's Touch",
    description: 'Advance any skill to Level 20.',
    icon: 'ShieldCheck',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 20,
    xpReward: 250,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-skill-25',
    title: 'Commanding Expertise',
    description: 'Advance any skill to Level 25.',
    icon: 'Shield',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 25,
    xpReward: 300,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-skill-30',
    title: 'Sovereign Practice',
    description: 'Advance any skill to Level 30.',
    icon: 'Award',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 30,
    xpReward: 350,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-skill-35',
    title: 'Zenith of Craft',
    description: 'Advance any skill to Level 35.',
    icon: 'Flame',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 35,
    xpReward: 400,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-skill-40',
    title: 'Venerated Mastery',
    description: 'Advance any skill to Level 40.',
    icon: 'Sparkle',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 40,
    xpReward: 450,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-skill-45',
    title: 'Transcendent Focus',
    description: 'Advance any skill to Level 45.',
    icon: 'Trophy',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 45,
    xpReward: 475,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-skill-50',
    title: 'Grandmaster of the Craft',
    description: 'Advance any skill to Level 50.',
    icon: 'Crown',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 50,
    xpReward: 500,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

export const MULTISKILL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-multiskill-2',
    title: 'Dual Discipline',
    description: 'Advance 2 distinct skills to Level 2 or higher.',
    icon: 'Compass',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 2,
    xpReward: 50,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-multiskill-3',
    title: 'Threefold Focus',
    description: 'Advance 3 distinct skills to Level 2 or higher.',
    icon: 'Layers',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 3,
    xpReward: 75,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-multiskill-4',
    title: 'Quadrivium',
    description: 'Advance 4 distinct skills to Level 2 or higher.',
    icon: 'Shield',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 4,
    xpReward: 100,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-multiskill-5',
    title: "Polymath's Horizon",
    description: 'Advance 5 distinct skills to Level 2 or higher.',
    icon: 'Crown',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 5,
    xpReward: 150,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const LIBRARY_TIERS = [1, 5, 10, 25, 50, 100];

const BOOK_ACHIEVEMENT_META: { title: string; icon: string; xp: number }[] = [
  { title: 'First Chapter', icon: 'BookOpen', xp: 25 },
  { title: 'Bookworm', icon: 'Bookmark', xp: 50 },
  { title: 'Avid Reader', icon: 'Feather', xp: 100 },
  { title: 'Bibliophile', icon: 'Sparkles', xp: 150 },
  { title: 'Keeper of Libraries', icon: 'Award', xp: 250 },
  { title: 'Grand Archivist', icon: 'Crown', xp: 500 },
];

const MOVIE_ACHIEVEMENT_META: { title: string; icon: string; xp: number }[] = [
  { title: 'First Screening', icon: 'Film', xp: 10 },
  { title: 'Matinee Regular', icon: 'Star', xp: 25 },
  { title: 'Cinephile', icon: 'Sparkle', xp: 50 },
  { title: 'Film Buff', icon: 'Trophy', xp: 75 },
  { title: 'Festival Veteran', icon: 'Award', xp: 125 },
  { title: 'Curator of Cinema', icon: 'Crown', xp: 250 },
];

const buildLibraryAchievements = (
  prefix: 'book' | 'movie',
  noun: string,
  meta: { title: string; icon: string; xp: number }[]
): Achievement[] =>
  LIBRARY_TIERS.map((count, i) => ({
    id: `ach-${prefix}-${count}`,
    title: meta[i].title,
    description: count === 1 ? `Finish your first ${noun}.` : `Finish ${count} ${noun}s.`,
    icon: meta[i].icon,
    unlockedAt: undefined,
    progress: 0,
    maxProgress: count,
    xpReward: meta[i].xp,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  }));

export const LIBRARY_ACHIEVEMENTS: Achievement[] = [
  ...buildLibraryAchievements('book', 'book', BOOK_ACHIEVEMENT_META),
  ...buildLibraryAchievements('movie', 'movie', MOVIE_ACHIEVEMENT_META),
];

export const RANK_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-rank-recruit',
    title: 'Rank: Recruit',
    description: 'Attain the rank of Recruit by advancing to Level 3.',
    icon: 'Shield',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 3,
    xpReward: 25,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-rank-apprentice',
    title: 'Rank: Apprentice',
    description: 'Attain the rank of Apprentice by advancing to Level 5.',
    icon: 'Award',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 5,
    xpReward: 35,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-rank-pathfinder',
    title: 'Rank: Pathfinder',
    description: 'Attain the rank of Pathfinder by advancing to Level 8.',
    icon: 'Compass',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 8,
    xpReward: 50,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-rank-wayfarer',
    title: 'Rank: Wayfarer',
    description: 'Attain the rank of Wayfarer by advancing to Level 12.',
    icon: 'Navigation',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 12,
    xpReward: 75,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-rank-captain',
    title: 'Rank: Captain',
    description: 'Attain the rank of Captain by advancing to Level 17.',
    icon: 'ShieldCheck',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 17,
    xpReward: 100,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-rank-commander',
    title: 'Rank: Commander',
    description: 'Attain the rank of Commander by advancing to Level 23.',
    icon: 'Shield',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 23,
    xpReward: 125,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-rank-high-commander',
    title: 'Rank: High Commander',
    description: 'Attain the rank of High Commander by advancing to Level 30.',
    icon: 'Award',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 30,
    xpReward: 150,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-rank-master',
    title: 'Rank: Master',
    description: 'Attain the rank of Master by advancing to Level 38.',
    icon: 'Sparkles',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 38,
    xpReward: 200,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-rank-grandmaster',
    title: 'Rank: Grandmaster',
    description: 'Attain the rank of Grandmaster by advancing to Level 50.',
    icon: 'Crown',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 50,
    xpReward: 250,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

export const INITIAL_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach-1',
    title: 'First Mark',
    description: 'Complete your first task and register initial XP in a skill.',
    icon: 'Sparkle',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 1,
    xpReward: 25,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  ...generatedTaskAchievements,
  {
    id: 'ach-proj-1',
    title: 'First Horizon',
    description: 'Create your first project to cultivate a focused domain.',
    icon: 'Folder',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 1,
    xpReward: 25,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-proj-5',
    title: 'Grand Architecture',
    description: 'Establish 5 distinct projects to expand your disciplines.',
    icon: 'Layers',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 5,
    xpReward: 50,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  ...RANK_ACHIEVEMENTS,
  ...LEVEL_ACHIEVEMENTS,
  ...SKILL_ACHIEVEMENTS,
  ...MULTISKILL_ACHIEVEMENTS,
  ...LIBRARY_ACHIEVEMENTS,
  {
    id: 'ach-2',
    title: 'Consistent Cadence',
    description: 'Maintain a 3-day streak across any skill.',
    icon: 'Flame',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 3,
    xpReward: 50,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-3',
    title: 'Deep Rhythm',
    description: 'Achieve a 7-day streak in a single skill.',
    icon: 'Flame',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 7,
    xpReward: 50,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'ach-6',
    title: 'Pristine Horizon',
    description: 'Clear all tasks scheduled for Today.',
    icon: 'Sun',
    unlockedAt: undefined,
    progress: 0,
    maxProgress: 1,
    xpReward: 25,
    xpClaimed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

export const INITIAL_USER: UserProfile = {
  id: 'user-1',
  name: 'Ekirum',
  ekirumLevel: 1,
  ekirumRank: 'Novice',
  totalXp: 0,
  dailyXpDate: undefined,
  dailyXpEarned: 0,
  achievements: [],
  soundEnabled: true,
  accentColor: 'crimson',
  onboardingCompleted: false,
  createdAt: nowIso,
  updatedAt: nowIso,
};
