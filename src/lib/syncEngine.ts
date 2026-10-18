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
import { computeUserLevelAndRank } from './characterMath';
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

  const dailyXpDate = isIncomingNewer ? incoming.dailyXpDate : existing.dailyXpDate;
  const dailyXpEarned = isIncomingNewer ? incoming.dailyXpEarned : existing.dailyXpEarned;

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
 * Custom merger for LibraryItem ensuring the one-time XP grant is never forgotten:
 * once XP was awarded on any device, the item keeps xpAwarded=true so it can never pay out twice.
 */
export function mergeLibraryItems(
  existing: LibraryItem,
  incoming: LibraryItem,
  isIncomingNewer: boolean
): LibraryItem {
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

  const xp = Math.max(existing.xp || 0, incoming.xp || 0);
  const level = Math.max(existing.level || 1, incoming.level || 1);
  const streak = Math.max(existing.streak || 0, incoming.streak || 0);
  const totalCompleted = Math.max(existing.totalCompleted || 0, incoming.totalCompleted || 0);

  let base: Skill;
  if (isExistingFresh && !isIncomingFresh) {
    base = incoming;
  } else if (!isExistingFresh && isIncomingFresh) {
    base = existing;
  } else {
    base = isIncomingNewer ? incoming : existing;
  }

  return {
    ...base,
    xp,
    level,
    streak,
    totalCompleted,
    updatedAt: isIncomingNewer ? incoming.updatedAt : existing.updatedAt,
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
      const isIncomingNewer = normalizedIncomingTime > existingTime;

      if (customMerger) {
        const merged = customMerger(existing, incoming, isIncomingNewer);
        if (JSON.stringify(merged) !== JSON.stringify(existing)) {
          toPut.push(merged);
          updated++;
        } else {
          skipped++;
        }
      } else if (isIncomingNewer) {
        // Incoming is strictly newer: update
        toPut.push(incoming);
        updated++;
      } else if (normalizedIncomingTime === existingTime) {
        // Tie-breaker: tombstone deletion takes precedence over active record
        if (incoming.isDeleted && !existing.isDeleted) {
          toPut.push(incoming);
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Near-tie within 2000ms clock skew: if incoming is a deletion, allow delete to win
        const timeDiff = existingTime - normalizedIncomingTime;
        if (timeDiff <= 2000 && incoming.isDeleted && !existing.isDeleted) {
          toPut.push(incoming);
          updated++;
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
          stats.tasks = await mergeTableRecords<Task>(db.tasks, tables.tasks, sanitizeTask, mergeOptions);
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
          stats.habits = await mergeTableRecords<Habit>(db.habits, tables.habits, sanitizeHabit, mergeOptions);
        }

        // 6. Merge Achievements
        if (tables.achievements) {
          stats.achievements = await mergeTableRecords<Achievement>(db.achievements, tables.achievements, sanitizeAchievement, mergeOptions, mergeAchievements);
        }

        // 7. Merge User Profile
        if (tables.userProfile) {
          const profiles = Array.isArray(tables.userProfile) ? tables.userProfile : [tables.userProfile];
          stats.userProfile = await mergeTableRecords<UserProfile>(db.userProfile, profiles, sanitizeUserProfile, mergeOptions, mergeUserProfiles);
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
        for (const e of allEvents) {
          if (!e.isDeleted && e.habitId && e.date) {
            let set = datesByHabitId.get(e.habitId);
            if (!set) {
              set = new Set<string>();
              datesByHabitId.set(e.habitId, set);
            }
            set.add(e.date);
          }
        }

        // Compute streak updates in memory: O(H)
        const updatedHabits: Habit[] = allHabits.map((habit) => {
          const dateSet = datesByHabitId.get(habit.id);
          const dates = dateSet ? Array.from(dateSet).sort() : (habit.completedDates || []);
          const { current, longest } = calculateHabitStreak(dates);

          return {
            ...habit,
            completedDates: dates,
            streak: current,
            longestStreak: Math.max(habit.longestStreak || 0, longest),
          };
        });

        // Batch update all habits in one transaction: O(1) DB write
        if (updatedHabits.length > 0) {
          await db.habits.bulkPut(updatedHabits);
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
