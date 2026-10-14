import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { useShallow } from 'zustand/react/shallow';
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

type PaletteItem = {
  id: string;
  type: 'nav' | 'action' | 'project' | 'task';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
};

interface CommandPaletteDialogProps {
  onClose: () => void;
}

const CommandPaletteDialog: React.FC<CommandPaletteDialogProps> = ({ onClose }) => {
  const {
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
  } = useEkirumStore(
    useShallow((s) => ({
      setCurrentView: s.setCurrentView,
      projects: s.projects,
      tasks: s.tasks,
      habits: s.habits,
      openTaskDetail: s.openTaskDetail,
      setQuickAddOpen: s.setQuickAddOpen,
      setNewProjectModalOpen: s.setNewProjectModalOpen,
      setNewHabitModalOpen: s.setNewHabitModalOpen,
      setBackupModalOpen: s.setBackupModalOpen,
      setHelpModalOpen: s.setHelpModalOpen,
      toggleSound: s.toggleSound,
    }))
  );

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedItemRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const navItems: PaletteItem[] = useMemo(
    () => [
      {
        id: 'nav-today',
        type: 'nav',
        title: "Go to Now o'clock",
        subtitle: 'View tasks due now and today',
        icon: <Calendar size={14} className="text-crimson" />,
        action: () => {
          setCurrentView('today');
          onClose();
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
          onClose();
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
          onClose();
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
          onClose();
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
          onClose();
        },
      },
      {
        id: 'act-new-task',
        type: 'action',
        title: 'New Task',
        subtitle: 'Open task creation bar',
        icon: <Plus size={14} className="text-crimson" />,
        action: () => {
          onClose();
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
          onClose();
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
          onClose();
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
          onClose();
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
          onClose();
        },
      },
      {
        id: 'act-guide',
        type: 'action',
        title: 'System Guide & Priorities (P1–P4)',
        subtitle: 'Learn priority XP rewards, syntax, and shortcuts (?)',
        icon: <HelpCircle size={14} className="text-stone-600" />,
        action: () => {
          onClose();
          setHelpModalOpen(true);
        },
      },
    ],
    [
      setCurrentView,
      onClose,
      setQuickAddOpen,
      setNewHabitModalOpen,
      setNewProjectModalOpen,
      setBackupModalOpen,
      toggleSound,
      setHelpModalOpen,
    ]
  );

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
          onClose();
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
          onClose();
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
          onClose();
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
    navItems,
    habits,
    projects,
    tasks,
    setCurrentView,
    onClose,
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
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent | KeyboardEvent) => {
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
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  // Keyboard navigation fallback when focus is not inside input
  useEffect(() => {
    const handleActiveKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement !== inputRef.current) {
        if (['ArrowDown', 'ArrowUp', 'Tab', 'Home', 'End', 'Enter', 'Escape'].includes(e.key)) {
          handleKeyDown(e);
        }
      }
    };

    window.addEventListener('keydown', handleActiveKeyDown);
    return () => window.removeEventListener('keydown', handleActiveKeyDown);
  }, [filteredItems, selectedIndex]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-20 bg-black/25 backdrop-blur-xs p-3 sm:p-4 pb-[env(safe-area-inset-bottom,0px)]"
      onClick={onClose}
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
            placeholder="Type a command, project, ritual, or search tasks..."
            className="w-full text-sm bg-transparent border-none outline-none text-charcoal placeholder-stone-400 font-sans"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="text-stone-400 hover:text-stone-600 p-1 cursor-pointer"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
          <span className="hidden sm:inline-block text-[10px] font-mono text-stone-600 bg-stone-100 border border-stone-200/80 px-1.5 py-0.5 rounded">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] sm:max-h-96 overflow-y-auto p-2 divide-y divide-stone-100/60">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-400 font-sans">
              No matching commands, habits, or tasks found.
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredItems.map((item, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <div
                    key={item.id}
                    ref={isSelected ? selectedItemRef : null}
                    onClick={() => item.action()}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-mac cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-stone-100 text-charcoal'
                        : 'text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                        {item.icon}
                      </div>
                      <div className="min-w-0 flex flex-col">
                        <span className="text-xs font-medium truncate font-sans text-stone-800">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="text-[11px] text-stone-600 truncate font-sans">
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="text-[10px] font-mono text-stone-600 bg-white border border-stone-200 px-1.5 py-0.5 rounded shadow-2xs">
                        ↵ Return
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="px-3.5 py-2 bg-stone-50 border-t border-stone-200/80 flex items-center justify-between text-[11px] text-stone-600 select-none">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono bg-white border border-stone-200 px-1 py-0.5 rounded shadow-2xs mr-1 text-[10px]">
                ↑
              </kbd>
              <kbd className="font-mono bg-white border border-stone-200 px-1 py-0.5 rounded shadow-2xs mr-1 text-[10px]">
                ↓
              </kbd>
              Navigate
            </span>
            <span>
              <kbd className="font-mono bg-white border border-stone-200 px-1 py-0.5 rounded shadow-2xs mr-1 text-[10px]">
                ↵
              </kbd>
              Select
            </span>
          </div>
          <span className="hidden sm:inline font-sans text-[10px] text-stone-600">
            {filteredItems.length} {filteredItems.length === 1 ? 'result' : 'results'}
          </span>
        </div>
      </div>
    </div>
  );
};

export const CommandPalette: React.FC = () => {
  const commandPaletteOpen = useEkirumStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useEkirumStore((s) => s.setCommandPaletteOpen);

  // Global window listener for Cmd+K to open/toggle palette
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  return <CommandPaletteDialog onClose={() => setCommandPaletteOpen(false)} />;
};
