export type Priority = 'p1' | 'p2' | 'p3' | 'p4';

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'weekdays';

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  isDeleted?: boolean;
  deletedAt?: string;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task extends BaseEntity {
  projectId: string;
  title: string;
  notes?: string;
  dueDate?: string; // YYYY-MM-DD or ISO string
  dueTime?: string; // HH:mm (optional)
  duration?: number; // Estimated duration in minutes
  recurrence?: Recurrence;
  recurrenceAnchorDay?: number; // 1-31 anchor day for monthly recurrence to avoid end-of-month drift
  priority: Priority;
  labels: string[];
  completed: boolean;
  completedAt?: string;
  uncompletedAt?: string;
  xpAwarded?: number;
  subtasks: Subtask[];
  section?: string; // For board view columns: e.g. "To Do", "In Progress", "Done"
  order?: number;
}

export interface Project extends BaseEntity {
  name: string;
  color?: string; // e.g. 'crimson', 'gold', 'slate', 'stone'
  icon?: string;
  skillId: string;
  description?: string;
}

export interface Skill extends BaseEntity {
  projectId: string;
  name: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  icon: string;
  streak: number;
  lastCompletedDate?: string;
  totalCompleted: number;
}

export interface Achievement extends BaseEntity {
  title: string;
  description: string;
  icon: string;
  unlockedAt?: string;
  progress: number;
  maxProgress: number;
  xpReward?: number;
  xpClaimed?: boolean;
  projectId?: string;
}

export type HabitFrequency = 'daily' | 'weekdays' | 'weekly';

export interface Habit extends BaseEntity {
  title: string;
  description?: string;
  projectId?: string; // Optional link to Project & Skill (awards XP to linked skill)
  frequency: HabitFrequency;
  targetDaysPerWeek?: number;
  completedDates: string[]; // YYYY-MM-DD (derived from HabitEvent or cached)
  streak: number;
  longestStreak: number;
  color?: string;
  icon?: string;
  archived?: boolean;
}

export interface HabitEvent extends BaseEntity {
  habitId: string;
  date: string; // YYYY-MM-DD
  completedAt: string; // ISO string
}

export const DAILY_XP_CAP = 500;

export interface UserProfile extends BaseEntity {
  name: string;
  avatar?: string;
  ekirumLevel: number;
  ekirumRank: string;
  totalXp: number;
  dailyXpDate?: string;
  dailyXpEarned?: number;
  achievements: string[];
  soundEnabled: boolean;
  accentColor: 'crimson' | 'gold';
  onboardingCompleted?: boolean;
}

export type LibraryItemType = 'book' | 'movie';
export type LibraryDifficulty = 0 | 1 | 2;
export type LibraryStatus = 'todo' | 'done';

export interface LibraryItem extends BaseEntity {
  title: string;
  type: LibraryItemType;
  creator?: string; // author or director
  url?: string;
  notes?: string;
  difficulty: LibraryDifficulty; // 0 mindless, 1 standard, 2 challenging
  projectId?: string; // Optional link to Project & Skill (receives the XP too)
  status: LibraryStatus;
  review?: string;
  finishedDate?: string; // YYYY-MM-DD
  completedAt?: string;
  xpAwarded?: boolean; // XP is granted once per item, never twice
  xpEarned?: number;
}

export type ViewType = 'today' | 'calendar' | 'upcoming' | 'completed' | 'habits' | 'library' | 'character' | 'project' | 'inbox';
export type DisplayMode = 'list' | 'timeline' | 'calendar';

export interface BackupTables {
  tasks: Task[];
  projects: Project[];
  skills: Skill[];
  habits: Habit[];
  habitEvents: HabitEvent[];
  achievements: Achievement[];
  userProfile: UserProfile[];
  libraryItems?: LibraryItem[];
}

export interface BackupFile {
  schemaVersion: number;
  exportedAt: string;
  deviceId: string;
  deviceClockOffsetMs?: number;
  tables: BackupTables;
}

export type BackupFolderPermission = 'granted' | 'prompt' | 'denied' | 'unsupported' | 'not-configured';

export interface BackupConfig {
  folderName?: string;
  lastBackupAt?: string;
  lastSyncAt?: string;
  isOverdue?: boolean;
  permission: BackupFolderPermission;
}
