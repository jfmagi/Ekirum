import React, { useState } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { IconHelper } from '../common/IconHelper';
import { PROJECT_COLOR_OPTIONS } from '../../lib/projectColors';
import { X, Plus } from 'lucide-react';

export const NewProjectModal: React.FC = () => {
  const { newProjectModalOpen, setNewProjectModalOpen, createProject, setCurrentView } = useEkirumStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(PROJECT_COLOR_OPTIONS[0].hex);
  const [selectedIcon, setSelectedIcon] = useState('Layers');

  React.useEffect(() => {
    if (!newProjectModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNewProjectModalOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [newProjectModalOpen, setNewProjectModalOpen]);

  if (!newProjectModalOpen) return null;

  const colorOptions = PROJECT_COLOR_OPTIONS;

  const iconOptions = [
    'Layers',
    'Cpu',
    'BookOpen',
    'Compass',
    'Sparkles',
    'Feather',
    'Bookmark',
    'Briefcase',
    'FileText',
    'Heart',
    'Code',
    'Globe',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const project = createProject(
      name.trim(),
      selectedColor,
      selectedIcon,
      description.trim()
    );

    setName('');
    setDescription('');
    setCurrentView('project', project.id);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-xs p-0 sm:p-4 pb-[env(safe-area-inset-bottom,0px)] animate-in fade-in duration-150"
      onClick={() => setNewProjectModalOpen(false)}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-sheet sm:rounded-sheet border border-stone-200/90 shadow-modal overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-2">
            <span className="font-serif text-base font-semibold text-charcoal">
              New Project
            </span>
          </div>
          <button
            onClick={() => setNewProjectModalOpen(false)}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-stone-500 hover:text-stone-800 p-2 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-700">
              Project Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Design Systems, Writing, Fitness"
              className="w-full text-base sm:text-xs font-sans px-3 py-2.5 sm:py-2 bg-stone-50 border border-stone-200 rounded-mac text-charcoal focus:bg-white focus:border-stone-400 focus:outline-none transition-colors placeholder-stone-500"
              autoFocus
            />
            <p className="text-[11px] text-stone-500 italic">
              A matching Skill will be automatically created in your Character tab.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-700">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Purpose and focus of this discipline..."
              className="w-full text-xs font-sans px-3 py-2 bg-stone-50 border border-stone-200 rounded-mac text-charcoal focus:bg-white focus:border-stone-400 focus:outline-none transition-colors resize-none placeholder-stone-500"
            />
          </div>

          {/* Color Palette Selection */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-stone-700">
                Accent Color
              </label>
              <span className="text-[11px] text-stone-500 font-sans italic">
                {colorOptions.find((c) => c.hex === selectedColor)?.name || ''}
              </span>
            </div>
            <div className="grid grid-cols-8 gap-2 pt-0.5">
              {colorOptions.map((c) => (
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

          {/* Icon Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-700">
              Icon
            </label>
            <div className="grid grid-cols-6 gap-2">
              {iconOptions.map((icon) => (
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

          {/* Actions */}
          <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setNewProjectModalOpen(false)}
              className="min-h-[38px] px-3.5 py-2 text-xs text-stone-500 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="min-h-[38px] px-4 py-2 text-xs font-medium text-white bg-crimson hover:bg-crimson-hover disabled:opacity-40 rounded-mac shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={14} />
              <span>Create Project</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
