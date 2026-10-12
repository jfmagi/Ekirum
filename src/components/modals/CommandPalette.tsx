import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import {
  Search,
  CheckCircle2,
  Calendar,
  CalendarDays,
  User,
  Plus,
  Folder,
  X,
  Volume2,
  Repeat,
  HardDrive,
  HelpCircle,
  BookOpen,
} from 'lucide-react';

export const CommandPalette: React.FC = () => {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setCurrentView,
    projects,
    tasks,
    habits,
    openTaskDetail,
    setQuickAddOpen,
    setNewProjectModalOpen,
    setNewHabitModalOpen,
    setBackupModalOpen,
    setHelpModalOpen,
    toggleSound,
  } = useEkirumStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedItemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [commandPaletteOpen]);

  // Items to search through
  type PaletteItem = {
    id: string;
    type: 'nav' | 'action' | 'project' | 'task';
    title: string;
    subtitle?: string;
    icon: React.ReactNode;
    action: () => void;
  };

  const navItems: PaletteItem[] = [
    {
      id: 'nav-today',
      type: 'nav',
      title: "Go to Now o'clock",
      subtitle: 'View tasks due now and today',
      icon: <Calendar size={14} className="text-crimson" />,
      action: () => {
        setCurrentView('today');
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'nav-calendar',
      type: 'nav',
      title: 'Go to Calendar',
      subtitle: 'View interactive calendar & schedule of tasks',
      icon: <CalendarDays size={14} className="text-stone-500" />,
      action: () => {
        setCurrentView('calendar');
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'nav-habits',
      type: 'nav',
      title: 'Go to Habits',
      subtitle: 'View daily rituals, streaks, and cadence',
      icon: <Repeat size={14} className="text-stone-500" />,
      action: () => {
        setCurrentView('habits');
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'nav-library',
      type: 'nav',
      title: 'Go to Library',
      subtitle: 'Reading list, watchlist, and gallery of finished items',
      icon: <BookOpen size={14} className="text-stone-500" />,
      action: () => {
        setCurrentView('library');
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'nav-character',
      type: 'nav',
      title: 'Go to Character',
      subtitle: 'View skills, levels, and achievements',
      icon: <User size={14} className="text-gold" />,
      action: () => {
        setCurrentView('character');
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'act-new-task',
      type: 'action',
      title: 'New Task',
      subtitle: 'Open task creation bar',
      icon: <Plus size={14} className="text-crimson" />,
      action: () => {
        setCommandPaletteOpen(false);
        setQuickAddOpen(true);
      },
    },
    {
      id: 'act-new-habit',
      type: 'action',
      title: 'New Habit',
      subtitle: 'Create a new daily cadence or ritual',
      icon: <Plus size={14} className="text-stone-600" />,
      action: () => {
        setCommandPaletteOpen(false);
        setNewHabitModalOpen(true);
      },
    },
    {
      id: 'act-new-proj',
      type: 'action',
      title: 'New Project',
      subtitle: 'Create a new project and linked skill',
      icon: <Folder size={14} className="text-stone-600" />,
      action: () => {
        setCommandPaletteOpen(false);
        setNewProjectModalOpen(true);
      },
    },
    {
      id: 'act-backup',
      type: 'action',
      title: 'Data Safety & Backup',
      subtitle: 'Download backup (.json), connect sync folder, or restore data',
      icon: <HardDrive size={14} className="text-stone-600" />,
      action: () => {
        setCommandPaletteOpen(false);
        setBackupModalOpen(true);
      },
    },
    {
      id: 'act-toggle-audio',
      type: 'action',
      title: 'Toggle Sound Effects',
      subtitle: 'Turn acoustic chime audio on or off',
      icon: <Volume2 size={14} className="text-stone-600" />,
      action: () => {
        toggleSound();
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'act-guide',
      type: 'action',
      title: 'System Guide & Priorities (P1–P4)',
      subtitle: 'Learn priority XP rewards, syntax, and shortcuts (?)',
      icon: <HelpCircle size={14} className="text-stone-600" />,
      action: () => {
        setCommandPaletteOpen(false);
        setHelpModalOpen(true);
      },
    },
  ];

  const normalizedQuery = query.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    // Nav items
    const matchingNav = normalizedQuery
      ? navItems.filter(
          (item) =>
            item.title.toLowerCase().includes(normalizedQuery) ||
            item.subtitle?.toLowerCase().includes(normalizedQuery)
        )
      : navItems;

    // Habit items
    const matchingHabits = habits
      .filter((h) => {
        if (!normalizedQuery) return true;
        return (
          h.title.toLowerCase().includes(normalizedQuery) ||
          h.frequency.toLowerCase().includes(normalizedQuery)
        );
      })
      .map((h): PaletteItem => ({
        id: `habit-${h.id}`,
        type: 'action',
        title: h.title,
        subtitle: `${h.frequency} ritual • ${h.streak}d streak`,
        icon: <Repeat size={14} className="text-stone-500" />,
        action: () => {
          setCurrentView('habits');
          setCommandPaletteOpen(false);
        },
      }));

    // Project items
    const matchingProjects = projects
      .filter((p) => {
        if (!normalizedQuery) return true;
        return p.name.toLowerCase().includes(normalizedQuery);
      })
      .map((p): PaletteItem => ({
        id: `proj-${p.id}`,
        type: 'project',
        title: p.name,
        subtitle: 'Project & Skill',
        icon: <Folder size={14} className="text-stone-500" />,
        action: () => {
          setCurrentView('project', p.id);
          setCommandPaletteOpen(false);
        },
      }));

    // Matching task items: filter uncompleted tasks BEFORE taking top 15 matches
    const matchingTasks = tasks
      .filter((t) => {
        if (t.completed) return false;
        if (!normalizedQuery) return true;
        return (
          t.title.toLowerCase().includes(normalizedQuery) ||
          (t.notes ? t.notes.toLowerCase().includes(normalizedQuery) : false)
        );
      })
      .slice(0, 15)
      .map((t): PaletteItem => ({
        id: `task-${t.id}`,
        type: 'task',
        title: t.title,
        subtitle: t.dueDate ? `Due ${t.dueDate}` : 'No due date',
        icon: <CheckCircle2 size={14} className="text-stone-500" />,
        action: () => {
          openTaskDetail(t.id);
          setCommandPaletteOpen(false);
        },
      }));

    return [
      ...matchingNav,
      ...matchingHabits,
      ...matchingProjects,
      ...matchingTasks,
    ];
  }, [
    normalizedQuery,
    habits,
    projects,
    tasks,
    setCurrentView,
    setCommandPaletteOpen,
    openTaskDetail,
  ]);

  // Ensure selectedIndex is always valid for the filtered results
  useEffect(() => {
    if (selectedIndex >= filteredItems.length && filteredItems.length > 0) {
      setSelectedIndex(0);
    }
  }, [filteredItems.length, selectedIndex]);

  // Scroll active item smoothly into view
  useEffect(() => {
    if (commandPaletteOpen && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [selectedIndex, commandPaletteOpen]);

  const handleKeyDown = (e: React.KeyboardEvent | KeyboardEvent) => {
    if (!commandPaletteOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length === 0 ? 0 : (prev + 1) % filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length === 0 ? 0 : (prev - 1 + filteredItems.length) % filteredItems.length));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        setSelectedIndex((prev) => (filteredItems.length === 0 ? 0 : (prev - 1 + filteredItems.length) % filteredItems.length));
      } else {
        setSelectedIndex((prev) => (filteredItems.length === 0 ? 0 : (prev + 1) % filteredItems.length));
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    }
  };

  // Window-level hotkey listener (Cmd+K, Esc, and navigation fallback)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
        return;
      }

      if (e.key === 'Escape' && commandPaletteOpen) {
        e.preventDefault();
        setCommandPaletteOpen(false);
        return;
      }

      // If palette is open and user pressed navigation keys while focus is not in an input
      if (commandPaletteOpen && document.activeElement !== inputRef.current) {
        if (['ArrowDown', 'ArrowUp', 'Tab', 'Home', 'End', 'Enter'].includes(e.key)) {
          handleKeyDown(e);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen, selectedIndex, filteredItems]);

  if (!commandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-20 bg-black/25 backdrop-blur-xs p-3 sm:p-4 pb-[env(safe-area-inset-bottom,0px)]"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white rounded-sheet border border-stone-200/90 shadow-modal overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-stone-200">
          <Search size={16} className="text-stone-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command, project, or task name..."
            className="flex-1 text-base sm:text-sm bg-transparent border-none focus:outline-none placeholder-stone-500 text-charcoal font-sans"
            autoFocus
          />
          <button
            onClick={() => setCommandPaletteOpen(false)}
            className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center text-stone-500 hover:text-stone-800 p-2 sm:p-1.5 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
            aria-label="Close command palette"
          >
            <X size={15} />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
          {filteredItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <div
                key={item.id}
                ref={isSelected ? selectedItemRef : undefined}
                onClick={item.action}
                onMouseMove={() => {
                  if (selectedIndex !== index) setSelectedIndex(index);
                }}
                className={`flex items-center justify-between px-3 py-2.5 sm:py-2 min-h-[40px] sm:min-h-[34px] rounded-mac text-xs cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-stone-100 text-charcoal font-medium'
                    : 'text-stone-600 hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  {item.icon}
                  <span className="truncate">{item.title}</span>
                </div>
                {item.subtitle && (
                  <span className="text-[10px] text-stone-500 font-mono flex-shrink-0 font-medium">
                    {item.subtitle}
                  </span>
                )}
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="py-8 text-center text-xs text-stone-500">
              No matching commands or tasks found
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-stone-50/70 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-500 font-mono font-medium">
          <span>Navigate with ↑ ↓ (or Tab) and Enter</span>
          <span>Esc to exit</span>
        </div>
      </div>
    </div>
  );
};
