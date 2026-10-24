import React from 'react';
import { Task, Priority } from '../../types';
import { useEkirumStore } from '../../store/useEkirumStore';
import {
  formatDueDateDisplay,
  formatLocalDate,
  formatDuration,
  isTaskOverdue,
  isTaskOngoing,
} from '../../lib/dateParser';
import {
  Check,
  Calendar,
  Clock,
  Timer,
  Tag,
  CheckSquare,
  Trash2,
  Edit3,
  Repeat,
} from 'lucide-react';

interface TaskItemProps {
  task: Task;
  onOpenDetail?: (id: string) => void;
}

export const TaskItem: React.FC<TaskItemProps> = React.memo(({ task, onOpenDetail }) => {
  const toggleTaskComplete = useEkirumStore((s) => s.toggleTaskComplete);
  const deleteTask = useEkirumStore((s) => s.deleteTask);
  const openTaskDetail = useEkirumStore((s) => s.openTaskDetail);
  const project = useEkirumStore((s) =>
    task.projectId ? s.projects.find((p) => p.id === task.projectId) : undefined
  );

  const priorityDots: Record<Priority, { color: string; label: string }> = {
    p1: { color: 'bg-crimson', label: 'Priority 1' },
    p2: { color: 'bg-amber-500', label: 'Priority 2' },
    p3: { color: 'bg-slate-400', label: 'Priority 3' },
    p4: { color: 'bg-stone-300', label: 'Priority 4' },
  };

  const handleDetail = () => {
    if (onOpenDetail) {
      onOpenDetail(task.id);
    } else {
      openTaskDetail(task.id);
    }
  };

  const subtasksTotal = task.subtasks?.length || 0;
  const subtasksCompleted = task.subtasks?.filter((s) => s.completed).length || 0;

  // Check if overdue or ongoing
  const todayStr = formatLocalDate();
  const isOverdue = isTaskOverdue(task, todayStr);
  const isOngoing = isTaskOngoing(task);

  return (
    <div
      className={`group relative px-3 py-2.5 rounded-mac transition-all duration-150 hover:bg-stone-100/60 border-b border-stone-200/40 last:border-b-0 ${
        task.completed ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Custom tactile circular checkbox with expanded touch target */}
        <button
          type="button"
          role="checkbox"
          aria-checked={task.completed}
          onMouseDown={(e) => {
            // Prevent active input blur layout shifts from canceling the click
            e.preventDefault();
          }}
          onClick={(e) => {
            e.stopPropagation();
            toggleTaskComplete(task.id);
          }}
          className={`mt-0.5 relative w-5 h-5 rounded-full border transition-all flex items-center justify-center flex-shrink-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-crimson focus-visible:outline-none before:absolute before:-inset-3 before:content-[''] ${
            task.completed
              ? 'bg-crimson border-crimson text-white'
              : 'border-stone-300 hover:border-crimson hover:bg-crimson-light/40'
          }`}
          title={task.completed ? 'Mark incomplete' : 'Mark complete (+XP)'}
          aria-label={task.completed ? `Mark "${task.title}" incomplete` : `Mark "${task.title}" complete`}
        >
          {task.completed && <Check size={11} strokeWidth={2.5} />}
        </button>

        {/* Task Title & Notes */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3
              role="button"
              tabIndex={0}
              onClick={handleDetail}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleDetail();
                }
              }}
              className={`text-sm text-charcoal leading-snug cursor-pointer transition-colors focus-visible:outline-none focus-visible:underline ${
                task.completed ? 'line-through text-stone-500' : 'hover:text-crimson'
              }`}
            >
              {task.title}
            </h3>

            {/* Quick Action buttons: visible on touch devices, hover-revealed on desktop */}
            <div className="sm:opacity-0 sm:group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={handleDetail}
                className="min-w-[36px] min-h-[36px] p-2 text-stone-400 hover:text-stone-800 hover:bg-stone-200/60 rounded-mac transition-colors focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer flex items-center justify-center relative before:absolute before:-inset-1"
                title="Edit task details"
                aria-label={`Edit task details for "${task.title}"`}
              >
                <Edit3 size={13} />
              </button>
              <button
                type="button"
                onClick={() => deleteTask(task.id)}
                className="min-w-[36px] min-h-[36px] p-2 text-stone-400 hover:text-red-700 hover:bg-stone-200/60 rounded-mac transition-colors focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none cursor-pointer flex items-center justify-center relative before:absolute before:-inset-1"
                title="Delete task"
                aria-label={`Delete task "${task.title}"`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Notes summary preview */}
          {task.notes && (
            <p
              role="button"
              tabIndex={0}
              onClick={handleDetail}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleDetail();
                }
              }}
              className="text-xs text-stone-500 font-sans mt-0.5 line-clamp-1 cursor-pointer focus-visible:outline-none focus-visible:underline"
            >
              {task.notes}
            </p>
          )}

          {/* Metadata Row (only if relevant metadata exists) */}
          {(task.dueDate || task.dueTime || project || subtasksTotal > 0 || (task.labels && task.labels.length > 0) || task.priority !== 'p4' || (task.recurrence && task.recurrence !== 'none') || task.duration) && (
            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-stone-500">
              {/* Priority subtle dot if assigned */}
              {task.priority !== 'p4' && (
                <div className="flex items-center gap-1" title={priorityDots[task.priority].label}>
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      priorityDots[task.priority].color
                    }`}
                  />
                  <span className="font-mono uppercase text-[10px]">
                    {task.priority}
                  </span>
                </div>
              )}

              {/* Due date and time range */}
              {(task.dueDate || task.dueTime) && (
                <div
                  className={`flex items-center gap-1 font-mono ${
                    isOverdue ? 'text-crimson font-medium' : 'text-stone-500'
                  }`}
                >
                  {task.dueDate ? (
                    <Calendar size={11} className={isOverdue ? 'text-crimson' : 'text-stone-400'} />
                  ) : (
                    <Clock size={11} className="text-stone-400" />
                  )}
                  <span>{formatDueDateDisplay(task.dueDate, task.dueTime, task.duration)}</span>
                </div>
              )}

              {/* Duration badge */}
              {task.duration && (
                <div
                  className={`flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.2 rounded border ${
                    isOngoing
                      ? 'text-emerald-800 bg-emerald-50 border-emerald-300 font-medium'
                      : 'text-blue-800 bg-blue-50 border-blue-200/70'
                  }`}
                  title={isOngoing ? `In progress (${formatDuration(task.duration)})` : `Estimated duration: ${formatDuration(task.duration)}`}
                >
                  <Timer size={10} className={isOngoing ? 'text-emerald-600 animate-pulse' : 'text-blue-600'} />
                  <span>{formatDuration(task.duration)}</span>
                </div>
              )}

              {/* Recurrence badge */}
              {task.recurrence && task.recurrence !== 'none' && (
                <div className="flex items-center gap-1 font-mono text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/70">
                  <Repeat size={10} className="text-emerald-600" />
                  <span className="capitalize">
                    {task.recurrence === 'weekdays' ? 'Weekdays' : task.recurrence}
                  </span>
                </div>
              )}

              {/* Project badge */}
              {project && (
                <span className="text-stone-600 bg-stone-100 px-1.5 py-0.2 rounded text-[10px] truncate max-w-[130px] font-medium">
                  {project.name}
                </span>
              )}

              {/* Subtasks progress */}
              {subtasksTotal > 0 && (
                <div className="flex items-center gap-1 text-[10px] font-mono text-stone-500 bg-stone-100/70 px-1.5 py-0.2 rounded">
                  <CheckSquare size={10} className="text-stone-400" />
                  <span>
                    {subtasksCompleted}/{subtasksTotal}
                  </span>
                </div>
              )}

              {/* Labels */}
              {task.labels && task.labels.length > 0 && (
                <div className="flex items-center gap-1">
                  {task.labels.map((lbl) => (
                    <span
                      key={lbl}
                      className="inline-flex items-center gap-0.5 text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded"
                    >
                      <Tag size={9} className="text-stone-400" />
                      {lbl}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
