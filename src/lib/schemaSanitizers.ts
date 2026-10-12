import {
  Task,
  Project,
  Skill,
  Habit,
  HabitEvent,
  Achievement,
  UserProfile,
  LibraryItem,
} from '../types';
import { formatLocalDate } from './dateParser';
import { MAX_LENGTHS } from './validation';

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Strict schema sanitizers to protect IndexedDB and React from corrupted or poisoned objects.
 */
export function sanitizeTask(raw: any): Task | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
    return null;
  }
  const now = new Date().toISOString();
  return cleanUndefined({
    id: String(raw.id).trim(),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, MAX_LENGTHS.TASK_TITLE) : 'Untitled Task',
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, MAX_LENGTHS.TASK_NOTES) : undefined,
    projectId: typeof raw.projectId === 'string' && raw.projectId.trim() ? raw.projectId.trim() : undefined,
    priority: ['p1', 'p2', 'p3', 'p4'].includes(raw.priority) ? raw.priority : 'p4',
    dueDate: typeof raw.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dueDate) ? raw.dueDate : undefined,
    dueTime: typeof raw.dueTime === 'string' && /^\d{2}:\d{2}$/.test(raw.dueTime) ? raw.dueTime : undefined,
    recurrence: ['none', 'daily', 'weekdays', 'weekly', 'monthly'].includes(raw.recurrence) ? raw.recurrence : 'none',
    completed: Boolean(raw.completed),
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : undefined,
    subtasks: Array.isArray(raw.subtasks)
      ? raw.subtasks
          .filter((s: any) => s && typeof s === 'object' && typeof s.id === 'string' && typeof s.title === 'string')
          .map((s: any) => ({
            id: String(s.id),
            title: String(s.title).slice(0, MAX_LENGTHS.SUBTASK_TITLE),
            completed: Boolean(s.completed),
          }))
      : [],
    labels: Array.isArray(raw.labels) ? raw.labels.filter((l: any) => typeof l === 'string' && l.trim()).map((l: any) => String(l).trim().slice(0, MAX_LENGTHS.LABEL)) : [],
    order: typeof raw.order === 'number' && !isNaN(raw.order) ? raw.order : 0,
    recurrenceAnchorDay:
      typeof raw.recurrenceAnchorDay === 'number' &&
      !isNaN(raw.recurrenceAnchorDay) &&
      raw.recurrenceAnchorDay >= 1 &&
      raw.recurrenceAnchorDay <= 31
        ? Math.floor(raw.recurrenceAnchorDay)
        : undefined,
    section: typeof raw.section === 'string' ? raw.section : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    isDeleted: Boolean(raw.isDeleted),
    deletedAt: typeof raw.deletedAt === 'string' ? raw.deletedAt : undefined,
  });
}

export function sanitizeProject(raw: any): Project | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
    return null;
  }
  const now = new Date().toISOString();
  return cleanUndefined({
    id: String(raw.id).trim(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, MAX_LENGTHS.PROJECT_NAME) : 'Unnamed Project',
    color: typeof raw.color === 'string' && raw.color.trim() ? raw.color.trim() : '#8B1528',
    icon: typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim() : 'Layers',
    skillId: typeof raw.skillId === 'string' && raw.skillId.trim() ? raw.skillId.trim() : `skill-${raw.id}`,
    description: typeof raw.description === 'string' ? raw.description.slice(0, MAX_LENGTHS.PROJECT_DESCRIPTION) : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    isDeleted: Boolean(raw.isDeleted),
    deletedAt: typeof raw.deletedAt === 'string' ? raw.deletedAt : undefined,
  });
}

export function sanitizeSkill(raw: any): Skill | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
    return null;
  }
  const now = new Date().toISOString();
  return cleanUndefined({
    id: String(raw.id).trim(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, MAX_LENGTHS.SKILL_NAME) : 'Unnamed Skill',
    level: typeof raw.level === 'number' && !isNaN(raw.level) && raw.level >= 1 ? Math.floor(raw.level) : 1,
    xp: typeof raw.xp === 'number' && !isNaN(raw.xp) && raw.xp >= 0 ? raw.xp : 0,
    xpToNextLevel: typeof raw.xpToNextLevel === 'number' && !isNaN(raw.xpToNextLevel) && raw.xpToNextLevel > 0 ? raw.xpToNextLevel : 100,
    icon: typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim() : 'Layers',
    streak: typeof raw.streak === 'number' && !isNaN(raw.streak) && raw.streak >= 0 ? raw.streak : 0,
    lastCompletedDate: typeof raw.lastCompletedDate === 'string' ? raw.lastCompletedDate : undefined,
    totalCompleted: typeof raw.totalCompleted === 'number' && !isNaN(raw.totalCompleted) && raw.totalCompleted >= 0 ? raw.totalCompleted : 0,
    projectId: typeof raw.projectId === 'string' && raw.projectId.trim() ? raw.projectId.trim() : `proj-${raw.id}`,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    isDeleted: Boolean(raw.isDeleted),
    deletedAt: typeof raw.deletedAt === 'string' ? raw.deletedAt : undefined,
  });
}

export function sanitizeHabit(raw: any): Habit | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
    return null;
  }
  const now = new Date().toISOString();
  return cleanUndefined({
    id: String(raw.id).trim(),
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, MAX_LENGTHS.HABIT_TITLE) : 'Unnamed Habit',
    description: typeof raw.description === 'string' ? raw.description.slice(0, MAX_LENGTHS.HABIT_DESCRIPTION) : undefined,
    projectId: typeof raw.projectId === 'string' ? raw.projectId : undefined,
    frequency: ['daily', 'weekdays', 'weekly'].includes(raw.frequency) ? raw.frequency : 'daily',
    color: typeof raw.color === 'string' && raw.color.trim() ? raw.color.trim() : '#8B1528',
    icon: typeof raw.icon === 'string' && raw.icon.trim() ? raw.icon.trim() : 'Compass',
    completedDates: Array.isArray(raw.completedDates)
      ? raw.completedDates.filter((d: any) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      : [],
    streak: typeof raw.streak === 'number' && !isNaN(raw.streak) && raw.streak >= 0 ? raw.streak : 0,
    longestStreak: typeof raw.longestStreak === 'number' && !isNaN(raw.longestStreak) && raw.longestStreak >= 0 ? raw.longestStreak : 0,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    isDeleted: Boolean(raw.isDeleted),
    deletedAt: typeof raw.deletedAt === 'string' ? raw.deletedAt : undefined,
  });
}

export function sanitizeHabitEvent(raw: any): HabitEvent | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim() || typeof raw.habitId !== 'string') {
    return null;
  }
  const now = new Date().toISOString();
  return cleanUndefined({
    id: String(raw.id).trim(),
    habitId: String(raw.habitId).trim(),
    date: typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : formatLocalDate(),
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : now,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    isDeleted: Boolean(raw.isDeleted),
    deletedAt: typeof raw.deletedAt === 'string' ? raw.deletedAt : undefined,
  });
}

export function sanitizeAchievement(raw: any): Achievement | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
    return null;
  }
  const now = new Date().toISOString();
  let unlockedAt: string | undefined = undefined;
  if (typeof raw.unlockedAt === 'string' && raw.unlockedAt.trim()) {
    unlockedAt = raw.unlockedAt.trim();
  } else if (raw.unlocked === true) {
    unlockedAt = now;
  }

  return cleanUndefined({
    id: String(raw.id).trim(),
    title: typeof raw.title === 'string' ? raw.title : 'Achievement',
    description: typeof raw.description === 'string' ? raw.description : '',
    icon: typeof raw.icon === 'string' ? raw.icon : 'Award',
    progress: typeof raw.progress === 'number' && !isNaN(raw.progress) ? Math.max(0, raw.progress) : 0,
    maxProgress: typeof raw.maxProgress === 'number' && !isNaN(raw.maxProgress) ? Math.max(1, raw.maxProgress) : 1,
    unlockedAt,
    xpReward: typeof raw.xpReward === 'number' && !isNaN(raw.xpReward) ? Math.max(0, raw.xpReward) : 0,
    xpClaimed: Boolean(raw.xpClaimed),
    projectId: typeof raw.projectId === 'string' && raw.projectId.trim() ? raw.projectId.trim() : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    isDeleted: Boolean(raw.isDeleted),
    deletedAt: typeof raw.deletedAt === 'string' ? raw.deletedAt : undefined,
  });
}

export function sanitizeUserProfile(raw: any): UserProfile | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
    return null;
  }
  const now = new Date().toISOString();
  const safeTotalXp = typeof raw.totalXp === 'number' && !isNaN(raw.totalXp) && raw.totalXp >= 0 ? raw.totalXp : 0;
  // Avatar validation: string, max 2MB data URL length
  const safeAvatar = typeof raw.avatar === 'string' && raw.avatar.length <= 2 * 1024 * 1024 ? raw.avatar : undefined;

  const rawLevel = raw.ekirumLevel ?? raw.ekiteroLevel ?? raw.curatorLevel;
  const safeLevel = typeof rawLevel === 'number' && !isNaN(rawLevel) && rawLevel >= 1 ? Math.floor(rawLevel) : 1;
  const rawRank = raw.ekirumRank ?? raw.ekiteroRank ?? raw.curatorRank;
  const safeRank = typeof rawRank === 'string' && rawRank.trim() ? rawRank : 'Recruit';

  const safeDailyXpDate =
    typeof raw.dailyXpDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.dailyXpDate)
      ? raw.dailyXpDate
      : undefined;
  const safeDailyXpEarned =
    typeof raw.dailyXpEarned === 'number' && !isNaN(raw.dailyXpEarned) && raw.dailyXpEarned >= 0
      ? Math.floor(raw.dailyXpEarned)
      : undefined;

  const accentColor: 'crimson' | 'gold' = raw.accentColor === 'gold' ? 'gold' : 'crimson';

  return cleanUndefined<UserProfile>({
    id: String(raw.id).trim(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, MAX_LENGTHS.USER_NAME) : 'Novice',
    avatar: safeAvatar,
    ekirumLevel: safeLevel,
    ekirumRank: safeRank,
    totalXp: safeTotalXp,
    dailyXpDate: safeDailyXpDate,
    dailyXpEarned: safeDailyXpEarned,
    achievements: Array.isArray(raw.achievements) ? raw.achievements.filter((a: any) => typeof a === 'string') : [],
    soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : true,
    accentColor,
    onboardingCompleted: Boolean(raw.onboardingCompleted),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    isDeleted: Boolean(raw.isDeleted),
  });
}

export function sanitizeLibraryItem(raw: any): LibraryItem | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
    return null;
  }
  const now = new Date().toISOString();
  const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const status = raw.status === 'done' ? 'done' : 'todo';
  const type: LibraryItem['type'] = raw.type === 'movie' ? 'movie' : 'book';
  return cleanUndefined<LibraryItem>({
    id: String(raw.id).trim(),
    title: (str(raw.title) || 'Untitled').slice(0, MAX_LENGTHS.LIBRARY_TITLE),
    type,
    creator: str(raw.creator) ? str(raw.creator)!.slice(0, MAX_LENGTHS.LIBRARY_CREATOR) : undefined,
    url: str(raw.url),
    notes: typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.slice(0, MAX_LENGTHS.LIBRARY_NOTES) : undefined,
    difficulty: raw.difficulty === 0 || raw.difficulty === 2 ? raw.difficulty : 1,
    projectId: str(raw.projectId),
    status,
    review: typeof raw.review === 'string' && raw.review.trim() ? raw.review : undefined,
    finishedDate:
      typeof raw.finishedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.finishedDate)
        ? raw.finishedDate
        : undefined,
    completedAt: str(raw.completedAt),
    xpAwarded: Boolean(raw.xpAwarded),
    xpEarned: typeof raw.xpEarned === 'number' && !isNaN(raw.xpEarned) && raw.xpEarned >= 0 ? raw.xpEarned : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    isDeleted: Boolean(raw.isDeleted),
    deletedAt: typeof raw.deletedAt === 'string' ? raw.deletedAt : undefined,
  });
}
