import React from 'react';
import { Habit } from '../../types';
import { useEkirumStore } from '../../store/useEkirumStore';
import { IconHelper } from '../common/IconHelper';
import { Flame, Check, Edit3 } from 'lucide-react';
import { formatLocalDate } from '../../lib/dateParser';

interface HabitCardProps {
  habit: Habit;
  weekDates: { dateStr: string; dayName: string; dayNumber: number; isToday: boolean }[];
}

export const HabitCard: React.FC<HabitCardProps> = ({ habit, weekDates }) => {
  const { toggleHabitDate, setEditingHabitId, projects, skills } = useEkirumStore();

  const linkedProject = projects.find((p) => p.id === habit.projectId);
  const linkedSkill = linkedProject ? skills.find((s) => s.id === linkedProject.skillId) : null;

  const todayStr = formatLocalDate(new Date());
  const isCompletedToday = habit.completedDates.includes(todayStr);

  const totalCheckIns = habit.completedDates.length;

  return (
    <div className="group relative bg-white border border-stone-200/90 rounded-card p-5 transition-all duration-200 hover:border-stone-300 hover:shadow-placard flex flex-col justify-between">
      {/* Top Header: Icon, Title, Streak, Edit Button */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-mac flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105 border"
              style={{
                backgroundColor: habit.color ? `${habit.color}10` : '#FBF0F2',
                borderColor: habit.color ? `${habit.color}30` : '#8B152830',
                color: habit.color || '#8B1528',
              }}
            >
              <IconHelper name={habit.icon || 'Compass'} size={16} strokeWidth={1.5} />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-base font-medium text-charcoal truncate">
                  {habit.title}
                </h3>
              </div>

              {habit.description && (
                <p className="text-xs text-stone-500 font-sans mt-0.5 line-clamp-1">
                  {habit.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Streak flame */}
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-mono transition-colors ${
                habit.streak > 0
                  ? 'bg-amber-50 border-amber-200/80 text-amber-700'
                  : 'bg-stone-50 border-stone-200/80 text-stone-500'
              }`}
              title={`Current streak: ${habit.streak} days (Best: ${habit.longestStreak} days)`}
            >
              <Flame
                size={12}
                className={habit.streak > 0 ? 'fill-amber-500 text-amber-500' : 'text-stone-400'}
              />
              <span className="font-medium">{habit.streak}d</span>
            </div>

            {/* Edit button */}
            <button
              onClick={() => setEditingHabitId(habit.id)}
              className="sm:opacity-0 sm:group-hover:opacity-100 opacity-100 focus-visible:opacity-100 p-2 min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center text-stone-500 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-all focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer relative before:absolute before:-inset-1"
              title="Edit habit settings"
              aria-label={`Edit habit settings for ${habit.title}`}
            >
              <Edit3 size={14} />
            </button>
          </div>
        </div>

        {/* Placard metadata strip */}
        <div className="flex flex-wrap items-center gap-2.5 mt-3 pt-2.5 border-t border-stone-100 text-[11px] text-stone-600 font-sans">
          <span className="capitalize text-stone-700 bg-stone-100 px-1.5 py-0.2 rounded text-[10px] font-medium">
            {habit.frequency}
          </span>

          {linkedProject && (
            <div className="flex items-center gap-1 text-stone-600">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: linkedProject.color || '#8B1528' }}
              />
              <span className="truncate max-w-[120px]">{linkedProject.name}</span>
              {linkedSkill && (
                <span className="text-[10px] text-stone-500">
                  (Skill Lv.{linkedSkill.level})
                </span>
              )}
            </div>
          )}

          <span>{totalCheckIns} check-in{totalCheckIns !== 1 ? 's' : ''} total</span>

          {isCompletedToday && (
            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.2 rounded text-[10px] font-medium">
              Done today
            </span>
          )}

          {habit.longestStreak > 0 && (
            <span className="hidden sm:inline text-stone-500">Best: {habit.longestStreak}d</span>
          )}
        </div>
      </div>

      {/* 7-Day Interactive Cadence Grid */}
      <div className="mt-4 pt-3 border-t border-stone-100">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {weekDates.map((day) => {
            const isCompleted = habit.completedDates.includes(day.dateStr);

            return (
              <button
                key={day.dateStr}
                onClick={() => toggleHabitDate(habit.id, day.dateStr)}
                className={`group/day flex flex-col items-center justify-center p-2 min-h-[44px] rounded-mac border transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-crimson focus-visible:outline-none ${
                  isCompleted
                    ? 'bg-crimson/10 border-crimson/40 text-crimson shadow-2xs'
                    : day.isToday
                    ? 'bg-stone-50 border-stone-300 text-stone-700 hover:border-crimson/60 hover:bg-stone-100'
                    : 'bg-white border-stone-200/70 text-stone-600 hover:border-stone-300 hover:text-stone-800'
                }`}
                title={`${day.dateStr}: ${isCompleted ? 'Completed (Click to uncheck)' : 'Click to complete'}`}
                aria-label={`${habit.title} check-in for ${day.dayName} ${day.dayNumber}: ${isCompleted ? 'Completed' : 'Not completed'}`}
              >
                <span className="text-[10px] font-sans uppercase tracking-wider text-stone-500 group-hover/day:text-stone-700">
                  {day.dayName}
                </span>

                <span className={`text-xs font-sans font-medium mt-0.5 ${day.isToday ? 'font-bold underline decoration-crimson decoration-2 underline-offset-2' : ''}`}>
                  {day.dayNumber}
                </span>

                <div
                  className={`mt-1.5 w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                    isCompleted
                      ? 'bg-crimson border-crimson text-white scale-105'
                      : 'border-stone-300 bg-white group-hover/day:border-stone-400'
                  }`}
                >
                  {isCompleted ? (
                    <Check size={10} strokeWidth={2.5} />
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-transparent group-hover/day:bg-stone-300" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
