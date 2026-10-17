import React, { useState, useEffect, useRef } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import {
  parseNaturalLanguageTask,
  formatDueDateDisplay,
  formatDuration,
  formatTimeRange,
  getCurrentHourTime,
  addMinutesToDateTime,
  diffInMinutesDateTime,
} from '../../lib/dateParser';
import {
  tokenizeTaskInput,
  getTokenClasses,
  formatNumberedTaskTitle,
  NumberingStyle,
} from '../../lib/taskSyntax';
import { Priority, Recurrence } from '../../types';
import { MAX_LENGTHS } from '../../lib/validation';
import {
  Calendar,
  Clock,
  Timer,
  Flag,
  Folder,
  Tag,
  CornerDownLeft,
  Repeat,
  X,
  ListOrdered,
  Minus,
  Plus,
  Check,
} from 'lucide-react';

interface QuickAddBarProps {
  inline?: boolean;
  onClose?: () => void;
  defaultProjectId?: string;
  defaultDueDate?: string;
}

export const QuickAddBar: React.FC<QuickAddBarProps> = ({
  inline = false,
  onClose,
  defaultProjectId,
  defaultDueDate,
}) => {
  const addTask = useEkirumStore((s) => s.addTask);
  const projects = useEkirumStore((s) => s.projects);
  const selectedProjectId = useEkirumStore((s) => s.selectedProjectId);

  const [input, setInput] = useState('');
  const [selectedProject, setSelectedProject] = useState<string>(
    defaultProjectId || selectedProjectId || (projects[0]?.id ?? 'inbox')
  );
  const [explicitPriority, setExplicitPriority] = useState<Priority | undefined>();
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const priorityMenuRef = useRef<HTMLDivElement>(null);

  const [explicitDueDate, setExplicitDueDate] = useState<string | null | undefined>(defaultDueDate);
  const [explicitDueTime, setExplicitDueTime] = useState<string | null | undefined>();
  const [explicitRecurrence, setExplicitRecurrence] = useState<Recurrence>('none');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const datePickerRef = useRef<HTMLDivElement>(null);

  const [explicitDuration, setExplicitDuration] = useState<number | null | undefined>();
  const [durationPickerOpen, setDurationPickerOpen] = useState(false);
  const durationPickerRef = useRef<HTMLDivElement>(null);

  const [explicitBatchCount, setExplicitBatchCount] = useState<number | undefined>();
  const [numberingStyle, setNumberingStyle] = useState<NumberingStyle>('suffix');
  const [startNumber, setStartNumber] = useState<number>(1);
  const [batchMenuOpen, setBatchMenuOpen] = useState(false);
  const batchMenuRef = useRef<HTMLDivElement>(null);

  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Responsive mobile placeholder detection (< 640px)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 640;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    setIsMobile(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMediaChange);
      return () => mediaQuery.removeEventListener('change', handleMediaChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleMediaChange);
      return () => mediaQuery.removeListener(handleMediaChange);
    }
  }, []);

  // Date strings for presets
  const todayDate = new Date();
  const formatDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const todayStr = formatDateStr(todayDate);

  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = formatDateStr(tomorrowDate);

  const nextWeekDate = new Date(todayDate);
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeekStr = formatDateStr(nextWeekDate);

  useEffect(() => {
    if (!inline) {
      inputRef.current?.focus();
    }
  }, [inline]);

  // Sync selectedProject whenever defaultProjectId or selectedProjectId changes
  useEffect(() => {
    const targetProject = defaultProjectId || selectedProjectId || projects[0]?.id;
    if (targetProject) {
      setSelectedProject(targetProject);
    }
  }, [defaultProjectId, selectedProjectId, projects]);

  // Sync explicitDueDate whenever defaultDueDate prop changes
  useEffect(() => {
    setExplicitDueDate(defaultDueDate);
  }, [defaultDueDate]);

  // Close popovers on click outside
  useEffect(() => {
    if (!datePickerOpen && !priorityMenuOpen && !batchMenuOpen && !durationPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (datePickerOpen && datePickerRef.current && !datePickerRef.current.contains(target)) {
        setDatePickerOpen(false);
      }
      if (durationPickerOpen && durationPickerRef.current && !durationPickerRef.current.contains(target)) {
        setDurationPickerOpen(false);
      }
      if (priorityMenuOpen && priorityMenuRef.current && !priorityMenuRef.current.contains(target)) {
        setPriorityMenuOpen(false);
      }
      if (batchMenuOpen && batchMenuRef.current && !batchMenuRef.current.contains(target)) {
        setBatchMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [datePickerOpen, priorityMenuOpen, batchMenuOpen, durationPickerOpen]);

  // Sync backdrop horizontal scroll with input
  useEffect(() => {
    if (backdropRef.current && inputRef.current) {
      backdropRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }, [input]);

  const handleInputScroll = () => {
    if (backdropRef.current && inputRef.current) {
      backdropRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };

  const parsed = parseNaturalLanguageTask(input);
  const tokens = tokenizeTaskInput(input);
  const hasParsedTokens = Boolean(
    input.trim().length > 0 && tokens.some((t) => t.type !== 'text')
  );

  // Computed values merging natural parse and explicit overrides
  const effectiveDueDate =
    explicitDueDate === null
      ? undefined
      : explicitDueDate !== undefined
      ? explicitDueDate
      : parsed.dueDate;

  const effectiveDueTime =
    explicitDueTime === null
      ? undefined
      : explicitDueTime !== undefined
      ? explicitDueTime
      : parsed.dueTime;

  const effectiveDuration =
    explicitDuration === null
      ? undefined
      : explicitDuration !== undefined
      ? explicitDuration
      : parsed.duration;

  const effectivePriority = explicitPriority || parsed.priority || 'p4';
  const effectiveRecurrence = explicitRecurrence !== 'none' ? explicitRecurrence : (parsed.recurrence || 'none');
  const effectiveBatchCount = explicitBatchCount !== undefined ? explicitBatchCount : (parsed.batchCount || 1);
  const previewTitle = parsed.title.trim() || input.trim() || 'Task';

  // Duration menu start and end date/hour calculations (default to current day and hour)
  const currentHourStr = getCurrentHourTime();
  const durationStartDate = effectiveDueDate || todayStr;
  const durationStartTime = effectiveDueTime || currentHourStr;

  const durationEnd = addMinutesToDateTime(
    durationStartDate,
    durationStartTime,
    effectiveDuration && effectiveDuration > 0 ? effectiveDuration : 60
  );
  const durationEndDate = durationEnd.date;
  const durationEndTime = durationEnd.time;

  const handleDurationStartChange = (newDate: string, newTime: string) => {
    setExplicitDueDate(newDate);
    setExplicitDueTime(newTime);
    if (!effectiveDuration) {
      setExplicitDuration(60);
    }
  };

  const handleDurationEndChange = (newEndDate: string, newEndTime: string) => {
    let diff = diffInMinutesDateTime(durationStartDate, durationStartTime, newEndDate, newEndTime);
    if (diff <= 0 && newEndDate === durationStartDate) {
      const nextDay = addMinutesToDateTime(durationStartDate, '00:00', 1440).date;
      diff = diffInMinutesDateTime(durationStartDate, durationStartTime, nextDay, newEndTime);
    }
    if (diff > 0) {
      setExplicitDuration(Math.min(1440, diff));
      if (!effectiveDueDate) setExplicitDueDate(durationStartDate);
      if (!effectiveDueTime) setExplicitDueTime(durationStartTime);
    }
  };

  const handleDurationPresetClick = (mins: number) => {
    setExplicitDuration(mins);
    if (!effectiveDueDate) setExplicitDueDate(durationStartDate);
    if (!effectiveDueTime) setExplicitDueTime(durationStartTime);
  };

  // Match projectQuery if user typed `@ProjectName`
  let effectiveProjectId = selectedProject;
  if (parsed.projectQuery) {
    const found = projects.find(
      (p) => p.name.toLowerCase().includes(parsed.projectQuery!.toLowerCase())
    );
    if (found) effectiveProjectId = found.id;
  }

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const rawTitle = input.trim();
    if (!rawTitle) return;

    const baseTitle = parsed.title.trim() || rawTitle;
    const count = effectiveBatchCount;
    const finalDueDate =
      effectiveDueDate ||
      (effectiveRecurrence !== 'none' && explicitDueDate !== null ? todayStr : undefined);

    if (count > 1) {
      // Add in reverse order so #1 ends up at the top of the task list
      for (let i = count - 1; i >= 0; i--) {
        const num = startNumber + i;
        const total = startNumber + count - 1;
        const taskTitle = formatNumberedTaskTitle(baseTitle, num, total, numberingStyle);

        addTask({
          title: taskTitle,
          projectId: effectiveProjectId,
          dueDate: finalDueDate,
          dueTime: effectiveDueTime,
          duration: effectiveDuration,
          priority: effectivePriority,
          recurrence: effectiveRecurrence,
          labels: parsed.labels,
        });
      }
    } else {
      addTask({
        title: baseTitle,
        projectId: effectiveProjectId,
        dueDate: finalDueDate,
        dueTime: effectiveDueTime,
        duration: effectiveDuration,
        priority: effectivePriority,
        recurrence: effectiveRecurrence,
        labels: parsed.labels,
      });
    }

    setInput('');
    setExplicitPriority(undefined);
    setExplicitDueDate(defaultDueDate);
    setExplicitDueTime(undefined);
    setExplicitDuration(undefined);
    setExplicitRecurrence('none');
    setExplicitBatchCount(undefined);
    setStartNumber(1);
    setDatePickerOpen(false);
    setDurationPickerOpen(false);
    setPriorityMenuOpen(false);
    setBatchMenuOpen(false);

    if (onClose) {
      onClose();
    }
  };

  const priorityColors: Record<Priority, string> = {
    p1: 'bg-crimson text-white',
    p2: 'bg-amber-600 text-white',
    p3: 'bg-stone-500 text-white',
    p4: 'bg-stone-200 text-stone-600',
  };

  const priorityBadgeLabels: Record<Priority, string> = {
    p1: 'P1 · Urgent',
    p2: 'P2 · High',
    p3: 'P3 · Low',
    p4: 'P4 · None',
  };

  const priorityTooltips: Record<Priority, string> = {
    p1: 'P1 — Urgent / High Focus',
    p2: 'P2 — High Focus',
    p3: 'P3 — Low Focus',
    p4: 'P4 — None / Default',
  };

  const handleContainerBlur = (e: React.FocusEvent) => {
    if (datePickerOpen || priorityMenuOpen || batchMenuOpen) return;
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsFocused(false);
    }
  };

  return (
    <div
      onFocus={() => setIsFocused(true)}
      onBlur={handleContainerBlur}
      className={`transition-all ${
        inline
          ? 'w-full py-2 px-3 rounded-mac border border-stone-200/70 bg-white/70 hover:bg-white hover:border-stone-300 focus-within:bg-white focus-within:border-stone-400 focus-within:shadow-2xs mb-5'
          : 'w-full max-w-xl bg-white rounded-sheet border border-stone-200/90 shadow-modal p-5'
      }`}
    >
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className="relative">
          {/* Syntax Highlighter Backdrop */}
          <div
            ref={backdropRef}
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none whitespace-pre overflow-x-hidden overflow-y-hidden text-base sm:text-sm font-sans pb-1 leading-normal select-none"
          >
            {input
              ? tokens.map((token, index) => (
                  <span key={index} className={getTokenClasses(token)}>
                    {token.text}
                  </span>
                ))
              : null}
          </div>

          <input
            ref={inputRef}
            type="text"
            maxLength={MAX_LENGTHS.TASK_TITLE}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onScroll={handleInputScroll}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (onClose) onClose();
                else {
                  setInput('');
                  setIsFocused(false);
                  inputRef.current?.blur();
                }
              }
            }}
            placeholder={isMobile ? 'Add a task...' : 'Add a task... (e.g. meditate daily at 18:00 @meditation)'}
            aria-label={isMobile ? 'Add a task' : 'Add a task, e.g. meditate daily at 18:00 @meditation'}
            className="w-full text-base sm:text-sm font-sans leading-normal bg-transparent border-0 pb-1 focus:outline-none focus:ring-0 text-transparent caret-stone-900 selection:bg-stone-300/60 selection:text-transparent placeholder:text-stone-500 transition-colors"
          />
        </div>

        {/* Natural Language Token Feedback */}
        {hasParsedTokens && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            {parsed.dueDate && explicitDueDate !== null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-[11px] border border-stone-200 font-mono">
                <Calendar size={11} className="text-stone-500" />
                {formatDueDateDisplay(effectiveDueDate, effectiveDueTime, effectiveDuration)}
              </span>
            )}

            {parsed.dueTime && !parsed.dueDate && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-[11px] border border-stone-200 font-mono">
                <Clock size={11} className="text-stone-500" />
                {formatTimeRange(parsed.dueTime, effectiveDuration)}
              </span>
            )}

            {parsed.priority && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium uppercase tracking-wider ${priorityColors[effectivePriority]}`}>
                <Flag size={10} />
                {priorityBadgeLabels[effectivePriority]}
              </span>
            )}

            {parsed.labels.map((lbl) => (
              <span
                key={lbl}
                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-[11px] border border-stone-200"
              >
                <Tag size={10} className="text-stone-500" />
                #{lbl}
              </span>
            ))}

            {parsed.recurrence && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] border border-emerald-200 font-mono">
                <Repeat size={11} className="text-emerald-600" />
                <span className="capitalize">
                  {effectiveRecurrence === 'weekdays' ? 'Every Weekday' : effectiveRecurrence}
                </span>
              </span>
            )}

            {parsed.projectQuery && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-[11px] border border-stone-200 font-mono">
                <Folder size={11} className="text-stone-500" />
                @{parsed.projectQuery}
              </span>
            )}

            {parsed.duration && explicitDuration !== null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 text-[11px] border border-blue-200 font-mono">
                <Timer size={11} className="text-blue-600" />
                {formatDuration(effectiveDuration)}
              </span>
            )}

            {parsed.batchCount && parsed.batchCount > 1 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 text-[11px] border border-purple-200 font-mono">
                <ListOrdered size={11} className="text-purple-600" />
                {effectiveBatchCount} tasks
              </span>
            )}
          </div>
        )}

        {/* Toolbar Controls & Actions (always in modal, or when focused/typing inline) */}
        {(!inline || isFocused || input.trim().length > 0) && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 animate-in fade-in duration-100">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {/* Project Picker */}
              <div className="relative inline-flex items-center">
                <Folder size={12} className="absolute left-2 text-stone-500 pointer-events-none" />
                <select
                  value={effectiveProjectId}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  aria-label="Assign to project"
                  className="pl-6 pr-3 py-1 text-xs bg-stone-50 border border-stone-200 rounded-mac text-stone-700 focus:outline-none focus:border-stone-400 cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mini Calendar & Hour Picker */}
              <div className="relative inline-flex items-center" ref={datePickerRef}>
                <button
                  type="button"
                  onClick={() => setDatePickerOpen(!datePickerOpen)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-mac border transition-all cursor-pointer ${
                    effectiveDueDate
                      ? 'bg-amber-500/10 text-amber-900 border-amber-300/80 font-medium shadow-2xs'
                      : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200'
                  }`}
                  title="Choose date and hour"
                  aria-label="Choose task date and hour"
                  aria-expanded={datePickerOpen}
                >
                  <Calendar size={12} className={effectiveDueDate ? 'text-amber-700' : 'text-stone-500'} />
                  <span>
                    {effectiveDueDate ? formatDueDateDisplay(effectiveDueDate) : 'Date & hour'}
                  </span>
                  {effectiveRecurrence !== 'none' && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-emerald-800 bg-emerald-100/70 px-1 py-0.2 rounded">
                      <Repeat size={9} />
                      <span className="capitalize">{effectiveRecurrence === 'weekdays' ? 'Weekdays' : effectiveRecurrence}</span>
                    </span>
                  )}
                  {effectiveDueTime && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-mono text-stone-700 bg-stone-200/60 px-1 py-0.2 rounded">
                      <Clock size={9} />
                      {formatTimeRange(effectiveDueTime, effectiveDuration)}
                    </span>
                  )}
                </button>

                {/* Quick clear button if date or recurrence is assigned */}
                {(effectiveDueDate || effectiveRecurrence !== 'none') && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExplicitDueDate(null);
                      setExplicitDueTime(null);
                      setExplicitRecurrence('none');
                    }}
                    className="ml-1 p-0.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 rounded cursor-pointer transition-colors"
                    title="Remove date and recurrence"
                    aria-label="Remove due date and recurrence"
                  >
                    <X size={11} />
                  </button>
                )}

                {/* Mini Calendar & Hour Popover */}
                {datePickerOpen && (
                  <div
                    className={`fixed inset-x-3 bottom-24 sm:absolute sm:inset-auto sm:left-0 ${
                      inline ? 'sm:top-full sm:mt-1.5' : 'sm:bottom-full sm:mb-1.5'
                    } w-auto sm:w-72 max-w-sm mx-auto sm:mx-0 bg-white rounded-sheet border border-stone-200/90 shadow-modal p-3.5 z-50 text-xs font-sans space-y-3 animate-in fade-in zoom-in-95 duration-100`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Presets Row */}
                    <div className="flex flex-wrap items-center gap-1.5 pb-2.5 border-b border-stone-100">
                      <button
                        type="button"
                        onClick={() => {
                          setExplicitDueDate(todayStr);
                        }}
                        className={`px-2 py-0.5 rounded-mac text-[11px] font-medium border transition-colors cursor-pointer ${
                          effectiveDueDate === todayStr
                            ? 'bg-charcoal text-white border-charcoal'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200'
                        }`}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExplicitDueDate(tomorrowStr);
                        }}
                        className={`px-2 py-0.5 rounded-mac text-[11px] font-medium border transition-colors cursor-pointer ${
                          effectiveDueDate === tomorrowStr
                            ? 'bg-charcoal text-white border-charcoal'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200'
                        }`}
                      >
                        Tomorrow
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExplicitDueDate(nextWeekStr);
                        }}
                        className={`px-2 py-0.5 rounded-mac text-[11px] font-medium border transition-colors cursor-pointer ${
                          effectiveDueDate === nextWeekStr
                            ? 'bg-charcoal text-white border-charcoal'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200'
                        }`}
                      >
                        Next Week
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExplicitDueDate(null);
                          setExplicitDueTime(null);
                        }}
                        className={`px-2 py-0.5 rounded-mac text-[11px] font-medium border transition-colors cursor-pointer ${
                          !effectiveDueDate
                            ? 'bg-charcoal text-white border-charcoal'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-500 border-stone-200'
                        }`}
                      >
                        No Date
                      </button>
                    </div>

                    {/* Date Picker Input */}
                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-[11px] text-stone-500 font-medium">
                        <Calendar size={12} className="text-stone-400" />
                        <span>Date</span>
                      </label>
                      <input
                        type="date"
                        value={effectiveDueDate || ''}
                        onChange={(e) => setExplicitDueDate(e.target.value || null)}
                        className="w-full bg-stone-50 border border-stone-200 hover:border-stone-300 focus:border-stone-400 focus:bg-white rounded-mac px-2.5 py-1 text-base sm:text-xs min-h-[36px] sm:min-h-auto text-charcoal outline-none transition-colors"
                      />
                    </div>

                    {/* Time / Hour Picker Input */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-1.5 text-[11px] text-stone-500 font-medium">
                          <Clock size={12} className="text-stone-400" />
                          <span>Hour & Time</span>
                        </label>
                        {effectiveDueTime && (
                          <button
                            type="button"
                            onClick={() => setExplicitDueTime(null)}
                            className="text-[10px] text-stone-400 hover:text-stone-600 underline cursor-pointer"
                          >
                            Clear hour
                          </button>
                        )}
                      </div>
                      <input
                        type="time"
                        value={effectiveDueTime || ''}
                        onChange={(e) => setExplicitDueTime(e.target.value || null)}
                        className="w-full bg-stone-50 border border-stone-200 hover:border-stone-300 focus:border-stone-400 focus:bg-white rounded-mac px-2.5 py-1 text-base sm:text-xs min-h-[36px] sm:min-h-auto text-charcoal outline-none transition-colors"
                      />

                      {/* Quick Hour Chips */}
                      <div className="flex items-center gap-1 pt-0.5 overflow-x-auto">
                        {['09:00', '12:00', '15:00', '18:00', '21:00'].map((timePreset) => (
                          <button
                            key={timePreset}
                            type="button"
                            onClick={() => {
                              setExplicitDueTime(timePreset);
                              if (!effectiveDueDate) setExplicitDueDate(todayStr);
                            }}
                            className={`px-1.5 py-0.5 text-[10px] rounded font-mono border transition-colors cursor-pointer ${
                              effectiveDueTime === timePreset
                                ? 'bg-charcoal text-white border-charcoal'
                                : 'bg-stone-100 hover:bg-stone-200 text-stone-600 border-stone-200'
                            }`}
                          >
                            {timePreset}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Recurrence Selector */}
                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-[11px] text-stone-500 font-medium">
                        <Repeat size={12} className="text-stone-400" />
                        <span>Recurrence</span>
                      </label>
                      <div className="flex flex-wrap items-center gap-1">
                        {(
                          [
                            { id: 'none', label: 'None' },
                            { id: 'daily', label: 'Daily' },
                            { id: 'weekdays', label: 'Weekdays' },
                            { id: 'weekly', label: 'Weekly' },
                            { id: 'monthly', label: 'Monthly' },
                          ] as { id: Recurrence; label: string }[]
                        ).map((rec) => (
                          <button
                            key={rec.id}
                            type="button"
                            onClick={() => {
                              setExplicitRecurrence(rec.id);
                              if (rec.id !== 'none' && !effectiveDueDate) {
                                setExplicitDueDate(todayStr);
                              }
                            }}
                            className={`px-2 py-0.5 rounded-mac text-[10px] font-medium border transition-colors cursor-pointer ${
                              effectiveRecurrence === rec.id
                                ? 'bg-charcoal text-white border-charcoal'
                                : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200'
                            }`}
                          >
                            {rec.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-stone-500 truncate max-w-[170px]">
                        {effectiveDueDate
                          ? formatDueDateDisplay(effectiveDueDate, effectiveDueTime, effectiveDuration)
                          : 'No date assigned'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDatePickerOpen(false)}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-charcoal hover:bg-stone-800 rounded-mac transition-colors cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mini Duration Picker */}
              <div className="relative inline-flex items-center" ref={durationPickerRef}>
                <button
                  type="button"
                  onClick={() => setDurationPickerOpen(!durationPickerOpen)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-mac border transition-all cursor-pointer ${
                    effectiveDuration
                      ? 'bg-blue-500/10 text-blue-900 border-blue-300/80 font-medium shadow-2xs'
                      : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200'
                  }`}
                  title="Estimated task duration"
                  aria-label="Estimated task duration"
                  aria-expanded={durationPickerOpen}
                >
                  <Timer size={12} className={effectiveDuration ? 'text-blue-700' : 'text-stone-500'} />
                  <span>{effectiveDuration ? formatDuration(effectiveDuration) : 'Duration'}</span>
                </button>

                {/* Quick clear button if duration is assigned */}
                {effectiveDuration && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExplicitDuration(null);
                    }}
                    className="ml-1 p-0.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200/50 rounded cursor-pointer transition-colors"
                    title="Remove duration"
                    aria-label="Remove task duration"
                  >
                    <X size={11} />
                  </button>
                )}

                {/* Duration Popover */}
                {durationPickerOpen && (
                  <div
                    className={`fixed inset-x-3 bottom-24 sm:absolute sm:inset-auto sm:left-0 ${
                      inline ? 'sm:top-full sm:mt-1.5' : 'sm:bottom-full sm:mb-1.5'
                    } w-auto sm:w-80 max-w-sm mx-auto sm:mx-0 bg-white rounded-sheet border border-stone-200/90 shadow-modal p-3.5 z-50 text-xs font-sans space-y-3 animate-in fade-in zoom-in-95 duration-100`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                      <div className="flex items-center gap-1.5 font-medium text-charcoal text-xs">
                        <Timer size={13} className="text-blue-600" />
                        <span>Task Duration</span>
                      </div>
                      {effectiveDuration && (
                        <button
                          type="button"
                          onClick={() => {
                            setExplicitDuration(null);
                            setDurationPickerOpen(false);
                          }}
                          className="text-[10px] text-stone-400 hover:text-stone-600 underline cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {/* Start & End Schedule Grid */}
                    <div className="space-y-2 pb-2.5 border-b border-stone-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
                          Start & End Schedule
                        </span>
                        {effectiveDuration && (
                          <span className="text-[11px] font-mono font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60">
                            {formatTimeRange(durationStartTime, effectiveDuration)} ({formatDuration(effectiveDuration)})
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Start Date & Hour */}
                        <div className="space-y-1 bg-stone-50/70 p-2 rounded-mac border border-stone-200/70">
                          <label className="flex items-center gap-1 text-[11px] font-medium text-stone-700">
                            <Clock size={11} className="text-stone-500" />
                            <span>Start</span>
                          </label>
                          <input
                            type="date"
                            value={durationStartDate}
                            onChange={(e) => handleDurationStartChange(e.target.value, durationStartTime)}
                            className="w-full bg-white border border-stone-200 hover:border-stone-300 focus:border-stone-400 rounded px-2 py-1 text-xs text-charcoal outline-none transition-colors"
                          />
                          <input
                            type="time"
                            value={durationStartTime}
                            onChange={(e) => handleDurationStartChange(durationStartDate, e.target.value)}
                            className="w-full bg-white border border-stone-200 hover:border-stone-300 focus:border-stone-400 rounded px-2 py-1 text-xs text-charcoal outline-none transition-colors font-mono"
                          />
                        </div>

                        {/* End Date & Hour */}
                        <div className="space-y-1 bg-stone-50/70 p-2 rounded-mac border border-stone-200/70">
                          <label className="flex items-center gap-1 text-[11px] font-medium text-stone-700">
                            <Clock size={11} className="text-blue-500" />
                            <span>End</span>
                          </label>
                          <input
                            type="date"
                            value={durationEndDate}
                            onChange={(e) => handleDurationEndChange(e.target.value, durationEndTime)}
                            className="w-full bg-white border border-stone-200 hover:border-stone-300 focus:border-stone-400 rounded px-2 py-1 text-xs text-charcoal outline-none transition-colors"
                          />
                          <input
                            type="time"
                            value={durationEndTime}
                            onChange={(e) => handleDurationEndChange(durationEndDate, e.target.value)}
                            className="w-full bg-white border border-stone-200 hover:border-stone-300 focus:border-stone-400 rounded px-2 py-1 text-xs text-charcoal outline-none transition-colors font-mono"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
                        Quick Presets
                      </label>
                      <div className="grid grid-cols-4 gap-1">
                        {[15, 25, 30, 45, 60, 90, 120, 180].map((mins) => (
                          <button
                            key={mins}
                            type="button"
                            onClick={() => handleDurationPresetClick(mins)}
                            className={`py-1 rounded-mac text-xs font-medium border transition-colors cursor-pointer text-center ${
                              effectiveDuration === mins
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                            }`}
                          >
                            {formatDuration(mins)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom Duration Input */}
                    <div className="space-y-1 pt-1 border-t border-stone-100">
                      <label className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
                        Custom Minutes
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={1440}
                          placeholder="e.g. 50"
                          value={effectiveDuration || ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value, 10) : null;
                            if (val && !isNaN(val) && val > 0) {
                              setExplicitDuration(Math.min(val, 1440));
                              if (!effectiveDueDate) setExplicitDueDate(durationStartDate);
                              if (!effectiveDueTime) setExplicitDueTime(durationStartTime);
                            } else {
                              setExplicitDuration(null);
                            }
                          }}
                          className="flex-1 bg-stone-50 border border-stone-200 hover:border-stone-300 focus:border-stone-400 focus:bg-white rounded-mac px-2.5 py-1 text-xs text-charcoal outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setDurationPickerOpen(false)}
                          className="px-2.5 py-1 text-xs font-medium text-white bg-charcoal hover:bg-stone-800 rounded-mac transition-colors cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Simplified Priority Menu */}
              <div className="relative inline-flex items-center" ref={priorityMenuRef}>
                <button
                  type="button"
                  onClick={() => setPriorityMenuOpen(!priorityMenuOpen)}
                  className={`inline-flex items-center justify-center p-1.5 text-xs rounded-mac border transition-all cursor-pointer ${
                    effectivePriority === 'p1'
                      ? 'bg-red-500/10 text-crimson border-red-300/80 font-semibold shadow-2xs'
                      : effectivePriority === 'p2'
                      ? 'bg-amber-500/10 text-amber-800 border-amber-300/80 font-semibold shadow-2xs'
                      : effectivePriority === 'p3'
                      ? 'bg-stone-200/60 text-stone-700 border-stone-300 font-medium'
                      : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200'
                  }`}
                  title={priorityTooltips[effectivePriority]}
                  aria-label="Choose task priority"
                  aria-expanded={priorityMenuOpen}
                >
                  <Flag
                    size={12}
                    className={
                      effectivePriority === 'p1'
                        ? 'text-crimson'
                        : effectivePriority === 'p2'
                        ? 'text-amber-700'
                        : effectivePriority === 'p3'
                        ? 'text-stone-600'
                        : 'text-stone-400'
                    }
                  />
                </button>

                {priorityMenuOpen && (
                  <div
                    className={`fixed inset-x-4 bottom-24 sm:absolute sm:inset-auto sm:left-0 ${
                      inline ? 'sm:top-full sm:mt-1.5' : 'sm:bottom-full sm:mb-1.5'
                    } w-auto sm:w-52 max-w-xs mx-auto sm:mx-0 bg-white rounded-sheet border border-stone-200/90 shadow-modal p-1.5 z-50 text-xs font-sans space-y-0.5 animate-in fade-in zoom-in-95 duration-100`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                      Priority
                    </div>
                    {(
                      [
                        { id: 'p1', label: 'P1 · Urgent', textClass: 'text-crimson', dotClass: 'bg-crimson' },
                        { id: 'p2', label: 'P2 · High', textClass: 'text-amber-700', dotClass: 'bg-amber-600' },
                        { id: 'p3', label: 'P3 · Low', textClass: 'text-stone-700', dotClass: 'bg-stone-500' },
                        { id: 'p4', label: 'P4 · None', textClass: 'text-stone-500', dotClass: 'bg-stone-300' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setExplicitPriority(opt.id as Priority);
                          setPriorityMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-mac text-xs transition-colors cursor-pointer ${
                          effectivePriority === opt.id
                            ? 'bg-stone-100 font-medium text-charcoal'
                            : 'hover:bg-stone-50 text-stone-600'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${opt.dotClass}`} />
                          <span className={opt.textClass}>{opt.label}</span>
                        </div>
                        {effectivePriority === opt.id && <Check size={11} className="text-charcoal" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Multiple Numbered Tasks Mini Menu */}
              <div className="relative inline-flex items-center" ref={batchMenuRef}>
                <button
                  type="button"
                  onClick={() => setBatchMenuOpen(!batchMenuOpen)}
                  className={`inline-flex items-center justify-center gap-1 p-1.5 text-xs rounded-mac border transition-all cursor-pointer ${
                    effectiveBatchCount > 1
                      ? 'bg-purple-500/10 text-purple-900 border-purple-300/80 font-medium shadow-2xs'
                      : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200'
                  }`}
                  title="Create multiple numbered tasks"
                  aria-label="Create multiple numbered tasks"
                  aria-expanded={batchMenuOpen}
                >
                  <ListOrdered size={12} className={effectiveBatchCount > 1 ? 'text-purple-700' : 'text-stone-500'} />
                  {effectiveBatchCount > 1 && (
                    <span className="font-mono text-xs">
                      x{effectiveBatchCount}
                    </span>
                  )}
                </button>

                {batchMenuOpen && (
                  <div
                    className={`fixed inset-x-3 bottom-24 sm:absolute sm:inset-auto sm:left-0 ${
                      inline ? 'sm:top-full sm:mt-1.5' : 'sm:bottom-full sm:mb-1.5'
                    } w-auto sm:w-72 max-w-sm mx-auto sm:mx-0 bg-white rounded-sheet border border-stone-200/90 shadow-modal p-3.5 z-50 text-xs font-sans space-y-3 animate-in fade-in zoom-in-95 duration-100`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                      <div className="flex items-center gap-1.5 font-medium text-charcoal text-xs">
                        <ListOrdered size={13} className="text-purple-600" />
                        <span>Multiple Numbered Tasks</span>
                      </div>
                      {effectiveBatchCount > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setExplicitBatchCount(1);
                            setStartNumber(1);
                          }}
                          className="text-[10px] text-stone-400 hover:text-stone-700 underline cursor-pointer"
                        >
                          Reset to 1
                        </button>
                      )}
                    </div>

                    {/* Quantity Stepper & Quick Presets */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-stone-500 font-medium block">
                        Number of tasks to create
                      </label>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center border border-stone-200 rounded-mac bg-stone-50 p-0.5">
                          <button
                            type="button"
                            disabled={effectiveBatchCount <= 1}
                            onClick={() => setExplicitBatchCount(Math.max(1, effectiveBatchCount - 1))}
                            className="w-6 h-6 flex items-center justify-center rounded text-stone-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            aria-label="Decrease task count"
                          >
                            <Minus size={11} />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={effectiveBatchCount}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setExplicitBatchCount(isNaN(val) ? 1 : Math.max(1, Math.min(50, val)));
                            }}
                            className="w-8 text-center text-xs font-mono font-medium bg-transparent border-0 outline-none p-0 text-charcoal"
                          />
                          <button
                            type="button"
                            disabled={effectiveBatchCount >= 50}
                            onClick={() => setExplicitBatchCount(Math.min(50, effectiveBatchCount + 1))}
                            className="w-6 h-6 flex items-center justify-center rounded text-stone-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                            aria-label="Increase task count"
                          >
                            <Plus size={11} />
                          </button>
                        </div>

                        {/* Quick Count Presets */}
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 5, 10].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setExplicitBatchCount(num)}
                              className={`px-2 py-1 text-[11px] font-mono rounded-mac border transition-colors cursor-pointer ${
                                effectiveBatchCount === num
                                  ? 'bg-charcoal text-white border-charcoal font-medium'
                                  : 'bg-stone-50 hover:bg-stone-100 text-stone-600 border-stone-200'
                              }`}
                            >
                              {num === 1 ? '1' : `${num}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {effectiveBatchCount > 1 && (
                      <>
                        {/* Numbering Format Options */}
                        <div className="space-y-1.5 pt-1">
                          <label className="text-[11px] text-stone-500 font-medium block">
                            Numbering Pattern
                          </label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              { id: 'suffix', label: 'Title 1, 2, 3', example: 'Task 1' },
                              { id: 'hash', label: 'Title #1, #2', example: 'Task #1' },
                              { id: 'fraction', label: 'Title (1/N)', example: `Task (1/${effectiveBatchCount})` },
                              { id: 'bracket', label: 'Title [1], [2]', example: 'Task [1]' },
                            ].map((fmt) => (
                              <button
                                key={fmt.id}
                                type="button"
                                onClick={() => setNumberingStyle(fmt.id as NumberingStyle)}
                                className={`flex flex-col text-left px-2 py-1 rounded-mac border transition-colors cursor-pointer ${
                                  numberingStyle === fmt.id
                                    ? 'bg-purple-50 border-purple-300 text-purple-950 font-medium'
                                    : 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-600'
                                }`}
                              >
                                <span className="text-[10px] font-mono">{fmt.example}</span>
                                <span className="text-[9px] text-stone-400">{fmt.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Start Number */}
                        <div className="flex items-center justify-between pt-1">
                          <label className="text-[11px] text-stone-500 font-medium">
                            Start numbering at
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={startNumber}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              setStartNumber(isNaN(val) ? 1 : Math.max(1, val));
                            }}
                            className="w-14 text-center text-xs font-mono bg-stone-50 border border-stone-200 rounded-mac py-0.5 outline-none focus:border-stone-400"
                          />
                        </div>

                        {/* Live Preview */}
                        <div className="p-2 rounded-mac bg-stone-50 border border-stone-200/80 text-[11px] text-stone-600 space-y-1">
                          <div className="text-[10px] uppercase font-semibold tracking-wider text-stone-400">
                            Preview ({effectiveBatchCount} tasks):
                          </div>
                          <div className="font-mono text-[10px] text-stone-700 space-y-0.5 truncate">
                            <div>• {formatNumberedTaskTitle(previewTitle, startNumber, startNumber + effectiveBatchCount - 1, numberingStyle)}</div>
                            <div>• {formatNumberedTaskTitle(previewTitle, startNumber + 1, startNumber + effectiveBatchCount - 1, numberingStyle)}</div>
                            {effectiveBatchCount > 2 && (
                              <div className="text-stone-400 italic">
                                ... and {effectiveBatchCount - 2} more
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Footer */}
                    <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                      <span className="text-[10px] text-stone-500">
                        {effectiveBatchCount > 1
                          ? `Will create ${effectiveBatchCount} tasks`
                          : 'Creates 1 task'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setBatchMenuOpen(false)}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-charcoal hover:bg-stone-800 rounded-mac transition-colors cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-2.5 py-1 text-xs text-stone-500 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={!input.trim()}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-white bg-crimson hover:bg-crimson-hover disabled:opacity-40 disabled:cursor-not-allowed rounded-mac shadow-xs transition-all cursor-pointer"
              >
                <span>{effectiveBatchCount > 1 ? `Add ${effectiveBatchCount} Tasks` : 'Add Task'}</span>
                <CornerDownLeft size={12} />
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};
