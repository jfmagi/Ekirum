import Dexie, { type EntityTable } from 'dexie';
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
import {
  INITIAL_PROJECTS,
  INITIAL_SKILLS,
  INITIAL_TASKS,
  INITIAL_ACHIEVEMENTS,
  INITIAL_USER,
  INITIAL_HABITS,
  INITIAL_HABIT_EVENTS,
} from './seedData';
import {
  sanitizeTask,
  sanitizeProject,
  sanitizeSkill,
  sanitizeHabit,
  sanitizeAchievement,
  sanitizeUserProfile,
} from './schemaSanitizers';

export interface SettingRecord {
  key: string;
  value: any;
}

export class EkirumDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>;
  projects!: EntityTable<Project, 'id'>;
  skills!: EntityTable<Skill, 'id'>;
  habits!: EntityTable<Habit, 'id'>;
  habitEvents!: EntityTable<HabitEvent, 'id'>;
  achievements!: EntityTable<Achievement, 'id'>;
  userProfile!: EntityTable<UserProfile, 'id'>;
  libraryItems!: EntityTable<LibraryItem, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;

  constructor() {
    super('ekirum_db');

    // Schema version 1 with indexed search fields
    this.version(1).stores({
      tasks: 'id, projectId, dueDate, priority, completed, updatedAt, isDeleted',
      projects: 'id, skillId, updatedAt, isDeleted',
      skills: 'id, projectId, updatedAt, isDeleted',
      habits: 'id, projectId, frequency, updatedAt, isDeleted',
      habitEvents: 'id, habitId, date, [habitId+date], updatedAt, isDeleted',
      achievements: 'id, updatedAt',
      userProfile: 'id, updatedAt',
      settings: 'key',
    });

    // Schema version 2: adds the Library (reading list / watchlist)
    this.version(2).stores({
      libraryItems: 'id, type, status, updatedAt, isDeleted',
    });
  }
}

export const db = new EkirumDatabase();

/**
 * Request persistent browser storage so IndexedDB is not evicted under disk pressure.
 */
export async function requestStoragePersistence(): Promise<boolean> {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (isPersisted) return true;
      const granted = await navigator.storage.persist();
      return granted;
    } catch (e) {
      console.warn('Storage persistence request failed:', e);
    }
  }
  return false;
}

/**
 * Get or create persistent device ID (UUID).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await db.settings.get('deviceId');
  if (existing?.value) {
    return existing.value;
  }

  // Fallback check in localStorage
  let localId: string | null = null;
  if (typeof localStorage !== 'undefined') {
    localId = localStorage.getItem('ekirum-device-id');
    if (!localId) {
      // Migrate from any legacy key if present
      const legacyId =
        localStorage.getItem('ekitero-device-id') ||
        localStorage.getItem('taskocraft-device-id') ||
        localStorage.getItem('doist-device-id');
      if (legacyId) {
        localId = legacyId;
        localStorage.setItem('ekirum-device-id', legacyId);
      }
    }
    // Purge legacy keys
    localStorage.removeItem('ekitero-device-id');
    localStorage.removeItem('taskocraft-device-id');
    localStorage.removeItem('doist-device-id');
  }

  if (!localId) {
    localId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ekirum-device-id', localId);
    }
  }

  await db.settings.put({ key: 'deviceId', value: localId });
  return localId;
}

/**
 * Regenerate a fresh unique device ID for this browser instance.
 * Used when a device ID collision is detected or manually requested.
 */
export async function regenerateDeviceId(): Promise<string> {
  const newId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  await db.settings.put({ key: 'deviceId', value: newId });
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('ekirum-device-id', newId);
  }

  // Clear sync caches so this device re-scans and syncs all files under its new identity
  await db.settings.delete('deviceSyncMtimes');
  await db.settings.delete('lastExportedTablesHash');
  await db.settings.delete('lastWrittenDeviceFile');

  return newId;
}

/**
 * Initialize Dexie with initial data or migrate from localStorage if present.
 */
export async function initializeDatabase(): Promise<void> {
  await requestStoragePersistence();
  await getOrCreateDeviceId();

  // Check if database has already been initialized (either has existing data or explicit initialized marker)
  const isAlreadyInitialized =
    (typeof localStorage !== 'undefined' && localStorage.getItem('ekirum-db-initialized-v1') === 'true') ||
    (await db.userProfile.count()) > 0 ||
    (await db.tasks.count()) > 0 ||
    (await db.projects.count()) > 0;

  if (isAlreadyInitialized) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ekirum-db-initialized-v1', 'true');
    }
    return; // Already initialized: preserve existing state (including intentionally empty/cleared state)
  }

  // Check if legacy data exists in localStorage
  try {
    let rawLocal: string | null = null;
    if (typeof localStorage !== 'undefined') {
      rawLocal = localStorage.getItem('ekirum-storage-v1');
      if (!rawLocal) {
        const legacyData =
          localStorage.getItem('ekitero-storage-v1') ||
          localStorage.getItem('taskocraft-storage-v1') ||
          localStorage.getItem('doist-storage-v1');
        if (legacyData) {
          rawLocal = legacyData;
          localStorage.setItem('ekirum-storage-v1', legacyData);
        }
      }
      // Migrate legacy mock cleanup marker if present
      if (localStorage.getItem('doist-mock-cleaned-v1')) {
        localStorage.setItem('ekirum-mock-cleaned-v1', 'true');
        localStorage.removeItem('doist-mock-cleaned-v1');
      }
      // Clean up legacy storage keys
      localStorage.removeItem('ekitero-storage-v1');
      localStorage.removeItem('taskocraft-storage-v1');
      localStorage.removeItem('doist-storage-v1');
    }
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      const state = parsed.state;
      if (state && typeof state === 'object') {
        const sanitizedTasks = Array.isArray(state.tasks)
          ? state.tasks.map(sanitizeTask).filter((t: any): t is Task => t !== null)
          : [];

        if (sanitizedTasks.length > 0) {
          const sanitizedProjects = Array.isArray(state.projects)
            ? state.projects.map(sanitizeProject).filter((p: any): p is Project => p !== null)
            : [];
          const sanitizedSkills = Array.isArray(state.skills)
            ? state.skills.map(sanitizeSkill).filter((s: any): s is Skill => s !== null)
            : [];
          const sanitizedAchievements = Array.isArray(state.achievements)
            ? state.achievements.map(sanitizeAchievement).filter((a: any): a is Achievement => a !== null)
            : [];
          const sanitizedUser = state.user ? sanitizeUserProfile(state.user) : null;
          const sanitizedHabits = Array.isArray(state.habits)
            ? state.habits.map(sanitizeHabit).filter((h: any): h is Habit => h !== null)
            : [];

          await db.transaction('rw', [db.tasks, db.projects, db.skills, db.habits, db.habitEvents, db.achievements, db.userProfile], async () => {
            if (sanitizedTasks.length > 0) await db.tasks.bulkPut(sanitizedTasks);
            if (sanitizedProjects.length > 0) await db.projects.bulkPut(sanitizedProjects);
            if (sanitizedSkills.length > 0) await db.skills.bulkPut(sanitizedSkills);
            if (sanitizedAchievements.length > 0) await db.achievements.bulkPut(sanitizedAchievements);
            if (sanitizedUser) await db.userProfile.put(sanitizedUser);

            if (sanitizedHabits.length > 0) {
              await db.habits.bulkPut(sanitizedHabits);

              // Generate initial habit events from legacy completedDates
              const events: HabitEvent[] = [];
              const seenEvents = new Set<string>();
              for (const h of sanitizedHabits) {
                if (Array.isArray(h.completedDates)) {
                  for (const date of h.completedDates) {
                    const eventKey = `${h.id}_${date}`;
                    if (seenEvents.has(eventKey)) continue;
                    seenEvents.add(eventKey);

                    events.push({
                      id: `event-${h.id}-${date}`,
                      habitId: h.id,
                      date,
                      completedAt: `${date}T12:00:00.000Z`,
                      createdAt: `${date}T12:00:00.000Z`,
                      updatedAt: `${date}T12:00:00.000Z`,
                      isDeleted: false,
                    });
                  }
                }
              }
              if (events.length > 0) {
                await db.habitEvents.bulkPut(events);
              }
            }
          });
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ekirum-db-initialized-v1', 'true');
            localStorage.removeItem('ekirum-storage-v1');
          }
          return;
        }
      }
    }
  } catch (err) {
    console.warn('Migration from localStorage skipped:', err);
  }

  // Populate from Seed Data
  await db.transaction('rw', [db.tasks, db.projects, db.skills, db.habits, db.habitEvents, db.achievements, db.userProfile], async () => {
    await db.projects.bulkPut(INITIAL_PROJECTS);
    await db.skills.bulkPut(INITIAL_SKILLS);
    await db.habits.bulkPut(INITIAL_HABITS);
    await db.habitEvents.bulkPut(INITIAL_HABIT_EVENTS);
    await db.tasks.bulkPut(INITIAL_TASKS);
    await db.achievements.bulkPut(INITIAL_ACHIEVEMENTS);
    await db.userProfile.put(INITIAL_USER);
  });

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('ekirum-db-initialized-v1', 'true');
  }
}
