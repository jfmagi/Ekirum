import React, { useMemo } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { TaskItem } from './TaskItem';
import { QuickAddBar } from './QuickAddBar';
import { FilterToolbar } from './FilterToolbar';
import { Sparkles, CheckCircle2, Edit3 } from 'lucide-react';
import { formatLocalDate } from '../../lib/dateParser';

import { useShallow } from 'zustand/react/shallow';

export const TaskListView: React.FC = () => {
  const {
    tasks,
    projects,
    currentView,
    selectedProjectId,
    selectedPriorityFilter,
    selectedLabelFilter,
    selectedProjectFilter,
    setProjectFilter,
    searchQuery,
    setEditingProjectId,
  } = useEkirumStore(
    useShallow((s) => ({
      tasks: s.tasks,
      projects: s.projects,
      currentView: s.currentView,
      selectedProjectId: s.selectedProjectId,
      selectedPriorityFilter: s.selectedPriorityFilter,
      selectedLabelFilter: s.selectedLabelFilter,
      selectedProjectFilter: s.selectedProjectFilter,
      setProjectFilter: s.setProjectFilter,
      searchQuery: s.searchQuery,
      setEditingProjectId: s.setEditingProjectId,
    }))
  );

  const todayStr = formatLocalDate();

  const totalCompletedCount = useMemo(() => {
    return tasks.filter((t) => !t.isDeleted && t.completed).length;
  }, [tasks]);

  // Count completed tasks per project for quick filter pills
  const completedProjectStats = useMemo(() => {
    if (currentView !== 'completed') return [];
    const allCompleted = tasks.filter((t) => !t.isDeleted && t.completed);
    const counts = new Map<string, number>();
    let inboxCount = 0;

    for (const t of allCompleted) {
      if (!t.projectId || t.projectId === 'inbox') {
        inboxCount++;
      } else {
        counts.set(t.projectId, (counts.get(t.projectId) || 0) + 1);
      }
    }

    const stats: { id: string; name: string; color?: string; count: number }[] = [];
    if (inboxCount > 0) {
      stats.push({ id: 'inbox', name: 'Inbox', color: '#78716c', count: inboxCount });
    }

    for (const p of projects) {
      if (!p.isDeleted) {
        const count = counts.get(p.id) || 0;
        if (count > 0) {
          stats.push({ id: p.id, name: p.name, color: p.color, count });
          counts.delete(p.id);
        }
      }
    }

    // Any tasks from deleted or unlisted projects
    for (const [pId, count] of counts.entries()) {
      stats.push({ id: pId, name: 'Other', count });
    }

    return stats;
  }, [currentView, tasks, projects]);

  const filterProjectName = useMemo(() => {
    if (selectedProjectFilter === 'all') return null;
    if (selectedProjectFilter === 'inbox') return 'Inbox';
    const found = projects.find((p) => p.id === selectedProjectFilter);
    return found ? found.name : 'Selected Project';
  }, [selectedProjectFilter, projects]);

  // 1. Filter by current view
  let filtered = tasks.filter((task) => {
    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = task.title.toLowerCase().includes(q);
      const matchNotes = task.notes?.toLowerCase().includes(q);
      const matchLabels = task.labels?.some((l) => l.toLowerCase().includes(q));
      if (!matchTitle && !matchNotes && !matchLabels) return false;
    }

    // Priority filter
    if (selectedPriorityFilter !== 'all' && task.priority !== selectedPriorityFilter) {
      return false;
    }

    // Label filter
    if (selectedLabelFilter !== 'all' && !task.labels?.includes(selectedLabelFilter)) {
      return false;
    }

    // View filter
    switch (currentView) {
      case 'inbox':
        return !task.completed && (!task.projectId || task.projectId === 'inbox');
      case 'today':
        if (selectedProjectFilter !== 'all') {
          const matchProj = selectedProjectFilter === 'inbox'
            ? (!task.projectId || task.projectId === 'inbox')
            : task.projectId === selectedProjectFilter;
          if (!matchProj) return false;
        }
        return (
          !task.completed &&
          (task.dueDate === todayStr ||
            (task.dueDate && task.dueDate < todayStr) ||
            (!task.dueDate && task.recurrence && task.recurrence !== 'none'))
        );
      case 'upcoming':
        if (selectedProjectFilter !== 'all') {
          const matchProj = selectedProjectFilter === 'inbox'
            ? (!task.projectId || task.projectId === 'inbox')
            : task.projectId === selectedProjectFilter;
          if (!matchProj) return false;
        }
        return !task.completed && (!task.dueDate || task.dueDate >= todayStr);
      case 'completed':
        if (selectedProjectFilter !== 'all') {
          if (selectedProjectFilter === 'inbox') {
            return task.completed && (!task.projectId || task.projectId === 'inbox');
          }
          return task.completed && task.projectId === selectedProjectFilter;
        }
        return task.completed;
      case 'project':
        return !task.completed && task.projectId === selectedProjectId;
      default:
        return true;
    }
  });

  // Separate overdue from today's tasks if on Today view
  const overdueTasks = currentView === 'today'
    ? filtered.filter((t) => t.dueDate && t.dueDate < todayStr)
    : [];
  const activeTodayTasks = currentView === 'today'
    ? filtered.filter((t) => !t.dueDate || t.dueDate >= todayStr)
    : filtered;

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const getViewTitle = () => {
    switch (currentView) {
      case 'inbox':
        return 'Inbox';
      case 'today':
        return "Now o'clock";
      case 'calendar':
      case 'upcoming':
        return 'Calendar';
      case 'completed':
        return 'Completed';
      case 'project':
        return selectedProject ? selectedProject.name : 'Project';
      default:
        return 'Tasks';
    }
  };

  return (
    <div className="max-w-3xl mx-auto w-full px-3.5 sm:px-6 py-4 sm:py-8">
      {/* View Title */}
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div className="flex items-center gap-2.5">
          <h2 className="font-serif text-xl sm:text-2xl text-charcoal font-medium tracking-tight">
            {getViewTitle()}
          </h2>
          {currentView === 'completed' && (
            <span
              className="text-xs font-mono text-stone-600 bg-stone-100 border border-stone-200/80 px-2.5 py-0.5 rounded-full font-medium"
              title={`${totalCompletedCount} completed tasks`}
            >
              {filtered.length !== totalCompletedCount
                ? `${filtered.length} / ${totalCompletedCount}`
                : totalCompletedCount}
            </span>
          )}
          {currentView === 'project' && selectedProject && (
            <button
              onClick={() => setEditingProjectId(selectedProject.id)}
              className="min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center p-2 text-stone-500 hover:text-charcoal hover:bg-stone-200/60 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
              title="Edit project & settings"
              aria-label={`Edit project ${selectedProject.name}`}
            >
              <Edit3 size={15} />
            </button>
          )}
        </div>
        {currentView === 'completed' && totalCompletedCount > 0 && (
          <span className="text-xs text-stone-500 font-sans hidden sm:inline-block">
            {totalCompletedCount === 1 ? '1 archived task' : `${totalCompletedCount} archived tasks`}
          </span>
        )}
        {currentView === 'project' && selectedProject?.description && (
          <span className="text-xs text-stone-500 font-sans italic max-w-sm truncate hidden sm:inline-block">
            {selectedProject.description}
          </span>
        )}
      </div>

      {/* Quick Add Bar */}
      {currentView !== 'completed' && (
        <QuickAddBar
          key={`${currentView}-${selectedProjectId || 'default'}`}
          inline
          defaultProjectId={selectedProjectId || undefined}
          defaultDueDate={currentView === 'today' ? todayStr : undefined}
        />
      )}

      {/* Completed view quick project filter pills */}
      {currentView === 'completed' && completedProjectStats.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-none" role="toolbar" aria-label="Filter completed tasks by project">
          <button
            onClick={() => setProjectFilter('all')}
            className={`min-h-[30px] px-2.5 py-1 text-xs rounded-full border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              selectedProjectFilter === 'all'
                ? 'bg-stone-800 text-white border-stone-800 font-medium shadow-2xs'
                : 'bg-white text-stone-600 border-stone-200/80 hover:bg-stone-100 hover:text-charcoal'
            }`}
            aria-pressed={selectedProjectFilter === 'all'}
          >
            <span>All</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                selectedProjectFilter === 'all'
                  ? 'bg-stone-700 text-stone-200'
                  : 'bg-stone-100 text-stone-500'
              }`}
            >
              {totalCompletedCount}
            </span>
          </button>
          {completedProjectStats.map((stat) => {
            const isActive = selectedProjectFilter === stat.id;
            return (
              <button
                key={stat.id}
                onClick={() => setProjectFilter(isActive ? 'all' : stat.id)}
                className={`min-h-[30px] px-2.5 py-1 text-xs rounded-full border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-stone-800 text-white border-stone-800 font-medium shadow-2xs'
                    : 'bg-white text-stone-600 border-stone-200/80 hover:bg-stone-100 hover:text-charcoal'
                }`}
                aria-pressed={isActive}
              >
                {stat.color && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stat.color }}
                  />
                )}
                <span>{stat.name}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                    isActive
                      ? 'bg-stone-700 text-stone-200'
                      : 'bg-stone-100 text-stone-500'
                  }`}
                >
                  {stat.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter toolbar */}
      <FilterToolbar />

      {/* Overdue Section (if any on Today view) */}
      {overdueTasks.length > 0 && (
        <div className="mb-6 sm:mb-8 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-serif font-semibold text-crimson uppercase tracking-wider">
              Overdue
            </span>
            <div className="h-px bg-crimson/20 flex-1" />
            <span className="text-[11px] font-mono text-crimson font-medium">
              {overdueTasks.length}
            </span>
          </div>
          <div className="bg-white rounded-card border border-crimson/25 shadow-2xs divide-y divide-stone-100 overflow-hidden">
            {overdueTasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        </div>
      )}

      {/* Main Task List */}
      {activeTodayTasks.length > 0 ? (
        <div className="bg-white rounded-card border border-stone-200/80 shadow-2xs divide-y divide-stone-100 overflow-hidden">
          {activeTodayTasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      ) : overdueTasks.length === 0 ? (
        /* Empty State with generous negative space and quiet calm */
        <div className="py-16 sm:py-20 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-full bg-stone-100/80 border border-stone-200/60 flex items-center justify-center text-stone-500 mb-4 shadow-2xs">
            {currentView === 'completed' ? (
              <CheckCircle2 size={20} className="text-stone-500" />
            ) : (
              <Sparkles size={20} className="text-gold" />
            )}
          </div>
          <h3 className="font-serif text-lg text-charcoal font-medium">
            {currentView === 'completed'
              ? (selectedProjectFilter !== 'all'
                  ? `No completed tasks in ${filterProjectName || 'this project'}`
                  : 'No completed tasks yet')
              : 'Clear space for defused thought'}
          </h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm font-sans leading-relaxed">
            {currentView === 'completed'
              ? (selectedProjectFilter !== 'all'
                  ? 'There are no completed tasks recorded for this project.'
                  : 'Complete tasks from your projects or today view to archive them here and earn skill XP.')
              : 'All pending items have been handled.'}
          </p>
          {currentView === 'completed' && selectedProjectFilter !== 'all' && (
            <button
              onClick={() => setProjectFilter('all')}
              className="mt-4 px-3 py-1.5 min-h-[34px] sm:min-h-[30px] text-xs font-mono text-stone-600 hover:text-charcoal bg-stone-100 hover:bg-stone-200/70 border border-stone-200/80 rounded-mac transition-all cursor-pointer"
            >
              Show all completed tasks ({totalCompletedCount})
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
};
