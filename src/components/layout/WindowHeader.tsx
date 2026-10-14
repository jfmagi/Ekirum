import React from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import {
  Search,
  Menu,
  Flame,
} from 'lucide-react';

export const WindowHeader: React.FC = () => {
  const setCurrentView = useEkirumStore((s) => s.setCurrentView);
  const setCommandPaletteOpen = useEkirumStore((s) => s.setCommandPaletteOpen);
  const mobileSidebarOpen = useEkirumStore((s) => s.mobileSidebarOpen);
  const setMobileSidebarOpen = useEkirumStore((s) => s.setMobileSidebarOpen);
  const user = useEkirumStore((s) => s.user);
  const maxStreak = useEkirumStore((s) =>
    s.skills.reduce((max, sk) => Math.max(max, sk.streak), 0)
  );

  return (
    <header className="min-h-13 border-b border-stone-200/80 bg-stone-50/80 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between select-none z-10 sticky top-0 safe-area-top">
      {/* Left side: Mobile menu toggle + Stable Profile Mini Display */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        {/* Mobile menu toggle */}
        <button
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="md:hidden min-w-[44px] min-h-[44px] p-2.5 -ml-1.5 text-stone-600 hover:text-charcoal hover:bg-stone-200/60 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer flex-shrink-0 flex items-center justify-center active:scale-95"
          title="Toggle Navigation & Projects"
          aria-label="Toggle navigation sidebar menu"
        >
          <Menu size={18} />
        </button>

        {/* Profile Mini Display */}
        {(() => {
          const userRank = user.ekirumRank ?? 'Novice';
          return (
            <button
              onClick={() => setCurrentView('character')}
              className="flex items-center gap-2 px-2 py-1.5 min-h-[44px] sm:min-h-[34px] rounded-mac text-stone-700 hover:text-charcoal hover:bg-stone-200/50 transition-colors text-left group focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer flex-shrink-0"
              title="Character Profile (Shortcut: 5)"
              aria-label={`Character Profile: ${userRank} ${user.name} (Shortcut: 5)`}
            >
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-5.5 h-5.5 rounded-full object-cover ring-1 ring-stone-300/80 flex-shrink-0"
                />
              ) : (
                <div className="w-5.5 h-5.5 rounded-full bg-stone-900 text-white flex items-center justify-center text-[11px] font-serif flex-shrink-0 font-medium">
                  {user.name ? user.name.slice(0, 2).toUpperCase() : 'EK'}
                </div>
              )}

              <div className="flex items-center gap-1.5 min-w-0 font-serif">
                <span
                  className="text-xs font-serif text-stone-500 font-medium tracking-tight flex-shrink-0"
                  title={`Title: ${userRank}`}
                >
                  {userRank}
                </span>
                <span className="text-xs font-medium text-charcoal truncate max-w-[110px] sm:max-w-[160px] group-hover:text-black">
                  {user.name}
                </span>
              </div>

              {maxStreak > 0 && (
                <div
                  className="flex items-center gap-0.5 text-xs text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded-full border border-amber-300/60 ml-0.5 flex-shrink-0 font-medium"
                  title={`${maxStreak}-day streak`}
                >
                  <Flame size={11} className="fill-amber-600 text-amber-600" />
                  <span className="text-[11px] font-sans font-medium">{maxStreak}d</span>
                </div>
              )}
            </button>
          );
        })()}
      </div>

      {/* Right side: Search & Command Bar Trigger */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="min-h-[44px] min-w-[44px] sm:min-h-[34px] sm:min-w-auto flex items-center justify-center sm:justify-start gap-2 px-3 sm:px-2.5 py-1.5 text-xs text-stone-700 bg-white/90 border border-stone-200 hover:border-stone-300 rounded-mac shadow-xs transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer active:scale-95"
          title="Search & Commands (Cmd+K)"
          aria-label="Search tasks and command palette (Shortcut: Cmd+K)"
        >
          <Search size={14} className="text-stone-500" />
          <span className="hidden sm:inline">Search & Actions</span>
          <kbd className="hidden sm:inline-block text-[11px] bg-stone-100 text-stone-600 px-1 py-0.5 rounded font-sans border border-stone-200">
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
};
