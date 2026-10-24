import React, { useMemo } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { IconHelper } from '../common/IconHelper';
import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  User,
  Plus,
  Repeat,
  X,
  HelpCircle,
  HardDrive,
  BookOpen,
} from 'lucide-react';
import { ViewType } from '../../types';
import { formatLocalDate, isTaskOngoing, getTaskEndDateTime } from '../../lib/dateParser';

import { useShallow } from 'zustand/react/shallow';

export const Sidebar: React.FC = () => {
  const {
    currentView,
    selectedProjectId,
    setCurrentView,
    tasks,
    projects,
    habits,
    libraryItems,
    user,
    setNewProjectModalOpen,
    setHelpModalOpen,
    setBackupModalOpen,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  } = useEkirumStore(
    useShallow((s) => ({
      currentView: s.currentView,
      selectedProjectId: s.selectedProjectId,
      setCurrentView: s.setCurrentView,
      tasks: s.tasks,
      projects: s.projects,
      habits: s.habits,
      libraryItems: s.libraryItems,
      user: s.user,
      setNewProjectModalOpen: s.setNewProjectModalOpen,
      setHelpModalOpen: s.setHelpModalOpen,
      setBackupModalOpen: s.setBackupModalOpen,
      mobileSidebarOpen: s.mobileSidebarOpen,
      setMobileSidebarOpen: s.setMobileSidebarOpen,
    }))
  );

  const todayStr = formatLocalDate();

  // Precompute all task counts and project task maps in a single O(tasks) pass
  const { todayCount, calendarCount, projectTaskCountMap } = useMemo(() => {
    let today = 0;
    let calendar = 0;
    const projectMap = new Map<string, number>();

    for (const t of tasks) {
      if (t.isDeleted || t.completed) continue;

      const isToday =
        t.dueDate === todayStr ||
        isTaskOngoing(t) ||
        getTaskEndDateTime(t.dueDate, t.dueTime, t.duration)?.endDate === todayStr;

      if (isToday) today++;
      else if (t.dueDate && t.dueDate > todayStr) calendar++;

      if (t.projectId) {
        projectMap.set(t.projectId, (projectMap.get(t.projectId) || 0) + 1);
      }
    }

    return {
      todayCount: today,
      calendarCount: calendar,
      projectTaskCountMap: projectMap,
    };
  }, [tasks, todayStr]);

  const habitsCount = habits.filter((h) => !h.archived).length;
  const libraryQueueCount = libraryItems.filter((i) => !i.isDeleted && i.status === 'todo').length;

  const navItems: { view: ViewType; label: string; icon: React.ReactNode; count: number }[] = [
    {
      view: 'today',
      label: "Now o'clock",
      icon: <Calendar size={15} className="text-crimson" />,
      count: todayCount,
    },
    {
      view: 'calendar',
      label: 'Calendar',
      icon: <CalendarDays size={15} className="text-stone-500" />,
      count: calendarCount,
    },
    {
      view: 'habits',
      label: 'Habits',
      icon: <Repeat size={15} className="text-stone-500" />,
      count: habitsCount,
    },
    {
      view: 'completed',
      label: 'Completed',
      icon: <CheckCircle2 size={15} className="text-stone-500" />,
      count: 0,
    },
  ];

  const handleSelectView = (view: ViewType, projectId: string | null = null) => {
    setCurrentView(view, projectId);
    setMobileSidebarOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-xs z-40 md:hidden transition-opacity duration-200"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar (Desktop fixed + Mobile slide-over drawer) */}
      <aside
        className={`w-72 md:w-64 flex-shrink-0 border-r border-stone-200/70 bg-stone-100/95 md:bg-stone-100/60 backdrop-blur-xl flex flex-col justify-between select-none h-full text-stone-800 z-40 transition-transform duration-200 ease-out safe-area-top safe-area-bottom ${
          mobileSidebarOpen
            ? 'fixed inset-y-0 left-0 shadow-2xl translate-x-0'
            : 'hidden md:flex'
        }`}
      >
        {/* Top Section */}
        <div className="p-3.5 space-y-5 overflow-y-auto">
          {/* Mobile drawer header with close button */}
          <div className="flex md:hidden items-center justify-between pb-2 border-b border-stone-200/70">
            <span className="font-serif text-sm font-semibold text-charcoal">Projects & Navigation</span>
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="min-w-[44px] min-h-[44px] p-2.5 text-stone-500 hover:text-charcoal hover:bg-stone-200/60 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer flex items-center justify-center active:scale-95"
              aria-label="Close navigation sidebar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Primary Views */}
          <nav aria-label="Main Navigation" className="space-y-0.5">
            <div className="px-2 pb-1.5 text-[11px] font-sans uppercase tracking-wider font-semibold text-stone-600">
              Navigation
            </div>
            {navItems.map((item) => {
              const isActive = currentView === item.view;
              return (
                <button
                  key={item.view}
                  onClick={() => handleSelectView(item.view)}
                  className={`w-full flex items-center justify-between px-2.5 py-2.5 sm:py-1.5 min-h-[44px] sm:min-h-[32px] rounded-mac text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer ${
                    isActive
                      ? 'bg-stone-200/80 text-charcoal font-semibold shadow-2xs'
                      : 'text-stone-700 hover:bg-stone-200/50 hover:text-charcoal'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {item.icon}
                    <span>{item.label}</span>
                  </div>
                  {item.count > 0 && (
                    <span
                      className={`text-[11px] font-sans px-1.5 py-0.5 rounded-full font-medium ${
                        isActive
                          ? 'bg-stone-300/80 text-charcoal'
                          : 'text-stone-600'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Library Tab Link (between Completed and Character) */}
            <button
              onClick={() => handleSelectView('library')}
              className={`w-full flex items-center justify-between px-2.5 py-2.5 sm:py-1.5 min-h-[44px] sm:min-h-[32px] rounded-mac text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer ${
                currentView === 'library'
                  ? 'bg-stone-200/80 text-charcoal font-semibold shadow-2xs'
                  : 'text-stone-700 hover:bg-stone-200/50 hover:text-charcoal'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookOpen size={15} className="text-stone-500" />
                <span>Library</span>
              </div>
              {libraryQueueCount > 0 && (
                <span
                  className={`text-[11px] font-sans px-1.5 py-0.5 rounded-full font-medium ${
                    currentView === 'library' ? 'bg-stone-300/80 text-charcoal' : 'text-stone-600'
                  }`}
                >
                  {libraryQueueCount}
                </span>
              )}
            </button>

            {/* Character Tab Link */}
            <button
              onClick={() => handleSelectView('character')}
              className={`w-full flex items-center justify-between px-2.5 py-2.5 sm:py-1.5 min-h-[44px] sm:min-h-[32px] rounded-mac text-xs font-medium transition-all focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer ${
                currentView === 'character'
                  ? 'bg-stone-200/80 text-charcoal font-semibold shadow-2xs'
                  : 'text-stone-700 hover:bg-stone-200/50 hover:text-charcoal'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <User size={15} className="text-amber-800" />
                <span>Character</span>
              </div>
              <span className="text-[11px] text-amber-900 bg-amber-100/90 border border-amber-300/80 px-1.5 py-0.5 rounded-full font-medium">
                Lv {user.ekirumLevel ?? 1}
              </span>
            </button>
          </nav>

          {/* Projects Section */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between px-2 pb-1.5">
              <span className="text-[11px] font-sans uppercase tracking-wider font-semibold text-stone-600">
                Projects & Skills
              </span>
              <button
                onClick={() => setNewProjectModalOpen(true)}
                className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center text-stone-500 hover:text-charcoal hover:bg-stone-200/60 p-2 sm:p-1.5 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
                title="Add New Project"
                aria-label="Add new project"
              >
                <Plus size={14} />
              </button>
            </div>

            <div className="space-y-0.5">
              {projects.map((project) => {
                const isSelected = currentView === 'project' && selectedProjectId === project.id;
                const taskCount = projectTaskCountMap.get(project.id) || 0;

                return (
                  <div
                    key={project.id}
                    className="relative flex items-center rounded-mac"
                  >
                    <button
                      onClick={() => handleSelectView('project', project.id)}
                      className={`flex-1 flex items-center justify-between px-2.5 py-2.5 sm:py-1.5 min-h-[44px] sm:min-h-[32px] rounded-mac text-xs transition-all text-left focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer ${
                        isSelected
                          ? 'bg-stone-200/80 text-charcoal font-medium shadow-2xs'
                          : 'text-stone-700 hover:bg-stone-200/50 hover:text-charcoal'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate pr-2">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: project.color || '#8B1528' }}
                        />
                        <IconHelper
                          name={project.icon || 'Folder'}
                          size={13}
                          className="text-stone-500 flex-shrink-0"
                        />
                        <span className="truncate">{project.name}</span>
                      </div>

                      {taskCount > 0 && (
                        <span className="text-[11px] font-sans text-stone-600 font-medium flex-shrink-0">
                          {taskCount}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Footer: Guide & Data and Backup */}
        <div className="p-3 border-t border-stone-200/70 flex items-center gap-2">
          <button
            onClick={() => {
              setHelpModalOpen(true);
              setMobileSidebarOpen(false);
            }}
            className="flex-1 min-h-[44px] sm:min-h-[36px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-600 hover:text-charcoal hover:bg-stone-200/60 rounded-mac transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none active:scale-95"
            title="System Guide & Shortcuts (Shortcut: ?)"
            aria-label="Open system guide and shortcuts"
          >
            <HelpCircle size={15} className="text-stone-500 flex-shrink-0" />
            <span>Guide</span>
          </button>

          <button
            onClick={() => {
              setBackupModalOpen(true);
              setMobileSidebarOpen(false);
            }}
            className="flex-1 min-h-[44px] sm:min-h-[36px] flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-600 hover:text-charcoal hover:bg-stone-200/60 rounded-mac transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none active:scale-95"
            title="Data Safety & Backup"
            aria-label="Open data safety and backup settings"
          >
            <HardDrive size={15} className="text-stone-500 flex-shrink-0" />
            <span className="truncate">Data & Backup</span>
          </button>
        </div>
      </aside>
    </>
  );
};
