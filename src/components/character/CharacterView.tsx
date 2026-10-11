import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useEkirumStore, getSkillRankTitle, getXpRequiredForLevel, getXpRequiredForNextLevel } from '../../store/useEkirumStore';
import { IconHelper } from '../common/IconHelper';
import { processAvatarImage } from '../../lib/avatarHelper';
import {
  Flame,
  Award,
  Sparkles,
  Check,
  Lock,
  Camera,
  Trash2,
  X,
  Folder,
  ArrowDown,
  ArrowUp,
} from 'lucide-react';
import { DAILY_XP_CAP } from '../../types';
import { formatLocalDate } from '../../lib/dateParser';
import { getVisibleAchievements } from '../../lib/achievements';

export const CharacterView: React.FC = () => {
  const {
    user,
    skills,
    projects,
    achievements,
    updateUserProfile,
    tasks,
    setNewProjectModalOpen,
    evaluateAndSyncAchievements,
  } = useEkirumStore();

  const [achievementFilter, setAchievementFilter] = useState<'all' | 'achieved' | 'in_progress'>('all');
  const [projectFilter, setProjectFilter] = useState<'all' | 'global' | string>('all');
  const [skillSort, setSkillSort] = useState<'level' | 'created'>('level');
  const [skillSortDir, setSkillSortDir] = useState<'desc' | 'asc'>('desc');

  const handleSkillSort = (option: 'level' | 'created') => {
    if (skillSort === option) {
      setSkillSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSkillSort(option);
      setSkillSortDir('desc');
    }
  };

  const sortedSkills = useMemo(() => {
    return [...skills].sort((a, b) => {
      if (skillSort === 'level') {
        const diff = (b.level || 1) - (a.level || 1);
        if (diff !== 0) {
          return skillSortDir === 'desc' ? diff : -diff;
        }
        const xpDiff = (b.xp || 0) - (a.xp || 0);
        if (xpDiff !== 0) {
          return skillSortDir === 'desc' ? xpDiff : -xpDiff;
        }
        return a.name.localeCompare(b.name);
      } else {
        const aTime = a.createdAt || '';
        const bTime = b.createdAt || '';
        const timeDiff = bTime.localeCompare(aTime);
        if (timeDiff !== 0) {
          return skillSortDir === 'desc' ? timeDiff : -timeDiff;
        }
        return a.name.localeCompare(b.name);
      }
    });
  }, [skills, skillSort, skillSortDir]);

  useEffect(() => {
    evaluateAndSyncAchievements();
  }, [evaluateAndSyncAchievements]);

  const [isEditingUserName, setIsEditingUserName] = useState(false);
  const [userNameDraft, setUserNameDraft] = useState(user.name);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const todayStr = formatLocalDate();
  const todayEarned = user.dailyXpDate === todayStr ? (user.dailyXpEarned || 0) : 0;
  const isCapped = todayEarned >= DAILY_XP_CAP;

  const totalTasksCompleted = tasks.filter((t) => t.completed).length;


  const handleSaveUserName = () => {
    if (userNameDraft.trim()) {
      updateUserProfile({ name: userNameDraft.trim() });
    }
    setIsEditingUserName(false);
  };

  const handleCancelUserName = () => {
    setUserNameDraft(user.name);
    setIsEditingUserName(false);
  };

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setAvatarError(null);
      const dataUrl = await processAvatarImage(file);
      updateUserProfile({ avatar: dataUrl });
    } catch (err: any) {
      setAvatarError(err?.message || 'Failed to process avatar image');
      setTimeout(() => setAvatarError(null), 4000);
    } finally {
      e.target.value = '';
    }
  };

  const handleRemoveAvatar = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateUserProfile({ avatar: undefined });
  };

  const activeProjects = useMemo(() => projects.filter((p) => !p.isDeleted), [projects]);
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Only show achievements that are visible (unlocked + rolling next active targets)
  const { visibleAchievements, achievedCount, inProgressCount, filteredAchievements } = useMemo(() => {
    const visible = getVisibleAchievements(achievements);
    let achieved = 0;
    let inProgress = 0;
    for (const a of visible) {
      if (a.unlockedAt) achieved++;
      else inProgress++;
    }

    const filtered = visible
      .filter((ach) => {
        if (achievementFilter === 'achieved' && !ach.unlockedAt) return false;
        if (achievementFilter === 'in_progress' && ach.unlockedAt) return false;
        if (projectFilter === 'global' && ach.projectId) return false;
        if (projectFilter !== 'all' && projectFilter !== 'global' && ach.projectId !== projectFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const aUnlocked = Boolean(a.unlockedAt);
        const bUnlocked = Boolean(b.unlockedAt);
        if (aUnlocked && !bUnlocked) return -1;
        if (!aUnlocked && bUnlocked) return 1;
        if (aUnlocked && bUnlocked) {
          return (b.unlockedAt || '').localeCompare(a.unlockedAt || '');
        }
        const aPct = a.maxProgress > 0 ? a.progress / a.maxProgress : 0;
        const bPct = b.maxProgress > 0 ? b.progress / b.maxProgress : 0;
        return bPct - aPct;
      });

    return {
      visibleAchievements: visible,
      achievedCount: achieved,
      inProgressCount: inProgress,
      filteredAchievements: filtered,
    };
  }, [achievements, achievementFilter, projectFilter]);

  const totalActiveCount = visibleAchievements.length;

  return (
    <div className="max-w-4xl mx-auto w-full px-3.5 sm:px-6 py-5 sm:py-10 select-none space-y-8 sm:space-y-12">
      {/* 1. Header: Avatar, Name, Level & Aggregate Status */}
      <div className="relative bg-white border border-stone-200/90 rounded-card sm:rounded-sheet p-4 sm:p-8 overflow-hidden">
        {/* Subtle decorative background gradient */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/5 via-crimson/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5">
            {/* Avatar section */}
            <div className="relative group flex-shrink-0">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleAvatarFileSelect}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative w-18 h-18 sm:w-22 sm:h-22 rounded-full ring-2 ring-stone-200/90 overflow-hidden cursor-pointer transition-all hover:ring-stone-400 bg-stone-100 flex items-center justify-center group"
                title="Click to upload or change avatar"
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                  />
                ) : (
                  <div className="w-full h-full bg-stone-900 text-stone-100 font-serif text-2xl flex items-center justify-center">
                    {user.name ? user.name.slice(0, 2).toUpperCase() : 'EK'}
                  </div>
                )}

                {/* Hover overlay with camera icon */}
                <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-150">
                  <Camera size={18} className="mb-0.5" />
                  <span className="text-[10px] font-sans font-medium">Change</span>
                </div>
              </div>

              {/* Remove avatar button if avatar exists */}
              {user.avatar && (
                <button
                  onClick={handleRemoveAvatar}
                  className="absolute -bottom-1 -right-1 p-1 bg-white hover:bg-stone-100 border border-stone-200 rounded-full text-stone-500 hover:text-crimson shadow-xs transition-colors cursor-pointer"
                  title="Remove avatar"
                  aria-label="Remove avatar"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>

            {/* Character identity & rank title */}
            <div className="space-y-0.5 min-w-0">
              {/* Character Name & Title Row */}
              <div className="flex items-center gap-2.5">
                {isEditingUserName ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={userNameDraft}
                      onChange={(e) => setUserNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveUserName();
                        if (e.key === 'Escape') handleCancelUserName();
                      }}
                      className="font-serif text-xl sm:text-2xl font-medium text-charcoal bg-stone-50 border border-stone-300 rounded-mac px-2.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
                      placeholder="Character name..."
                    />
                    <button
                      onClick={handleSaveUserName}
                      className="p-1.5 bg-charcoal text-white hover:bg-stone-800 rounded-mac shadow-2xs transition-colors cursor-pointer"
                      title="Save name (Enter)"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={handleCancelUserName}
                      className="p-1.5 bg-stone-100 text-stone-600 hover:bg-stone-200 rounded-mac transition-colors cursor-pointer"
                      title="Cancel (Esc)"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group/name flex-wrap">
                    {/* Rank as Title honorific - displayed BEFORE nickname, without shadow */}
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-serif font-medium tracking-wide bg-stone-100 text-stone-700 border border-stone-200/90"
                      title={`Title: ${user.ekirumRank ?? 'Novice'}`}
                    >
                      {user.ekirumRank ?? 'Novice'}
                    </span>

                    <h2
                      onClick={() => {
                        setUserNameDraft(user.name);
                        setIsEditingUserName(true);
                      }}
                      className="font-serif text-2xl sm:text-3xl font-medium text-charcoal tracking-tight cursor-pointer hover:text-stone-700 transition-colors"
                      title="Click to rename character"
                    >
                      {user.name}
                    </h2>
                  </div>
                )}
              </div>

              {/* Level indicator */}
              <div className="font-serif text-xs sm:text-sm text-stone-500 font-medium">
                Level {user.ekirumLevel ?? 1}
              </div>
            </div>
          </div>

          {/* Aggregate Stat Indicators */}
          <div className="grid grid-cols-3 gap-3 w-full sm:w-auto sm:flex sm:items-center sm:gap-6 border-t md:border-t-0 md:border-l border-stone-200/80 pt-4 md:pt-0 md:pl-8 flex-shrink-0">
            <div className="space-y-1">
              <span className="text-[10px] sm:text-[11px] font-sans uppercase text-stone-500 tracking-wider font-semibold">
                Total XP
              </span>
              <div className="text-lg sm:text-xl font-serif text-charcoal font-semibold">
                {user.totalXp.toLocaleString()}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] sm:text-[11px] font-sans uppercase text-stone-500 tracking-wider font-semibold">
                Tasks Done
              </span>
              <div className="text-lg sm:text-xl font-serif text-charcoal font-semibold">
                {totalTasksCompleted}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] sm:text-[11px] font-sans uppercase text-stone-500 tracking-wider font-semibold">
                Active Skills
              </span>
              <div className="text-lg sm:text-xl font-serif text-charcoal font-semibold">
                {skills.length}
              </div>
            </div>
          </div>
        </div>

        {/* Avatar Error Notification */}
        {avatarError && (
          <div className="mt-4 p-2.5 rounded-mac bg-red-50 border border-red-200 text-red-800 text-xs flex items-center justify-between">
            <span>{avatarError}</span>
            <button onClick={() => setAvatarError(null)} className="p-0.5 hover:text-red-950">
              <X size={12} />
            </button>
          </div>
        )}

        {/* Only displayed when someone actually reaches the daily cap */}
        {isCapped && (
          <div className="mt-6 pt-5 border-t border-stone-100 flex items-center justify-between text-xs text-amber-900 bg-amber-50/80 border border-amber-200/90 rounded-card p-3.5">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-700 shrink-0" />
              <span>
                Daily XP Cap reached ({DAILY_XP_CAP}/{DAILY_XP_CAP} XP) — Mindful focus preserved for today.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Skills Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-xl text-charcoal font-medium">
              Skills
            </h3>
            <span className="text-xs font-mono text-stone-500">
              ({skills.length})
            </span>
          </div>

          {skills.length > 0 && (
            <div className="inline-flex items-center bg-stone-100/90 p-0.5 rounded-mac border border-stone-200/80 text-xs">
              <button
                onClick={() => handleSkillSort('level')}
                className={`px-2.5 py-1 min-h-[28px] rounded-[5px] font-sans transition-all cursor-pointer flex items-center gap-1.5 ${
                  skillSort === 'level'
                    ? 'bg-white text-charcoal font-medium shadow-2xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <span>By Level</span>
                {skillSort === 'level' && (
                  skillSortDir === 'desc' ? (
                    <ArrowDown size={11} className="text-stone-500" />
                  ) : (
                    <ArrowUp size={11} className="text-stone-500" />
                  )
                )}
              </button>
              <button
                onClick={() => handleSkillSort('created')}
                className={`px-2.5 py-1 min-h-[28px] rounded-[5px] font-sans transition-all cursor-pointer flex items-center gap-1.5 ${
                  skillSort === 'created'
                    ? 'bg-white text-charcoal font-medium shadow-2xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                <span>Time Added</span>
                {skillSort === 'created' && (
                  skillSortDir === 'desc' ? (
                    <ArrowDown size={11} className="text-stone-500" />
                  ) : (
                    <ArrowUp size={11} className="text-stone-500" />
                  )
                )}
              </button>
            </div>
          )}
        </div>

        {skills.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {sortedSkills.map((skill) => {
            const rankTitle = getSkillRankTitle(skill.level);
            const currentLevelMinXp = getXpRequiredForLevel(skill.level);
            const nextLevelXp = getXpRequiredForNextLevel(skill.level);
            const levelRange = nextLevelXp - currentLevelMinXp;
            const progressInLevel = Math.max(0, skill.xp - currentLevelMinXp);
            const progressPercent = Math.min(100, Math.round((progressInLevel / levelRange) * 100));

            return (
              <div
                key={skill.id}
                className="group relative bg-white border border-stone-200/90 hover:border-stone-300 rounded-card p-5 sm:p-6 shadow-placard transition-all duration-300"
              >
                {/* Top card row: Icon, Name, Streak */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-mac bg-stone-100 border border-stone-200/80 flex items-center justify-center text-charcoal group-hover:border-gold/50 transition-colors">
                      <IconHelper name={skill.icon || 'Folder'} size={18} strokeWidth={1.5} />
                    </div>

                    <div>
                      <h4 className="text-sm font-serif font-semibold text-charcoal">
                        {skill.name}
                      </h4>
                      <span className="text-xs text-stone-500 font-serif font-medium">
                        {rankTitle}
                      </span>
                    </div>
                  </div>

                  {/* Streak candle / flame */}
                  <div
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-mono ${
                      skill.streak > 0
                        ? 'bg-amber-50 border-amber-200/70 text-amber-700'
                        : 'bg-stone-50 border-stone-200 text-stone-500'
                    }`}
                    title={`${skill.streak}-day active streak`}
                  >
                    <Flame
                      size={13}
                      className={skill.streak > 0 ? 'fill-amber-500 text-amber-500' : 'text-stone-400'}
                    />
                    <span>{skill.streak}d</span>
                  </div>
                </div>

                {/* Level & XP stats */}
                <div className="flex items-baseline justify-between mt-4 mb-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-serif text-lg font-semibold text-charcoal">
                      Level {skill.level}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-stone-500 font-medium">
                    {skill.xp} / {nextLevelXp} XP
                  </span>
                </div>

                {/* Spotlight / Gilded XP Progress Bar */}
                <div className="relative h-2 w-full bg-stone-100 rounded-full overflow-hidden border border-stone-200/60">
                  <div
                    className="h-full bg-gradient-to-r from-gold/80 via-gold to-amber-500 rounded-full transition-all duration-700 shadow-xs motion-reduce:transition-none"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        ) : (
          <div className="py-14 flex flex-col items-center justify-center text-center bg-white border border-stone-200/80 rounded-card p-8 shadow-placard">
            <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 mb-3 shadow-2xs">
              <Sparkles size={18} className="text-gold" />
            </div>
            <h3 className="font-serif text-lg text-charcoal font-medium">No skills yet</h3>
            <p className="text-xs text-stone-500 mt-1 max-w-sm font-sans leading-relaxed">
              Create a project to start earning skill levels as you complete tasks.
            </p>
            <button
              onClick={() => setNewProjectModalOpen(true)}
              className="mt-4 px-3.5 py-1.5 text-xs font-medium text-white bg-charcoal hover:bg-stone-800 rounded-mac shadow-xs transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
            >
              Create Your First Project
            </button>
          </div>
        )}
      </div>

      {/* 3. Achievements Collection Strip */}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-serif text-xl text-charcoal font-medium">
              Achievements
            </h3>
            <p className="text-xs text-stone-500 font-sans mt-1">
              Active milestones achieved and currently in progress.
            </p>
          </div>

          {/* Filter Tabs (only showing Achieved and In Progress) */}
          {totalActiveCount > 0 && (
            <div className="inline-flex items-center bg-stone-100/90 p-0.5 rounded-mac border border-stone-200/80 text-xs overflow-x-auto max-w-full">
              <button
                onClick={() => setAchievementFilter('all')}
                className={`px-3 py-1.5 min-h-[32px] rounded-[5px] font-sans transition-all cursor-pointer ${
                  achievementFilter === 'all'
                    ? 'bg-white text-charcoal font-medium shadow-2xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                All ({totalActiveCount})
              </button>
              <button
                onClick={() => setAchievementFilter('achieved')}
                className={`px-3 py-1.5 min-h-[32px] rounded-[5px] font-sans transition-all cursor-pointer ${
                  achievementFilter === 'achieved'
                    ? 'bg-white text-charcoal font-medium shadow-2xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                Achieved ({achievedCount})
              </button>
              <button
                onClick={() => setAchievementFilter('in_progress')}
                className={`px-3 py-1.5 min-h-[32px] rounded-[5px] font-sans transition-all cursor-pointer ${
                  achievementFilter === 'in_progress'
                    ? 'bg-white text-charcoal font-medium shadow-2xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                In Progress ({inProgressCount})
              </button>
            </div>
          )}
        </div>

        {/* Project Filter Pills */}
        {activeProjects.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full text-xs">
            <button
              onClick={() => setProjectFilter('all')}
              className={`px-2.5 py-1 rounded-full font-sans transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                projectFilter === 'all'
                  ? 'bg-charcoal text-white font-medium shadow-2xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              All Projects
            </button>
            <button
              onClick={() => setProjectFilter('global')}
              className={`px-2.5 py-1 rounded-full font-sans transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                projectFilter === 'global'
                  ? 'bg-charcoal text-white font-medium shadow-2xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Global
            </button>
            {activeProjects.map((p) => {
              const isSelected = projectFilter === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setProjectFilter(p.id)}
                  className={`px-2.5 py-1 rounded-full font-sans transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-charcoal text-white font-medium shadow-2xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: p.color || '#6366f1' }}
                  />
                  <span>{p.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Achievement Cards Grid or Empty State */}
        {filteredAchievements.length === 0 ? (
          <div className="bg-stone-50/50 border border-stone-200/60 rounded-sheet p-10 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
              <Award size={22} />
            </div>
            <h4 className="font-serif text-base text-charcoal font-medium">
              {achievementFilter === 'achieved'
                ? 'No achievements unlocked yet'
                : achievementFilter === 'in_progress'
                ? 'No achievements currently in progress'
                : 'No active achievements yet'}
            </h4>
            <p className="text-xs text-stone-500 font-sans max-w-sm mx-auto leading-relaxed">
              {achievementFilter === 'achieved'
                ? inProgressCount > 0
                  ? `You have ${inProgressCount} milestone${inProgressCount !== 1 ? 's' : ''} in progress. Keep up your focus to unlock your first honors!`
                  : 'Complete tasks, build streaks, or create projects to begin unlocking honors.'
                : achievementFilter === 'in_progress'
                ? 'All tracked milestones have been achieved! Keep completing goals to embark on new milestones.'
                : 'Complete your first task or create a project to reveal your milestones.'}
            </p>
            {achievementFilter !== 'all' && totalActiveCount > 0 && (
              <button
                onClick={() => setAchievementFilter('all')}
                className="mt-2 px-3.5 py-1 text-xs font-medium text-charcoal bg-stone-100 hover:bg-stone-200 rounded-mac transition-colors cursor-pointer"
              >
                View All Active ({totalActiveCount})
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredAchievements.map((ach) => {
              const isUnlocked = Boolean(ach.unlockedAt);

              return (
                <div
                  key={ach.id}
                  className={`relative rounded-card p-4.5 border transition-all flex flex-col justify-between ${
                    isUnlocked
                      ? 'bg-gradient-to-br from-amber-50/50 via-white to-amber-50/20 border-amber-300/80 shadow-placard ring-1 ring-amber-400/20'
                      : 'bg-white/80 border-stone-200/80 hover:border-stone-300 shadow-2xs'
                  }`}
                >
                  <div>
                    {/* Header: Icon & Status Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border ${
                          isUnlocked
                            ? 'bg-gradient-to-br from-amber-100 to-amber-200/80 border-amber-300/80 text-amber-800 shadow-xs'
                            : 'bg-stone-100 border-stone-200 text-stone-400'
                        }`}
                      >
                        {isUnlocked ? (
                          <IconHelper name={ach.icon} className="text-amber-800" size={17} />
                        ) : (
                          <Lock size={14} />
                        )}
                      </div>

                      {isUnlocked ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-sans font-medium px-2 py-0.5 rounded-full bg-amber-100/90 text-amber-950 border border-amber-300/80 shadow-2xs">
                          <Check size={11} className="text-amber-800" />
                          Achieved
                        </span>
                      ) : (
                        <span className="text-[11px] font-sans text-stone-500 font-medium">
                          In Progress
                        </span>
                      )}
                    </div>

                    {/* Project Tag */}
                    {ach.projectId && (
                      <div className="flex items-center gap-1 text-[10px] font-sans font-medium text-stone-500 mb-1">
                        <Folder size={10} className="text-stone-400 shrink-0" />
                        <span className="truncate max-w-[180px]">
                          {projectsById.get(ach.projectId)?.name || 'Project'}
                        </span>
                      </div>
                    )}

                    {/* Title & Description */}
                    <h4 className="text-xs font-serif font-semibold text-charcoal">
                      {ach.title}
                    </h4>
                    <p className="text-xs text-stone-600 font-sans mt-1 line-clamp-2 leading-relaxed">
                      {ach.description}
                    </p>
                  </div>

                  {/* Footer Meta / Progress */}
                  <div className="mt-4 pt-2.5 border-t border-stone-100">
                    {isUnlocked ? (
                      <div className="flex items-center justify-between text-[11px] font-sans text-amber-950 font-medium">
                        <span className="flex items-center gap-1">
                          <Sparkles size={12} className="text-amber-600" />
                          Completed
                        </span>
                        {ach.unlockedAt && (
                          <span className="text-stone-500 font-normal">
                            {new Date(ach.unlockedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-sans text-stone-600 font-medium">
                          <span>Progress</span>
                          <span className="font-mono text-stone-700">
                            {ach.progress} / {ach.maxProgress}
                          </span>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-1 overflow-hidden">
                          <div
                            className="bg-stone-400 h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round((ach.progress / ach.maxProgress) * 100)
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
