import { Task, Skill, Habit, Achievement, UserProfile, Project, LibraryItem } from '../types';
import { INITIAL_ACHIEVEMENTS } from './seedData';
import { formatLocalDate, isTaskOngoing, getTaskEndDateTime } from './dateParser';
import { calculateSkillLevel } from './characterMath';

export interface AchievementEvaluationResult {
  updatedAchievements: Achievement[];
  newlyUnlocked: Achievement[];
  earnedXpBonus: number;
  hasChanges: boolean;
  projectSkillXpGains?: Record<string, number>;
}

const LIBRARY_PREFIXES = ['ach-book-', 'ach-movie-'];

function getLibraryPrefix(id: string): string | undefined {
  return LIBRARY_PREFIXES.find((p) => id.startsWith(p));
}

export function getProjectMilestoneXp(target: number): number {
  if (target === 1000) return 300;
  if (target === 500) return 200;
  if (target === 250) return 150;
  if (target === 100) return 100;
  if (target === 50) return 50;
  return 25;
}

export function parseProjectAchievementId(id: string): { projectId: string; target: number } | null {
  if (!id.startsWith('ach-project-')) return null;
  const rest = id.slice('ach-project-'.length);
  const idx = rest.lastIndexOf('-');
  if (idx === -1) return null;
  const projectId = rest.slice(0, idx);
  const target = parseInt(rest.slice(idx + 1), 10);
  return (!projectId || isNaN(target) || target <= 0) ? null : { projectId, target };
}

export function getProjectMilestoneMeta(projectName: string, target: number, icon?: string): {
  title: string;
  description: string;
  icon: string;
  xpReward: number;
} {
  const isBoost = target === 50 || target === 100 || target === 250 || target === 500 || target === 1000;
  const title = isBoost
    ? `${projectName}: Milestone ${target}`
    : `${projectName}: ${target} Contributions`;
  const description = `Complete ${target} tasks or library items in ${projectName}.`;
  const xpReward = getProjectMilestoneXp(target);
  return {
    title,
    description,
    icon: icon || 'Folder',
    xpReward,
  };
}

export function applySkillXpGains(
  skills: Skill[],
  gains?: Record<string, number>
): {
  updatedSkills: Skill[];
  leveledUpSkills: Array<{ name: string; newLevel: number }>;
} {
  if (!gains || Object.keys(gains).length === 0) {
    return { updatedSkills: skills, leveledUpSkills: [] };
  }

  const nowIso = new Date().toISOString();
  const leveledUpSkills: Array<{ name: string; newLevel: number }> = [];

  const updatedSkills = skills.map((s) => {
    const gain = gains[s.id];
    if (!gain || gain <= 0) return s;

    const newXp = (s.xp || 0) + gain;
    const oldLevel = s.level || 1;
    const newLevel = calculateSkillLevel(newXp);

    if (newLevel > oldLevel) {
      leveledUpSkills.push({ name: s.name, newLevel });
    }

    return {
      ...s,
      xp: newXp,
      level: newLevel,
      xpToNextLevel: newLevel * newLevel * 20,
      updatedAt: nowIso,
    };
  });

  return { updatedSkills, leveledUpSkills };
}

export function isAchievementVisible(ach: Achievement, allAchievements: Achievement[]): boolean {
  // 1. Any unlocked achievement is visible
  if (Boolean(ach.unlockedAt)) {
    return true;
  }

  // 2. Task milestones: only the lowest unachieved milestone is visible in progress
  const isTaskMilestone = ach.id.startsWith('ach-tasks-') || ach.id === 'ach-5';
  if (isTaskMilestone) {
    for (const other of allAchievements) {
      if (!other.unlockedAt && (other.id.startsWith('ach-tasks-') || other.id === 'ach-5')) {
        if (other.maxProgress < ach.maxProgress) {
          return false;
        }
      }
    }
    return true;
  }

  // 3. Rank milestones: only the lowest unachieved rank milestone is visible in progress
  const isRankMilestone = ach.id.startsWith('ach-rank-');
  if (isRankMilestone) {
    for (const other of allAchievements) {
      if (!other.unlockedAt && other.id.startsWith('ach-rank-')) {
        if (other.maxProgress < ach.maxProgress) {
          return false;
        }
      }
    }
    return true;
  }

  // 4. Level milestones: only the lowest unachieved level milestone is visible in progress
  const isLevelMilestone = ach.id.startsWith('ach-level-');
  if (isLevelMilestone) {
    for (const other of allAchievements) {
      if (!other.unlockedAt && other.id.startsWith('ach-level-')) {
        if (other.maxProgress < ach.maxProgress) {
          return false;
        }
      }
    }
    return true;
  }

  // 5. Skill milestones: only the lowest unachieved skill milestone is visible in progress
  const isSkillMilestone = ach.id.startsWith('ach-skill-') || ach.id === 'ach-4';
  if (isSkillMilestone) {
    for (const other of allAchievements) {
      if (!other.unlockedAt && (other.id.startsWith('ach-skill-') || other.id === 'ach-4')) {
        if (other.maxProgress < ach.maxProgress) {
          return false;
        }
      }
    }
    return true;
  }

  // 6. Multi-skill breadth milestones: only the lowest unachieved milestone is visible in progress
  const isMultiSkillMilestone = ach.id.startsWith('ach-multiskill-');
  if (isMultiSkillMilestone) {
    for (const other of allAchievements) {
      if (!other.unlockedAt && other.id.startsWith('ach-multiskill-')) {
        if (other.maxProgress < ach.maxProgress) {
          return false;
        }
      }
    }
    return true;
  }

  // 7. Library milestones (books / movies): only the lowest unachieved tier per ladder is visible
  const libraryPrefix = getLibraryPrefix(ach.id);
  if (libraryPrefix) {
    for (const other of allAchievements) {
      if (!other.unlockedAt && other.id.startsWith(libraryPrefix)) {
        if (other.maxProgress < ach.maxProgress) {
          return false;
        }
      }
    }
    return true;
  }

  // 8. Project milestones: only the lowest unachieved milestone per project is visible in progress
  const projMeta = parseProjectAchievementId(ach.id);
  if (projMeta) {
    for (const other of allAchievements) {
      if (!other.unlockedAt) {
        const otherMeta = parseProjectAchievementId(other.id);
        if (otherMeta && otherMeta.projectId === projMeta.projectId) {
          if (other.maxProgress < ach.maxProgress) {
            return false;
          }
        }
      }
    }
    return true;
  }

  // 9. Other achievements (streaks, projects, first mark, pristine horizon):
  // Show if in progress (progress > 0)
  return ach.progress > 0;
}

export function getVisibleAchievements(allAchievements: Achievement[]): Achievement[] {
  let minTaskAch: Achievement | null = null;
  let minRankAch: Achievement | null = null;
  let minLevelAch: Achievement | null = null;
  let minSkillAch: Achievement | null = null;
  let minMultiSkillAch: Achievement | null = null;
  const minLibraryAch = new Map<string, Achievement>();
  const minProjectAch = new Map<string, Achievement>();

  for (const a of allAchievements) {
    if (a.unlockedAt) continue;

    const projMeta = parseProjectAchievementId(a.id);
    if (projMeta) {
      const current = minProjectAch.get(projMeta.projectId);
      if (!current || a.maxProgress < current.maxProgress) {
        minProjectAch.set(projMeta.projectId, a);
      }
      continue;
    }

    if (a.id.startsWith('ach-tasks-') || a.id === 'ach-5') {
      if (!minTaskAch || a.maxProgress < minTaskAch.maxProgress) {
        minTaskAch = a;
      }
    } else if (a.id.startsWith('ach-rank-')) {
      if (!minRankAch || a.maxProgress < minRankAch.maxProgress) {
        minRankAch = a;
      }
    } else if (a.id.startsWith('ach-level-')) {
      if (!minLevelAch || a.maxProgress < minLevelAch.maxProgress) {
        minLevelAch = a;
      }
    } else if (a.id.startsWith('ach-skill-') || a.id === 'ach-4') {
      if (!minSkillAch || a.maxProgress < minSkillAch.maxProgress) {
        minSkillAch = a;
      }
    } else if (a.id.startsWith('ach-multiskill-')) {
      if (!minMultiSkillAch || a.maxProgress < minMultiSkillAch.maxProgress) {
        minMultiSkillAch = a;
      }
    } else {
      const libPrefix = getLibraryPrefix(a.id);
      if (libPrefix) {
        const current = minLibraryAch.get(libPrefix);
        if (!current || a.maxProgress < current.maxProgress) {
          minLibraryAch.set(libPrefix, a);
        }
      }
    }
  }

  const nextActiveIds = new Set<string>();
  if (minTaskAch) nextActiveIds.add(minTaskAch.id);
  if (minRankAch) nextActiveIds.add(minRankAch.id);
  if (minLevelAch) nextActiveIds.add(minLevelAch.id);
  if (minSkillAch) nextActiveIds.add(minSkillAch.id);
  if (minMultiSkillAch) nextActiveIds.add(minMultiSkillAch.id);
  minLibraryAch.forEach((a) => nextActiveIds.add(a.id));
  minProjectAch.forEach((a) => nextActiveIds.add(a.id));

  return allAchievements.filter((a) => {
    if (Boolean(a.unlockedAt)) return true;
    if (nextActiveIds.has(a.id)) return true;
    if (
      !a.id.startsWith('ach-tasks-') &&
      a.id !== 'ach-5' &&
      !a.id.startsWith('ach-rank-') &&
      !a.id.startsWith('ach-level-') &&
      !a.id.startsWith('ach-skill-') &&
      a.id !== 'ach-4' &&
      !a.id.startsWith('ach-multiskill-') &&
      !getLibraryPrefix(a.id) &&
      !parseProjectAchievementId(a.id)
    ) {
      return a.progress > 0;
    }
    return false;
  });
}


export function evaluateAchievements(
  tasks: Task[] = [],
  skills: Skill[] = [],
  habits: Habit[] = [],
  currentAchievements: Achievement[] = [],
  user?: UserProfile,
  projects: Project[] = [],
  libraryItems: LibraryItem[] = []
): AchievementEvaluationResult {
  const nowIso = new Date().toISOString();
  const todayStr = formatLocalDate();

  const activeProjects = projects.filter((p) => !p.isDeleted);
  const activeProjectMap = new Map<string, Project>(activeProjects.map((p) => [p.id, p]));
  const allProjectMap = new Map<string, Project>(projects.map((p) => [p.id, p]));

  const currentAchievementsMap = new Map<string, Achievement>(
    currentAchievements.map((a) => [a.id, a])
  );

  const projectCompletionsMap = new Map<string, number>();
  for (const t of tasks) {
    if (!t.isDeleted && t.completed && t.projectId) {
      projectCompletionsMap.set(t.projectId, (projectCompletionsMap.get(t.projectId) || 0) + 1);
    }
  }
  for (const item of libraryItems) {
    if (!item.isDeleted && item.status === 'done' && item.projectId) {
      projectCompletionsMap.set(item.projectId, (projectCompletionsMap.get(item.projectId) || 0) + 1);
    }
  }

  // Base list of achievements to evaluate, initialized with INITIAL_ACHIEVEMENTS
  const baseMap = new Map<string, Achievement>();
  for (const ach of INITIAL_ACHIEVEMENTS) {
    baseMap.set(ach.id, { ...ach });
  }

  // Populate project milestone achievements lazily for active projects.
  // Instead of generating all 100 tiers (10..1000) eagerly, generate only completed milestones
  // plus the single next in-progress milestone target (10, 20, 30...).
  for (const p of activeProjects) {
    const count = projectCompletionsMap.get(p.id) || 0;
    const maxMilestoneTarget = Math.min(1000, Math.max(10, Math.ceil((count + 1) / 10) * 10));

    for (let target = 10; target <= maxMilestoneTarget; target += 10) {
      const achId = `ach-project-${p.id}-${target}`;
      const meta = getProjectMilestoneMeta(p.name, target, p.icon);
      baseMap.set(achId, {
        id: achId,
        title: meta.title,
        description: meta.description,
        icon: meta.icon,
        unlockedAt: undefined,
        progress: 0,
        maxProgress: target,
        xpReward: meta.xpReward,
        xpClaimed: false,
        projectId: p.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }

  for (const ach of currentAchievements) {
    const projMeta = parseProjectAchievementId(ach.id);
    if (projMeta) {
      const count = projectCompletionsMap.get(projMeta.projectId) || 0;
      const maxMilestoneTarget = Math.min(1000, Math.max(10, Math.ceil((count + 1) / 10) * 10));

      // Discard un-unlocked milestones for deleted projects or milestones beyond the current rolling target
      if (!ach.unlockedAt && (!activeProjectMap.has(projMeta.projectId) || projMeta.target > maxMilestoneTarget)) {
        baseMap.delete(ach.id);
        continue;
      }
    }

    const existing = baseMap.get(ach.id);
    const activeProj = projMeta ? activeProjectMap.get(projMeta.projectId) : undefined;
    let dynamicTitle = existing?.title || ach.title;
    let dynamicDescription = existing?.description || ach.description;
    let dynamicIcon = existing?.icon || ach.icon;

    if (activeProj && projMeta) {
      const meta = getProjectMilestoneMeta(activeProj.name, projMeta.target, activeProj.icon);
      dynamicTitle = meta.title;
      dynamicDescription = meta.description;
      dynamicIcon = meta.icon;
    }

    baseMap.set(ach.id, {
      ...(existing || {}),
      ...ach,
      title: dynamicTitle,
      description: dynamicDescription,
      icon: dynamicIcon,
      xpReward: existing?.xpReward !== undefined ? existing.xpReward : ach.xpReward,
      maxProgress: existing?.maxProgress !== undefined ? existing.maxProgress : ach.maxProgress,
      projectId: ach.projectId || (projMeta ? projMeta.projectId : undefined),
    });
  }

  let completedTasksCount = 0;
  let hasCompletedScheduledToday = false;
  let activeTasksDueTodayCount = 0;

  for (const t of tasks) {
    if (t.isDeleted) continue;
    if (t.completed) {
      completedTasksCount++;
      const endsToday = t.dueDate === todayStr || getTaskEndDateTime(t.dueDate, t.dueTime, t.duration)?.endDate === todayStr;
      if (endsToday) {
        hasCompletedScheduledToday = true;
      }
    } else {
      const isDueOrOngoingToday =
        t.dueDate === todayStr ||
        isTaskOngoing(t) ||
        getTaskEndDateTime(t.dueDate, t.dueTime, t.duration)?.endDate === todayStr ||
        (t.dueDate && t.dueDate < todayStr);
      if (isDueOrOngoingToday) {
        activeTasksDueTodayCount++;
      }
    }
  }

  let skillsCompletedCount = 0;
  let maxSkillStreak = 0;
  let highestSkillLevel = 1;
  let activeSkillsCount = 0;
  let advancedSkillsCount = 0;

  for (const s of skills) {
    if (s.isDeleted) continue;
    activeSkillsCount++;
    skillsCompletedCount += s.totalCompleted || 0;
    if ((s.streak || 0) > maxSkillStreak) maxSkillStreak = s.streak || 0;
    if ((s.level || 1) > highestSkillLevel) highestSkillLevel = s.level || 1;
    if ((s.level || 1) >= 2) advancedSkillsCount++;
  }

  let booksFinishedCount = 0;
  let moviesFinishedCount = 0;
  for (const item of libraryItems) {
    if (item.isDeleted || item.status !== 'done') continue;
    if (item.type === 'book') booksFinishedCount++;
    else if (item.type === 'movie') moviesFinishedCount++;
  }

  let maxHabitStreak = 0;
  for (const h of habits) {
    if (h.isDeleted) continue;
    const streak = Math.max(h.streak || 0, h.longestStreak || 0);
    if (streak > maxHabitStreak) maxHabitStreak = streak;
  }

  let activeProjectsCount = 0;
  for (const p of projects) {
    if (!p.isDeleted) activeProjectsCount++;
  }

  const totalCompletedCount = Math.max(completedTasksCount, skillsCompletedCount);
  const highestStreak = Math.max(maxSkillStreak, maxHabitStreak);
  const projectCount = Math.max(activeProjectsCount, activeSkillsCount);
  const userLevel = user?.ekirumLevel ?? 1;
  const pristineTodayCleared = hasCompletedScheduledToday && activeTasksDueTodayCount === 0;

  const newlyUnlocked: Achievement[] = [];
  const updatedAchievements: Achievement[] = [];
  const projectSkillXpGains: Record<string, number> = {};
  let earnedXpBonus = 0;
  let hasChanges = baseMap.size !== currentAchievements.length;

  for (const [id, ach] of baseMap.entries()) {
    const isAlreadyUnlocked = Boolean(ach.unlockedAt);
    let targetProgress = ach.progress || 0;
    let shouldUnlock = isAlreadyUnlocked;
    const projMeta = parseProjectAchievementId(id);

    switch (id) {
      case 'ach-1': {
        // 'First Mark': Complete your first task and register initial XP in a skill
        const hasDoneTask = totalCompletedCount >= 1 || (user && user.totalXp > 0);
        targetProgress = hasDoneTask ? 1 : 0;
        if (targetProgress >= 1) shouldUnlock = true;
        break;
      }
      case 'ach-proj-1': {
        // 'First Horizon': Create your first project
        targetProgress = Math.min(1, Math.max(ach.progress || 0, projectCount));
        if (targetProgress >= 1) shouldUnlock = true;
        break;
      }
      case 'ach-proj-5': {
        // 'Grand Architecture': Create 5 projects
        targetProgress = Math.min(5, Math.max(ach.progress || 0, projectCount));
        if (targetProgress >= 5) shouldUnlock = true;
        break;
      }
      case 'ach-2': {
        // 'Consistent Cadence': Maintain a 3-day streak across any skill
        targetProgress = Math.min(3, Math.max(ach.progress || 0, highestStreak));
        if (targetProgress >= 3) shouldUnlock = true;
        break;
      }
      case 'ach-3': {
        // 'Deep Rhythm': Achieve a 7-day streak in a single skill
        targetProgress = Math.min(7, Math.max(ach.progress || 0, highestStreak));
        if (targetProgress >= 7) shouldUnlock = true;
        break;
      }
      case 'ach-4': {
        // 'Mastery in Hand': Advance any skill to Level 5
        targetProgress = Math.min(5, Math.max(ach.progress || 0, highestSkillLevel));
        if (targetProgress >= 5) shouldUnlock = true;
        break;
      }
      case 'ach-5': {
        // 'Century Milestone': Complete 100 tasks across all projects
        targetProgress = Math.min(100, Math.max(ach.progress || 0, totalCompletedCount));
        if (targetProgress >= 100) shouldUnlock = true;
        break;
      }
      case 'ach-6': {
        // 'Pristine Horizon': Clear all tasks scheduled for Today
        if (pristineTodayCleared) {
          targetProgress = 1;
          shouldUnlock = true;
        } else if (isAlreadyUnlocked) {
          targetProgress = 1;
          shouldUnlock = true;
        } else {
          targetProgress = 0;
        }
        break;
      }
      default: {
        // Project milestones (every 10 contributions up to 1000 in a project)
        if (projMeta) {
          const count = projectCompletionsMap.get(projMeta.projectId) || 0;
          targetProgress = Math.min(projMeta.target, Math.max(ach.progress || 0, count));
          if (targetProgress >= projMeta.target) shouldUnlock = true;
        }
        // Rank milestones (Novice, Recruit, Apprentice, etc.)
        else if (id.startsWith('ach-rank-')) {
          targetProgress = Math.min(ach.maxProgress, Math.max(ach.progress || 0, userLevel));
          if (targetProgress >= ach.maxProgress) shouldUnlock = true;
        }
        // Level milestones (10, 25, 50)
        else if (id.startsWith('ach-level-')) {
          const target = parseInt(id.replace('ach-level-', ''), 10);
          if (!isNaN(target) && target > 0) {
            targetProgress = Math.min(target, Math.max(ach.progress || 0, userLevel));
            if (targetProgress >= target) shouldUnlock = true;
          }
        }
        // Multi-task milestones (every 10 tasks up to 1000)
        else if (id.startsWith('ach-tasks-')) {
          const target = parseInt(id.replace('ach-tasks-', ''), 10);
          if (!isNaN(target) && target > 0) {
            targetProgress = Math.min(target, Math.max(ach.progress || 0, totalCompletedCount));
            if (targetProgress >= target) shouldUnlock = true;
          }
        }
        // Skill level milestones (10, 15, 20, 25, 30, 35, 40, 45, 50)
        else if (id.startsWith('ach-skill-')) {
          const target = parseInt(id.replace('ach-skill-', ''), 10);
          if (!isNaN(target) && target > 0) {
            targetProgress = Math.min(target, Math.max(ach.progress || 0, highestSkillLevel));
            if (targetProgress >= target) shouldUnlock = true;
          }
        }
        // Multi-skill milestones (2, 3, 4, 5 distinct skills at level 2+)
        else if (id.startsWith('ach-multiskill-')) {
          const target = parseInt(id.replace('ach-multiskill-', ''), 10);
          if (!isNaN(target) && target > 0) {
            targetProgress = Math.min(target, Math.max(ach.progress || 0, advancedSkillsCount));
            if (targetProgress >= target) shouldUnlock = true;
          }
        }
        // Library milestones (books / movies finished)
        else if (id.startsWith('ach-book-') || id.startsWith('ach-movie-')) {
          const isBook = id.startsWith('ach-book-');
          const target = parseInt(id.replace(isBook ? 'ach-book-' : 'ach-movie-', ''), 10);
          const count = isBook ? booksFinishedCount : moviesFinishedCount;
          if (!isNaN(target) && target > 0) {
            targetProgress = Math.min(target, Math.max(ach.progress || 0, count));
            if (targetProgress >= target) shouldUnlock = true;
          }
        } else if ((ach.progress || 0) >= ach.maxProgress) {
          shouldUnlock = true;
        }
        break;
      }
    }

    let xpClaimed = ach.xpClaimed || false;
    if (shouldUnlock && !xpClaimed) {
      xpClaimed = true;
      const reward = ach.xpReward || 0;
      earnedXpBonus += reward;
      if (projMeta) {
        const proj = allProjectMap.get(projMeta.projectId);
        if (proj?.skillId && reward > 0) {
          projectSkillXpGains[proj.skillId] = (projectSkillXpGains[proj.skillId] || 0) + reward;
        }
      }
    }

    const nextProgress = shouldUnlock ? ach.maxProgress : Math.min(ach.maxProgress, targetProgress);
    const nextUnlockedAt = isAlreadyUnlocked ? ach.unlockedAt : shouldUnlock ? nowIso : undefined;
    const oldAch = currentAchievementsMap.get(id);
    const didChange =
      !oldAch ||
      nextProgress !== oldAch.progress ||
      nextUnlockedAt !== oldAch.unlockedAt ||
      xpClaimed !== oldAch.xpClaimed ||
      ach.title !== oldAch.title ||
      ach.icon !== oldAch.icon ||
      ach.description !== oldAch.description;

    if (didChange) {
      hasChanges = true;
    }

    const updatedAch: Achievement = {
      ...ach,
      progress: nextProgress,
      unlockedAt: nextUnlockedAt,
      xpClaimed,
      updatedAt: didChange ? nowIso : ach.updatedAt,
    };

    if (!isAlreadyUnlocked && shouldUnlock) {
      newlyUnlocked.push(updatedAch);
    }

    updatedAchievements.push(updatedAch);
  }

  return { updatedAchievements, newlyUnlocked, earnedXpBonus, hasChanges, projectSkillXpGains };
}

