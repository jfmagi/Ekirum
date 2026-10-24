import React from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { TaskItem } from './TaskItem';
import { FilterToolbar } from './FilterToolbar';
import { Task } from '../../types';
import { Calendar, Edit3 } from 'lucide-react';
import {
  formatLocalDate,
  isTaskOverdue,
  isTaskOngoing,
  getTaskEndDateTime,
} from '../../lib/dateParser';

import { useShallow } from 'zustand/react/shallow';

export const TaskTimelineView: React.FC = () => {
  const {
    tasks,
    projects,
    currentView,
    selectedProjectId,
    selectedPriorityFilter,
    selectedLabelFilter,
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
      searchQuery: s.searchQuery,
      setEditingProjectId: s.setEditingProjectId,
    }))
  );

  const now = new Date();
  const todayStr = formatLocalDate(now);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatLocalDate(tomorrow);

  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  const sevenDaysStr = formatLocalDate(sevenDaysLater);

  // Active uncompleted tasks
  const activeTasks = tasks.filter((t) => {
    if (t.isDeleted) return false;
    if (t.completed) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match = t.title.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q);
      if (!match) return false;
    }

    if (selectedPriorityFilter !== 'all' && t.priority !== selectedPriorityFilter) return false;
    if (selectedLabelFilter !== 'all' && !t.labels?.includes(selectedLabelFilter)) return false;

    switch (currentView) {
      case 'inbox':
        if (t.projectId && t.projectId !== 'inbox') return false;
        break;
      case 'project':
        if (t.projectId !== selectedProjectId) return false;
        break;
    }

    return true;
  });

  const overdue: Task[] = [];
  const today: Task[] = [];
  const nextDay: Task[] = [];
  const thisWeek: Task[] = [];
  const later: Task[] = [];
  const unscheduled: Task[] = [];

  activeTasks.forEach((t) => {
    if (!t.dueDate) {
      unscheduled.push(t);
    } else if (isTaskOverdue(t, todayStr, now)) {
      overdue.push(t);
    } else if (
      t.dueDate === todayStr ||
      isTaskOngoing(t, now) ||
      getTaskEndDateTime(t.dueDate, t.dueTime, t.duration)?.endDate === todayStr
    ) {
      today.push(t);
    } else if (t.dueDate === tomorrowStr) {
      nextDay.push(t);
    } else if (t.dueDate <= sevenDaysStr) {
      thisWeek.push(t);
    } else {
      later.push(t);
    }
  });

  const timelineGroups = [
    { title: 'Overdue', tasks: overdue, color: 'text-crimson', line: 'bg-crimson/30' },
    { title: 'Today', tasks: today, color: 'text-charcoal', line: 'bg-stone-200' },
    { title: 'Tomorrow', tasks: nextDay, color: 'text-stone-700', line: 'bg-stone-200' },
    { title: 'This Week', tasks: thisWeek, color: 'text-stone-700', line: 'bg-stone-200' },
    { title: 'Later', tasks: later, color: 'text-stone-600', line: 'bg-stone-200' },
    { title: 'Unscheduled', tasks: unscheduled, color: 'text-stone-500', line: 'bg-stone-200' },
  ];

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const getViewTitle = () => {
    switch (currentView) {
      case 'inbox':
        return 'Inbox';
      case 'today':
        return "Now o'clock";
      case 'upcoming':
        return 'Upcoming';
      case 'completed':
        return 'Completed';
      case 'project':
        return selectedProject ? selectedProject.name : 'Project';
      default:
        return 'Timeline';
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
        {currentView === 'project' && selectedProject?.description && (
          <span className="text-xs text-stone-500 font-sans italic max-w-sm truncate hidden sm:inline-block">
            {selectedProject.description}
          </span>
        )}
      </div>

      {/* Filter toolbar */}
      <FilterToolbar />
      <div className="space-y-8">
        {timelineGroups.map((group) => {
          if (group.tasks.length === 0) return null;

          return (
            <div key={group.title} className="space-y-3">
              <div className="flex items-center gap-3">
                <span className={`font-serif text-sm font-semibold tracking-wide ${group.color}`}>
                  {group.title}
                </span>
                <div className={`h-px flex-1 ${group.line}`} />
                <span className="text-[11px] font-mono text-stone-500 font-medium">
                  {group.tasks.length}
                </span>
              </div>

              <div className="space-y-2.5">
                {group.tasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            </div>
          );
        })}

        {activeTasks.length === 0 && (
          <div className="py-20 text-center">
            <Calendar size={24} className="mx-auto text-stone-400 mb-3" />
            <h3 className="font-serif text-lg text-charcoal">No upcoming tasks</h3>
            <p className="text-xs text-stone-500 mt-1">
              Press Q or use the quick add bar to schedule tasks.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
