import React, { useState, useMemo, useEffect } from 'react';
import { useEkirumStore, getSkillRankTitle, getXpRequiredForLevel, getXpRequiredForNextLevel } from '../../store/useEkirumStore';
import { useShallow } from 'zustand/react/shallow';
import {
  X,
  FileDown,
  Printer,
  ExternalLink,
  Check,
  Download,
} from 'lucide-react';
import {
  generateCharacterDossierHtml,
  printCharacterDossier,
  openDossierInNewTab,
  downloadHtmlDossier,
} from '../../lib/pdfExport';
import { IconHelper } from '../common/IconHelper';

export const ExportCharacterPdfModal: React.FC = () => {
  const {
    user,
    skills,
    projects,
    achievements,
    habits,
    tasks,
    setExportPdfModalOpen,
  } = useEkirumStore(
    useShallow((s) => ({
      user: s.user,
      skills: s.skills,
      projects: s.projects,
      achievements: s.achievements,
      habits: s.habits,
      tasks: s.tasks,
      setExportPdfModalOpen: s.setExportPdfModalOpen,
    }))
  );

  // Skill selection state (default: all active skills selected)
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(() => {
    return new Set(skills.map((s) => s.id));
  });

  // Section inclusion options
  const [includeStats, setIncludeStats] = useState(true);
  const [includeAchievements, setIncludeAchievements] = useState(true);
  const [includeHabits, setIncludeHabits] = useState(true);

  // Customization
  const [dossierTitle, setDossierTitle] = useState('Character Dossier & Skill Record');
  const [customNote, setCustomNote] = useState('');

  // Mobile layout tab: 'customize' or 'preview'
  const [activeTab, setActiveTab] = useState<'customize' | 'preview'>('customize');
  const [isPrinting, setIsPrinting] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExportPdfModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setExportPdfModalOpen]);

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const tasksCompletedCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);
  const unlockedAchievements = useMemo(
    () => achievements.filter((a) => Boolean(a.unlockedAt)),
    [achievements]
  );

  // Filter skills to only chosen ones
  const chosenSkills = useMemo(() => {
    return skills.filter((s) => selectedSkillIds.has(s.id));
  }, [skills, selectedSkillIds]);

  const allSkillsSelected = skills.length > 0 && selectedSkillIds.size === skills.length;

  const handleToggleAllSkills = () => {
    if (allSkillsSelected) {
      setSelectedSkillIds(new Set());
    } else {
      setSelectedSkillIds(new Set(skills.map((s) => s.id)));
    }
  };

  const handleToggleSkill = (skillId: string) => {
    setSelectedSkillIds((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  };

  // Compile full HTML for export
  const dossierHtml = useMemo(() => {
    return generateCharacterDossierHtml({
      user,
      skills: chosenSkills,
      projects,
      achievements: unlockedAchievements,
      habits,
      tasksCompletedCount,
      dossierTitle: dossierTitle.trim() || 'Character Dossier & Skill Record',
      customNote: customNote.trim() || undefined,
      includeStats,
      includeAchievements,
      includeHabits,
    });
  }, [
    user,
    chosenSkills,
    projects,
    unlockedAchievements,
    habits,
    tasksCompletedCount,
    dossierTitle,
    customNote,
    includeStats,
    includeAchievements,
    includeHabits,
  ]);

  const handlePrint = () => {
    setIsPrinting(true);
    printCharacterDossier(dossierHtml);
    setTimeout(() => setIsPrinting(false), 2000);
  };

  const handleOpenNewTab = () => {
    openDossierInNewTab(dossierHtml);
  };

  const handleDownloadHtml = () => {
    const safeName = (user.name || 'character').toLowerCase().replace(/[^a-z0-9]/g, '-');
    downloadHtmlDossier(dossierHtml, `ekirum-dossier-${safeName}.html`);
  };

  const initials = user.name
    ? user.name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'EK';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export Character Profile to PDF"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 pb-[env(safe-area-inset-bottom,0px)] animate-in fade-in duration-150"
      onClick={() => setExportPdfModalOpen(false)}
    >
      <div
        className="w-full max-w-5xl bg-white rounded-t-sheet sm:rounded-sheet border border-stone-200/90 shadow-modal overflow-hidden flex flex-col max-h-[94dvh] sm:max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-mac bg-stone-100 border border-stone-200 flex items-center justify-center text-charcoal">
              <FileDown size={16} className="text-stone-700" />
            </div>
            <div>
              <h3 className="font-serif text-base sm:text-lg font-semibold text-charcoal">
                Export Character Dossier to PDF
              </h3>
              <span className="text-[11px] text-stone-500 font-sans">
                Select chosen skills, customize sections, and save as a printable PDF
              </span>
            </div>
          </div>

          <button
            onClick={() => setExportPdfModalOpen(false)}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-500 hover:text-stone-800 p-2 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
            aria-label="Close export dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Mobile View Toggle */}
        <div className="sm:hidden flex border-b border-stone-200 bg-stone-100/60 p-1">
          <button
            onClick={() => setActiveTab('customize')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-mac transition-colors ${
              activeTab === 'customize'
                ? 'bg-white text-charcoal shadow-2xs font-semibold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Customize & Skills ({chosenSkills.length})
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-mac transition-colors ${
              activeTab === 'preview'
                ? 'bg-white text-charcoal shadow-2xs font-semibold'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            Sheet Preview
          </button>
        </div>

        {/* Body Container: Split View */}
        <div className="flex-1 overflow-y-auto flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-stone-200">
          {/* Left Column: Customization Controls & Skills Selection */}
          <div
            className={`w-full md:w-[48%] p-5 sm:p-6 overflow-y-auto space-y-6 ${
              activeTab === 'preview' ? 'hidden sm:block' : 'block'
            }`}
          >
            {/* 1. Skill Selection Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-serif text-sm font-semibold text-charcoal">
                    Chosen Skills to Include
                  </h4>
                  <span className="text-[11px] text-stone-500 font-sans">
                    {selectedSkillIds.size} of {skills.length} selected
                  </span>
                </div>

                {skills.length > 0 && (
                  <button
                    onClick={handleToggleAllSkills}
                    className="text-xs text-stone-600 hover:text-charcoal font-medium underline-offset-2 hover:underline cursor-pointer"
                  >
                    {allSkillsSelected ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              {skills.length === 0 ? (
                <div className="p-3.5 bg-stone-50 rounded-mac border border-stone-200 text-xs text-stone-500 text-center">
                  No skills recorded yet. Create projects to begin leveling skills.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {skills.map((skill) => {
                    const isSelected = selectedSkillIds.has(skill.id);
                    const rankTitle = getSkillRankTitle(skill.level || 1);
                    const nextLevelXp = getXpRequiredForNextLevel(skill.level || 1);
                    const linkedProject = skill.projectId
                      ? projectsById.get(skill.projectId)
                      : undefined;

                    return (
                      <div
                        key={skill.id}
                        onClick={() => handleToggleSkill(skill.id)}
                        className={`flex items-center justify-between p-2.5 rounded-card border transition-all cursor-pointer select-none ${
                          isSelected
                            ? 'bg-amber-50/40 border-amber-300/80 shadow-2xs'
                            : 'bg-white border-stone-200/80 hover:border-stone-300 opacity-65'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-amber-600 text-white'
                                : 'border border-stone-300 bg-white text-transparent'
                            }`}
                          >
                            <Check size={12} strokeWidth={2.5} />
                          </div>

                          <div className="w-7 h-7 rounded-mac bg-stone-100 flex items-center justify-center shrink-0 text-stone-700">
                            <IconHelper name={skill.icon || 'Folder'} size={14} />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-serif font-semibold text-charcoal truncate">
                                {skill.name}
                              </span>
                              <span className="text-[10px] text-stone-500 font-serif">
                                • {rankTitle}
                              </span>
                            </div>
                            {linkedProject && (
                              <div className="text-[10px] text-stone-500 truncate flex items-center gap-1">
                                <span
                                  className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                                  style={{ backgroundColor: linkedProject.color || '#6366f1' }}
                                />
                                <span>{linkedProject.name}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0 pl-2">
                          <span className="text-xs font-serif font-semibold text-charcoal">
                            Lv. {skill.level || 1}
                          </span>
                          <div className="text-[10px] font-mono text-stone-500">
                            {skill.xp || 0}/{nextLevelXp}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Section Inclusions */}
            <div className="space-y-3 pt-4 border-t border-stone-200">
              <h4 className="font-serif text-sm font-semibold text-charcoal">
                Sections to Include
              </h4>

              <div className="space-y-2">
                <label className="flex items-center gap-2.5 text-xs text-charcoal cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeStats}
                    onChange={(e) => setIncludeStats(e.target.checked)}
                    className="w-4 h-4 rounded text-charcoal focus:ring-stone-400 accent-amber-600"
                  />
                  <span>Overall Experience & Task Stats Placard</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-charcoal cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeAchievements}
                    onChange={(e) => setIncludeAchievements(e.target.checked)}
                    className="w-4 h-4 rounded text-charcoal focus:ring-stone-400 accent-amber-600"
                  />
                  <span>
                    Unlocked Milestone Honors ({unlockedAchievements.length} unlocked)
                  </span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-charcoal cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeHabits}
                    onChange={(e) => setIncludeHabits(e.target.checked)}
                    className="w-4 h-4 rounded text-charcoal focus:ring-stone-400 accent-amber-600"
                  />
                  <span>Habit Consistency & Daily Rituals ({habits.length})</span>
                </label>
              </div>
            </div>

            {/* 3. Document Customization */}
            <div className="space-y-3 pt-4 border-t border-stone-200">
              <h4 className="font-serif text-sm font-semibold text-charcoal">
                Dossier Metadata (Optional)
              </h4>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-stone-600 mb-1">
                    Document Title
                  </label>
                  <input
                    type="text"
                    value={dossierTitle}
                    onChange={(e) => setDossierTitle(e.target.value)}
                    placeholder="Character Dossier & Skill Record"
                    className="w-full text-xs font-sans bg-stone-50 border border-stone-300 rounded-mac px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-stone-600 mb-1">
                    Personal Motto or Focus Note
                  </label>
                  <input
                    type="text"
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                    placeholder="e.g. Focus on mastery and steady daily practice."
                    className="w-full text-xs font-sans bg-stone-50 border border-stone-300 rounded-mac px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Sheet Preview */}
          <div
            className={`w-full md:w-[52%] p-4 sm:p-6 bg-stone-100/70 overflow-y-auto flex flex-col items-center justify-start ${
              activeTab === 'customize' ? 'hidden sm:flex' : 'flex'
            }`}
          >
            <div className="w-full max-w-[460px] text-center mb-3">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 font-sans">
                Live Document Preview
              </span>
            </div>

            {/* Scaled-down Parchment Sheet Preview Card */}
            <div className="w-full max-w-[460px] bg-white border border-stone-200/90 rounded-card shadow-placard p-6 space-y-5 text-left select-none relative overflow-hidden">
              {/* Title & Date */}
              <div>
                <span className="text-[9px] font-sans font-bold uppercase tracking-widest text-crimson block mb-0.5">
                  Ekirum Record
                </span>
                <h4 className="font-serif text-lg font-semibold text-charcoal leading-tight">
                  {dossierTitle.trim() || 'Character Dossier'}
                </h4>
                <span className="text-[10px] text-stone-500">
                  {new Date().toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>

              {/* Character Profile Card */}
              <div className="flex items-center gap-3 p-3 bg-stone-50/80 border border-stone-200/80 rounded-card">
                <div className="w-12 h-12 rounded-full overflow-hidden border border-stone-300 bg-charcoal flex items-center justify-center shrink-0">
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-white font-serif text-base font-semibold">
                      {initials}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <span className="inline-block text-[10px] font-serif font-semibold text-crimson bg-crimson-light px-2 py-0.5 rounded-full border border-crimson/20 mb-0.5">
                    {user.ekirumRank || 'Novice'}
                  </span>
                  <div className="font-serif text-base font-semibold text-charcoal leading-tight truncate">
                    {user.name}
                  </div>
                  <div className="text-[11px] text-stone-500 font-sans">
                    Level {user.ekirumLevel || 1} • {(user.totalXp || 0).toLocaleString()} XP
                  </div>
                  {customNote && (
                    <div className="text-[10px] font-serif italic text-stone-600 mt-1 border-l-2 border-gold pl-1.5 truncate">
                      “{customNote}”
                    </div>
                  )}
                </div>
              </div>

              {/* Stats Grid Preview */}
              {includeStats && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2 bg-stone-50 border border-stone-200/70 rounded-mac">
                    <span className="text-[9px] uppercase font-semibold text-stone-500 block">
                      Total XP
                    </span>
                    <span className="font-serif text-sm font-bold text-charcoal">
                      {(user.totalXp || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="p-2 bg-stone-50 border border-stone-200/70 rounded-mac">
                    <span className="text-[9px] uppercase font-semibold text-stone-500 block">
                      Tasks
                    </span>
                    <span className="font-serif text-sm font-bold text-charcoal">
                      {tasksCompletedCount}
                    </span>
                  </div>
                  <div className="p-2 bg-stone-50 border border-stone-200/70 rounded-mac">
                    <span className="text-[9px] uppercase font-semibold text-stone-500 block">
                      Skills
                    </span>
                    <span className="font-serif text-sm font-bold text-charcoal">
                      {chosenSkills.length}
                    </span>
                  </div>
                </div>
              )}

              {/* Chosen Skills Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-stone-200 pb-1">
                  <span className="font-serif text-xs font-semibold text-charcoal">
                    Chosen Skills ({chosenSkills.length})
                  </span>
                </div>

                {chosenSkills.length === 0 ? (
                  <p className="text-[11px] text-amber-800 italic bg-amber-50 p-2 rounded">
                    No skills selected. Check at least one skill on the left.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {chosenSkills.map((s) => {
                      const rankTitle = getSkillRankTitle(s.level || 1);
                      const currentMinXp = getXpRequiredForLevel(s.level || 1);
                      const nextLevelXp = getXpRequiredForNextLevel(s.level || 1);
                      const levelRange = Math.max(1, nextLevelXp - currentMinXp);
                      const progress = Math.max(0, (s.xp || 0) - currentMinXp);
                      const pct = Math.min(100, Math.round((progress / levelRange) * 100));

                      return (
                        <div
                          key={s.id}
                          className="p-2 border border-stone-200 rounded-mac bg-stone-50/50"
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-serif font-semibold text-charcoal truncate">
                              {s.name}
                            </span>
                            <span className="font-serif text-[10px] text-stone-500">
                              {rankTitle} • Lv. {s.level}
                            </span>
                          </div>
                          <div className="w-full bg-stone-200 rounded-full h-1 mt-1.5 overflow-hidden">
                            <div
                              className="bg-amber-600 h-full rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Unlocked Achievements Preview */}
              {includeAchievements && unlockedAchievements.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-stone-200">
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-xs font-semibold text-charcoal">
                      Honors ({unlockedAchievements.length})
                    </span>
                  </div>
                  <p className="text-[10px] text-stone-500">
                    Includes {unlockedAchievements.length} milestone honor
                    {unlockedAchievements.length !== 1 ? 's' : ''} with completion dates.
                  </p>
                </div>
              )}

              {/* Footer preview note */}
              <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[9px] text-stone-500 font-sans">
                <span>Ekirum Architecture</span>
                <span>Vector PDF Record</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions Bar */}
        <div className="px-5 sm:px-6 py-3.5 bg-stone-50/90 border-t border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 rounded-mac transition-colors cursor-pointer"
              title="Download standalone HTML file of this dossier"
            >
              <Download size={13} />
              <span>Download HTML</span>
            </button>

            <button
              onClick={handleOpenNewTab}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-sans text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 rounded-mac transition-colors cursor-pointer"
              title="Open dossier in a new window to view full page or print"
            >
              <ExternalLink size={13} />
              <span>Open in Tab</span>
            </button>
          </div>

          <div className="flex items-center gap-2.5 justify-end">
            <button
              onClick={() => setExportPdfModalOpen(false)}
              className="px-3.5 py-1.5 text-xs font-sans text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-sans font-semibold text-white bg-charcoal hover:bg-stone-800 disabled:opacity-50 rounded-mac shadow-xs transition-colors cursor-pointer"
            >
              <Printer size={14} className="text-amber-400" />
              <span>{isPrinting ? 'Opening Print Dialog...' : 'Export to PDF'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
