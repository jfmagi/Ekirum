import { db, getOrCreateDeviceId } from './db';
import {
  BackupFile,
  Task,
  Project,
  Skill,
  Habit,
  HabitEvent,
  Achievement,
  UserProfile,
  LibraryItem,
} from '../types';
import { calculateHabitStreak } from '../store/useEkirumStore';
import { computeUserLevelAndRank, calculateSkillLevel } from './characterMath';
import {
  sanitizeTask,
  sanitizeProject,
  sanitizeSkill,
  sanitizeHabit,
  sanitizeHabitEvent,
  sanitizeAchievement,
  sanitizeUserProfile,
  sanitizeLibraryItem,
} from './schemaSanitizers';
import { SEED_EPOCH_ISO } from './seedData';

export interface MergeStats {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface MergeResult {
  success: boolean;
  error?: string;
  stats: Record<string, MergeStats>;
  totalChanges: number;
}

export const MAX_RECORDS_PER_TABLE = 50000;

/**
 * Garbage-collect soft-deleted tombstones older than the retention cutoff (default: 60 days).
 * Prevents unbounded Dexie table growth while safely protecting distributed LWW sync.
 */
export async function compactTombstones(cutoffDays = 60): Promise<number> {
  const cutoffTime = new Date(Date.now() - cutoffDays * 24 * 3600 * 1000).toISOString();
  let purgedCount = 0;

  await db.transaction('rw', [db.tasks, db.projects, db.skills, db.habits, db.habitEvents, db.libraryItems], async () => {
    const tables = [db.tasks, db.projects, db.skills, db.habits, db.habitEvents, db.libraryItems];
    for (const table of tables) {
      const oldDeletedKeys = await table
        .filter((r: any) => Boolean(r.isDeleted) && typeof r.updatedAt === 'string' && r.updatedAt < cutoffTime)
        .primaryKeys();
      if (oldDeletedKeys.length > 0) {
        await table.bulkDelete(oldDeletedKeys);
        purgedCount += oldDeletedKeys.length;
      }
    }
  });

  return purgedCount;
}

/**
 * Export all tables from IndexedDB into a versioned JSON backup object.
 */
export async function exportAll(customDeviceId?: string): Promise<BackupFile> {
  const deviceId = customDeviceId || (await getOrCreateDeviceId());

  const [
    tasks,
    projects,
    skills,
    habits,
    habitEvents,
    achievements,
    userProfile,
    libraryItems,
  ] = await Promise.all([
    db.tasks.toArray(),
    db.projects.toArray(),
    db.skills.toArray(),
    db.habits.toArray(),
    db.habitEvents.toArray(),
    db.achievements.toArray(),
    db.userProfile.toArray(),
    db.libraryItems.toArray(),
  ]);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    deviceId,
    tables: {
      tasks,
      projects,
      skills,
      habits,
      habitEvents,
      achievements,
      userProfile,
      libraryItems,
    },
  };
}

// Schema sanitizers are imported from schemaSanitizers.ts

/**
 * Custom merger for UserProfile ensuring:
 * 1. Monotonic progress: total XP and Level NEVER decrease upon sync.
 * 2. Unlocked achievements union: all achievements unlocked on any device stay unlocked.
 * 3. Identity protection: uncustomized default placeholders ('Ekirum' / 0 XP) never overwrite customized characters.
 */
export function mergeUserProfiles(
  existing: UserProfile,
  incoming: UserProfile,
  isIncomingNewer: boolean
): UserProfile {
  const existingXp = existing.totalXp || 0;
  const incomingXp = incoming.totalXp || 0;
  const totalXp = Math.max(existingXp, incomingXp);

  const { level: derivedLevel, rank: derivedRank } = computeUserLevelAndRank(totalXp);
  const ekirumLevel = Math.max(existing.ekirumLevel || 1, incoming.ekirumLevel || 1, derivedLevel);
  const ekirumRank = derivedRank;

  const mergedAchievements = Array.from(
    new Set([...(existing.achievements || []), ...(incoming.achievements || [])])
  );

  const isExistingDefault =
    existing.name === 'Ekirum' && existingXp === 0 && !existing.onboardingCompleted && !existing.avatar;
  const isIncomingDefault =
    incoming.name === 'Ekirum' && incomingXp === 0 && !incoming.onboardingCompleted && !incoming.avatar;

  let chosenProfile: UserProfile;
  if (isExistingDefault && !isIncomingDefault) {
    chosenProfile = incoming;
  } else if (!isExistingDefault && isIncomingDefault) {
    chosenProfile = existing;
  } else if (incomingXp > existingXp) {
    chosenProfile = incoming;
  } else if (existingXp > incomingXp) {
    chosenProfile = existing;
  } else {
    chosenProfile = isIncomingNewer ? incoming : existing;
  }

  let dailyXpDate = isIncomingNewer ? incoming.dailyXpDate : existing.dailyXpDate;
  let dailyXpEarned = isIncomingNewer ? incoming.dailyXpEarned : existing.dailyXpEarned;
  if (existing.dailyXpDate && incoming.dailyXpDate && existing.dailyXpDate === incoming.dailyXpDate) {
    dailyXpDate = existing.dailyXpDate;
    dailyXpEarned = Math.max(existing.dailyXpEarned || 0, incoming.dailyXpEarned || 0);
  }

  return {
    ...chosenProfile,
    id: existing.id || incoming.id || 'user-1',
    totalXp,
    ekirumLevel,
    ekirumRank,
    achievements: mergedAchievements,
    dailyXpDate,
    dailyXpEarned,
    onboardingCompleted: Boolean(existing.onboardingCompleted || incoming.onboardingCompleted),
    updatedAt: isIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  };
}

/**
 * Custom merger for Achievement ensuring:
 * 1. Monotonic unlock invariant: an achievement unlocked on any device is NEVER locked again.
 * 2. Permanent claim & progress: max progress and claimed bonus are preserved.
 */
export function mergeAchievements(
  existing: Achievement,
  incoming: Achievement,
  isIncomingNewer: boolean
): Achievement {
  const isUnlocked = Boolean(
    existing.unlockedAt || incoming.unlockedAt || (existing as any).unlocked || (incoming as any).unlocked
  );
  const xpClaimed = Boolean(existing.xpClaimed || incoming.xpClaimed);
  const progress = Math.max(existing.progress || 0, incoming.progress || 0);

  let unlockedAt = existing.unlockedAt;
  if (isUnlocked) {
    if (existing.unlockedAt && incoming.unlockedAt) {
      unlockedAt =
        new Date(existing.unlockedAt).getTime() < new Date(incoming.unlockedAt).getTime()
          ? existing.unlockedAt
          : incoming.unlockedAt;
    } else {
      unlockedAt = existing.unlockedAt || incoming.unlockedAt || new Date().toISOString();
    }
  }

  const base = isIncomingNewer ? incoming : existing;
  return {
    ...base,
    projectId: existing.projectId || incoming.projectId,
    unlockedAt,
    progress,
    xpClaimed,
    updatedAt: isIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  };
}

/**
 * Custom merger for LibraryItem ensuring the one-time XP grant and completion state are preserved:
 * once XP was awarded on any device, the item keeps xpAwarded=true so it can never pay out twice,
 * and if completed on one device while untouched (xpAwarded=false) on the other, the completion wins.
 */
export function mergeLibraryItems(
  existing: LibraryItem,
  incoming: LibraryItem,
  isIncomingNewer: boolean
): LibraryItem {
  if (existing.isDeleted || incoming.isDeleted) {
    const base = isIncomingNewer ? incoming : existing;
    const xpAwarded = Boolean(existing.xpAwarded || incoming.xpAwarded);
    const xpEarned = Math.max(existing.xpEarned || 0, incoming.xpEarned || 0);
    return {
      ...base,
      xpAwarded,
      xpEarned: xpAwarded ? xpEarned : base.xpEarned,
      updatedAt: isIncomingNewer ? incoming.updatedAt : existing.updatedAt,
    };
  }

  const xpAwarded = Boolean(existing.xpAwarded || incoming.xpAwarded);
  const xpEarned = Math.max(existing.xpEarned || 0, incoming.xpEarned || 0);

  // If completed on one device and never completed (xpAwarded=false) on the other, completion wins
  let base: LibraryItem;
  if (incoming.status === 'done' && existing.status !== 'done' && !existing.xpAwarded) {
    base = incoming;
  } else if (existing.status === 'done' && incoming.status !== 'done' && !incoming.xpAwarded) {
    base = existing;
  } else {
    base = isIncomingNewer ? incoming : existing;
  }

  return {
    ...base,
    xpAwarded,
    xpEarned: xpAwarded ? xpEarned : base.xpEarned,
    updatedAt: isIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  };
}

/**
 * Custom merger for Skill ensuring:
 * 1. Progress monotonicity: XP, level, and streaks never degrade.
 * 2. Uncustomized placeholders don't overwrite customized skills.
 */
export function mergeSkills(
  existing: Skill,
  incoming: Skill,
  isIncomingNewer: boolean
): Skill {
  const isExistingFresh = (existing.xp || 0) === 0 && (existing.level || 1) === 1;
  const isIncomingFresh = (incoming.xp || 0) === 0 && (incoming.level || 1) === 1;

  const existingXp = existing.xp || 0;
  const incomingXp = incoming.xp || 0;
  const xp = Math.max(existingXp, incomingXp);
  const derivedLevel = calculateSkillLevel(xp);
  const level = Math.max(existing.level || 1, incoming.level || 1, derivedLevel);
  const streak = Math.max(existing.streak || 0, incoming.streak || 0);
  const totalCompleted = Math.max(existing.totalCompleted || 0, incoming.totalCompleted || 0);

  let base: Skill;
  if (isExistingFresh && !isIncomingFresh) {
    base = incoming;
  } else if (!isExistingFresh && isIncomingFresh) {
    base = existing;
  } else if (incomingXp > existingXp) {
    base = incoming;
  } else if (existingXp > incomingXp) {
    base = existing;
  } else {
    base = isIncomingNewer ? incoming : existing;
  }

  let lastCompletedDate = base.lastCompletedDate;
  if (existing.lastCompletedDate && incoming.lastCompletedDate) {
    lastCompletedDate =
      existing.lastCompletedDate >= incoming.lastCompletedDate
        ? existing.lastCompletedDate
        : incoming.lastCompletedDate;
  } else {
    lastCompletedDate = existing.lastCompletedDate || incoming.lastCompletedDate;
  }

  const xpToNextLevel = base.xpToNextLevel || level * level * 20;

  return cleanSkillUndefined({
    ...base,
    xp,
    level,
    xpToNextLevel,
    streak,
    lastCompletedDate,
    totalCompleted,
    updatedAt: isIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  });
}

function cleanSkillUndefined(s: Skill): Skill {
  if (s.lastCompletedDate === undefined) {
    const copy = { ...s };
    delete copy.lastCompletedDate;
    return copy;
  }
  return s;
}

/**
 * Key-order-independent canonical JSON serialization for comparing records.
 * Prevents false-positive "changes applied" counts when object keys are in a different order
 * or when optional fields are undefined.
 */
function toCanonicalValue(val: any): any {
  if (Array.isArray(val)) {
    return val.map(toCanonicalValue);
  }
  if (val !== null && typeof val === 'object') {
    const sorted: Record<string, any> = {};
    for (const k of Object.keys(val).sort()) {
      if (val[k] !== undefined) {
        sorted[k] = toCanonicalValue(val[k]);
      }
    }
    return sorted;
  }
  return val;
}

export function isRecordEqual(a: any, b: any): boolean {
  return JSON.stringify(toCanonicalValue(a)) === JSON.stringify(toCanonicalValue(b));
}

/**
 * Custom merger for Task ensuring:
 * 1. Tombstone deletions respect LWW and near-tie clock-skew rules.
 * 2. Seed epoch records always yield to user modifications.
 * 3. Completed tasks and completed subtasks are preserved across devices even if the lower-progress device has a newer updatedAt.
 */
export function mergeTasks(
  existing: Task,
  incoming: Task,
  isIncomingNewer: boolean
): Task {
  const existingTime = new Date(existing.updatedAt || 0).getTime();
  const incomingTime = new Date(incoming.updatedAt || 0).getTime();
  const timeDiff = existingTime - incomingTime;

  if (existing.isDeleted || incoming.isDeleted) {
    if (incomingTime === existingTime) {
      return incoming.isDeleted ? incoming : existing;
    }
    if (isIncomingNewer) return incoming;
    if (incoming.isDeleted && !existing.isDeleted && timeDiff <= 5000) {
      return incoming;
    }
    return existing;
  }

  const effectiveIncomingNewer =
    isIncomingNewer || (existing.updatedAt === SEED_EPOCH_ISO && incoming.updatedAt !== SEED_EPOCH_ISO);

  let base = effectiveIncomingNewer ? incoming : existing;

  // Monotonic completion: if completed on incoming and not completed on existing, apply completion
  const completed = Boolean(existing.completed || incoming.completed);
  const completedAt = completed
    ? (incoming.completed && !existing.completed
        ? (incoming.completedAt || incoming.updatedAt)
        : existing.completed && !incoming.completed
          ? (existing.completedAt || existing.updatedAt)
          : base.completedAt)
    : undefined;

  // Merge subtask completion progress
  let subtasks = base.subtasks || [];
  if (
    Array.isArray(existing.subtasks) &&
    existing.subtasks.length > 0 &&
    Array.isArray(incoming.subtasks) &&
    incoming.subtasks.length > 0
  ) {
    const otherSubtasks = effectiveIncomingNewer ? existing.subtasks : incoming.subtasks;
    const otherMap = new Map(otherSubtasks.map((s) => [s.id, s]));
    subtasks = subtasks.map((s) => {
      const other = otherMap.get(s.id);
      if (other && other.completed && !s.completed) {
        return { ...s, completed: true };
      }
      return s;
    });
  }

  // If recurring task was advanced on incoming, keep the advanced dueDate
  let dueDate = base.dueDate;
  if (
    !completed &&
    base.recurrence &&
    base.recurrence !== 'none' &&
    existing.dueDate &&
    incoming.dueDate &&
    incoming.dueDate > existing.dueDate
  ) {
    dueDate = incoming.dueDate;
  }

  const result: Task = {
    ...base,
    completed,
    ...(completedAt !== undefined ? { completedAt } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    subtasks,
    updatedAt: effectiveIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  };
  if (completedAt === undefined) {
    delete result.completedAt;
  }
  if (dueDate === undefined) {
    delete result.dueDate;
  }
  return result;
}

/**
 * Custom merger for Habit ensuring:
 * 1. Completed dates from all devices are unioned so habit check-in progress is never lost.
 * 2. Current and longest streaks are monotonically recalculated.
 */
export function mergeHabits(
  existing: Habit,
  incoming: Habit,
  isIncomingNewer: boolean
): Habit {
  const existingTime = new Date(existing.updatedAt || 0).getTime();
  const incomingTime = new Date(incoming.updatedAt || 0).getTime();
  const timeDiff = existingTime - incomingTime;

  if (existing.isDeleted || incoming.isDeleted) {
    if (incomingTime === existingTime) {
      return incoming.isDeleted ? incoming : existing;
    }
    if (isIncomingNewer) return incoming;
    if (incoming.isDeleted && !existing.isDeleted && timeDiff <= 5000) {
      return incoming;
    }
    return existing;
  }

  const effectiveIncomingNewer =
    isIncomingNewer || (existing.updatedAt === SEED_EPOCH_ISO && incoming.updatedAt !== SEED_EPOCH_ISO);
  const base = effectiveIncomingNewer ? incoming : existing;

  const existingDates = Array.from(new Set(existing.completedDates || [])).sort();
  const completedDates = Array.from(
    new Set([...existingDates, ...(incoming.completedDates || [])])
  ).sort();
  const datesChanged = JSON.stringify(completedDates) !== JSON.stringify(existingDates);
  const { current, longest } = calculateHabitStreak(completedDates);
  const longestStreak = Math.max(existing.longestStreak || 0, incoming.longestStreak || 0, longest);

  return {
    ...base,
    completedDates,
    streak: datesChanged || effectiveIncomingNewer ? current : existing.streak,
    longestStreak,
    updatedAt: effectiveIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  };
}

/**
 * Generic Last-Write-Wins (LWW) table merger with clock-skew mitigation and optional domain-specific merger.
 * Compares by id and updatedAt timestamp. Newer timestamp wins unless overridden by customMerger.
 * Mitigates device clock skew, clamps future timestamps, and gives tombstone deletions precedence.
 */
async function mergeTableRecords<T extends { id: string; updatedAt: string; isDeleted?: boolean }>(
  table: any,
  incomingItems: any[] = [],
  sanitizer?: (item: any) => T | null,
  options?: { clockSkewMs?: number },
  customMerger?: (existing: T, incoming: T, isIncomingNewer: boolean) => T
): Promise<MergeStats> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  if (!Array.isArray(incomingItems) || incomingItems.length === 0) {
    return { inserted, updated, skipped };
  }

  // Sanitize incoming items and discard invalid or malformed objects
  const validItems: T[] = [];
  for (const raw of incomingItems) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
      continue;
    }
    const clean = sanitizer ? sanitizer(raw) : (raw as T);
    if (clean && clean.id) {
      validItems.push(clean);
    }
  }

  if (validItems.length === 0) {
    return { inserted, updated, skipped };
  }

  // Pre-load existing items in bulk for efficiency
  const ids = validItems.map((item) => item.id);
  const existingRecords = await table.bulkGet(ids);
  const existingMap = new Map<string, T>();

  for (const item of existingRecords) {
    if (item && item.id) {
      existingMap.set(item.id, item);
    }
  }

  const toPut: T[] = [];
  const localNow = Date.now();
  const clockSkew = options?.clockSkewMs || 0;

  for (const incoming of validItems) {
    const existing = existingMap.get(incoming.id);
    const rawIncomingTime = new Date(incoming.updatedAt || 0).getTime();
    let normalizedIncomingTime = rawIncomingTime - clockSkew;

    // Future-skew clamp: Never allow normalized incoming timestamp to exceed localNow + 60s
    if (normalizedIncomingTime > localNow + 60_000) {
      normalizedIncomingTime = localNow;
      incoming.updatedAt = new Date(localNow).toISOString();
    }

    if (!existing) {
      toPut.push(incoming);
      inserted++;
    } else {
      const existingTime = new Date(existing.updatedAt || 0).getTime();
      const isStrictlyNewer = normalizedIncomingTime > existingTime;
      const isIncomingNewerOrEqual = normalizedIncomingTime >= existingTime;

      if (customMerger) {
        const merged = customMerger(existing, incoming, isIncomingNewerOrEqual);
        if (!isRecordEqual(merged, existing)) {
          toPut.push(merged);
          updated++;
        } else {
          skipped++;
        }
      } else if (isStrictlyNewer) {
        // Incoming is strictly newer: update only if content or timestamp differs
        if (!isRecordEqual(incoming, existing)) {
          toPut.push(incoming);
          updated++;
        } else {
          skipped++;
        }
      } else if (normalizedIncomingTime === existingTime) {
        // Tie-breaker: tombstone deletion takes precedence over active record
        if (incoming.isDeleted && !existing.isDeleted) {
          toPut.push(incoming);
          updated++;
        } else if (!isRecordEqual(incoming, existing)) {
          // If timestamps are identical but contents differ, incoming update applies
          toPut.push(incoming);
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Near-tie within 5000ms clock skew: allow deletions and task completions to win
        const timeDiff = existingTime - normalizedIncomingTime;
        if (timeDiff <= 5000) {
          if (incoming.isDeleted && !existing.isDeleted) {
            toPut.push(incoming);
            updated++;
          } else if ((incoming as any).completed && !(existing as any).completed) {
            toPut.push(incoming);
            updated++;
          } else if (existing.updatedAt === SEED_EPOCH_ISO && !isRecordEqual(incoming, existing)) {
            toPut.push(incoming);
            updated++;
          } else {
            skipped++;
          }
        } else {
          skipped++;
        }
      }
    }
  }

  if (toPut.length > 0) {
    await table.bulkPut(toPut);
  }

  return { inserted, updated, skipped };
}

/**
 * Import and merge a backup file into the local Dexie database using Last-Write-Wins.
 */
export async function importAndMerge(payload: any): Promise<MergeResult> {
  try {
    if (!payload || typeof payload !== 'object') {
      return {
        success: false,
        error: 'Invalid backup structure. Object expected.',
        stats: {},
        totalChanges: 0,
      };
    }

    // Support both canonical { schemaVersion, tables } format and legacy formats
    let tables: any = payload.tables;
    if (!tables) {
      tables = payload.data || payload.state || payload;
    }

    if (!tables || typeof tables !== 'object') {
      return {
        success: false,
        error: 'Backup payload missing entity tables.',
        stats: {},
        totalChanges: 0,
      };
    }

    for (const [tableName, records] of Object.entries(tables)) {
      if (Array.isArray(records) && records.length > MAX_RECORDS_PER_TABLE) {
        return {
          success: false,
          error: `Table "${tableName}" exceeds maximum allowed record count of ${MAX_RECORDS_PER_TABLE} (received ${records.length}).`,
          stats: {},
          totalChanges: 0,
        };
      }
    }

    const stats: Record<string, MergeStats> = {};

    // Do NOT infer device clock skew from exportedAt; exportedAt represents backup file creation time, not clock offset.
    // If a payload explicitly supplies a measured deviceClockOffsetMs, respect it; otherwise 0.
    const clockSkewMs = typeof payload.deviceClockOffsetMs === 'number' ? payload.deviceClockOffsetMs : 0;
    const mergeOptions = { clockSkewMs };

    await db.transaction(
      'rw',
      [
        db.tasks,
        db.projects,
        db.skills,
        db.habits,
        db.habitEvents,
        db.achievements,
        db.userProfile,
        db.libraryItems,
      ],
      async () => {
        // 1. Merge Tasks
        if (tables.tasks) {
          stats.tasks = await mergeTableRecords<Task>(db.tasks, tables.tasks, sanitizeTask, mergeOptions, mergeTasks);
        }

        // 2. Merge Projects
        if (tables.projects) {
          stats.projects = await mergeTableRecords<Project>(db.projects, tables.projects, sanitizeProject, mergeOptions);
        }

        // 3. Merge Skills
        if (tables.skills) {
          stats.skills = await mergeTableRecords<Skill>(db.skills, tables.skills, sanitizeSkill, mergeOptions, mergeSkills);
        }

        // 4. Merge Habit Events (atomic check-ins with deduplication invariant)
        if (tables.habitEvents && Array.isArray(tables.habitEvents)) {
          const eventDedupMap = new Map<string, any>();
          for (const raw of tables.habitEvents) {
            if (!raw || typeof raw !== 'object' || !raw.habitId || !raw.date) continue;
            const key = `${raw.habitId}_${raw.date}`;
            const existing = eventDedupMap.get(key);
            if (!existing || new Date(raw.updatedAt || 0).getTime() > new Date(existing.updatedAt || 0).getTime()) {
              eventDedupMap.set(key, raw);
            }
          }
          stats.habitEvents = await mergeTableRecords<HabitEvent>(
            db.habitEvents,
            Array.from(eventDedupMap.values()),
            sanitizeHabitEvent,
            mergeOptions
          );
        }

        // 5. Merge Habits
        if (tables.habits) {
          stats.habits = await mergeTableRecords<Habit>(db.habits, tables.habits, sanitizeHabit, mergeOptions, mergeHabits);
        }

        // 6. Merge Achievements (skipping un-unlocked project milestones with 0 progress from legacy 100-tier exports)
        if (tables.achievements && Array.isArray(tables.achievements)) {
          const relevantAchievements = tables.achievements.filter((a: any) => {
            if (!a || typeof a.id !== 'string') return false;
            if (a.id.startsWith('ach-project-') && !a.unlockedAt && !a.unlocked && (!a.progress || a.progress <= 0)) {
              const targetStr = a.id.slice(a.id.lastIndexOf('-') + 1);
              const target = parseInt(targetStr, 10);
              if (!isNaN(target) && target > 10) {
                return false;
              }
            }
            return true;
          });
          stats.achievements = await mergeTableRecords<Achievement>(
            db.achievements,
            relevantAchievements,
            sanitizeAchievement,
            mergeOptions,
            mergeAchievements
          );
        }

        // 7. Merge User Profile (normalizing legacy 'default' id to canonical 'user-1')
        if (tables.userProfile) {
          const rawProfiles = Array.isArray(tables.userProfile) ? tables.userProfile : [tables.userProfile];
          const sanitizedIncoming: UserProfile[] = [];
          for (const raw of rawProfiles) {
            const clean = sanitizeUserProfile(raw);
            if (clean) {
              sanitizedIncoming.push({
                ...clean,
                id: clean.id === 'default' ? 'user-1' : clean.id,
              });
            }
          }
          // Deduplicate incoming profiles by id (merging any 'default' and 'user-1' that now both have id 'user-1')
          const dedupedIncomingMap = new Map<string, UserProfile>();
          for (const prof of sanitizedIncoming) {
            const prev = dedupedIncomingMap.get(prof.id);
            if (!prev) {
              dedupedIncomingMap.set(prof.id, prof);
            } else {
              const isNewer = new Date(prof.updatedAt || 0).getTime() >= new Date(prev.updatedAt || 0).getTime();
              dedupedIncomingMap.set(prof.id, mergeUserProfiles(prev, prof, isNewer));
            }
          }

          // If db.userProfile has a legacy 'default' row, fold it into 'user-1' and remove 'default'
          const defaultRow = await db.userProfile.get('default');
          if (defaultRow) {
            const existingUser1 = await db.userProfile.get('user-1');
            const normalizedDefault: UserProfile = { ...defaultRow, id: 'user-1' };
            if (existingUser1) {
              const isNewer =
                new Date(normalizedDefault.updatedAt || 0).getTime() >=
                new Date(existingUser1.updatedAt || 0).getTime();
              await db.userProfile.put(mergeUserProfiles(existingUser1, normalizedDefault, isNewer));
            } else {
              await db.userProfile.put(normalizedDefault);
            }
            await db.userProfile.delete('default');
          }

          stats.userProfile = await mergeTableRecords<UserProfile>(
            db.userProfile,
            Array.from(dedupedIncomingMap.values()),
            sanitizeUserProfile,
            mergeOptions,
            mergeUserProfiles
          );
        }

        // 7b. Merge Library items
        if (tables.libraryItems) {
          stats.libraryItems = await mergeTableRecords<LibraryItem>(
            db.libraryItems,
            tables.libraryItems,
            sanitizeLibraryItem,
            mergeOptions,
            mergeLibraryItems
          );
        }

        // 8. Re-compute habit streaks and completedDates from non-deleted habit events in O(E + H)
        const allHabits = await db.habits.toArray();
        const allEvents = await db.habitEvents.toArray();

        // Build single-pass map of dates per habitId: O(E)
        const datesByHabitId = new Map<string, Set<string>>();
        const deletedDatesByHabitId = new Map<string, Set<string>>();
        for (const e of allEvents) {
          if (e.habitId && e.date) {
            if (e.isDeleted) {
              let delSet = deletedDatesByHabitId.get(e.habitId);
              if (!delSet) {
                delSet = new Set<string>();
                deletedDatesByHabitId.set(e.habitId, delSet);
              }
              delSet.add(e.date);
            } else {
              let set = datesByHabitId.get(e.habitId);
              if (!set) {
                set = new Set<string>();
                datesByHabitId.set(e.habitId, set);
              }
              set.add(e.date);
            }
          }
        }

        // Compute streak updates in memory: O(H)
        const habitsToPut: Habit[] = [];
        for (const habit of allHabits) {
          const dateSet = datesByHabitId.get(habit.id);
          const delSet = deletedDatesByHabitId.get(habit.id);
          const baseDates = (habit.completedDates || []).filter((d) => !delSet?.has(d));
          const mergedDateSet = new Set<string>(baseDates);
          if (dateSet) {
            dateSet.forEach((d) => mergedDateSet.add(d));
          }
          const dates = Array.from(mergedDateSet).sort();
          const existingDates = Array.from(new Set(habit.completedDates || [])).sort();
          const datesChanged = JSON.stringify(dates) !== JSON.stringify(existingDates);
          const { current, longest } = calculateHabitStreak(dates);
          const nextLongest = Math.max(habit.longestStreak || 0, longest);

          if (datesChanged || nextLongest > (habit.longestStreak || 0)) {
            const updatedHabit: Habit = {
              ...habit,
              completedDates: dates,
              streak: current,
              longestStreak: nextLongest,
            };
            habitsToPut.push(updatedHabit);
          }
        }

        // Batch update changed habits in one transaction: O(1) DB write
        if (habitsToPut.length > 0) {
          await db.habits.bulkPut(habitsToPut);
          if (!stats.habits) {
            stats.habits = { inserted: 0, updated: habitsToPut.length, skipped: 0 };
          } else if (stats.habits.inserted === 0 && stats.habits.updated === 0) {
            stats.habits.updated += habitsToPut.length;
          }
        }
      }
    );

    const totalChanges = Object.values(stats).reduce(
      (sum, s) => sum + s.inserted + s.updated,
      0
    );

    return {
      success: true,
      stats,
      totalChanges,
    };
  } catch (err) {
    console.error('importAndMerge error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown merge failure',
      stats: {},
      totalChanges: 0,
    };
  }
}

