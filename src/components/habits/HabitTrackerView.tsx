import React, { useState } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { HabitCard } from './HabitCard';
import {
  Flame,
  Plus,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  CalendarCheck,
} from 'lucide-react';

import { formatLocalDate } from '../../lib/dateParser';

export const HabitTrackerView: React.FC = () => {
  const habits = useEkirumStore((s) => s.habits);
  const setNewHabitModalOpen = useEkirumStore((s) => s.setNewHabitModalOpen);

  // Offset in weeks from current week (0 = current week, -1 = last week, etc.)
  const [weekOffset, setWeekOffset] = useState(0);

  const today = new Date();
  const todayStr = formatLocalDate(today);

  // Compute 7 days for the selected week
  // We align with Monday-Sunday or the last 7 days ending with today when offset is 0
  const getWeekDates = (offset: number) => {
    const dates = [];
    const baseDate = new Date();
    // Shift by weeks
    baseDate.setDate(baseDate.getDate() + offset * 7);

    // Monday to Sunday for the current week:
    const currentDayOfWeek = baseDate.getDay(); // 0 is Sunday, 1 is Monday
    const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + mondayOffset);

    const dayLetters = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = formatLocalDate(d);
      dates.push({
        dateStr,
        dayName: dayLetters[i],
        dayNumber: d.getDate(),
        isToday: dateStr === todayStr,
      });
    }

    return dates;
  };

  const weekDates = getWeekDates(weekOffset);

  // Overall Statistics
  const activeHabits = habits.filter((h) => !h.archived);
  const completedTodayCount = activeHabits.filter((h) => h.completedDates.includes(todayStr)).length;
  const todayPercentage = activeHabits.length > 0 ? Math.round((completedTodayCount / activeHabits.length) * 100) : 0;
  const bestStreak = activeHabits.reduce((max, h) => Math.max(max, h.streak), 0);
  const totalLifetimeCheckIns = activeHabits.reduce((sum, h) => sum + h.completedDates.length, 0);

  // Format week range label
  const [fy, fm, fd] = weekDates[0].dateStr.split('-').map(Number);
  const firstDate = new Date(fy, fm - 1, fd);
  const [ly, lm, ld] = weekDates[6].dateStr.split('-').map(Number);
  const lastDate = new Date(ly, lm - 1, ld);
  const rangeLabel = `${firstDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="max-w-4xl mx-auto w-full px-3.5 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8">
      {/* 1. Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-crimson" />
            <h2 className="font-serif text-2xl font-medium text-charcoal">
              Habits
            </h2>
            <span className="text-xs font-mono text-stone-500 font-medium">
              ({activeHabits.length})
            </span>
          </div>
          <p className="text-xs text-stone-500 font-sans mt-0.5">
            Daily cadence & repeatable rituals. Check-ins award XP to linked skills.
          </p>
        </div>

        <button
          onClick={() => setNewHabitModalOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[36px] text-xs font-medium text-white bg-crimson hover:bg-crimson-hover rounded-mac shadow-xs transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-stone-400 cursor-pointer font-sans"
        >
          <Plus size={14} />
          <span>New Habit</span>
        </button>
      </div>

      {/* 2. Overview Metric Placards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Today's Completion Rate */}
        <div className="bg-white border border-stone-200/90 rounded-card p-3.5 sm:p-4 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-[11px] font-sans text-stone-500 uppercase tracking-wider font-semibold">
            <span>Today's Cadence</span>
            <span className="text-charcoal font-semibold">{todayPercentage}%</span>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="text-xl sm:text-2xl font-serif font-medium text-charcoal">
              {completedTodayCount}
              <span className="text-xs sm:text-sm font-sans text-stone-500 font-normal"> / {activeHabits.length}</span>
            </div>
            <span className="text-[11px] sm:text-xs text-stone-600 font-sans hidden sm:inline">completed</span>
          </div>
          <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-crimson h-full rounded-full transition-all duration-500"
              style={{ width: `${todayPercentage}%` }}
            />
          </div>
        </div>

        {/* Active Habits */}
        <div className="bg-white border border-stone-200/90 rounded-card p-3.5 sm:p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-sans text-stone-500 uppercase tracking-wider font-semibold">
            Active Habits
          </span>
          <div className="text-xl sm:text-2xl font-serif font-medium text-charcoal">
            {activeHabits.length}
          </div>
          <p className="text-[10px] sm:text-[11px] text-stone-500 font-sans line-clamp-1">
            Consistent disciplines
          </p>
        </div>

        {/* Best Current Streak */}
        <div className="bg-white border border-stone-200/90 rounded-card p-3.5 sm:p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-sans text-stone-500 uppercase tracking-wider font-semibold">
            Best Streak
          </span>
          <div className="flex items-center gap-1.5 text-xl sm:text-2xl font-serif font-medium text-amber-700">
            <Flame size={18} className="fill-amber-500 text-amber-500 flex-shrink-0" />
            <span>{bestStreak}d</span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-stone-500 font-sans line-clamp-1">
            Focus days
          </p>
        </div>

        {/* Total Check-ins */}
        <div className="bg-white border border-stone-200/90 rounded-card p-3.5 sm:p-4 shadow-2xs space-y-1">
          <span className="text-[11px] font-sans text-stone-500 uppercase tracking-wider font-semibold">
            Total Check-ins
          </span>
          <div className="text-xl sm:text-2xl font-serif font-medium text-charcoal">
            {totalLifetimeCheckIns}
          </div>
          <p className="text-[10px] sm:text-[11px] text-stone-500 font-sans line-clamp-1">
            Ritual completions
          </p>
        </div>
      </div>

      {/* 3. Week Navigator Strip */}
      <div className="flex items-center justify-between bg-stone-100/70 border border-stone-200/80 rounded-mac px-3.5 py-2">
        <div className="flex items-center gap-2 text-xs font-sans text-stone-600">
          <CalendarCheck size={14} className="text-stone-500 flex-shrink-0" />
          <span className="font-medium text-charcoal truncate">{rangeLabel}</span>
          {weekOffset === 0 && (
            <span className="hidden sm:inline text-[10px] bg-stone-200/80 text-stone-700 px-1.5 py-0.2 rounded-full font-sans">
              Current Week
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setWeekOffset((prev) => prev - 1)}
            className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-stone-500 hover:text-charcoal hover:bg-stone-200/60 rounded transition-colors cursor-pointer"
            title="Previous week"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>

          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="px-2.5 py-1 min-h-[32px] text-[11px] font-mono text-stone-500 hover:text-charcoal hover:bg-stone-200/60 rounded transition-colors flex items-center gap-1 cursor-pointer"
              title="Return to current week"
            >
              <RotateCcw size={11} />
              <span>Today</span>
            </button>
          )}

          <button
            onClick={() => setWeekOffset((prev) => prev + 1)}
            className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-stone-500 hover:text-charcoal hover:bg-stone-200/60 rounded transition-colors cursor-pointer"
            title="Next week"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* 4. Habits List */}
      {activeHabits.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {activeHabits.map((habit) => (
            <HabitCard key={habit.id} habit={habit} weekDates={weekDates} />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="py-20 flex flex-col items-center justify-center text-center bg-white border border-stone-200/80 rounded-card p-8">
          <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 mb-4 shadow-2xs">
            <Sparkles size={20} className="text-gold" />
          </div>
          <h3 className="font-serif text-lg text-charcoal font-medium">
            No habits established yet
          </h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm font-sans leading-relaxed">
            Cultivate deliberate daily rituals. Every check-in maintains your streak and awards XP to your linked skills.
          </p>
          <button
            onClick={() => setNewHabitModalOpen(true)}
            className="mt-5 px-3.5 py-1.5 text-xs font-medium text-white bg-crimson hover:bg-crimson-hover rounded-mac shadow-xs transition-all focus-visible:ring-2 focus-visible:ring-stone-400 cursor-pointer"
          >
            Create Your First Habit
          </button>
        </div>
      )}
    </div>
  );
};
