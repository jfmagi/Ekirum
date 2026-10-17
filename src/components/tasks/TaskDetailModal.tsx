import React, { useState } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { Task, Priority, Recurrence } from '../../types';
import { MAX_LENGTHS } from '../../lib/validation';
import { formatDuration } from '../../lib/dateParser';
import {
  X,
  Calendar,
  Clock,
  Timer,
  Flag,
  Folder,
  CheckSquare,
  Plus,
  Trash2,
  Repeat,
  Tag,
} from 'lucide-react';

import { useShallow } from 'zustand/react/shallow';

export const TaskDetailModal: React.FC = () => {
  const {
    taskDetailId,
    openTaskDetail,
    tasks,
    updateTask,
    deleteTask,
    projects,
    addSubtask,
    toggleSubtask,
    deleteSubtask,
  } = useEkirumStore(
    useShallow((s) => ({
      taskDetailId: s.taskDetailId,
      openTaskDetail: s.openTaskDetail,
      tasks: s.tasks,
      updateTask: s.updateTask,
      deleteTask: s.deleteTask,
      projects: s.projects,
      addSubtask: s.addSubtask,
      toggleSubtask: s.toggleSubtask,
      deleteSubtask: s.deleteSubtask,
    }))
  );

  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [newTagInput, setNewTagInput] = useState('');

  React.useEffect(() => {
    if (!taskDetailId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        openTaskDetail(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [taskDetailId, openTaskDetail]);

  if (!taskDetailId) return null;

  const task = tasks.find((t) => t.id === taskDetailId);
  if (!task) return null;

  const handleAddSubtaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskTitle.trim()) return;
    addSubtask(task.id, newSubtaskTitle.trim());
    setNewSubtaskTitle('');
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = newTagInput.trim().replace(/^@/, '');
    if (!tag || task.labels.includes(tag)) return;
    updateTask(task.id, { labels: [...task.labels, tag] });
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    updateTask(task.id, {
      labels: task.labels.filter((l) => l !== tagToRemove),
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-xs p-0 sm:p-4 pb-[env(safe-area-inset-bottom,0px)] animate-in fade-in duration-150"
      onClick={() => openTaskDetail(null)}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-t-sheet sm:rounded-sheet border border-stone-200 shadow-modal overflow-hidden flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-stone-200/80 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-2">
            <h2 id="task-detail-title" className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
              Task Details
            </h2>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => {
                deleteTask(task.id);
                openTaskDetail(null);
              }}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 text-stone-500 hover:text-red-700 hover:bg-stone-100 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none cursor-pointer"
              title="Delete task"
              aria-label="Delete task"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={() => openTaskDetail(null)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 text-stone-500 hover:text-stone-800 hover:bg-stone-200/60 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
              title="Close (Esc)"
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 sm:space-y-6">
          {/* Title Input */}
          <div>
            <input
              type="text"
              maxLength={MAX_LENGTHS.TASK_TITLE}
              value={task.title}
              onChange={(e) => updateTask(task.id, { title: e.target.value })}
              className="w-full font-serif text-xl font-medium text-charcoal border-0 border-b border-transparent hover:border-stone-200 focus:border-stone-400 focus:outline-none focus:ring-0 pb-1.5 transition-colors placeholder-stone-500"
              placeholder="Task title..."
            />
          </div>

          {/* Core Properties Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 p-3.5 bg-stone-50/70 border border-stone-200/70 rounded-card">
            {/* Project Picker */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-stone-600 uppercase tracking-wider flex items-center gap-1">
                <Folder size={11} /> Project
              </label>
              <select
                value={task.projectId}
                onChange={(e) => updateTask(task.id, { projectId: e.target.value })}
                className="w-full text-xs bg-white border border-stone-200 rounded-mac px-2 py-1.5 text-stone-700 focus:outline-none focus:border-stone-400 cursor-pointer"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Picker */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-stone-600 uppercase tracking-wider flex items-center gap-1">
                <Flag size={11} /> Priority
              </label>
              <select
                value={task.priority}
                onChange={(e) => updateTask(task.id, { priority: e.target.value as Priority })}
                className="w-full text-xs bg-white border border-stone-200 rounded-mac px-2 py-1.5 text-stone-700 focus:outline-none focus:border-stone-400 cursor-pointer"
              >
                <option value="p1">P1 — High (Crimson)</option>
                <option value="p2">P2 — Medium (Amber)</option>
                <option value="p3">P3 — Low (Slate)</option>
                <option value="p4">P4 — None</option>
              </select>
            </div>

            {/* Recurrence Picker */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-stone-600 uppercase tracking-wider flex items-center gap-1">
                <Repeat size={11} /> Recurrence
              </label>
              <select
                value={task.recurrence || 'none'}
                onChange={(e) => {
                  const rec = e.target.value as Recurrence;
                  const updates: Partial<Task> = { recurrence: rec };
                  if (rec !== 'none' && !task.dueDate) {
                    const now = new Date();
                    const y = now.getFullYear();
                    const m = String(now.getMonth() + 1).padStart(2, '0');
                    const d = String(now.getDate()).padStart(2, '0');
                    updates.dueDate = `${y}-${m}-${d}`;
                  }
                  updateTask(task.id, updates);
                }}
                className="w-full text-xs bg-white border border-stone-200 rounded-mac px-2 py-1.5 text-stone-700 focus:outline-none focus:border-stone-400 cursor-pointer"
              >
                <option value="none">No Recurrence</option>
                <option value="daily">Daily</option>
                <option value="weekdays">Every Weekday</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          {/* Due Date, Time & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-stone-600 uppercase tracking-wider flex items-center gap-1">
                <Calendar size={11} /> Due Date
              </label>
              <input
                type="date"
                value={task.dueDate || ''}
                onChange={(e) => updateTask(task.id, { dueDate: e.target.value || undefined })}
                className="w-full text-xs bg-white border border-stone-200 rounded-mac px-2.5 py-1.5 text-stone-700 focus:outline-none focus:border-stone-400"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-stone-600 uppercase tracking-wider flex items-center gap-1">
                <Clock size={11} /> Due Time
              </label>
              <input
                type="time"
                value={task.dueTime || ''}
                onChange={(e) => updateTask(task.id, { dueTime: e.target.value || undefined })}
                className="w-full text-xs bg-white border border-stone-200 rounded-mac px-2.5 py-1.5 text-stone-700 focus:outline-none focus:border-stone-400"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-stone-600 uppercase tracking-wider flex items-center gap-1">
                  <Timer size={11} /> Duration
                </label>
                {task.duration && (
                  <button
                    type="button"
                    onClick={() => updateTask(task.id, { duration: undefined })}
                    className="text-[10px] text-stone-400 hover:text-stone-600 underline cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="relative flex items-center">
                <input
                  type="number"
                  min={1}
                  max={1440}
                  placeholder="Minutes (e.g. 30)"
                  value={task.duration ?? ''}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                    updateTask(task.id, {
                      duration: val && !isNaN(val) && val > 0 ? Math.min(val, 1440) : undefined,
                    });
                  }}
                  className="w-full text-xs bg-white border border-stone-200 rounded-mac px-2.5 py-1.5 text-stone-700 focus:outline-none focus:border-stone-400 pr-14 font-mono"
                />
                {task.duration && (
                  <span className="absolute right-2.5 text-[11px] font-medium text-blue-600 pointer-events-none">
                    {formatDuration(task.duration)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Duration Preset Chips */}
          <div className="flex items-center gap-1 overflow-x-auto -mt-2">
            <span className="text-[10px] text-stone-400 font-medium uppercase tracking-wider mr-1">
              Presets:
            </span>
            {[15, 25, 30, 45, 60, 90, 120].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => updateTask(task.id, { duration: mins })}
                className={`px-2 py-0.5 text-[10px] rounded font-mono border transition-colors cursor-pointer ${
                  task.duration === mins
                    ? 'bg-blue-600 text-white border-blue-600 font-semibold'
                    : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200'
                }`}
              >
                {formatDuration(mins)}
              </button>
            ))}
          </div>

          {/* Notes / Description */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-stone-600 uppercase tracking-wider">
              Notes & Context
            </label>
            <textarea
              rows={4}
              maxLength={MAX_LENGTHS.TASK_NOTES}
              value={task.notes || ''}
              onChange={(e) => updateTask(task.id, { notes: e.target.value })}
              placeholder="Add detailed notes or requirements..."
              className="w-full text-xs font-sans leading-relaxed p-3 bg-stone-50/50 border border-stone-200 rounded-card text-charcoal focus:bg-white focus:border-stone-400 focus:outline-none transition-colors resize-none placeholder-stone-500"
            />
          </div>

          {/* Subtasks Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-stone-600 uppercase tracking-wider flex items-center gap-1">
                <CheckSquare size={12} /> Subtasks (
                {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length})
              </label>
            </div>

            {/* Subtask List */}
            <div className="space-y-1.5">
              {task.subtasks.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between px-3 py-2 bg-stone-50 rounded-mac border border-stone-200/60 group"
                >
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs flex-1 min-h-[36px]">
                    <input
                      type="checkbox"
                      checked={sub.completed}
                      onChange={() => toggleSubtask(task.id, sub.id)}
                      className="rounded text-crimson focus:ring-0 border-stone-300 w-4 h-4 cursor-pointer"
                    />
                    <span
                      className={
                        sub.completed ? 'line-through text-stone-500' : 'text-stone-700'
                      }
                    >
                      {sub.title}
                    </span>
                  </label>
                  <button
                    onClick={() => deleteSubtask(task.id, sub.id)}
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center p-2 sm:p-1.5 text-stone-500 hover:text-crimson transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-stone-400 rounded cursor-pointer relative before:absolute before:-inset-1"
                    aria-label={`Delete subtask ${sub.title}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Subtask Form */}
            <form onSubmit={handleAddSubtaskSubmit} className="flex gap-2 pt-1">
              <input
                type="text"
                maxLength={MAX_LENGTHS.SUBTASK_TITLE}
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                placeholder="Add subtask..."
                className="flex-1 text-base sm:text-xs bg-white border border-stone-200 rounded-mac px-2.5 py-2 sm:py-1.5 focus:outline-none focus:border-stone-400 placeholder-stone-500"
              />
              <button
                type="submit"
                disabled={!newSubtaskTitle.trim()}
                className="min-h-[36px] px-3 py-1.5 text-xs bg-stone-100 hover:bg-stone-200 disabled:opacity-40 text-stone-700 rounded-mac font-medium transition-colors flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-stone-400 cursor-pointer"
              >
                <Plus size={13} />
                <span>Add</span>
              </button>
            </form>
          </div>

          {/* Labels / Tags Section */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-stone-600 uppercase tracking-wider flex items-center gap-1">
              <Tag size={11} /> Labels
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {task.labels.map((lbl) => (
                <span
                  key={lbl}
                  className="inline-flex items-center gap-1 text-xs text-stone-700 bg-stone-100 border border-stone-200 px-2.5 py-1 sm:py-0.5 rounded-full"
                >
                  <span>{lbl}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(lbl)}
                    className="hover:text-crimson p-1 min-w-[24px] min-h-[24px] flex items-center justify-center rounded focus-visible:ring-1 focus-visible:ring-stone-400 cursor-pointer"
                    aria-label={`Remove label ${lbl}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}

              <form onSubmit={handleAddTag} className="inline-flex items-center">
                <input
                  type="text"
                  maxLength={MAX_LENGTHS.LABEL}
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="+ Label"
                  className="text-base sm:text-xs w-24 sm:w-20 px-2.5 py-1.5 sm:py-0.5 rounded-full bg-stone-50 border border-stone-200 focus:w-32 sm:focus:w-28 focus:outline-none focus:border-stone-400 transition-all"
                />
              </form>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3.5 bg-stone-50 border-t border-stone-200 flex justify-end">
          <button
            onClick={() => openTaskDetail(null)}
            className="min-h-[38px] px-5 py-2 text-xs font-medium text-white bg-charcoal hover:bg-stone-800 rounded-mac shadow-xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
