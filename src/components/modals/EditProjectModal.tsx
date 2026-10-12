import React, { useState, useEffect, useRef } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { IconHelper } from '../common/IconHelper';
import { PROJECT_COLOR_OPTIONS } from '../../lib/projectColors';
import { MAX_LENGTHS } from '../../lib/validation';
import { X, Save, Trash2, AlertTriangle } from 'lucide-react';

const COLOR_OPTIONS = PROJECT_COLOR_OPTIONS;

const ICON_OPTIONS = [
  'Layers', 'Cpu', 'BookOpen', 'Compass', 'Sparkles', 'Feather',
  'Bookmark', 'Briefcase', 'FileText', 'Heart', 'Code', 'Globe',
];

export const EditProjectModal: React.FC = () => {
  const {
    editingProjectId,
    setEditingProjectId,
    projects,
    tasks,
    updateProject,
    deleteProject,
    setCurrentView,
  } = useEkirumStore();

  const project = projects.find((p) => p.id === editingProjectId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState('#8B1528');
  const [selectedIcon, setSelectedIcon] = useState('Layers');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const close = () => {
    setEditingProjectId(null);
    setConfirmDelete(false);
  };

  const prevEditingIdRef = useRef<string | null>(null);

  // Sync local state whenever editingProjectId changes
  useEffect(() => {
    if (editingProjectId && editingProjectId !== prevEditingIdRef.current) {
      const targetProject = projects.find((p) => p.id === editingProjectId);
      if (targetProject) {
        setName(targetProject.name);
        setDescription(targetProject.description || '');
        setSelectedColor(targetProject.color || '#8B1528');
        setSelectedIcon(targetProject.icon || 'Layers');
        setConfirmDelete(false);
      }
    }
    prevEditingIdRef.current = editingProjectId;
  }, [editingProjectId]);

  useEffect(() => {
    if (!editingProjectId || !project) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingProjectId, project]);

  if (!editingProjectId || !project) return null;

  const projectTaskCount = tasks.filter((t) => t.projectId === project.id).length;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateProject(project.id, {
      name: name.trim(),
      description: description.trim(),
      color: selectedColor,
      icon: selectedIcon,
    });
    setEditingProjectId(null);
  };

  const handleDelete = () => {
    deleteProject(project.id);
    setCurrentView('today');
    setEditingProjectId(null);
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
          <div className="flex items-center gap-2.5">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: selectedColor }}
            />
            <span className="font-serif text-base font-semibold text-charcoal">
              Edit Project
            </span>
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
        <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-700">Project Name</label>
            <input
              type="text"
              maxLength={MAX_LENGTHS.PROJECT_NAME}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-base sm:text-xs font-sans px-3 py-2.5 sm:py-2 bg-stone-50 border border-stone-200 rounded-mac text-charcoal focus:bg-white focus:border-stone-400 focus:outline-none transition-colors placeholder-stone-500"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-700">Description</label>
            <textarea
              rows={2}
              maxLength={MAX_LENGTHS.PROJECT_DESCRIPTION}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Purpose and focus of this discipline..."
              className="w-full text-base sm:text-xs font-sans px-3 py-2 bg-stone-50 border border-stone-200 rounded-mac text-charcoal focus:bg-white focus:border-stone-400 focus:outline-none transition-colors resize-none placeholder-stone-500"
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-stone-700">Accent Color</label>
              <span className="text-[11px] text-stone-500 font-sans italic">
                {COLOR_OPTIONS.find((c) => c.hex === selectedColor)?.name || ''}
              </span>
            </div>
            <div className="grid grid-cols-8 gap-2 pt-0.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setSelectedColor(c.hex)}
                  className={`w-6 h-6 rounded-full transition-transform focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer justify-self-center relative before:absolute before:-inset-2 ${
                    selectedColor === c.hex
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
              {ICON_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setSelectedIcon(icon)}
                  className={`min-h-[38px] min-w-[38px] p-2 rounded-mac border flex items-center justify-center transition-all focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer ${
                    selectedIcon === icon
                      ? 'bg-stone-100 border-stone-400 text-charcoal'
                      : 'border-stone-200 text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                  }`}
                  title={icon}
                  aria-label={`Select ${icon} icon`}
                >
                  <IconHelper name={icon} size={16} />
                </button>
              ))}
            </div>
          </div>

          {/* Save / Cancel */}
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
              disabled={!name.trim()}
              className="min-h-[38px] px-4 py-2 text-xs font-medium text-white bg-charcoal hover:bg-stone-800 disabled:opacity-40 rounded-mac shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Save size={14} />
              <span>Save Changes</span>
            </button>
          </div>
        </form>

        {/* Delete zone */}
        <div className="px-5 sm:px-6 pb-5">
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full min-h-[38px] flex items-center justify-center gap-2 py-2 text-xs text-stone-500 hover:text-red-700 border border-dashed border-stone-200 hover:border-red-300 hover:bg-stone-100 rounded-mac transition-all focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:outline-none cursor-pointer"
            >
              <Trash2 size={13} />
              <span>Delete project…</span>
            </button>
          ) : (
            <div className="rounded-mac border border-crimson/30 bg-red-50/60 p-3.5 space-y-2.5">
              <div className="flex items-start gap-2 text-xs text-stone-700">
                <AlertTriangle size={14} className="text-crimson flex-shrink-0 mt-0.5" />
                <span>
                  This will permanently delete <strong>{project.name}</strong> and its{' '}
                  <strong>{projectTaskCount} task{projectTaskCount !== 1 ? 's' : ''}</strong>.
                  The linked Skill will also be removed. This cannot be undone.
                </span>
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-[36px] px-3 py-1.5 text-xs text-stone-500 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-colors cursor-pointer"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="min-h-[36px] px-3.5 py-1.5 text-xs font-medium text-white bg-crimson hover:bg-crimson-hover rounded-mac shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Delete permanently</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
