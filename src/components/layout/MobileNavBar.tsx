import React, { useMemo } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import {
  Calendar,
  CalendarDays,
  Repeat,
  User,
  Plus,
} from 'lucide-react';
import { ViewType } from '../../types';
import { formatLocalDate } from '../../lib/dateParser';

export const MobileNavBar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    tasks,
    habits,
    user,
    setQuickAddOpen,
  } = useEkirumStore();

  const todayStr = formatLocalDate();

  const todayCount = useMemo(() => {
    let count = 0;
    for (const t of tasks) {
      if (!t.isDeleted && !t.completed && (t.dueDate === todayStr || (t.dueDate && t.dueDate < todayStr))) {
        count++;
      }
    }
    return count;
  }, [tasks, todayStr]);

  const habitsCount = useMemo(() => {
    return habits.filter((h) => !h.archived).length;
  }, [habits]);

  const navItems: { view: ViewType; label: string; icon: React.ReactNode; badge?: number | string }[] = [
    {
      view: 'today',
      label: 'Now',
      icon: <Calendar size={18} />,
      badge: todayCount > 0 ? todayCount : undefined,
    },
    {
      view: 'calendar',
      label: 'Calendar',
      icon: <CalendarDays size={18} />,
    },
    {
      view: 'habits',
      label: 'Habits',
      icon: <Repeat size={18} />,
      badge: habitsCount > 0 ? habitsCount : undefined,
    },
    {
      view: 'character',
      label: 'Character',
      icon: user.avatar ? (
        <img
          src={user.avatar}
          alt={user.name}
          className="w-4.5 h-4.5 rounded-full object-cover ring-1 ring-stone-300"
        />
      ) : (
        <User size={18} />
      ),
      badge: `Lv${user.ekirumLevel ?? 1}`,
    },
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-[#FBFBF9]/95 backdrop-blur-xl border-t border-stone-200/90 safe-area-bottom select-none shadow-[0_-4px_16px_rgba(0,0,0,0.04)]"
    >
      <div className="flex items-center justify-around px-2 h-14 max-w-md mx-auto">
        {/* Left items: Now, Calendar */}
        {navItems.slice(0, 2).map((item) => {
          const isActive = currentView === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => setCurrentView(item.view)}
              className={`flex-1 min-h-[44px] flex flex-col items-center justify-center py-1 transition-all active:scale-95 cursor-pointer focus-visible:outline-none ${
                isActive ? 'text-crimson' : 'text-stone-500 hover:text-charcoal'
              }`}
              aria-label={`Go to ${item.label}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative flex items-center justify-center">
                {item.icon}
                {item.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 min-w-[14px] h-[14px] px-0.5 rounded-full bg-crimson text-white text-[9px] font-sans font-semibold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-sans mt-0.5 tracking-tight ${isActive ? 'font-semibold text-charcoal' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Center: Prominent Thumb Quick Add Action Button */}
        <div className="flex-1 flex items-center justify-center">
          <button
            type="button"
            onClick={() => setQuickAddOpen(true)}
            className="w-10 h-10 rounded-full bg-crimson hover:bg-crimson-hover text-white shadow-md flex items-center justify-center transition-all active:scale-90 cursor-pointer focus-visible:ring-2 focus-visible:ring-crimson focus-visible:outline-none"
            title="Quick Add Task"
            aria-label="Quick Add Task"
          >
            <Plus size={20} strokeWidth={2.2} />
          </button>
        </div>

        {/* Right items: Habits, Character */}
        {navItems.slice(2).map((item) => {
          const isActive = currentView === item.view;
          return (
            <button
              key={item.view}
              type="button"
              onClick={() => setCurrentView(item.view)}
              className={`flex-1 min-h-[44px] flex flex-col items-center justify-center py-1 transition-all active:scale-95 cursor-pointer focus-visible:outline-none ${
                isActive ? 'text-crimson' : 'text-stone-500 hover:text-charcoal'
              }`}
              aria-label={`Go to ${item.label}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative flex items-center justify-center">
                {item.icon}
                {item.badge !== undefined && (
                  <span className="absolute -top-1 -right-2 px-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[8px] font-sans font-semibold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-sans mt-0.5 tracking-tight ${isActive ? 'font-semibold text-charcoal' : 'font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
