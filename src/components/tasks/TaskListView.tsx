import React, { useMemo } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { TaskItem } from './TaskItem';
import { QuickAddBar } from './QuickAddBar';
import { FilterToolbar } from './FilterToolbar';
import { Sparkles, CheckCircle2, Edit3 } from 'lucide-react';
import { formatLocalDate } from '../../lib/dateParser';

export const TaskListView: React.FC = () => {
  const {
    tasks,
    projects,
    currentView,
    selectedProjectId,
    selectedPriorityFilter,
    selectedLabelFilter,
    searchQuery,
    setEditingProjectId,
  } = useEkirumStore();

  const todayStr = formatLocalDate();

  const totalCompletedCount = useMemo(() => {
    return tasks.filter((t) => !t.isDeleted && t.completed).length;
  }, [tasks]);

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
        return (
          !task.completed &&
          (task.dueDate === todayStr ||
            (task.dueDate && task.dueDate < todayStr) ||
            (!task.dueDate && task.recurrence && task.recurrence !== 'none'))
        );
      case 'upcoming':
        return !task.completed && (!task.dueDate || task.dueDate >= todayStr);
      case 'completed':
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
              className="p-1.5 text-stone-500 hover:text-charcoal hover:bg-stone-200/60 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
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
        />
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
              ? 'No completed tasks yet'
              : 'Clear space for defused thought'}
          </h3>
          <p className="text-xs text-stone-500 mt-1 max-w-sm font-sans leading-relaxed">
            {currentView === 'completed'
              ? 'Complete tasks from your projects or today view to archive them here and earn skill XP.'
              : 'All pending items have been handled.'}
          </p>
        </div>
      ) : null}
    </div>
  );
};
