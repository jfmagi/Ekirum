import React, { useState } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import {
  X,
  Flag,
  Sparkles,
  Calendar,
  Repeat,
  Tag,
  Folder,
  Award,
  Download,
  Laptop,
  Monitor,
  Smartphone,
  FileDown,
} from 'lucide-react';

export const HelpModal: React.FC = () => {
  const helpModalOpen = useEkirumStore((s) => s.helpModalOpen);
  const setHelpModalOpen = useEkirumStore((s) => s.setHelpModalOpen);
  const setExportPdfModalOpen = useEkirumStore((s) => s.setExportPdfModalOpen);
  const [activeTab, setActiveTab] = useState<'priorities' | 'syntax' | 'skills' | 'shortcuts' | 'install' | 'export'>('priorities');

  const close = () => {
    setHelpModalOpen(false);
  };

  React.useEffect(() => {
    if (!helpModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [helpModalOpen]);

  if (!helpModalOpen) return null;


  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 pb-[env(safe-area-inset-bottom,0px)] animate-in fade-in duration-150"
      onClick={close}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-t-sheet sm:rounded-sheet border border-stone-200/90 shadow-modal overflow-hidden flex flex-col max-h-[90dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-3.5 sm:py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/60">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-gold-subtle border border-gold/40 flex items-center justify-center text-gold shadow-2xs">
              <Sparkles size={14} />
            </div>
            <div>
              <h3 className="font-serif text-base font-semibold text-charcoal">
                System Guide & Shortcuts
              </h3>
              <p className="text-[11px] text-stone-500 font-sans">
                Priorities, quick syntax, skills, shortcuts, and app installation
              </p>
            </div>
          </div>
          <button
            onClick={close}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-stone-500 hover:text-stone-800 p-2 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
            aria-label="Close guide dialog"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 sm:px-6 pt-2 border-b border-stone-100 flex items-center gap-1 bg-stone-50/30 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('priorities')}
            className={`min-h-[40px] px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer flex-shrink-0 ${
              activeTab === 'priorities'
                ? 'border-crimson text-charcoal font-semibold'
                : 'border-transparent text-stone-500 hover:text-charcoal'
            }`}
          >
            Priorities (P1–P4)
          </button>
          <button
            onClick={() => setActiveTab('syntax')}
            className={`min-h-[40px] px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer flex-shrink-0 ${
              activeTab === 'syntax'
                ? 'border-crimson text-charcoal font-semibold'
                : 'border-transparent text-stone-500 hover:text-charcoal'
            }`}
          >
            Quick Add Syntax
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={`min-h-[40px] px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer flex-shrink-0 ${
              activeTab === 'skills'
                ? 'border-crimson text-charcoal font-semibold'
                : 'border-transparent text-stone-500 hover:text-charcoal'
            }`}
          >
            Skills & XP
          </button>
          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`min-h-[40px] px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer flex-shrink-0 ${
              activeTab === 'shortcuts'
                ? 'border-crimson text-charcoal font-semibold'
                : 'border-transparent text-stone-500 hover:text-charcoal'
            }`}
          >
            Shortcuts
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`min-h-[40px] px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer flex-shrink-0 flex items-center gap-1.5 ${
              activeTab === 'export'
                ? 'border-crimson text-charcoal font-semibold'
                : 'border-transparent text-stone-500 hover:text-charcoal'
            }`}
          >
            <FileDown size={13} className={activeTab === 'export' ? 'text-crimson' : 'text-stone-400'} />
            Export to PDF
          </button>
          <button
            onClick={() => setActiveTab('install')}
            className={`min-h-[40px] px-3 py-2 text-xs font-medium border-b-2 transition-all cursor-pointer flex-shrink-0 flex items-center gap-1.5 ${
              activeTab === 'install'
                ? 'border-crimson text-charcoal font-semibold'
                : 'border-transparent text-stone-500 hover:text-charcoal'
            }`}
          >
            <Download size={13} className={activeTab === 'install' ? 'text-crimson' : 'text-stone-400'} />
            Install as App
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* TAB 1: PRIORITIES */}
          {activeTab === 'priorities' && (
            <div className="space-y-4">
              <div className="bg-stone-50/70 border border-stone-200/80 rounded-card p-3.5 text-xs text-stone-700 leading-relaxed font-sans">
                Priorities determine task urgency, visual spotlight badges, and <strong>Skill XP rewards</strong> when completed. You can type <code className="px-1 py-0.5 bg-stone-200 rounded font-mono text-[11px] text-charcoal">p1</code>, <code className="px-1 py-0.5 bg-stone-200 rounded font-mono text-[11px] text-charcoal">p2</code>, <code className="px-1 py-0.5 bg-stone-200 rounded font-mono text-[11px] text-charcoal">p3</code>, or <code className="px-1 py-0.5 bg-stone-200 rounded font-mono text-[11px] text-charcoal">p4</code> directly into the Quick Add bar.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* P1 */}
                <div className="p-4 bg-white border-2 border-crimson/30 rounded-card shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-crimson text-white text-[11px] font-mono font-medium uppercase tracking-wider">
                      <Flag size={11} /> P1 — Urgent
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-crimson">
                      +15 XP (10 + 5 bonus)
                    </span>
                  </div>
                  <h4 className="font-serif text-sm font-semibold text-charcoal">
                    High / Critical Focus
                  </h4>
                  <p className="text-xs text-stone-600 font-sans leading-relaxed">
                    Reserved for non-negotiable, high-impact tasks that must be done today. Grants highest bonus skill XP upon completion.
                  </p>
                </div>

                {/* P2 */}
                <div className="p-4 bg-white border border-amber-300 rounded-card shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-600 text-white text-[11px] font-mono font-medium uppercase tracking-wider">
                      <Flag size={11} /> P2 — Medium
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-amber-700">
                      +13 XP (10 + 3 bonus)
                    </span>
                  </div>
                  <h4 className="font-serif text-sm font-semibold text-charcoal">
                    Important Milestones
                  </h4>
                  <p className="text-xs text-stone-600 font-sans leading-relaxed">
                    Significant tasks that advance core projects, but without immediate crisis urgency. Awards +3 bonus XP.
                  </p>
                </div>

                {/* P3 */}
                <div className="p-4 bg-white border border-stone-200 rounded-card shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-stone-500 text-white text-[11px] font-mono font-medium uppercase tracking-wider">
                      <Flag size={11} /> P3 — Low
                    </span>
                    <span className="text-[11px] font-mono font-medium text-stone-600">
                      10 XP (Standard)
                    </span>
                  </div>
                  <h4 className="font-serif text-sm font-semibold text-charcoal">
                    Standard Tasks
                  </h4>
                  <p className="text-xs text-stone-600 font-sans leading-relaxed">
                    Everyday administrative, maintenance, or routine work. Contributes baseline progress to your character.
                  </p>
                </div>

                {/* P4 */}
                <div className="p-4 bg-white border border-stone-200 rounded-card shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-stone-200 text-stone-700 text-[11px] font-mono font-medium uppercase tracking-wider">
                      <Flag size={11} /> P4 — None
                    </span>
                    <span className="text-[11px] font-mono font-medium text-stone-600">
                      10 XP (Standard)
                    </span>
                  </div>
                  <h4 className="font-serif text-sm font-semibold text-charcoal">
                    Default / Unassigned
                  </h4>
                  <p className="text-xs text-stone-600 font-sans leading-relaxed">
                    Unprioritized items added without an explicit priority tag.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: QUICK ADD SYNTAX */}
          {activeTab === 'syntax' && (
            <div className="space-y-4">
              <div className="p-3 bg-stone-50/70 border border-stone-200/80 rounded-card">
                <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold block mb-1">
                  Natural Language Parser Example
                </span>
                <div className="p-2.5 bg-white border border-stone-200 rounded-mac font-mono text-xs text-charcoal">
                  Finish chapter draft <span className="text-emerald-700 font-semibold">tomorrow 4pm</span>{' '}
                  <span className="text-crimson font-semibold">p1</span>{' '}
                  <span className="text-stone-700 font-semibold">#Writing</span>{' '}
                  <span className="text-blue-700 font-semibold">@urgent</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-3 bg-white border border-stone-200/80 rounded-card flex items-start gap-3">
                  <Calendar size={16} className="text-emerald-700 mt-0.5 flex-shrink-0" />
                  <div>
                    <h5 className="text-xs font-semibold text-charcoal">Dates & Times (Multilingual: EN, PL, ES)</h5>
                    <p className="text-xs text-stone-600 mt-0.5 font-sans">
                      Recognizes dates and hours across English (<code className="font-mono text-stone-800">today</code>, <code className="font-mono text-stone-800">tomorrow 4pm</code>, <code className="font-mono text-stone-800">next monday</code>), Polish (<code className="font-mono text-stone-800">dzisiaj</code>, <code className="font-mono text-stone-800">jutro o 15:30</code>, <code className="font-mono text-stone-800">w piątek o 8 rano</code>, <code className="font-mono text-stone-800">w południe</code>), and Spanish (<code className="font-mono text-stone-800">hoy</code>, <code className="font-mono text-stone-800">mañana a las 15:30</code>, <code className="font-mono text-stone-800">el próximo martes</code>, <code className="font-mono text-stone-800">al mediodía</code>).
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-white border border-stone-200/80 rounded-card flex items-start gap-3">
                  <Repeat size={16} className="text-amber-700 mt-0.5 flex-shrink-0" />
                  <div>
                    <h5 className="text-xs font-semibold text-charcoal">Recurrence & Routines</h5>
                    <p className="text-xs text-stone-600 mt-0.5 font-sans">
                      Automatically schedules repeating tasks with <code className="font-mono text-stone-800">daily</code>, <code className="font-mono text-stone-800">codziennie</code>, <code className="font-mono text-stone-800">diariamente</code>, <code className="font-mono text-stone-800">co wtorek</code>, <code className="font-mono text-stone-800">cada semana</code>, or <code className="font-mono text-stone-800">every weekday</code>.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-white border border-stone-200/80 rounded-card flex items-start gap-3">
                  <Folder size={16} className="text-stone-700 mt-0.5 flex-shrink-0" />
                  <div>
                    <h5 className="text-xs font-semibold text-charcoal">Project Binding (@Project)</h5>
                    <p className="text-xs text-stone-600 mt-0.5 font-sans">
                      Type <code className="font-mono text-stone-800">@</code> followed by any part of a project name (e.g. <code className="font-mono text-stone-800">@Design</code>) to assign the task to that project.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-white border border-stone-200/80 rounded-card flex items-start gap-3">
                  <Tag size={16} className="text-blue-700 mt-0.5 flex-shrink-0" />
                  <div>
                    <h5 className="text-xs font-semibold text-charcoal">Labels (#Tag)</h5>
                    <p className="text-xs text-stone-600 mt-0.5 font-sans">
                      Use <code className="font-mono text-stone-800">#</code> to add tags (e.g. <code className="font-mono text-stone-800">#deepwork</code>, <code className="font-mono text-stone-800">#client</code>). Filter by any label from the top filter bar.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SKILLS & XP */}
          {activeTab === 'skills' && (
            <div className="space-y-4">
              <div className="p-4 bg-stone-50/70 border border-stone-200/80 rounded-card space-y-2">
                <div className="flex items-center gap-2">
                  <Award size={16} className="text-gold" />
                  <h4 className="font-serif text-sm font-semibold text-charcoal">
                    Automatic Project & Skill Synergy
                  </h4>
                </div>
                <p className="text-xs text-stone-600 font-sans leading-relaxed">
                  Every Project you create automatically establishes a corresponding <strong>Skill</strong> in your Character tab. Completing tasks in that project awards XP to that skill, helping you visualize where your focus goes over time.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-sans">
                <div className="p-3.5 bg-white border border-stone-200/80 rounded-card space-y-1.5">
                  <div className="font-semibold text-charcoal flex items-center justify-between">
                    <span>Task Completion XP</span>
                    <span className="font-mono text-gold font-bold">+10 to +20 XP</span>
                  </div>
                  <p className="text-stone-600 text-[11px] leading-relaxed">
                    10 base XP + priority bonus (+5 for P1, +3 for P2) + timeliness bonus (+5 if on or before due date).
                  </p>
                </div>

                <div className="p-3.5 bg-white border border-stone-200/80 rounded-card space-y-1.5">
                  <div className="font-semibold text-charcoal flex items-center justify-between">
                    <span>Habit Ritual XP</span>
                    <span className="font-mono text-gold font-bold">+10 to +15 XP</span>
                  </div>
                  <p className="text-stone-600 text-[11px] leading-relaxed">
                    Each habit check-in awards +10 XP to its linked skill, plus an extra +5 XP streak bonus if active.
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-white border border-stone-200/80 rounded-card space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold block">
                    Ranks Progression
                  </span>
                  <span className="text-[10px] text-stone-500 font-mono">
                    Levels are unlimited
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-serif tracking-wide">
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700">Novice</span>
                  <span className="text-stone-300">→</span>
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700">Recruit</span>
                  <span className="text-stone-300">→</span>
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700">Apprentice</span>
                  <span className="text-stone-300">→</span>
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700">Pathfinder</span>
                  <span className="text-stone-300">→</span>
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700">Wayfarer</span>
                  <span className="text-stone-300">→</span>
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700">Captain</span>
                  <span className="text-stone-300">→</span>
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700">Commander</span>
                  <span className="text-stone-300">→</span>
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700">High Commander</span>
                  <span className="text-stone-300">→</span>
                  <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700">Master</span>
                  <span className="text-stone-300">→</span>
                  <span className="px-2 py-0.5 rounded bg-gold-subtle border border-gold/40 text-charcoal font-semibold">Grandmaster</span>
                </div>
                <p className="text-[11px] text-stone-500 leading-relaxed font-sans pt-1">
                  Ranks ascend through consistent dedication, completing tasks, and maintaining daily habits. Character and skill levels are unlimited.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: SHORTCUTS */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-4 font-sans">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 bg-white border border-stone-200/80 rounded-mac flex items-center justify-between">
                  <span className="text-stone-700">Quick Add Task</span>
                  <kbd className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono text-[11px] text-charcoal">
                    Q
                  </kbd>
                </div>
                <div className="p-2.5 bg-white border border-stone-200/80 rounded-mac flex items-center justify-between">
                  <span className="text-stone-700">Command Palette</span>
                  <kbd className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono text-[11px] text-charcoal">
                    ⌘K
                  </kbd>
                </div>
                <div className="p-2.5 bg-white border border-stone-200/80 rounded-mac flex items-center justify-between">
                  <span className="text-stone-700">System & Priority Guide</span>
                  <kbd className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono text-[11px] text-charcoal">
                    ?
                  </kbd>
                </div>
                <div className="p-2.5 bg-white border border-stone-200/80 rounded-mac flex items-center justify-between">
                  <span className="text-stone-700">Dismiss Dialogs</span>
                  <kbd className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono text-[11px] text-charcoal">
                    Esc
                  </kbd>
                </div>
                <div className="p-2.5 bg-white border border-stone-200/80 rounded-mac flex items-center justify-between">
                  <span className="text-stone-700">Now o'clock View</span>
                  <kbd className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono text-[11px] text-charcoal">
                    1
                  </kbd>
                </div>
                <div className="p-2.5 bg-white border border-stone-200/80 rounded-mac flex items-center justify-between">
                  <span className="text-stone-700">Calendar View</span>
                  <kbd className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono text-[11px] text-charcoal">
                    2
                  </kbd>
                </div>
                <div className="p-2.5 bg-white border border-stone-200/80 rounded-mac flex items-center justify-between">
                  <span className="text-stone-700">Habits View</span>
                  <kbd className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono text-[11px] text-charcoal">
                    3
                  </kbd>
                </div>
                <div className="p-2.5 bg-white border border-stone-200/80 rounded-mac flex items-center justify-between">
                  <span className="text-stone-700">Completed Tasks</span>
                  <kbd className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono text-[11px] text-charcoal">
                    4
                  </kbd>
                </div>
                <div className="p-2.5 bg-white border border-stone-200/80 rounded-mac flex items-center justify-between">
                  <span className="text-stone-700">Character</span>
                  <kbd className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono text-[11px] text-charcoal">
                    5
                  </kbd>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: INSTALL AS APP */}
          {activeTab === 'install' && (
            <div className="space-y-4 font-sans text-xs">
              <div className="bg-stone-50/70 border border-stone-200/80 rounded-card p-3.5 space-y-1.5 text-stone-700 leading-relaxed">
                <div className="flex items-center gap-2 font-serif text-sm font-semibold text-charcoal">
                  <Download size={15} className="text-crimson" />
                  <span>Run Ekirum as a Standalone App</span>
                </div>
                <p className="text-xs text-stone-600">
                  Ekirum is built as an offline-first Progressive Web App (PWA). You don't need app store downloads or installers — you can install it directly from your web browser to run in its own dedicated, chromeless window with desktop dock/taskbar or mobile home-screen access.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Chromium Card */}
                <div className="p-4 bg-white border border-stone-200 rounded-card shadow-xs space-y-2.5">
                  <div className="flex items-center gap-2 text-charcoal font-semibold">
                    <Laptop size={15} className="text-stone-700" />
                    <h5 className="font-serif text-sm">Chromium Browsers</h5>
                  </div>
                  <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-stone-100 text-stone-600">
                    Chrome · Edge · Brave · Opera · Vivaldi
                  </span>
                  <div className="text-stone-600 space-y-1.5 leading-relaxed text-[11px]">
                    <p>
                      <strong>Desktop</strong>: Look for the <strong className="text-charcoal">Install</strong> icon (computer with down arrow) on the right side of the URL bar, or click:
                    </p>
                    <div className="p-2 bg-stone-50 rounded border border-stone-200/80 font-mono text-[10.5px] text-stone-800">
                      Menu (⋮) → Save and share → Install Ekirum
                    </div>
                    <p className="text-stone-500 text-[10px]">
                      (In Microsoft Edge: Menu ... → Apps → Install this site as an app)
                    </p>
                  </div>
                </div>

                {/* Apple Safari macOS Sonoma Card */}
                <div className="p-4 bg-white border border-stone-200 rounded-card shadow-xs space-y-2.5">
                  <div className="flex items-center gap-2 text-charcoal font-semibold">
                    <Monitor size={15} className="text-stone-700" />
                    <h5 className="font-serif text-sm">Safari on macOS (14 Sonoma+)</h5>
                  </div>
                  <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-stone-100 text-stone-600">
                    macOS Standalone Web App
                  </span>
                  <div className="text-stone-600 space-y-1.5 leading-relaxed text-[11px]">
                    <p>
                      Turn Ekirum into a native Mac app right from Safari's menu bar:
                    </p>
                    <div className="p-2 bg-stone-50 rounded border border-stone-200/80 font-mono text-[10.5px] text-stone-800">
                      File → Add to Dock...
                    </div>
                    <p className="text-stone-500 text-[10px]">
                      Or click Safari's Share button → <strong className="text-stone-700">Add to Dock</strong>. Ekirum gets its own Dock icon, independent window, and ⌘Tab slot.
                    </p>
                  </div>
                </div>

                {/* iOS & iPadOS Card */}
                <div className="p-4 bg-white border border-stone-200 rounded-card shadow-xs space-y-2.5">
                  <div className="flex items-center gap-2 text-charcoal font-semibold">
                    <Smartphone size={15} className="text-stone-700" />
                    <h5 className="font-serif text-sm">iPhone & iPad (Safari)</h5>
                  </div>
                  <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-stone-100 text-stone-600">
                    iOS / iPadOS Home Screen App
                  </span>
                  <div className="text-stone-600 space-y-1.5 leading-relaxed text-[11px]">
                    <p>
                      In Safari, tap the <strong className="text-charcoal">Share</strong> button (square with arrow up), then select:
                    </p>
                    <div className="p-2 bg-stone-50 rounded border border-stone-200/80 font-mono text-[10.5px] text-stone-800">
                      Share → Add to Home Screen → Add
                    </div>
                    <p className="text-stone-500 text-[10px]">
                      Launches fullscreen with no Safari URL bar or browser chrome.
                    </p>
                  </div>
                </div>

                {/* Android Card */}
                <div className="p-4 bg-white border border-stone-200 rounded-card shadow-xs space-y-2.5">
                  <div className="flex items-center gap-2 text-charcoal font-semibold">
                    <Smartphone size={15} className="text-stone-700" />
                    <h5 className="font-serif text-sm">Android Browsers</h5>
                  </div>
                  <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-stone-100 text-stone-600">
                    Chrome · Firefox · Samsung Internet
                  </span>
                  <div className="text-stone-600 space-y-1.5 leading-relaxed text-[11px]">
                    <p>
                      Tap the browser menu button (<strong className="text-charcoal">⋮</strong> or <strong className="text-charcoal">☰</strong>), then tap:
                    </p>
                    <div className="p-2 bg-stone-50 rounded border border-stone-200/80 font-mono text-[10.5px] text-stone-800">
                      Install app  or  Add to Home screen
                    </div>
                    <p className="text-stone-500 text-[10px]">
                      In Samsung Internet, tap the install arrow in the URL bar directly.
                    </p>
                  </div>
                </div>
              </div>

              {/* Benefits highlight */}
              <div className="p-3.5 bg-stone-50/70 border border-stone-200/80 rounded-card space-y-1.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold block">
                  Benefits of Installing
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-stone-600 pt-0.5">
                  <div className="flex items-start gap-1.5">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span><strong>Focused</strong>: Dedicated window with zero tab clutter</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span><strong>100% Offline</strong>: Instant launch without network reliance</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span><strong>Fast Access</strong>: Quick switch with ⌘Tab or Alt-Tab</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: EXPORT CHARACTER & SKILLS TO PDF */}
          {activeTab === 'export' && (
            <div className="space-y-5 font-sans">
              <div className="bg-stone-50/80 border border-stone-200/90 rounded-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-charcoal font-serif text-base font-semibold">
                  <FileDown size={17} className="text-crimson" />
                  <span>Character Dossier & Skill Record Export</span>
                </div>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Export your character profile, rank, level, total experience, and any combination of your chosen skills into a clean, printable PDF document or offline HTML record.
                </p>
              </div>

              {/* Action Banner Card */}
              <div className="p-4 bg-white border border-stone-200/90 rounded-card shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-serif font-semibold text-charcoal">
                    Generate Your Printable Dossier
                  </h4>
                  <p className="text-[11px] text-stone-500">
                    Choose which skills to include, toggle sections, preview live, and print or save to vector PDF.
                  </p>
                </div>
                <button
                  onClick={() => {
                    close();
                    setExportPdfModalOpen(true);
                  }}
                  className="px-4 py-2 bg-charcoal hover:bg-stone-800 text-white text-xs font-medium rounded-mac shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2 shrink-0"
                >
                  <FileDown size={14} className="text-amber-400" />
                  <span>Open PDF Exporter</span>
                </button>
              </div>

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3.5 bg-stone-50/50 border border-stone-200/80 rounded-card space-y-1.5">
                  <div className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-crimson" />
                    <span>Skill Selection</span>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Select all skills or hand-pick specific masteries you want to highlight, along with their level badges, rank titles, and progress bars.
                  </p>
                </div>

                <div className="p-3.5 bg-stone-50/50 border border-stone-200/80 rounded-card space-y-1.5">
                  <div className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                    <span>True Vector Output</span>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Formatted for standard A4 and Letter paper. Uses the system print engine to output crisp, selectable text with zero pixelation at any zoom level.
                  </p>
                </div>

                <div className="p-3.5 bg-stone-50/50 border border-stone-200/80 rounded-card space-y-1.5">
                  <div className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-stone-500" />
                    <span>Section Customization</span>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Toggle aggregate stats, unlocked milestone honors, daily habit consistency, and add an optional custom focus motto or personal dedication.
                  </p>
                </div>

                <div className="p-3.5 bg-stone-50/50 border border-stone-200/80 rounded-card space-y-1.5">
                  <div className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                    <span>100% Private & Offline</span>
                  </div>
                  <p className="text-[11px] text-stone-600 leading-relaxed">
                    Your data never touches any remote server or external PDF rendering service. Generated directly inside your local browser.
                  </p>
                </div>
              </div>

              {/* Pro Tip */}
              <div className="p-3 bg-amber-50/60 border border-amber-200/70 rounded-mac text-[11px] text-amber-900 flex items-start gap-2">
                <Sparkles size={14} className="text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Tip:</strong> In your browser's Print window, select <em>Destination: Save as PDF</em> and verify <em>Background graphics</em> is checked to preserve full color progress bars and styling.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-stone-50/80 border-t border-stone-200 flex justify-between items-center text-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] text-stone-500 font-mono">
              Press <kbd className="px-1 py-0.2 bg-stone-200 rounded text-stone-700">?</kbd> anytime to open this guide
            </span>
            {activeTab !== 'install' && (
              <>
                <span className="text-stone-300 hidden sm:inline">•</span>
                <button
                  onClick={() => setActiveTab('install')}
                  className="text-[11px] text-stone-600 hover:text-charcoal underline underline-offset-2 font-medium cursor-pointer hidden sm:inline"
                >
                  Tip: Install as App →
                </button>
              </>
            )}
          </div>
          <button
            onClick={close}
            className="px-4 py-1.5 text-xs font-medium text-white bg-charcoal hover:bg-stone-800 rounded-mac shadow-xs transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
