import React, { useState, useEffect, useRef } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { IconHelper } from '../common/IconHelper';
import { HabitFrequency } from '../../types';
import { PROJECT_COLOR_OPTIONS } from '../../lib/projectColors';
import { MAX_LENGTHS } from '../../lib/validation';
import { X, Plus, Save, Trash2, Repeat, Folder, AlertTriangle } from 'lucide-react';

const COLOR_OPTIONS = PROJECT_COLOR_OPTIONS;

const ICON_OPTIONS = [
  'Compass',
  'BookOpen',
  'Cpu',
  'Layers',
  'Sparkles',
  'Flame',
  'Feather',
  'Bookmark',
  'Heart',
  'Sun',
  'Target',
  'Code',
];

import { useShallow } from 'zustand/react/shallow';

export const HabitModal: React.FC = () => {
  const {
    newHabitModalOpen,
    setNewHabitModalOpen,
    editingHabitId,
    setEditingHabitId,
    habits,
    projects,
    addHabit,
    updateHabit,
    deleteHabit,
  } = useEkirumStore(
    useShallow((s) => ({
      newHabitModalOpen: s.newHabitModalOpen,
      setNewHabitModalOpen: s.setNewHabitModalOpen,
      editingHabitId: s.editingHabitId,
      setEditingHabitId: s.setEditingHabitId,
      habits: s.habits,
      projects: s.projects,
      addHabit: s.addHabit,
      updateHabit: s.updateHabit,
      deleteHabit: s.deleteHabit,
    }))
  );

  const isEditing = Boolean(editingHabitId);
  const editingHabit = habits.find((h) => h.id === editingHabitId);

  const isOpen = newHabitModalOpen || isEditing;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [frequency, setFrequency] = useState<HabitFrequency>('daily');
  const [color, setColor] = useState('#8B1528');
  const [icon, setIcon] = useState('Compass');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const prevIsOpenRef = useRef(false);
  const prevEditingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const justOpened = isOpen && !prevIsOpenRef.current;
    const habitChanged = editingHabitId !== prevEditingIdRef.current;

    if (justOpened || habitChanged) {
      if (editingHabitId) {
        const habitToEdit = habits.find((h) => h.id === editingHabitId);
        if (habitToEdit) {
          setTitle(habitToEdit.title);
          setDescription(habitToEdit.description || '');
          setProjectId(habitToEdit.projectId || '');
          setFrequency(habitToEdit.frequency || 'daily');
          setColor(habitToEdit.color || '#8B1528');
          setIcon(habitToEdit.icon || 'Compass');
        }
      } else {
        setTitle('');
        setDescription('');
        setProjectId(projects[0]?.id || '');
        setFrequency('daily');
        setColor('#8B1528');
        setIcon('Compass');
      }
      setConfirmDelete(false);
    }

    prevIsOpenRef.current = isOpen;
    prevEditingIdRef.current = editingHabitId;
  }, [isOpen, editingHabitId]);

  const close = () => {
    setNewHabitModalOpen(false);
    setEditingHabitId(null);
    setConfirmDelete(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (isEditing && editingHabit) {
      updateHabit(editingHabit.id, {
        title: title.trim(),
        description: description.trim(),
        projectId: projectId || undefined,
        frequency,
        color,
        icon,
      });
    } else {
      addHabit({
        title: title.trim(),
        description: description.trim(),
        projectId: projectId || undefined,
        frequency,
        color,
        icon,
      });
    }

    close();
  };

  const handleDelete = () => {
    if (!editingHabit) return;
    deleteHabit(editingHabit.id);
    close();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-xs p-0 sm:p-4 pb-[env(safe-area-inset-bottom,0px)] animate-in fade-in duration-150"
      onClick={close}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-sheet sm:rounded-sheet border border-stone-200/90 shadow-modal overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <h3 className="font-serif text-base font-semibold text-charcoal">
              {isEditing ? 'Edit Habit' : 'New Habit'}
            </h3>
          </div>
          <button
            onClick={close}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-stone-500 hover:text-stone-800 p-2 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-700">Habit Name</label>
            <input
              type="text"
              maxLength={MAX_LENGTHS.HABIT_TITLE}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 20-min morning walk, Daily journaling..."
              className="w-full text-base sm:text-xs font-sans px-3 py-2.5 sm:py-2 bg-stone-50 border border-stone-200 rounded-mac text-charcoal focus:bg-white focus:border-stone-400 focus:outline-none transition-colors placeholder-stone-500"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-600">Intent & Context</label>
            <textarea
              rows={2}
              maxLength={MAX_LENGTHS.HABIT_DESCRIPTION}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why this ritual matters to you..."
              className="w-full text-base sm:text-xs font-sans px-3 py-2 bg-stone-50 border border-stone-200 rounded-mac text-charcoal focus:bg-white focus:border-stone-400 focus:outline-none transition-colors resize-none placeholder-stone-500"
            />
          </div>

          {/* Linked Project & Skill */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-600 flex items-center gap-1">
              <Folder size={12} /> Linked Project & Skill
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full text-xs bg-stone-50 border border-stone-200 rounded-mac px-2.5 py-2 text-stone-700 focus:outline-none focus:border-stone-400 cursor-pointer"
            >
              <option value="">None (General Ekirum XP only)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Awards XP to linked skill)
                </option>
              ))}
            </select>
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-600 flex items-center gap-1">
              <Repeat size={12} /> Target Cadence
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'daily', label: 'Every Day' },
                { id: 'weekdays', label: 'Weekdays' },
                { id: 'weekly', label: 'Weekly' },
              ].map((freq) => (
                <button
                  key={freq.id}
                  type="button"
                  onClick={() => setFrequency(freq.id as HabitFrequency)}
                  className={`py-1.5 px-2 text-xs rounded-mac border transition-all text-center ${
                    frequency === freq.id
                      ? 'bg-stone-100 border-stone-400 text-charcoal font-medium shadow-2xs'
                      : 'border-stone-200 text-stone-500 hover:text-stone-800'
                  }`}
                >
                  {freq.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-stone-700">Accent Color</label>
              <span className="text-[11px] text-stone-500 font-sans italic">
                {COLOR_OPTIONS.find((c) => c.hex === color)?.name || ''}
              </span>
            </div>
            <div className="grid grid-cols-8 gap-2 pt-0.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  className={`w-6 h-6 rounded-full transition-transform focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer justify-self-center ${
                    color === c.hex
                      ? 'scale-115 ring-2 ring-stone-600 ring-offset-2 shadow-xs'
                      : 'hover:scale-105 opacity-90 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                  aria-label={`Select ${c.name} accent color`}
                />
              ))}
            </div>
          </div>

          {/* Icon */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-700">Icon</label>
            <div className="grid grid-cols-6 gap-2">
              {ICON_OPTIONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`min-h-[38px] min-w-[38px] p-2 rounded-mac border flex items-center justify-center transition-all focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer ${
                    icon === ic
                      ? 'bg-stone-100 border-stone-400 text-charcoal'
                      : 'border-stone-200 text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                  }`}
                  title={ic}
                  aria-label={`Select ${ic} icon`}
                >
                  <IconHelper name={ic} size={16} />
                </button>
              ))}
            </div>
          </div>

          {/* Submit / Cancel Buttons */}
          <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              className="min-h-[38px] px-3.5 py-2 text-xs text-stone-500 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="min-h-[38px] px-4 py-2 text-xs font-medium text-white bg-crimson hover:bg-crimson-hover disabled:opacity-40 rounded-mac shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {isEditing ? <Save size={14} /> : <Plus size={14} />}
              <span>{isEditing ? 'Save Changes' : 'Create Habit'}</span>
            </button>
          </div>
        </form>

        {/* Delete option if editing */}
        {isEditing && (
          <div className="px-5 sm:px-6 pb-5">
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full min-h-[38px] flex items-center justify-center gap-2 py-2 text-xs text-stone-500 hover:text-red-700 border border-dashed border-stone-200 hover:border-red-300 hover:bg-stone-100 rounded-mac transition-all focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none cursor-pointer"
              >
                <Trash2 size={13} />
                <span>Delete habit…</span>
              </button>
            ) : (
              <div className="rounded-mac border border-crimson/30 bg-red-50/60 p-3 space-y-2">
                <div className="flex items-start gap-2 text-xs text-stone-700">
                  <AlertTriangle size={14} className="text-crimson flex-shrink-0 mt-0.5" />
                  <span>
                    Delete <strong>{editingHabit?.title}</strong> and its completion history?
                  </span>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-[36px] px-3 py-1.5 text-xs text-stone-500 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-colors cursor-pointer"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-crimson hover:bg-crimson-hover rounded-mac shadow-xs transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
