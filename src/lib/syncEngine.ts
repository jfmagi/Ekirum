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
import { computeUserLevelAndRank, calculateSkillLevel, getEkirumRankTitle } from './characterMath';
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
import { SEED_EPOCH_ISO, INITIAL_USER } from './seedData';

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
export async function exportAll(
  customDeviceId?: string,
  options?: { deviceClockOffsetMs?: number }
): Promise<BackupFile> {
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
    deviceClockOffsetMs: options?.deviceClockOffsetMs ?? 0,
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
 * 1. Progress monotonicity & CRDT additivity: newly completed tasks/habits/library items
 *    from both devices are credited additively without destroying concurrent progress.
 * 2. Unlocked achievements union: all achievements unlocked on any device stay unlocked.
 * 3. Identity protection: uncustomized default placeholders ('Ekirum' / 0 XP) never overwrite customized characters,
 *    and user customizations (name, avatar, theme) are determined by LWW rather than being overwritten by higher XP.
 */
export function mergeUserProfiles(
  existing: UserProfile,
  incoming: UserProfile,
  isIncomingNewer: boolean,
  incomingNewXpDelta: number = 0
): UserProfile {
  const existingXp = existing.totalXp || 0;
  const incomingXp = incoming.totalXp || 0;
  // Additive CRDT merge: newly completed tasks/habits/library from peer are added to existing XP,
  // while ensuring monotonicity against incoming.totalXp (handles clean pull from higher-progress peer)
  const totalXp = Math.max(existingXp + incomingNewXpDelta, incomingXp);

  const { level: derivedLevel } = computeUserLevelAndRank(totalXp);
  const ekirumLevel = Math.max(existing.ekirumLevel || 1, incoming.ekirumLevel || 1, derivedLevel);
  const ekirumRank = getEkirumRankTitle(ekirumLevel);

  const mergedAchievements = Array.from(
    new Set([...(existing.achievements || []), ...(incoming.achievements || [])])
  );

  const isExistingDefault =
    existing.name === 'Ekirum' && existingXp === 0 && !existing.onboardingCompleted && !existing.avatar;
  const isIncomingDefault =
    incoming.name === 'Ekirum' && incomingXp === 0 && !incoming.onboardingCompleted && !incoming.avatar;

  // Selection of user customizations: uncustomized default yields to customized;
  // otherwise LWW determines identity fields (name, avatar, theme).
  // NEVER use incomingXp > existingXp to overwrite user profile identity.
  let chosenProfile: UserProfile;
  if (isExistingDefault && !isIncomingDefault) {
    chosenProfile = incoming;
  } else if (!isExistingDefault && isIncomingDefault) {
    chosenProfile = existing;
  } else {
    chosenProfile = isIncomingNewer ? incoming : existing;
  }

  let dailyXpDate = isIncomingNewer ? incoming.dailyXpDate : existing.dailyXpDate;
  let dailyXpEarned = isIncomingNewer ? incoming.dailyXpEarned : existing.dailyXpEarned;
  if (existing.dailyXpDate && incoming.dailyXpDate && existing.dailyXpDate === incoming.dailyXpDate) {
    dailyXpDate = existing.dailyXpDate;
    dailyXpEarned = Math.min(500, Math.max(existing.dailyXpEarned || 0, incoming.dailyXpEarned || 0));
  }

  const result: UserProfile = {
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

  // If merged state took fields from both sides (differs from both existing and incoming),
  // advance updatedAt to now so peer devices immediately recognize and adopt the composite state.
  if (!isSubstantiveRecordEqual(result, existing) && !isSubstantiveRecordEqual(result, incoming)) {
    result.updatedAt = new Date().toISOString();
  }

  return result;
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
  const result: Achievement = {
    ...base,
    projectId: existing.projectId || incoming.projectId,
    unlockedAt,
    progress,
    xpClaimed,
    updatedAt: isIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  };

  if (!isSubstantiveRecordEqual(result, existing) && !isSubstantiveRecordEqual(result, incoming)) {
    result.updatedAt = new Date().toISOString();
  }

  return result;
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
    const result: LibraryItem = {
      ...base,
      xpAwarded,
      xpEarned: xpAwarded ? xpEarned : base.xpEarned,
      updatedAt: isIncomingNewer ? incoming.updatedAt : existing.updatedAt,
    };
    if (!isSubstantiveRecordEqual(result, existing) && !isSubstantiveRecordEqual(result, incoming)) {
      result.updatedAt = new Date().toISOString();
    }
    return result;
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

  const result: LibraryItem = {
    ...base,
    xpAwarded,
    xpEarned: xpAwarded ? xpEarned : base.xpEarned,
    updatedAt: isIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  };

  if (!isSubstantiveRecordEqual(result, existing) && !isSubstantiveRecordEqual(result, incoming)) {
    result.updatedAt = new Date().toISOString();
  }

  return result;
}

/**
 * Custom merger for Skill ensuring:
 * 1. Progress monotonicity & additivity: XP, level, and completions from newly arriving tasks
 *    are credited additively without destroying concurrent progress.
 * 2. Uncustomized placeholders don't overwrite customized skills.
 */
export function mergeSkills(
  existing: Skill,
  incoming: Skill,
  isIncomingNewer: boolean,
  options?: { deltaXp?: number; deltaCompletions?: number }
): Skill {
  const isExistingFresh = (existing.xp || 0) === 0 && (existing.level || 1) === 1;
  const isIncomingFresh = (incoming.xp || 0) === 0 && (incoming.level || 1) === 1;

  const existingXp = existing.xp || 0;
  const incomingXp = incoming.xp || 0;
  const deltaXp = options?.deltaXp || 0;
  const deltaCompletions = options?.deltaCompletions || 0;

  const xp = Math.max(existingXp + deltaXp, incomingXp);
  const derivedLevel = calculateSkillLevel(xp);
  const level = Math.max(existing.level || 1, incoming.level || 1, derivedLevel);
  const streak = Math.max(existing.streak || 0, incoming.streak || 0);
  const totalCompleted = Math.max((existing.totalCompleted || 0) + deltaCompletions, incoming.totalCompleted || 0);

  let base: Skill;
  if (isExistingFresh && !isIncomingFresh) {
    base = incoming;
  } else if (!isExistingFresh && isIncomingFresh) {
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

  const xpToNextLevel = level * level * 20;

  const result = cleanSkillUndefined({
    ...base,
    xp,
    level,
    xpToNextLevel,
    streak,
    lastCompletedDate,
    totalCompleted,
    updatedAt: isIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  });

  if (!isSubstantiveRecordEqual(result, existing) && !isSubstantiveRecordEqual(result, incoming)) {
    result.updatedAt = new Date().toISOString();
  }

  return result;
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
 * Key-order-independent canonical JSON serialization for comparing records,
 * ignoring updatedAt so mere timestamp advancement is not counted as a substantive change.
 */
export function isSubstantiveRecordEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const canonicalA = toCanonicalValue(a);
  const canonicalB = toCanonicalValue(b);
  if (canonicalA && typeof canonicalA === 'object' && !Array.isArray(canonicalA)) {
    delete canonicalA.updatedAt;
  }
  if (canonicalB && typeof canonicalB === 'object' && !Array.isArray(canonicalB)) {
    delete canonicalB.updatedAt;
  }
  return JSON.stringify(canonicalA) === JSON.stringify(canonicalB);
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
    if (incoming.isDeleted && !existing.isDeleted && timeDiff <= 30000) {
      return incoming;
    }
    return existing;
  }

  const effectiveIncomingNewer =
    isIncomingNewer || (existing.updatedAt === SEED_EPOCH_ISO && incoming.updatedAt !== SEED_EPOCH_ISO);

  let base = effectiveIncomingNewer ? incoming : existing;

  let completed = base.completed;
  let completedAt = base.completedAt;
  let uncompletedAt = base.uncompletedAt;
  let xpAwarded = base.xpAwarded;

  if (existing.completed && incoming.completed) {
    completed = true;
    completedAt = existing.completedAt && incoming.completedAt
      ? (new Date(existing.completedAt).getTime() < new Date(incoming.completedAt).getTime()
          ? existing.completedAt
          : incoming.completedAt)
      : existing.completedAt || incoming.completedAt || base.completedAt;
    uncompletedAt = undefined;
    xpAwarded = typeof existing.xpAwarded === 'number'
      ? existing.xpAwarded
      : typeof incoming.xpAwarded === 'number'
        ? incoming.xpAwarded
        : base.xpAwarded;
  } else if (!existing.completed && !incoming.completed) {
    completed = false;
    completedAt = undefined;
    uncompletedAt = existing.uncompletedAt && incoming.uncompletedAt
      ? (new Date(existing.uncompletedAt).getTime() > new Date(incoming.uncompletedAt).getTime()
          ? existing.uncompletedAt
          : incoming.uncompletedAt)
      : existing.uncompletedAt || incoming.uncompletedAt || base.uncompletedAt;
    xpAwarded = undefined;
  } else {
    // One record is completed and one is uncompleted
    const completedRecord = existing.completed ? existing : incoming;
    const uncompletedRecord = existing.completed ? incoming : existing;

    const completedTime = completedRecord.completedAt
      ? new Date(completedRecord.completedAt).getTime()
      : new Date(completedRecord.updatedAt || 0).getTime();

    // Check if the uncompleted record has an explicit uncompletedAt timestamp,
    // or if incoming is strictly newer and explicitly uncompleted
    const uncompletedTime = uncompletedRecord.uncompletedAt
      ? new Date(uncompletedRecord.uncompletedAt).getTime()
      : (uncompletedRecord === incoming && effectiveIncomingNewer)
        ? new Date(uncompletedRecord.updatedAt || 0).getTime()
        : 0;

    if (uncompletedTime > completedTime) {
      // The task was uncompleted strictly after the completion timestamp
      completed = false;
      completedAt = undefined;
      uncompletedAt = uncompletedRecord.uncompletedAt || uncompletedRecord.updatedAt;
      xpAwarded = undefined;
    } else {
      // The completion happened after the uncompletion, or incoming was completed and existing never uncompleted it (Test 13)
      completed = true;
      completedAt = completedRecord.completedAt || completedRecord.updatedAt || new Date().toISOString();
      uncompletedAt = undefined;
      xpAwarded = completedRecord.xpAwarded;
    }
  }

  // Merge subtask completion progress: if local task is newer but older incoming had completed subtasks,
  // ensure those completed subtasks are not lost (handles Test 13: lower-progress device with newer updatedAt).
  let subtasks = base.subtasks || [];
  if (!effectiveIncomingNewer && Array.isArray(existing.subtasks) && Array.isArray(incoming.subtasks)) {
    const incomingMap = new Map(incoming.subtasks.map((s) => [s.id, s]));
    subtasks = subtasks.map((s) => {
      const inc = incomingMap.get(s.id);
      if (inc && inc.completed && !s.completed) {
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
    ...(uncompletedAt !== undefined ? { uncompletedAt } : {}),
    ...(xpAwarded !== undefined ? { xpAwarded } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    subtasks,
    updatedAt: effectiveIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  };
  if (completedAt === undefined) {
    delete result.completedAt;
  }
  if (uncompletedAt === undefined) {
    delete result.uncompletedAt;
  }
  if (xpAwarded === undefined) {
    delete result.xpAwarded;
  }
  if (dueDate === undefined) {
    delete result.dueDate;
  }

  if (!isSubstantiveRecordEqual(result, existing) && !isSubstantiveRecordEqual(result, incoming)) {
    result.updatedAt = new Date().toISOString();
  }

  return result;
}

/**
 * Custom merger for Project ensuring:
 * 1. Tombstone deletions respect LWW and near-tie clock-skew rules.
 * 2. Seed epoch records always yield to user modifications.
 * 3. Project identity and edits (rename, color, icon, description) made on either device are preserved.
 * 4. Composite states advance updatedAt to now.
 */
export function mergeProjects(
  existing: Project,
  incoming: Project,
  isIncomingNewer: boolean
): Project {
  const existingTime = new Date(existing.updatedAt || 0).getTime();
  const incomingTime = new Date(incoming.updatedAt || 0).getTime();
  const timeDiff = existingTime - incomingTime;

  if (existing.isDeleted || incoming.isDeleted) {
    if (incomingTime === existingTime) {
      return incoming.isDeleted ? incoming : existing;
    }
    if (isIncomingNewer) return incoming;
    if (incoming.isDeleted && !existing.isDeleted && timeDiff <= 30000) {
      return incoming;
    }
    return existing;
  }

  const effectiveIncomingNewer =
    isIncomingNewer || (existing.updatedAt === SEED_EPOCH_ISO && incoming.updatedAt !== SEED_EPOCH_ISO);
  const base = effectiveIncomingNewer ? incoming : existing;
  const other = effectiveIncomingNewer ? existing : incoming;

  const result: Project = {
    ...base,
    skillId: base.skillId || other.skillId,
    color: base.color || other.color,
    icon: base.icon || other.icon,
    description: base.description !== undefined ? base.description : other.description,
    updatedAt: effectiveIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  };

  if (!isSubstantiveRecordEqual(result, existing) && !isSubstantiveRecordEqual(result, incoming)) {
    result.updatedAt = new Date().toISOString();
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
    if (incoming.isDeleted && !existing.isDeleted && timeDiff <= 30000) {
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

  const result: Habit = {
    ...base,
    completedDates,
    streak: datesChanged || effectiveIncomingNewer ? current : existing.streak,
    longestStreak,
    updatedAt: effectiveIncomingNewer ? incoming.updatedAt : existing.updatedAt,
  };

  if (!isSubstantiveRecordEqual(result, existing) && !isSubstantiveRecordEqual(result, incoming)) {
    result.updatedAt = new Date().toISOString();
  }

  return result;
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
    let rawIncomingTime = new Date(incoming.updatedAt || 0).getTime();
    let normalizedIncomingTime = rawIncomingTime - clockSkew;

    // Future-skew clamp: Never allow incoming timestamp to exceed localNow + 60s
    // If a record is authored far in the future (> 60s), clamp its updatedAt to prevent locking out future edits on other devices.
    if (rawIncomingTime > localNow + 60_000) {
      incoming.updatedAt = new Date(localNow).toISOString();
      rawIncomingTime = localNow;
      normalizedIncomingTime = localNow;
    } else if (normalizedIncomingTime > localNow + 60_000) {
      normalizedIncomingTime = localNow;
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
        const hasSubstantiveChange = !isSubstantiveRecordEqual(merged, existing);
        const hasTimestampChange = !isRecordEqual(merged, existing);
        if (hasSubstantiveChange) {
          toPut.push(merged);
          updated++;
        } else if (hasTimestampChange) {
          toPut.push(merged);
        } else {
          skipped++;
        }
      } else if (isStrictlyNewer) {
        const hasSubstantiveChange = !isSubstantiveRecordEqual(incoming, existing);
        const hasTimestampChange = !isRecordEqual(incoming, existing);
        if (hasSubstantiveChange) {
          toPut.push(incoming);
          updated++;
        } else if (hasTimestampChange) {
          toPut.push(incoming);
        } else {
          skipped++;
        }
      } else if (normalizedIncomingTime === existingTime) {
        // Tie-breaker: tombstone deletion takes precedence over active record
        if (incoming.isDeleted && !existing.isDeleted) {
          toPut.push(incoming);
          updated++;
        } else if (!isSubstantiveRecordEqual(incoming, existing)) {
          // If timestamps are identical but substantive contents differ, incoming update applies
          toPut.push(incoming);
          updated++;
        } else if (!isRecordEqual(incoming, existing)) {
          toPut.push(incoming);
        } else {
          skipped++;
        }
      } else {
        // Near-tie within 30000ms clock skew: allow deletions and task completions to win
        const timeDiff = existingTime - normalizedIncomingTime;
        if (timeDiff <= 30000) {
          if (incoming.isDeleted && !existing.isDeleted) {
            toPut.push(incoming);
            updated++;
          } else if ((incoming as any).completed && !(existing as any).completed) {
            toPut.push(incoming);
            updated++;
          } else if (existing.updatedAt === SEED_EPOCH_ISO && !isSubstantiveRecordEqual(incoming, existing)) {
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

    // Calculate clock skew between authoring device and local device:
    // If a payload explicitly supplies a measured deviceClockOffsetMs, respect it;
    // otherwise dynamically measure offset if exportedAt is in the future relative to localNow
    const localNow = Date.now();
    let clockSkewMs = typeof payload.deviceClockOffsetMs === 'number' ? payload.deviceClockOffsetMs : 0;
    if (!clockSkewMs && typeof payload.exportedAt === 'string') {
      const exportedMs = Date.parse(payload.exportedAt);
      if (!Number.isNaN(exportedMs) && exportedMs > localNow) {
        clockSkewMs = exportedMs - localNow;
      }
    }
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
        // Pre-scan existing records to identify newly arriving completions and calculate XP/skill deltas (RC1)
        let incomingNewXpDelta = 0;
        const incomingSkillXpDelta: Record<string, number> = {};
        const incomingSkillCompletionsDelta: Record<string, number> = {};

        // Build project -> skillId map for routing skill progress
        const projectSkillMap = new Map<string, string>();
        const existingProjects = await db.projects.toArray();
        for (const p of existingProjects) {
          if (p && p.id && p.skillId) {
            projectSkillMap.set(p.id, p.skillId);
          }
        }
        if (Array.isArray(tables.projects)) {
          for (const p of tables.projects) {
            if (p && p.id && p.skillId && !projectSkillMap.has(p.id)) {
              projectSkillMap.set(p.id, p.skillId);
            }
          }
        }

        // 1. Task completions delta
        if (Array.isArray(tables.tasks) && tables.tasks.length > 0) {
          const taskIds = tables.tasks.filter((t: any) => t && t.id).map((t: any) => t.id);
          const existingTasks = await db.tasks.bulkGet(taskIds);
          const existingTasksMap = new Map<string, Task>();
          for (const t of existingTasks) {
            if (t && t.id) existingTasksMap.set(t.id, t);
          }

          for (const raw of tables.tasks) {
            if (!raw || !raw.id || !raw.completed) continue;
            const existingTask = existingTasksMap.get(raw.id);
            const isUncompletedLocally = Boolean(
              existingTask?.uncompletedAt &&
                new Date(existingTask.uncompletedAt).getTime() >
                  new Date(raw.completedAt || raw.updatedAt || 0).getTime()
            );
            if (!isUncompletedLocally && (!existingTask || !existingTask.completed)) {
              // Newly completed task!
              let taskXp = 0;
              if (typeof raw.xpAwarded === 'number' && !isNaN(raw.xpAwarded) && raw.xpAwarded >= 0) {
                taskXp = raw.xpAwarded;
              } else {
                let potential = 10;
                if (raw.priority === 'p1') potential += 5;
                else if (raw.priority === 'p2') potential += 3;
                if (raw.dueDate) potential += 5;
                taskXp = potential;
              }
              incomingNewXpDelta += taskXp;
              const skillId = raw.projectId ? projectSkillMap.get(raw.projectId) : undefined;
              if (skillId) {
                incomingSkillXpDelta[skillId] = (incomingSkillXpDelta[skillId] || 0) + taskXp;
                incomingSkillCompletionsDelta[skillId] = (incomingSkillCompletionsDelta[skillId] || 0) + 1;
              }
            }
          }
        }

        // 2. Habit check-ins delta
        if (Array.isArray(tables.habits) && tables.habits.length > 0) {
          const habitIds = tables.habits.filter((h: any) => h && h.id).map((h: any) => h.id);
          const existingHabits = await db.habits.bulkGet(habitIds);
          const existingHabitsMap = new Map<string, Habit>();
          for (const h of existingHabits) {
            if (h && h.id) existingHabitsMap.set(h.id, h);
          }

          for (const raw of tables.habits) {
            if (!raw || !raw.id || !Array.isArray(raw.completedDates)) continue;
            const existingHabit = existingHabitsMap.get(raw.id);
            const existingDatesSet = new Set(existingHabit?.completedDates || []);
            let newCheckins = 0;
            for (const d of raw.completedDates) {
              if (typeof d === 'string' && !existingDatesSet.has(d)) {
                newCheckins++;
              }
            }
            if (newCheckins > 0) {
              const habitXp = newCheckins * 15;
              incomingNewXpDelta += habitXp;
              const skillId = raw.projectId ? projectSkillMap.get(raw.projectId) : undefined;
              if (skillId) {
                incomingSkillXpDelta[skillId] = (incomingSkillXpDelta[skillId] || 0) + habitXp;
                incomingSkillCompletionsDelta[skillId] = (incomingSkillCompletionsDelta[skillId] || 0) + newCheckins;
              }
            }
          }
        }

        // 3. Library items delta
        if (Array.isArray(tables.libraryItems) && tables.libraryItems.length > 0) {
          const itemIds = tables.libraryItems.filter((i: any) => i && i.id).map((i: any) => i.id);
          const existingItems = await db.libraryItems.bulkGet(itemIds);
          const existingItemsMap = new Map<string, LibraryItem>();
          for (const i of existingItems) {
            if (i && i.id) existingItemsMap.set(i.id, i);
          }

          for (const raw of tables.libraryItems) {
            if (!raw || !raw.id || !raw.xpAwarded) continue;
            const existingItem = existingItemsMap.get(raw.id);
            if (!existingItem || !existingItem.xpAwarded) {
              const libXp = raw.xpEarned || (raw.type === 'book' ? 100 : 50);
              incomingNewXpDelta += libXp;
              const skillId = raw.projectId ? projectSkillMap.get(raw.projectId) : undefined;
              if (skillId) {
                incomingSkillXpDelta[skillId] = (incomingSkillXpDelta[skillId] || 0) + libXp;
                incomingSkillCompletionsDelta[skillId] = (incomingSkillCompletionsDelta[skillId] || 0) + 1;
              }
            }
          }
        }

        // 4. Achievements delta
        if (Array.isArray(tables.achievements) && tables.achievements.length > 0) {
          const achIds = tables.achievements.filter((a: any) => a && a.id).map((a: any) => a.id);
          const existingAchs = await db.achievements.bulkGet(achIds);
          const existingAchsMap = new Map<string, Achievement>();
          for (const a of existingAchs) {
            if (a && a.id) existingAchsMap.set(a.id, a);
          }

          for (const raw of tables.achievements) {
            if (!raw || !raw.id || (!raw.unlocked && !raw.unlockedAt)) continue;
            const existingAch = existingAchsMap.get(raw.id);
            const wasUnlocked = Boolean(existingAch && (existingAch.unlockedAt || (existingAch as any).unlocked));
            if (!wasUnlocked) {
              const achXp = raw.xpReward || 0;
              incomingNewXpDelta += achXp;
            }
          }
        }
        // 1. Merge Tasks
        if (tables.tasks) {
          stats.tasks = await mergeTableRecords<Task>(db.tasks, tables.tasks, sanitizeTask, mergeOptions, mergeTasks);
        }

        // 2. Merge Projects
        if (tables.projects) {
          stats.projects = await mergeTableRecords<Project>(db.projects, tables.projects, sanitizeProject, mergeOptions, mergeProjects);
        }

        // 3. Merge Skills (additive CRDT delta progress)
        if (tables.skills) {
          stats.skills = await mergeTableRecords<Skill>(
            db.skills,
            tables.skills,
            sanitizeSkill,
            mergeOptions,
            (existing, incoming, isIncomingNewer) =>
              mergeSkills(existing, incoming, isIncomingNewer, {
                deltaXp: incomingSkillXpDelta[existing.id] || 0,
                deltaCompletions: incomingSkillCompletionsDelta[existing.id] || 0,
              })
          );
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
        if (tables.userProfile && (!Array.isArray(tables.userProfile) || tables.userProfile.length > 0)) {
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
              dedupedIncomingMap.set(prof.id, mergeUserProfiles(prev, prof, isNewer, incomingNewXpDelta));
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
              await db.userProfile.put(mergeUserProfiles(existingUser1, normalizedDefault, isNewer, incomingNewXpDelta));
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
            (existing, incoming, isIncomingNewer) =>
              mergeUserProfiles(existing, incoming, isIncomingNewer, incomingNewXpDelta)
          );
        } else if (incomingNewXpDelta > 0) {
          // Backup file did not contain userProfile table, but contained newly completed items that awarded XP
          const existingUser = (await db.userProfile.get('user-1')) || (await db.userProfile.toCollection().first()) || INITIAL_USER;
          const newXp = (existingUser.totalXp || 0) + incomingNewXpDelta;
          const { level } = computeUserLevelAndRank(newXp);
          const effectiveLevel = Math.max(existingUser.ekirumLevel || 1, level);
          const effectiveRank = getEkirumRankTitle(effectiveLevel);
          const updatedUser: UserProfile = {
            ...existingUser,
            id: 'user-1',
            totalXp: newXp,
            ekirumLevel: effectiveLevel,
            ekirumRank: effectiveRank,
            updatedAt: new Date().toISOString(),
          };
          await db.userProfile.put(updatedUser);
          stats.userProfile = { inserted: 0, updated: 1, skipped: 0 };
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

