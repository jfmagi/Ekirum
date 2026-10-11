import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  Task,
  Project,
  Skill,
  Achievement,
  UserProfile,
  ViewType,
  DisplayMode,
  Priority,
  Recurrence,
  Habit,
  HabitFrequency,
  HabitEvent,
  LibraryItem,
  LibraryItemType,
  LibraryDifficulty,
  DAILY_XP_CAP,
} from '../types';
import {
  INITIAL_PROJECTS,
  INITIAL_SKILLS,
  INITIAL_TASKS,
  INITIAL_ACHIEVEMENTS,
  INITIAL_USER,
  INITIAL_HABITS,
} from '../lib/seedData';
import { sound } from '../lib/sound';
import { db, initializeDatabase } from '../lib/db';
import { exportAll, importAndMerge } from '../lib/syncEngine';
import { evaluateAchievements, applySkillXpGains } from '../lib/achievements';
import { getLibraryXp } from '../lib/library';
import { formatLocalDate } from '../lib/dateParser';
export { formatLocalDate };
import {
  getBackupStatus,
  pickBackupDirectory,
  reconnectBackupDirectory,
  maybeBackupAndSync,
  BackupStatus,
} from '../lib/backupService';


export function calculateHabitStreak(completedDates: string[]): { current: number; longest: number } {
  if (!completedDates || completedDates.length === 0) return { current: 0, longest: 0 };

  const uniqueDates = Array.from(new Set(completedDates)).sort();
  const today = new Date();
  const todayStr = formatLocalDate(today);
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = formatLocalDate(yesterdayDate);

  const hasToday = uniqueDates.includes(todayStr);
  const hasYesterday = uniqueDates.includes(yesterdayStr);

  let currentStreak = 0;
  if (hasToday || hasYesterday) {
    const checkDate = hasToday ? new Date() : yesterdayDate;
    while (true) {
      const dateStr = formatLocalDate(checkDate);
      if (uniqueDates.includes(dateStr)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Calculate longest historical streak
  let longestStreak = 0;
  let tempStreak = 0;
  for (let i = 0; i < uniqueDates.length; i++) {
    if (i === 0) {
      tempStreak = 1;
    } else {
      const [py, pm, pd] = uniqueDates[i - 1].split('-').map(Number);
      const [cy, cm, cd] = uniqueDates[i].split('-').map(Number);
      const prev = new Date(py, pm - 1, pd);
      const curr = new Date(cy, cm - 1, cd);
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        tempStreak++;
      } else if (diffDays > 1) {
        tempStreak = 1;
      }
    }
    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }
  }

  return { current: currentStreak, longest: Math.max(longestStreak, currentStreak) };
}

export function getXpRequiredForLevel(level: number): number {
  return (level - 1) * (level - 1) * 20;
}

export function getXpRequiredForNextLevel(level: number): number {
  return level * level * 20;
}

import {
  EKIRUM_RANKS,
  type EkirumRank,
  getEkirumRankTitle,
  getSkillRankTitle,
  computeUserLevelAndRank,
  calculateSkillLevel,
} from '../lib/characterMath';

export {
  EKIRUM_RANKS,
  type EkirumRank,
  getEkirumRankTitle,
  getSkillRankTitle,
  computeUserLevelAndRank,
  calculateSkillLevel,
};

export function getNextRecurrenceDate(
  currentDueDate: string | undefined,
  recurrence: Recurrence,
  todayStr: string
): string {
  const baseStr = currentDueDate && currentDueDate > todayStr ? currentDueDate : todayStr;
  const [y, m, d] = baseStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  if (recurrence === 'daily') {
    date.setDate(date.getDate() + 1);
  } else if (recurrence === 'weekdays') {
    do {
      date.setDate(date.getDate() + 1);
    } while (date.getDay() === 0 || date.getDay() === 6);
  } else if (recurrence === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else if (recurrence === 'monthly') {
    let targetYear = y;
    let targetMonth = m; // m is 1-indexed (1 to 12)
    targetMonth += 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
    // In JS Date, day 0 of monthIndex M is the last day of month M-1
    // Passing targetMonth as the 0-day index returns the last day of targetMonth
    const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
    const targetDay = Math.min(d, daysInTargetMonth);
    const ny = targetYear;
    const nm = String(targetMonth).padStart(2, '0');
    const nd = String(targetDay).padStart(2, '0');
    return `${ny}-${nm}-${nd}`;
  }

  const ny = date.getFullYear();
  const nm = String(date.getMonth() + 1).padStart(2, '0');
  const nd = String(date.getDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

function generateUuid(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

interface CelebrationState {
  show: boolean;
  type: 'levelUp' | 'achievement' | 'task' | 'capReached';
  title: string;
  subtitle: string;
  xpEarned?: number;
  newLevel?: number;
}

export interface EkirumStore {
  // State
  tasks: Task[];
  projects: Project[];
  skills: Skill[];
  habits: Habit[];
  libraryItems: LibraryItem[];
  achievements: Achievement[];
  user: UserProfile;

  currentView: ViewType;
  selectedProjectId: string | null;
  displayMode: DisplayMode;
  searchQuery: string;
  selectedPriorityFilter: Priority | 'all';
  selectedLabelFilter: string | 'all';

  // Modals & Panels
  quickAddOpen: boolean;
  quickAddDefaultDate: string | null;
  commandPaletteOpen: boolean;
  taskDetailId: string | null;
  newProjectModalOpen: boolean;
  editingProjectId: string | null;
  backupModalOpen: boolean;
  helpModalOpen: boolean;
  newHabitModalOpen: boolean;
  editingHabitId: string | null;
  celebration: CelebrationState | null;
  mobileSidebarOpen: boolean;

  // Storage & Sync State
  backupStatus: BackupStatus | null;
  isSyncing: boolean;
  storageError: string | null;
  setStorageError: (error: string | null) => void;
  clearStorageError: () => void;

  // Actions - Views & Navigation
  setCurrentView: (view: ViewType, projectId?: string | null) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setSearchQuery: (query: string) => void;
  setPriorityFilter: (priority: Priority | 'all') => void;
  setLabelFilter: (label: string | 'all') => void;
  setQuickAddOpen: (open: boolean, defaultDueDate?: string | null) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  openTaskDetail: (taskId: string | null) => void;
  setNewProjectModalOpen: (open: boolean) => void;
  setEditingProjectId: (id: string | null) => void;
  setBackupModalOpen: (open: boolean) => void;
  setHelpModalOpen: (open: boolean) => void;
  setNewHabitModalOpen: (open: boolean) => void;
  setEditingHabitId: (id: string | null) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  dismissCelebration: () => void;
  toggleSound: () => void;
  onboardingModalOpen: boolean;
  setOnboardingModalOpen: (open: boolean) => void;
  completeOnboarding: (name: string, avatar?: string) => Promise<void>;

  // Deletion Undo Safety
  deletedTaskToast: { task: Task; timeoutId?: any } | null;
  undoDeleteTask: () => void;
  dismissDeletedTaskToast: () => void;

  // Actions - Tasks
  addTask: (data: {
    title: string;
    projectId?: string;
    notes?: string;
    dueDate?: string;
    dueTime?: string;
    recurrence?: Recurrence;
    priority?: Priority;
    labels?: string[];
    section?: string;
  }) => Task;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleTaskComplete: (id: string) => Promise<void> | void;
  reorderTasks: (activeId: string, overId: string) => void;
  setTaskSection: (id: string, section: string) => void;

  // Actions - Subtasks
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  addSubtask: (taskId: string, title: string) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;

  // Actions - Projects & Skills
  createProject: (name: string, color?: string, icon?: string, description?: string) => Project;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  updateSkill: (id: string, updates: Partial<Skill>) => void;

  // Actions - Habits
  addHabit: (data: {
    title: string;
    description?: string;
    projectId?: string;
    frequency?: HabitFrequency;
    color?: string;
    icon?: string;
  }) => Habit;
  toggleHabitDate: (habitId: string, dateStr: string) => Promise<void>;
  updateHabit: (id: string, updates: Partial<Habit>) => void;
  deleteHabit: (id: string) => void;

  // Actions - Library (reading list / watchlist)
  addLibraryItem: (data: {
    title: string;
    type: LibraryItemType;
    creator?: string;
    url?: string;
    notes?: string;
    difficulty?: LibraryDifficulty;
    projectId?: string;
  }) => LibraryItem;
  updateLibraryItem: (id: string, updates: Partial<LibraryItem>) => void;
  deleteLibraryItem: (id: string) => void;
  completeLibraryItem: (id: string, details?: { review?: string; finishedDate?: string }) => Promise<void>;
  reopenLibraryItem: (id: string) => void;

  // Actions - Storage, Backup & Serverless Sync
  initStorage: () => Promise<void>;
  syncWithDatabase: () => Promise<void>;
  refreshBackupStatus: () => Promise<void>;
  selectBackupFolder: () => Promise<{ success: boolean; name?: string; error?: string }>;
  reconnectBackupFolder: () => Promise<boolean>;
  triggerBackupAndSync: (force?: boolean) => Promise<boolean>;

  // Actions - Manual Export & Merge
  exportBackupJson: () => Promise<string>;
  importBackupJson: (jsonString: string) => Promise<{
    success: boolean;
    error?: string;
    stats?: { tasks: number; projects: number; habits: number; skills: number };
  }>;
  restoreSafetySnapshot: () => Promise<boolean>;

  // Utilities
  evaluateAndSyncAchievements: () => void;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  clearAllData: () => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

const inFlightTaskActions = new Set<string>();
const inFlightHabitActions = new Set<string>();
const inFlightLibraryActions = new Set<string>();

/**
 * Centralized recurrence invariant:
 * - Creates an immutable completed archive task with a guaranteed unique UUID
 * - Advances the active recurring task due date while preserving its original ID
 */
export function advanceRecurringTask(
  task: Task,
  todayStr: string,
  nowIso: string
): { completedArchiveTask: Task; activeRecurringTask: Task } {
  const nextDueDate = getNextRecurrenceDate(task.dueDate, task.recurrence || 'daily', todayStr);
  const archiveId = generateUuid('task');

  const completedArchiveTask: Task = {
    ...task,
    id: archiveId,
    completed: true,
    completedAt: nowIso,
    recurrence: 'none',
    updatedAt: nowIso,
  };

  const activeRecurringTask: Task = {
    ...task,
    dueDate: nextDueDate,
    completed: false,
    completedAt: undefined,
    updatedAt: nowIso,
  };

  return { completedArchiveTask, activeRecurringTask };
}

export const useEkirumStore = create<EkirumStore>()(
  persist(
    (set, get) => {
      const handleStorageError = (error: unknown, actionDesc = 'saving data') => {
        console.warn(`[Storage Error] Failed while ${actionDesc}:`, error);
        const msg = error instanceof Error ? error.message : String(error);
        set({
          storageError: `Persistence warning (${actionDesc}): ${msg}. Local changes are held in memory.`,
        });
      };
      const saveCatch = (desc?: string) => (err: unknown) => handleStorageError(err, desc);

      return {
        tasks: INITIAL_TASKS,
        projects: INITIAL_PROJECTS,
        skills: INITIAL_SKILLS,
        habits: INITIAL_HABITS,
        libraryItems: [],
        achievements: INITIAL_ACHIEVEMENTS,
        user: INITIAL_USER,

        currentView: 'today',
        selectedProjectId: null,
        displayMode: 'list',
        searchQuery: '',
        selectedPriorityFilter: 'all',
        selectedLabelFilter: 'all',

        quickAddOpen: false,
        quickAddDefaultDate: null,
        commandPaletteOpen: false,
        taskDetailId: null,
        newProjectModalOpen: false,
        editingProjectId: null,
        backupModalOpen: false,
        helpModalOpen: false,
        newHabitModalOpen: false,
        editingHabitId: null,
        celebration: null,
        mobileSidebarOpen: false,
        onboardingModalOpen: false,

        backupStatus: null,
        isSyncing: false,
        storageError: null,
        setStorageError: (error: string | null) => set({ storageError: error }),
        clearStorageError: () => set({ storageError: null }),
        deletedTaskToast: null,

      setCurrentView: (view, projectId = null) => {
        const newDisplayMode = (view === 'calendar' || view === 'upcoming') ? 'calendar' : 'list';
        set({
          currentView: view,
          selectedProjectId: projectId,
          displayMode: newDisplayMode,
          mobileSidebarOpen: false,
        });
      },

      setDisplayMode: (mode) => set({ displayMode: mode }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setPriorityFilter: (priority) => set({ selectedPriorityFilter: priority }),
      setLabelFilter: (label) => set({ selectedLabelFilter: label }),
      setQuickAddOpen: (open, defaultDueDate = null) => {
        set({ quickAddOpen: open, quickAddDefaultDate: open ? (defaultDueDate || null) : null });
      },
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      openTaskDetail: (taskId) => set({ taskDetailId: taskId }),
      setNewProjectModalOpen: (open) => set({ newProjectModalOpen: open }),
      setEditingProjectId: (id) => set({ editingProjectId: id }),
      setBackupModalOpen: (open) => set({ backupModalOpen: open }),
      setHelpModalOpen: (open) => set({ helpModalOpen: open }),
      setNewHabitModalOpen: (open) => set({ newHabitModalOpen: open }),
      setEditingHabitId: (id) => set({ editingHabitId: id }),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      dismissCelebration: () => set({ celebration: null }),
      setOnboardingModalOpen: (open) => set({ onboardingModalOpen: open }),

      completeOnboarding: async (name: string, avatar?: string) => {
        const trimmedName = name.trim() || 'Ekirum';
        const updates: Partial<UserProfile> = {
          name: trimmedName,
          onboardingCompleted: true,
        };
        if (avatar !== undefined) {
          updates.avatar = avatar;
        }
        get().updateUserProfile(updates);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('ekirum_onboarded_v1', 'true');
        }
        set({ onboardingModalOpen: false });
      },

      toggleSound: () => {
        const current = get().user.soundEnabled;
        sound.setEnabled(!current);
        const updated = { ...get().user, soundEnabled: !current, updatedAt: new Date().toISOString() };
        set({ user: updated });
        db.userProfile.put(updated).catch(saveCatch('updating sound settings'));
      },

      evaluateAndSyncAchievements: () => {
        const { tasks, skills, habits, achievements, user, projects, libraryItems } = get();
        const { updatedAchievements, newlyUnlocked, earnedXpBonus, hasChanges, projectSkillXpGains } = evaluateAchievements(
          tasks,
          skills,
          habits,
          achievements,
          user,
          projects,
          libraryItems
        );
        const { updatedSkills } = applySkillXpGains(skills, projectSkillXpGains);
        const hasSkillGains = Boolean(projectSkillXpGains && Object.keys(projectSkillXpGains).length > 0);
        if (!hasChanges && !hasSkillGains) {
          return;
        }
        let updatedUser = user;
        let celebration = get().celebration;
        if (newlyUnlocked.length > 0 || earnedXpBonus > 0) {
          const unlockedIds = newlyUnlocked.map((a) => a.id);
          const currentAchIds = new Set(user.achievements || []);
          unlockedIds.forEach((achId) => currentAchIds.add(achId));
          const newUserXp = user.totalXp + earnedXpBonus;
          const { level: newLevel, rank: newRank } = computeUserLevelAndRank(newUserXp);
          updatedUser = {
            ...user,
            totalXp: newUserXp,
            ekirumLevel: newLevel,
            ekirumRank: newRank,
            achievements: Array.from(currentAchIds),
            updatedAt: new Date().toISOString(),
          };
          db.userProfile.put(updatedUser).catch(saveCatch('updating user profile'));

          if (newlyUnlocked.length > 0 && !celebration) {
            sound.playLevelUp();
            const firstAch = newlyUnlocked[0];
            celebration = {
              show: true,
              type: 'achievement' as const,
              title: newlyUnlocked.length > 1 ? `${firstAch.title} (+${newlyUnlocked.length - 1} more)` : firstAch.title,
              subtitle: firstAch.description,
              xpEarned: earnedXpBonus > 0 ? earnedXpBonus : (firstAch.xpReward || 0),
            };
          }
        }
        if (hasSkillGains) {
          db.skills.bulkPut(updatedSkills).catch(saveCatch('updating skills'));
        }
        db.achievements.bulkPut(updatedAchievements).catch(saveCatch('updating achievements'));
        set({ achievements: updatedAchievements, user: updatedUser, skills: updatedSkills, celebration });
      },

      updateUserProfile: (updates) => {
        const current = get().user;
        const updatedUser: UserProfile = {
          ...current,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
        set({ user: updatedUser });
        db.userProfile.put(updatedUser).catch(saveCatch('updating user profile'));
      },

      initStorage: async () => {
        try {
          if (typeof localStorage !== 'undefined') {
            if (localStorage.getItem('doist-mock-cleaned-v1')) {
              localStorage.removeItem('doist-mock-cleaned-v1');
              localStorage.setItem('ekirum-mock-cleaned-v1', 'true');
            }
          }
          await initializeDatabase();
          await get().syncWithDatabase();

          // Check if first-time onboarding should be presented
          const currentUser = get().user;
          const currentTasks = get().tasks;
          const isMarkedOnboarded =
            currentUser.onboardingCompleted ||
            (typeof localStorage !== 'undefined' && localStorage.getItem('ekirum_onboarded_v1') === 'true');

          if (!isMarkedOnboarded && currentTasks.length === 0 && currentUser.totalXp === 0) {
            set({ onboardingModalOpen: true });
          }

          await get().refreshBackupStatus();
          // Lifecycle check: auto backup if > 24h & sync foreign devices
          await maybeBackupAndSync(false);
          await get().refreshBackupStatus();
        } catch (e) {
          console.error('Storage initialization failed:', e);
        }
      },

      syncWithDatabase: async () => {
        try {
          const [allTasks, allProjects, allSkills, allHabits, allAchievements, allUsers, allLibrary] =
            await Promise.all([
              db.tasks.toArray(),
              db.projects.toArray(),
              db.skills.toArray(),
              db.habits.toArray(),
              db.achievements.toArray(),
              db.userProfile.toArray(),
              db.libraryItems.toArray(),
            ]);

          const activeLibrary = allLibrary.filter((i) => !i.isDeleted);
          const activeTasks = allTasks.filter((t) => !t.isDeleted);
          const activeProjects = allProjects.filter((p) => !p.isDeleted);
          const activeSkills = allSkills.filter((s) => !s.isDeleted);
          const activeHabits = allHabits.filter((h) => !h.isDeleted);
          const currentUser = allUsers[0] || INITIAL_USER;
          const currentAchs = allAchievements.length > 0 ? allAchievements : INITIAL_ACHIEVEMENTS;

          const { updatedAchievements, newlyUnlocked, earnedXpBonus, hasChanges, projectSkillXpGains } = evaluateAchievements(
            activeTasks,
            activeSkills,
            activeHabits,
            currentAchs,
            currentUser,
            activeProjects,
            activeLibrary
          );

          const { updatedSkills } = applySkillXpGains(activeSkills, projectSkillXpGains);
          if (projectSkillXpGains && Object.keys(projectSkillXpGains).length > 0) {
            db.skills.bulkPut(updatedSkills).catch(saveCatch('updating skills'));
          }

          if (newlyUnlocked.length > 0 || earnedXpBonus > 0) {
            const unlockedIds = newlyUnlocked.map((a) => a.id);
            const currentAchIds = new Set(currentUser.achievements || []);
            unlockedIds.forEach((id) => currentAchIds.add(id));
            const newUserXp = currentUser.totalXp + earnedXpBonus;
            const { level: newLevel, rank: newRank } = computeUserLevelAndRank(newUserXp);
            currentUser.totalXp = newUserXp;
            currentUser.ekirumLevel = newLevel;
            currentUser.ekirumRank = newRank;
            currentUser.achievements = Array.from(currentAchIds);
            db.userProfile.put(currentUser).catch(saveCatch('updating user profile'));
          }

          if (hasChanges) {
            db.achievements.bulkPut(updatedAchievements).catch(saveCatch('updating achievements'));
          }

          set({
            tasks: activeTasks,
            projects: activeProjects,
            skills: updatedSkills,
            habits: activeHabits,
            libraryItems: activeLibrary,
            achievements: updatedAchievements,
            user: currentUser,
          });
        } catch (err) {
          handleStorageError(err, 'synchronizing database');
        }
      },

      refreshBackupStatus: async () => {
        try {
          const status = await getBackupStatus();
          set({ backupStatus: status });
        } catch (err) {
          console.warn('Refresh backup status error:', err);
        }
      },

      selectBackupFolder: async () => {
        set({ isSyncing: true });
        const res = await pickBackupDirectory();
        await get().refreshBackupStatus();
        set({ isSyncing: false });
        return res;
      },

      reconnectBackupFolder: async () => {
        set({ isSyncing: true });
        const ok = await reconnectBackupDirectory();
        if (ok) {
          await get().syncWithDatabase();
        }
        await get().refreshBackupStatus();
        set({ isSyncing: false });
        return ok;
      },

      triggerBackupAndSync: async (force = true) => {
        set({ isSyncing: true });
        const res = await maybeBackupAndSync(force);
        if (res) {
          await get().syncWithDatabase();
        }
        await get().refreshBackupStatus();
        set({ isSyncing: false });
        return res;
      },

      addTask: (data) => {
        const state = get();
        const projects = state.projects;
        const defaultProjectId =
          data.projectId ||
          (state.currentView === 'project' && state.selectedProjectId ? state.selectedProjectId : null) ||
          (projects[0] ? projects[0].id : 'inbox');

        // 2. Determine effective due date:
        // Tasks with recurrence (daily, weekdays, weekly, monthly) must be scheduled starting today if no date is given.
        // Dateless non-recurring tasks remain dateless (dueDate: undefined).
        let effectiveDueDate = data.dueDate;
        if (!effectiveDueDate && data.recurrence && data.recurrence !== 'none') {
          const now = new Date();
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, '0');
          const d = String(now.getDate()).padStart(2, '0');
          effectiveDueDate = `${y}-${m}-${d}`;
        }

        const now = new Date().toISOString();

        const newTask: Task = {
          id: generateUuid('task'),
          projectId: defaultProjectId,
          title: data.title.trim(),
          notes: data.notes || '',
          dueDate: effectiveDueDate,
          dueTime: data.dueTime,
          recurrence: data.recurrence || 'none',
          priority: data.priority || 'p4',
          labels: data.labels || [],
          completed: false,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
          subtasks: [],
          section: data.section || 'To Do',
        };

        set((s) => ({
          tasks: [newTask, ...s.tasks],
        }));

        db.tasks.put(newTask).catch(saveCatch('creating task'));
        sound.playClick();
        return newTask;
      },

      updateTask: (id, updates) => {
        const now = new Date().toISOString();
        const updatedTask = { ...updates, updatedAt: now };

        // If recurrence is being assigned to a dateless task, auto-assign today as initial schedule
        if (updates.recurrence && updates.recurrence !== 'none') {
          const existing = get().tasks.find((t) => t.id === id);
          if (existing && !existing.dueDate && !updates.dueDate) {
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            updatedTask.dueDate = `${y}-${m}-${d}`;
          }
        }

        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...updatedTask } : t)),
        }));

        db.tasks.update(id, updatedTask).catch(saveCatch('updating task'));
      },

      deleteTask: (id) => {
        const task = get().tasks.find((t) => t.id === id);
        const now = new Date().toISOString();
        const currentToast = get().deletedTaskToast;
        if (currentToast?.timeoutId) {
          clearTimeout(currentToast.timeoutId);
        }

        set((state) => ({
          tasks: state.tasks.filter((t) => t.id !== id),
          taskDetailId: state.taskDetailId === id ? null : state.taskDetailId,
          deletedTaskToast: task ? { task } : null,
        }));

        // Soft delete tombstone in Dexie
        db.tasks.update(id, { isDeleted: true, deletedAt: now, updatedAt: now }).catch(saveCatch('deleting task'));

        if (task) {
          const timeoutId = setTimeout(() => {
            set((state) => (state.deletedTaskToast?.task.id === task.id ? { deletedTaskToast: null } : {}));
          }, 6000);
          set({ deletedTaskToast: { task, timeoutId } });
        }
      },

      undoDeleteTask: () => {
        const toast = get().deletedTaskToast;
        if (!toast?.task) return;
        if (toast.timeoutId) clearTimeout(toast.timeoutId);

        const restoredTask = {
          ...toast.task,
          isDeleted: false,
          deletedAt: undefined,
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          tasks: [restoredTask, ...state.tasks.filter((t) => t.id !== restoredTask.id)],
          deletedTaskToast: null,
        }));

        db.tasks.put(restoredTask).catch(saveCatch('restoring task'));
        sound.playClick();
      },

      dismissDeletedTaskToast: () => {
        const toast = get().deletedTaskToast;
        if (toast?.timeoutId) clearTimeout(toast.timeoutId);
        set({ deletedTaskToast: null });
      },

      toggleTaskComplete: async (id) => {
        if (inFlightTaskActions.has(id)) return;
        inFlightTaskActions.add(id);

        try {
          const { tasks, projects, skills, user } = get();
          const task = tasks.find((t) => t.id === id);
          if (!task) return;

          const isNowCompleted = !task.completed;
          const now = new Date().toISOString();
          const todayStr = formatLocalDate();

          if (!isNowCompleted) {
            // Uncompleting a task
            const updated = { ...task, completed: false, completedAt: undefined, updatedAt: now };
            set((state) => ({
              tasks: state.tasks.map((t) => (t.id === id ? updated : t)),
            }));
            await db.tasks.put(updated).catch(saveCatch('updating task completion'));
            sound.playClick();
            return;
          }

          // Completing a task
          sound.playTaskComplete();

          const currentDailyEarned = user.dailyXpDate === todayStr ? (user.dailyXpEarned || 0) : 0;
          const remainingCap = Math.max(0, DAILY_XP_CAP - currentDailyEarned);

          let potentialXp = 10;
          if (task.priority === 'p1') potentialXp += 5;
          else if (task.priority === 'p2') potentialXp += 3;

          if (task.dueDate && task.dueDate >= todayStr) {
            potentialXp += 5; // Timeliness bonus
          }

          const earnedXp = Math.min(potentialXp, remainingCap);
          const newDailyEarned = currentDailyEarned + earnedXp;

          const isRecurring = Boolean(task.recurrence && task.recurrence !== 'none');
          let completedArchiveTask: Task | null = null;
          let activeRecurringTask: Task | null = null;
          let completedTask: Task | null = null;

          if (isRecurring) {
            const recurringRes = advanceRecurringTask(task, todayStr, now);
            completedArchiveTask = recurringRes.completedArchiveTask;
            activeRecurringTask = recurringRes.activeRecurringTask;
          } else {
            completedTask = {
              ...task,
              completed: true,
              completedAt: now,
              updatedAt: now,
            };
          }

          let updatedSkills = [...skills];
          let leveledUpSkillName: string | null = null;
          let leveledUpNewLevel: number | null = null;

          if (task.projectId) {
            const project = projects.find((p) => p.id === task.projectId);
            if (project) {
              const skillIndex = skills.findIndex((s) => s.id === project.skillId);
              if (skillIndex !== -1) {
                const skill = skills[skillIndex];
                const oldLevel = skill.level;
                const newXp = skill.xp + earnedXp;
                const newLevel = calculateSkillLevel(newXp);
                const xpToNext = getXpRequiredForNextLevel(newLevel);

                const lastDate = skill.lastCompletedDate;
                let newStreak = skill.streak;
                if (lastDate !== todayStr) {
                  const yesterdayDate = new Date();
                  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
                  const yesterday = formatLocalDate(yesterdayDate);
                  newStreak = lastDate === yesterday ? skill.streak + 1 : 1;
                }

                if (newLevel > oldLevel) {
                  leveledUpSkillName = skill.name;
                  leveledUpNewLevel = newLevel;
                }

                const updatedSkill: Skill = {
                  ...skill,
                  xp: newXp,
                  level: newLevel,
                  xpToNextLevel: xpToNext,
                  streak: newStreak,
                  lastCompletedDate: todayStr,
                  totalCompleted: skill.totalCompleted + 1,
                  updatedAt: now,
                };

                updatedSkills[skillIndex] = updatedSkill;
              }
            }
          }

          const newUserXp = user.totalXp + earnedXp;
          const newEkirumLevel = Math.max(1, Math.floor(Math.sqrt(newUserXp / 30)) + 1);
          const newEkirumRank = getEkirumRankTitle(newEkirumLevel);

          let updatedUser: UserProfile = {
            ...user,
            totalXp: newUserXp,
            ekirumLevel: newEkirumLevel,
            ekirumRank: newEkirumRank,
            dailyXpDate: todayStr,
            dailyXpEarned: newDailyEarned,
            updatedAt: now,
          };

          const updatedTasks = isRecurring && completedArchiveTask && activeRecurringTask
            ? [
                completedArchiveTask,
                ...get().tasks.map((t) => (t.id === id ? activeRecurringTask! : t)),
              ]
            : get().tasks.map((t) => (t.id === id ? completedTask! : t));

          const { updatedAchievements, newlyUnlocked, earnedXpBonus, hasChanges, projectSkillXpGains } = evaluateAchievements(
            updatedTasks,
            updatedSkills,
            get().habits,
            get().achievements,
            updatedUser,
            get().projects,
            get().libraryItems
          );

          const { updatedSkills: finalSkills, leveledUpSkills: projLeveledUpSkills } = applySkillXpGains(
            updatedSkills,
            projectSkillXpGains
          );

          if (newlyUnlocked.length > 0 || earnedXpBonus > 0) {
            const unlockedIds = newlyUnlocked.map((a) => a.id);
            const currentAchIds = new Set(updatedUser.achievements || []);
            unlockedIds.forEach((achId) => currentAchIds.add(achId));
            const finalUserXp = updatedUser.totalXp + earnedXpBonus;
            const { level: finalLevel, rank: finalRank } = computeUserLevelAndRank(finalUserXp);
            updatedUser = {
              ...updatedUser,
              totalXp: finalUserXp,
              ekirumLevel: finalLevel,
              ekirumRank: finalRank,
              achievements: Array.from(currentAchIds),
            };
          }

          let activeLeveledUpName = leveledUpSkillName;
          let activeLeveledUpNewLevel = leveledUpNewLevel;
          if (!activeLeveledUpName && projLeveledUpSkills.length > 0) {
            activeLeveledUpName = projLeveledUpSkills[0].name;
            activeLeveledUpNewLevel = projLeveledUpSkills[0].newLevel;
          }

          let celebration = null;
          if (activeLeveledUpName && activeLeveledUpNewLevel) {
            sound.playLevelUp();
            const firstAch = newlyUnlocked.length > 0 ? newlyUnlocked[0] : null;
            celebration = {
              show: true,
              type: 'levelUp' as const,
              title: `${activeLeveledUpName} Advanced`,
              subtitle: firstAch
                ? `Reached Level ${activeLeveledUpNewLevel} (${getSkillRankTitle(activeLeveledUpNewLevel)}) · Unlocked: ${firstAch.title}`
                : `Reached Level ${activeLeveledUpNewLevel} (${getSkillRankTitle(activeLeveledUpNewLevel)})`,
              xpEarned: earnedXp + earnedXpBonus,
              newLevel: activeLeveledUpNewLevel,
            };
          } else if (newlyUnlocked.length > 0) {
            sound.playLevelUp();
            const firstAch = newlyUnlocked[0];
            celebration = {
              show: true,
              type: 'achievement' as const,
              title: newlyUnlocked.length > 1 ? `${firstAch.title} (+${newlyUnlocked.length - 1} more)` : firstAch.title,
              subtitle: firstAch.description,
              xpEarned: earnedXpBonus > 0 ? earnedXpBonus : (firstAch.xpReward || 0),
            };
          } else if (currentDailyEarned < DAILY_XP_CAP && newDailyEarned >= DAILY_XP_CAP) {
            celebration = {
              show: true,
              type: 'capReached' as const,
              title: 'Daily Mastery Cap Reached',
              subtitle: `You reached today's ${DAILY_XP_CAP} XP ceiling. Mindful pacing preserved — stellar focus today!`,
              xpEarned: earnedXp,
            };
          }

          // 1. Synchronous state update for immediate UI reactivity
          set(() => ({
            tasks: updatedTasks,
            skills: finalSkills,
            achievements: updatedAchievements,
            user: updatedUser,
            celebration,
          }));

          // 2. Atomic IndexedDB transaction across all affected tables
          await db.transaction('rw', [db.tasks, db.skills, db.achievements, db.userProfile], async () => {
            if (isRecurring && completedArchiveTask && activeRecurringTask) {
              await db.tasks.bulkPut([completedArchiveTask, activeRecurringTask]);
            } else if (completedTask) {
              await db.tasks.put(completedTask);
            }
            if (finalSkills.length > 0) {
              await db.skills.bulkPut(finalSkills);
            }
            if (hasChanges) {
              await db.achievements.bulkPut(updatedAchievements);
            }
            await db.userProfile.put(updatedUser);
          }).catch(saveCatch('completing task'));
        } finally {
          inFlightTaskActions.delete(id);
        }
      },

      reorderTasks: (activeId, overId) => {
        set((state) => {
          const oldIndex = state.tasks.findIndex((t) => t.id === activeId);
          const newIndex = state.tasks.findIndex((t) => t.id === overId);
          if (oldIndex === -1 || newIndex === -1) return state;

          const updatedTasks = [...state.tasks];
          const [moved] = updatedTasks.splice(oldIndex, 1);
          updatedTasks.splice(newIndex, 0, moved);

          const now = new Date().toISOString();
          const indexed = updatedTasks.map((t, idx) => ({ ...t, order: idx, updatedAt: now }));

          indexed.forEach((t) => db.tasks.update(t.id, { order: t.order, updatedAt: now }).catch(saveCatch('reordering tasks')));
          return { tasks: indexed };
        });
      },

      setTaskSection: (id, section) => {
        const now = new Date().toISOString();
        set((state) => ({
          tasks: state.tasks.map((t) => (t.id === id ? { ...t, section, updatedAt: now } : t)),
        }));
        db.tasks.update(id, { section, updatedAt: now }).catch(saveCatch('updating task section'));
      },

      toggleSubtask: (taskId, subtaskId) => {
        const now = new Date().toISOString();
        set((state) => ({
          tasks: state.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const updatedSubtasks = t.subtasks.map((st) =>
              st.id === subtaskId ? { ...st, completed: !st.completed } : st
            );
            const updated = { ...t, subtasks: updatedSubtasks, updatedAt: now };
            db.tasks.put(updated).catch(saveCatch('updating subtask'));
            return updated;
          }),
        }));
        sound.playClick();
      },

      addSubtask: (taskId, title) => {
        const now = new Date().toISOString();
        const newSubtask = {
          id: generateUuid('sub'),
          title,
          completed: false,
        };

        set((state) => ({
          tasks: state.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const updated = { ...t, subtasks: [...t.subtasks, newSubtask], updatedAt: now };
            db.tasks.put(updated).catch(saveCatch('adding subtask'));
            return updated;
          }),
        }));
      },

      deleteSubtask: (taskId, subtaskId) => {
        const now = new Date().toISOString();
        set((state) => ({
          tasks: state.tasks.map((t) => {
            if (t.id !== taskId) return t;
            const updated = {
              ...t,
              subtasks: t.subtasks.filter((st) => st.id !== subtaskId),
              updatedAt: now,
            };
            db.tasks.put(updated).catch(saveCatch('deleting subtask'));
            return updated;
          }),
        }));
      },

      createProject: (name, color = '#8B1528', icon = 'Layers', description) => {
        const now = new Date().toISOString();
        const projectId = generateUuid('proj');
        const skillId = generateUuid('skill');

        const newSkill: Skill = {
          id: skillId,
          projectId,
          name,
          level: 1,
          xp: 0,
          xpToNextLevel: 20,
          icon,
          streak: 0,
          totalCompleted: 0,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        };

        const newProject: Project = {
          id: projectId,
          name,
          color,
          icon,
          skillId,
          description,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        };

        const updatedProjects = [...get().projects, newProject];
        const updatedSkills = [...get().skills, newSkill];

        const { updatedAchievements, newlyUnlocked, earnedXpBonus, projectSkillXpGains } = evaluateAchievements(
          get().tasks,
          updatedSkills,
          get().habits,
          get().achievements,
          get().user,
          updatedProjects,
          get().libraryItems
        );

        const { updatedSkills: finalSkills } = applySkillXpGains(updatedSkills, projectSkillXpGains);

        let updatedUser = get().user;
        if (newlyUnlocked.length > 0 || earnedXpBonus > 0) {
          const unlockedIds = newlyUnlocked.map((a) => a.id);
          const currentAchIds = new Set(updatedUser.achievements || []);
          unlockedIds.forEach((achId) => currentAchIds.add(achId));
          const newUserXp = updatedUser.totalXp + earnedXpBonus;
          const { level: newLevel, rank: newRank } = computeUserLevelAndRank(newUserXp);
          updatedUser = {
            ...updatedUser,
            totalXp: newUserXp,
            ekirumLevel: newLevel,
            ekirumRank: newRank,
            achievements: Array.from(currentAchIds),
            updatedAt: now,
          };
          db.userProfile.put(updatedUser).catch(saveCatch('updating user profile'));
        }

        let celebration = null;
        if (newlyUnlocked.length > 0) {
          sound.playLevelUp();
          const firstAch = newlyUnlocked[0];
          celebration = {
            show: true,
            type: 'achievement' as const,
            title: newlyUnlocked.length > 1 ? `${firstAch.title} (+${newlyUnlocked.length - 1} more)` : firstAch.title,
            subtitle: firstAch.description,
            xpEarned: earnedXpBonus > 0 ? earnedXpBonus : (firstAch.xpReward || 0),
          };
        } else {
          sound.playClick();
        }

        set(() => ({
          projects: updatedProjects,
          skills: finalSkills,
          achievements: updatedAchievements,
          user: updatedUser,
          newProjectModalOpen: false,
          celebration: celebration || get().celebration,
        }));

        db.projects.put(newProject).catch(saveCatch('creating project'));
        db.skills.bulkPut(finalSkills).catch(saveCatch('creating skill'));
        db.achievements.bulkPut(updatedAchievements).catch(saveCatch('updating achievements'));

        return newProject;
      },

      updateProject: (id, updates) => {
        const now = new Date().toISOString();
        set((state) => {
          const updatedProjects = state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: now } : p
          );

          const targetProject = updatedProjects.find((p) => p.id === id);
          let updatedSkills = state.skills;

          if (targetProject) {
            updatedSkills = state.skills.map((s) => {
              if (s.id === targetProject.skillId) {
                const updatedSkill = {
                  ...s,
                  name: updates.name !== undefined ? updates.name : s.name,
                  icon: updates.icon !== undefined ? updates.icon : s.icon,
                  updatedAt: now,
                };
                db.skills.put(updatedSkill).catch(saveCatch('updating project skill'));
                return updatedSkill;
              }
              return s;
            });
            db.projects.update(id, { ...updates, updatedAt: now }).catch(saveCatch('updating project'));
          }

          const { updatedAchievements, hasChanges } = evaluateAchievements(
            state.tasks,
            updatedSkills,
            state.habits,
            state.achievements,
            state.user,
            updatedProjects,
            state.libraryItems
          );
          if (hasChanges) {
            db.achievements.bulkPut(updatedAchievements).catch(saveCatch('updating achievements'));
          }

          return { projects: updatedProjects, skills: updatedSkills, achievements: updatedAchievements };
        });
      },

      deleteProject: (id) => {
        const now = new Date().toISOString();
        set((state) => {
          const project = state.projects.find((p) => p.id === id);
          if (!project) return state;

          db.projects.update(id, { isDeleted: true, deletedAt: now, updatedAt: now }).catch(saveCatch('deleting project'));
          db.skills.update(project.skillId, { isDeleted: true, deletedAt: now, updatedAt: now }).catch(saveCatch('deleting project skill'));

          // Soft delete tasks under this project
          state.tasks
            .filter((t) => t.projectId === id)
            .forEach((t) => db.tasks.update(t.id, { isDeleted: true, deletedAt: now, updatedAt: now }).catch(saveCatch('deleting project tasks')));

          // Prune unearned achievements for deleted project from Dexie
          db.achievements
            .where('id')
            .startsWith(`ach-project-${id}-`)
            .and((a) => !a.unlockedAt)
            .delete()
            .catch(saveCatch('pruning deleted project achievements'));

          const updatedProjects = state.projects.filter((p) => p.id !== id);
          const updatedSkills = state.skills.filter((s) => s.id !== project.skillId);
          const updatedTasks = state.tasks.filter((t) => t.projectId !== id);

          const { updatedAchievements, hasChanges } = evaluateAchievements(
            updatedTasks,
            updatedSkills,
            state.habits,
            state.achievements,
            state.user,
            updatedProjects,
            state.libraryItems
          );
          if (hasChanges) {
            db.achievements.bulkPut(updatedAchievements).catch(saveCatch('updating achievements'));
          }

          return {
            projects: updatedProjects,
            skills: updatedSkills,
            tasks: updatedTasks,
            achievements: updatedAchievements,
            selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
            currentView: state.selectedProjectId === id ? 'today' : state.currentView,
          };
        });
      },

      updateSkill: (id, updates) => {
        const now = new Date().toISOString();
        set((state) => ({
          skills: state.skills.map((s) => (s.id === id ? { ...s, ...updates, updatedAt: now } : s)),
        }));
        db.skills.update(id, { ...updates, updatedAt: now }).catch(saveCatch('updating skill'));
      },

      addHabit: (data) => {
        const now = new Date().toISOString();
        const newHabit: Habit = {
          id: generateUuid('habit'),
          title: data.title.trim(),
          description: data.description?.trim(),
          projectId: data.projectId,
          frequency: data.frequency || 'daily',
          completedDates: [],
          streak: 0,
          longestStreak: 0,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
          color: data.color || '#8B1528',
          icon: data.icon || 'Compass',
        };

        set((state) => ({
          habits: [newHabit, ...state.habits],
          newHabitModalOpen: false,
        }));

        db.habits.put(newHabit).catch(saveCatch('creating habit'));
        sound.playClick();
        return newHabit;
      },

      toggleHabitDate: async (habitId, dateStr) => {
        const lockKey = `${habitId}_${dateStr}`;
        if (inFlightHabitActions.has(lockKey)) return;
        inFlightHabitActions.add(lockKey);

        try {
          const { habits, projects, skills, user } = get();
          const habit = habits.find((h) => h.id === habitId);
          if (!habit) return;

          const now = new Date().toISOString();
          const alreadyCompleted = habit.completedDates.includes(dateStr);

          // Find existing event in IndexedDB if any
          const existingEvent = await db.habitEvents
            .where({ habitId, date: dateStr })
            .first();

          if (alreadyCompleted) {
            // Uncheck date: soft-delete the habitEvent
            const updatedDates = habit.completedDates.filter((d) => d !== dateStr);
            const { current, longest } = calculateHabitStreak(updatedDates);
            const updatedHabit = {
              ...habit,
              completedDates: updatedDates,
              streak: current,
              longestStreak: longest,
              updatedAt: now,
            };

            set((state) => ({
              habits: state.habits.map((h) => (h.id === habitId ? updatedHabit : h)),
            }));

            await db.transaction('rw', [db.habits, db.habitEvents], async () => {
              if (existingEvent) {
                await db.habitEvents.update(existingEvent.id, {
                  isDeleted: true,
                  deletedAt: now,
                  updatedAt: now,
                });
              }
              await db.habits.put(updatedHabit);
            }).catch(saveCatch('unchecking habit'));

            sound.playClick();
            return;
          }

          // Check in for date: create or revive atomic HabitEvent record
          let eventToSave: HabitEvent;
          if (existingEvent) {
            eventToSave = {
              ...existingEvent,
              isDeleted: false,
              deletedAt: undefined,
              completedAt: now,
              updatedAt: now,
            };
          } else {
            eventToSave = {
              id: generateUuid('event'),
              habitId,
              date: dateStr,
              completedAt: now,
              createdAt: now,
              updatedAt: now,
              isDeleted: false,
            };
          }

          const updatedDates = Array.from(new Set([...habit.completedDates, dateStr])).sort();
          const { current, longest } = calculateHabitStreak(updatedDates);
          sound.playTaskComplete();

          // Habit check-in XP is excluded from the daily XP cap (the cap applies solely to tasks)
          const earnedXp = current >= 3 ? 15 : 10;

          let updatedSkills = [...skills];
          let leveledUpSkillName: string | null = null;
          let leveledUpNewLevel: number | null = null;

          if (habit.projectId) {
            const project = projects.find((p) => p.id === habit.projectId);
            if (project) {
              const skillIndex = skills.findIndex((s) => s.id === project.skillId);
              if (skillIndex !== -1) {
                const skill = skills[skillIndex];
                const oldLevel = skill.level;
                const newXp = skill.xp + earnedXp;
                const newLevel = calculateSkillLevel(newXp);
                const xpToNext = getXpRequiredForNextLevel(newLevel);

                if (newLevel > oldLevel) {
                  leveledUpSkillName = skill.name;
                  leveledUpNewLevel = newLevel;
                }

                const updatedSkill: Skill = {
                  ...skill,
                  xp: newXp,
                  level: newLevel,
                  xpToNextLevel: xpToNext,
                  totalCompleted: skill.totalCompleted + 1,
                  updatedAt: now,
                };

                updatedSkills[skillIndex] = updatedSkill;
              }
            }
          }

          const newUserXp = user.totalXp + earnedXp;
          const newEkirumLevel = Math.max(1, Math.floor(Math.sqrt(newUserXp / 30)) + 1);
          const newEkirumRank = getEkirumRankTitle(newEkirumLevel);

          let updatedUser: UserProfile = {
            ...user,
            totalXp: newUserXp,
            ekirumLevel: newEkirumLevel,
            ekirumRank: newEkirumRank,
            updatedAt: now,
          };

          const updatedHabit: Habit = {
            ...habit,
            completedDates: updatedDates,
            streak: current,
            longestStreak: Math.max(habit.longestStreak || 0, longest),
            updatedAt: now,
          };

          const updatedHabits = get().habits.map((h) => (h.id === habitId ? updatedHabit : h));

          const { updatedAchievements, newlyUnlocked, earnedXpBonus, hasChanges, projectSkillXpGains } = evaluateAchievements(
            get().tasks,
            updatedSkills,
            updatedHabits,
            get().achievements,
            updatedUser,
            get().projects,
            get().libraryItems
          );

          const { updatedSkills: finalSkills, leveledUpSkills: projLeveledUpSkills } = applySkillXpGains(
            updatedSkills,
            projectSkillXpGains
          );

          if (newlyUnlocked.length > 0 || earnedXpBonus > 0) {
            const unlockedIds = newlyUnlocked.map((a) => a.id);
            const currentAchIds = new Set(updatedUser.achievements || []);
            unlockedIds.forEach((achId) => currentAchIds.add(achId));
            const finalUserXp = updatedUser.totalXp + earnedXpBonus;
            const { level: finalLevel, rank: finalRank } = computeUserLevelAndRank(finalUserXp);
            updatedUser = {
              ...updatedUser,
              totalXp: finalUserXp,
              ekirumLevel: finalLevel,
              ekirumRank: finalRank,
              achievements: Array.from(currentAchIds),
            };
          }

          let activeLeveledUpName = leveledUpSkillName;
          let activeLeveledUpNewLevel = leveledUpNewLevel;
          if (!activeLeveledUpName && projLeveledUpSkills.length > 0) {
            activeLeveledUpName = projLeveledUpSkills[0].name;
            activeLeveledUpNewLevel = projLeveledUpSkills[0].newLevel;
          }

          let celebration = null;
          if (activeLeveledUpName && activeLeveledUpNewLevel) {
            sound.playLevelUp();
            const firstAch = newlyUnlocked.length > 0 ? newlyUnlocked[0] : null;
            celebration = {
              show: true,
              type: 'levelUp' as const,
              title: `${activeLeveledUpName} Advanced`,
              subtitle: firstAch
                ? `Daily ritual consistency elevated your skill to Level ${activeLeveledUpNewLevel} (${getSkillRankTitle(activeLeveledUpNewLevel)}) · Unlocked: ${firstAch.title}`
                : `Daily ritual consistency elevated your skill to Level ${activeLeveledUpNewLevel} (${getSkillRankTitle(activeLeveledUpNewLevel)})`,
              xpEarned: earnedXp + earnedXpBonus,
              newLevel: activeLeveledUpNewLevel,
            };
          } else if (newlyUnlocked.length > 0) {
            sound.playLevelUp();
            const firstAch = newlyUnlocked[0];
            celebration = {
              show: true,
              type: 'achievement' as const,
              title: newlyUnlocked.length > 1 ? `${firstAch.title} (+${newlyUnlocked.length - 1} more)` : firstAch.title,
              subtitle: firstAch.description,
              xpEarned: earnedXpBonus > 0 ? earnedXpBonus : (firstAch.xpReward || 0),
            };
          }

          // 1. Synchronous state update for immediate UI feedback
          set(() => ({
            habits: updatedHabits,
            skills: finalSkills,
            achievements: updatedAchievements,
            user: updatedUser,
            celebration,
          }));

          // 2. Atomic IndexedDB transaction across all affected tables
          await db.transaction('rw', [db.habits, db.habitEvents, db.skills, db.achievements, db.userProfile], async () => {
            await db.habitEvents.put(eventToSave);
            await db.habits.put(updatedHabit);
            if (finalSkills.length > 0) {
              await db.skills.bulkPut(finalSkills);
            }
            if (hasChanges) {
              await db.achievements.bulkPut(updatedAchievements);
            }
            await db.userProfile.put(updatedUser);
          }).catch(saveCatch('checking in habit'));
        } finally {
          inFlightHabitActions.delete(lockKey);
        }
      },

      updateHabit: (id, updates) => {
        const now = new Date().toISOString();
        set((state) => ({
          habits: state.habits.map((h) => (h.id === id ? { ...h, ...updates, updatedAt: now } : h)),
          editingHabitId: null,
        }));
        db.habits.update(id, { ...updates, updatedAt: now }).catch(saveCatch('updating habit'));
      },

      deleteHabit: (id) => {
        const now = new Date().toISOString();
        set((state) => ({
          habits: state.habits.filter((h) => h.id !== id),
          editingHabitId: state.editingHabitId === id ? null : state.editingHabitId,
        }));
        db.habits.update(id, { isDeleted: true, deletedAt: now, updatedAt: now }).catch(saveCatch('deleting habit'));
      },

      addLibraryItem: (data) => {
        const now = new Date().toISOString();
        const newItem: LibraryItem = {
          id: generateUuid('lib'),
          title: data.title.trim(),
          type: data.type,
          creator: data.creator?.trim() || undefined,
          url: data.url?.trim() || undefined,
          notes: data.notes?.trim() || undefined,
          difficulty: data.difficulty ?? 1,
          projectId: data.projectId || undefined,
          status: 'todo',
          xpAwarded: false,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        };
        set((state) => ({ libraryItems: [newItem, ...state.libraryItems] }));
        db.libraryItems.put(newItem).catch(saveCatch('adding library item'));
        sound.playClick();
        return newItem;
      },

      updateLibraryItem: (id, updates) => {
        const now = new Date().toISOString();
        set((state) => ({
          libraryItems: state.libraryItems.map((i) => (i.id === id ? { ...i, ...updates, updatedAt: now } : i)),
        }));
        db.libraryItems.update(id, { ...updates, updatedAt: now }).catch(saveCatch('updating library item'));
      },

      deleteLibraryItem: (id) => {
        const now = new Date().toISOString();
        set((state) => ({ libraryItems: state.libraryItems.filter((i) => i.id !== id) }));
        db.libraryItems.update(id, { isDeleted: true, deletedAt: now, updatedAt: now }).catch(saveCatch('deleting library item'));
      },

      reopenLibraryItem: (id) => {
        // XP already awarded is kept (no clawback); xpAwarded stays true so re-finishing never pays twice.
        const now = new Date().toISOString();
        const updates = { status: 'todo' as const, updatedAt: now };
        set((state) => ({
          libraryItems: state.libraryItems.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        }));
        db.libraryItems.update(id, updates).catch(saveCatch('reopening library item'));
        sound.playClick();
      },

      completeLibraryItem: async (id, details = {}) => {
        if (inFlightLibraryActions.has(id)) return;
        inFlightLibraryActions.add(id);

        try {
          const { libraryItems, projects, skills, user } = get();
          const item = libraryItems.find((i) => i.id === id);
          if (!item || item.status === 'done') return;

          const now = new Date().toISOString();
          const grantXp = !item.xpAwarded;
          const earnedXp = grantXp ? getLibraryXp(item.type, item.difficulty) : 0;

          const updatedItem: LibraryItem = {
            ...item,
            status: 'done',
            review: details.review?.trim() || undefined,
            finishedDate: details.finishedDate || formatLocalDate(),
            completedAt: now,
            xpAwarded: true,
            xpEarned: grantXp ? earnedXp : item.xpEarned,
            updatedAt: now,
          };
          const updatedItems = libraryItems.map((i) => (i.id === id ? updatedItem : i));

          // XP goes to the character and, when linked, to the project's skill.
          // Library XP is a one-time reward and bypasses the daily task XP cap.
          let updatedSkills = [...skills];
          let leveledUpSkillName: string | null = null;
          let leveledUpNewLevel: number | null = null;

          if (grantXp && item.projectId) {
            const project = projects.find((p) => p.id === item.projectId);
            const skillIndex = project ? skills.findIndex((s) => s.id === project.skillId) : -1;
            if (skillIndex !== -1) {
              const skill = skills[skillIndex];
              const newXp = skill.xp + earnedXp;
              const newLevel = calculateSkillLevel(newXp);
              if (newLevel > skill.level) {
                leveledUpSkillName = skill.name;
                leveledUpNewLevel = newLevel;
              }
              updatedSkills[skillIndex] = {
                ...skill,
                xp: newXp,
                level: newLevel,
                xpToNextLevel: getXpRequiredForNextLevel(newLevel),
                totalCompleted: skill.totalCompleted + 1,
                updatedAt: now,
              };
            }
          }

          const newUserXp = user.totalXp + earnedXp;
          const { level: newEkirumLevel, rank: newEkirumRank } = computeUserLevelAndRank(newUserXp);
          let updatedUser: UserProfile = {
            ...user,
            totalXp: newUserXp,
            ekirumLevel: newEkirumLevel,
            ekirumRank: newEkirumRank,
            updatedAt: now,
          };

          const { updatedAchievements, newlyUnlocked, earnedXpBonus, hasChanges, projectSkillXpGains } = evaluateAchievements(
            get().tasks,
            updatedSkills,
            get().habits,
            get().achievements,
            updatedUser,
            get().projects,
            updatedItems
          );

          const { updatedSkills: finalSkills, leveledUpSkills: projLeveledUpSkills } = applySkillXpGains(
            updatedSkills,
            projectSkillXpGains
          );

          if (newlyUnlocked.length > 0 || earnedXpBonus > 0) {
            const currentAchIds = new Set(updatedUser.achievements || []);
            newlyUnlocked.forEach((a) => currentAchIds.add(a.id));
            const finalUserXp = updatedUser.totalXp + earnedXpBonus;
            const { level: finalLevel, rank: finalRank } = computeUserLevelAndRank(finalUserXp);
            updatedUser = {
              ...updatedUser,
              totalXp: finalUserXp,
              ekirumLevel: finalLevel,
              ekirumRank: finalRank,
              achievements: Array.from(currentAchIds),
            };
          }

          let activeLeveledUpName = leveledUpSkillName;
          let activeLeveledUpNewLevel = leveledUpNewLevel;
          if (!activeLeveledUpName && projLeveledUpSkills.length > 0) {
            activeLeveledUpName = projLeveledUpSkills[0].name;
            activeLeveledUpNewLevel = projLeveledUpSkills[0].newLevel;
          }

          const noun = item.type === 'book' ? 'Finished reading' : 'Finished watching';
          let celebration = get().celebration;
          if (activeLeveledUpName && activeLeveledUpNewLevel) {
            sound.playLevelUp();
            const firstAch = newlyUnlocked.length > 0 ? newlyUnlocked[0] : null;
            celebration = {
              show: true,
              type: 'levelUp' as const,
              title: `${activeLeveledUpName} Advanced`,
              subtitle: firstAch
                ? `${noun} "${item.title}" elevated your skill to Level ${activeLeveledUpNewLevel} (${getSkillRankTitle(activeLeveledUpNewLevel)}) · Unlocked: ${firstAch.title}`
                : `${noun} "${item.title}" elevated your skill to Level ${activeLeveledUpNewLevel} (${getSkillRankTitle(activeLeveledUpNewLevel)})`,
              xpEarned: earnedXp + earnedXpBonus,
              newLevel: activeLeveledUpNewLevel,
            };
          } else if (newlyUnlocked.length > 0) {
            sound.playLevelUp();
            const firstAch = newlyUnlocked[0];
            celebration = {
              show: true,
              type: 'achievement' as const,
              title: newlyUnlocked.length > 1 ? `${firstAch.title} (+${newlyUnlocked.length - 1} more)` : firstAch.title,
              subtitle: firstAch.description,
              xpEarned: earnedXpBonus > 0 ? earnedXpBonus + earnedXp : (firstAch.xpReward || 0),
            };
          } else {
            sound.playTaskComplete();
          }

          set({
            libraryItems: updatedItems,
            skills: finalSkills,
            achievements: updatedAchievements,
            user: updatedUser,
            celebration,
          });

          await db.transaction('rw', [db.libraryItems, db.skills, db.achievements, db.userProfile], async () => {
            await db.libraryItems.put(updatedItem);
            if (finalSkills.length > 0) {
              await db.skills.bulkPut(finalSkills);
            }
            if (hasChanges) {
              await db.achievements.bulkPut(updatedAchievements);
            }
            await db.userProfile.put(updatedUser);
          }).catch(saveCatch('finishing library item'));
        } finally {
          inFlightLibraryActions.delete(id);
        }
      },

      exportBackupJson: async () => {
        const backupData = await exportAll();
        return JSON.stringify(backupData, null, 2);
      },

      importBackupJson: async (jsonString: string) => {
        try {
          const parsed = JSON.parse(jsonString);

          // Save safety snapshot in IndexedDB settings (and localStorage as fallback)
          try {
            const currentExport = await exportAll();
            const snapshotData = {
              format: 'ekirum-safety-snapshot',
              savedAt: new Date().toISOString(),
              data: currentExport,
            };

            await db.settings.put({
              key: 'safetySnapshot',
              value: snapshotData,
            });

            // Fallback copy in localStorage if within quota limit
            try {
              localStorage.setItem('ekirum-safety-snapshot', JSON.stringify(snapshotData));
            } catch {
              // Ignore localStorage quota errors since IndexedDB holds the primary snapshot
            }
          } catch (e) {
            console.warn('Safety snapshot error:', e);
          }

          const mergeRes = await importAndMerge(parsed);
          if (!mergeRes.success) {
            return { success: false, error: mergeRes.error || 'Failed to merge backup data.' };
          }

          await get().syncWithDatabase();
          sound.playLevelUp();

          // Also trigger backup write to sync folder if configured
          maybeBackupAndSync(true).catch(saveCatch('folder backup after import'));

          const { tasks, projects, habits, skills } = get();
          return {
            success: true,
            stats: {
              tasks: tasks.length,
              projects: projects.length,
              habits: habits.length,
              skills: skills.length,
            },
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : 'Invalid JSON file content.',
          };
        }
      },

      restoreSafetySnapshot: async () => {
        try {
          // 1. Try IndexedDB settings table first (unbounded storage quota)
          const record = await db.settings.get('safetySnapshot');
          let data = record?.value?.data || record?.value;

          // 2. Fallback to localStorage if not found in IndexedDB
          if (!data && typeof localStorage !== 'undefined') {
            let raw = localStorage.getItem('ekirum-safety-snapshot');
            if (!raw) {
              const legacy =
                localStorage.getItem('ekitero-safety-snapshot') ||
                localStorage.getItem('taskocraft-safety-snapshot') ||
                localStorage.getItem('doist-safety-snapshot');
              if (legacy) {
                raw = legacy;
                localStorage.setItem('ekirum-safety-snapshot', legacy);
              }
            }
            localStorage.removeItem('ekitero-safety-snapshot');
            localStorage.removeItem('taskocraft-safety-snapshot');
            localStorage.removeItem('doist-safety-snapshot');

            if (raw) {
              const parsed = JSON.parse(raw);
              data = parsed.data || parsed;
            }
          }

          if (!data) return false;

          const res = await importAndMerge(data);
          if (res.success) {
            await get().syncWithDatabase();
            sound.playClick();
            return true;
          }
          return false;
        } catch (err) {
          console.warn('restoreSafetySnapshot error:', err);
          return false;
        }
      },

      clearAllData: async () => {
        try {
          await db.transaction(
            'rw',
            [db.tasks, db.projects, db.skills, db.habits, db.habitEvents, db.achievements, db.userProfile, db.libraryItems],
            async () => {
              await db.tasks.clear();
              await db.projects.clear();
              await db.skills.clear();
              await db.habits.clear();
              await db.habitEvents.clear();
              await db.achievements.clear();
              await db.userProfile.clear();
              await db.libraryItems.clear();

              await db.achievements.bulkPut(INITIAL_ACHIEVEMENTS);
              await db.userProfile.put(INITIAL_USER);
            }
          );

          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('ekirum-storage-v1');
            localStorage.removeItem('ekirum-safety-snapshot');
            localStorage.removeItem('ekirum-mock-cleaned-v1');
            // Purge any legacy keys
            localStorage.removeItem('ekitero-storage-v1');
            localStorage.removeItem('taskocraft-storage-v1');
            localStorage.removeItem('doist-storage-v1');
            localStorage.removeItem('ekitero-safety-snapshot');
            localStorage.removeItem('taskocraft-safety-snapshot');
            localStorage.removeItem('doist-safety-snapshot');
            localStorage.removeItem('doist-mock-cleaned-v1');
            // Explicitly preserve initialization marker so reload never re-seeds default data
            localStorage.setItem('ekirum-db-initialized-v1', 'true');
          }

          set({
            tasks: [],
            projects: [],
            skills: [],
            habits: [],
            libraryItems: [],
            achievements: INITIAL_ACHIEVEMENTS,
            user: INITIAL_USER,
            currentView: 'today',
            selectedProjectId: null,
            taskDetailId: null,
            editingProjectId: null,
            editingHabitId: null,
          });
        } catch (err) {
          console.error('Failed to clear data:', err);
        }
      },

      resetToDefaults: async () => {
        await db.transaction(
          'rw',
          [db.tasks, db.projects, db.skills, db.habits, db.habitEvents, db.achievements, db.userProfile, db.libraryItems],
          async () => {
            await db.tasks.clear();
            await db.projects.clear();
            await db.skills.clear();
            await db.habits.clear();
            await db.habitEvents.clear();
            await db.achievements.clear();
            await db.userProfile.clear();
            await db.libraryItems.clear();

            await db.projects.bulkPut(INITIAL_PROJECTS);
            await db.skills.bulkPut(INITIAL_SKILLS);
            await db.habits.bulkPut(INITIAL_HABITS);
            await db.tasks.bulkPut(INITIAL_TASKS);
            await db.achievements.bulkPut(INITIAL_ACHIEVEMENTS);
            await db.userProfile.put(INITIAL_USER);
          }
        );

        set({
          tasks: INITIAL_TASKS,
          projects: INITIAL_PROJECTS,
          skills: INITIAL_SKILLS,
          habits: INITIAL_HABITS,
          libraryItems: [],
          achievements: INITIAL_ACHIEVEMENTS,
          user: INITIAL_USER,
          currentView: 'today',
          selectedProjectId: null,
        });
      },
    };
  },
    {
      name: 'ekirum-storage-v1',
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          if (typeof localStorage === 'undefined') return null;
          const val = localStorage.getItem(name);
          if (val) return val;
          const legacy =
            localStorage.getItem('ekitero-storage-v1') ||
            localStorage.getItem('taskocraft-storage-v1') ||
            localStorage.getItem('doist-storage-v1');
          if (legacy) {
            localStorage.setItem(name, legacy);
            localStorage.removeItem('ekitero-storage-v1');
            localStorage.removeItem('taskocraft-storage-v1');
            localStorage.removeItem('doist-storage-v1');
            return legacy;
          }
          return null;
        },
        setItem: (name: string, value: string) => {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(name, value);
          }
        },
        removeItem: (name: string) => {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(name);
          }
        },
      })),
      onRehydrateStorage: () => (state) => {
        if (state && (state.displayMode as unknown as string) === 'board') {
          state.displayMode = 'list';
        }
      },
      partialize: (state) => ({
        tasks: state.tasks,
        projects: state.projects,
        skills: state.skills,
        habits: state.habits,
        achievements: state.achievements,
        user: state.user,
        displayMode: (state.displayMode as unknown as string) === 'board' ? 'list' : state.displayMode,
      }),
    }
  )
);
