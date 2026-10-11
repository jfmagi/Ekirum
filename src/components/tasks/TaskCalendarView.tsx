import React, { useState, useMemo } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { Task, Priority } from '../../types';
import { TaskItem } from './TaskItem';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Check,
  AlertCircle,
  Inbox,
  CalendarPlus,
  X,
  Layers,
} from 'lucide-react';

export function isTaskScheduledOnDate(
  task: Task,
  dateStr: string,
  dateObj: Date,
  todayStr: string
): boolean {
  // Direct match to assigned due date
  if (task.dueDate === dateStr) return true;

  // Completed tasks are only shown on their historical dueDate
  if (task.completed) return false;

  // Recurring tasks project onto all matching future days
  if (task.recurrence && task.recurrence !== 'none') {
    const startDate = task.dueDate || todayStr;
    // Don't show recurring tasks before their starting date
    if (dateStr < startDate) return false;

    if (task.recurrence === 'daily') {
      return true;
    }
    if (task.recurrence === 'weekdays') {
      const day = dateObj.getDay();
      return day !== 0 && day !== 6;
    }
    if (task.recurrence === 'weekly') {
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const startObj = new Date(sy, sm - 1, sd);
      return startObj.getDay() === dateObj.getDay();
    }
    if (task.recurrence === 'monthly') {
      const startDayNum = Number(startDate.split('-')[2]);
      return Number(dateStr.split('-')[2]) === startDayNum;
    }
  }

  return false;
}

export const TaskCalendarView: React.FC = () => {
  const {
    tasks,
    currentView,
    selectedProjectId,
    searchQuery,
    selectedPriorityFilter,
    selectedLabelFilter,
    updateTask,
    addTask,
    toggleTaskComplete,
    openTaskDetail,
    setQuickAddOpen,
  } = useEkirumStore();

  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [today]);

  // Current view state
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [mobileTab, setMobileTab] = useState<'calendar' | 'agenda'>('calendar');
  const [showBacklog, setShowBacklog] = useState<boolean>(false);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [inlineTaskTitle, setInlineTaskTitle] = useState<string>('');

  // Priority badge styling
  const priorityDots: Record<Priority, string> = {
    p1: 'bg-crimson ring-1 ring-crimson/30',
    p2: 'bg-amber-500 ring-1 ring-amber-500/30',
    p3: 'bg-slate-400 ring-1 ring-slate-400/30',
    p4: 'bg-stone-300 ring-1 ring-stone-300/30',
  };

  // Filter tasks based on view, search, priority, label
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (task.isDeleted) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = task.title.toLowerCase().includes(q);
        const matchNotes = task.notes?.toLowerCase().includes(q);
        const matchLabels = task.labels?.some((l) => l.toLowerCase().includes(q));
        if (!matchTitle && !matchNotes && !matchLabels) return false;
      }

      if (selectedPriorityFilter !== 'all' && task.priority !== selectedPriorityFilter) {
        return false;
      }

      if (selectedLabelFilter !== 'all' && !task.labels?.includes(selectedLabelFilter)) {
        return false;
      }

      if (currentView === 'project' && selectedProjectId) {
        return task.projectId === selectedProjectId;
      }

      return true;
    });
  }, [tasks, searchQuery, selectedPriorityFilter, selectedLabelFilter, currentView, selectedProjectId]);

  // Navigation handlers
  const handlePrev = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() - 1);
    } else {
      next.setDate(next.getDate() - 7);
    }
    setCurrentDate(next);
  };

  const handleNext = () => {
    const next = new Date(currentDate);
    if (viewMode === 'month') {
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    setCurrentDate(next);
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(todayStr);
  };

  // Month navigation labels
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const currentMonthName = monthNames[currentDate.getMonth()];
  const currentYear = currentDate.getFullYear();

  // Generate Month Grid (Monday-first)
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    // JS getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday
    // Convert to Monday=0, Sunday=6
    const startDayIndex = (firstDayOfMonth.getDay() + 6) % 7;

    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: { date: Date; dateStr: string; isCurrentMonth: boolean }[] = [];

    // Leading days from previous month
    for (let i = startDayIndex - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, daysInPrevMonth - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      days.push({
        date: d,
        dateStr: `${y}-${m}-${date}`,
        isCurrentMonth: false,
      });
    }

    // Days in current month
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      const d = new Date(year, month, i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(i).padStart(2, '0');
      days.push({
        date: d,
        dateStr: `${y}-${m}-${date}`,
        isCurrentMonth: true,
      });
    }

    // Trailing days from next month to fill grid (35 or 42 cells)
    const totalCells = days.length <= 35 ? 35 : 42;
    const remaining = totalCells - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(i).padStart(2, '0');
      days.push({
        date: d,
        dateStr: `${y}-${m}-${date}`,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentDate]);

  // Generate Week Grid
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const day = (curr.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(curr);
    monday.setDate(curr.getDate() - day);

    const days: { date: Date; dateStr: string; isCurrentMonth: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      days.push({
        date: d,
        dateStr: `${y}-${m}-${date}`,
        isCurrentMonth: d.getMonth() === currentDate.getMonth(),
      });
    }
    return days;
  }, [currentDate]);

  // Map tasks by dueDate & recurrence across visible calendar dates
  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();

    // Collect all candidate dates from month grid, week grid, selected date, and explicit task due dates
    const candidateDates = new Map<string, Date>();
    monthDays.forEach((d) => candidateDates.set(d.dateStr, d.date));
    weekDays.forEach((d) => candidateDates.set(d.dateStr, d.date));
    if (!candidateDates.has(selectedDate)) {
      const [sy, sm, sd] = selectedDate.split('-').map(Number);
      candidateDates.set(selectedDate, new Date(sy, sm - 1, sd));
    }
    filteredTasks.forEach((t) => {
      if (t.dueDate && !candidateDates.has(t.dueDate)) {
        const [ty, tm, td] = t.dueDate.split('-').map(Number);
        candidateDates.set(t.dueDate, new Date(ty, tm - 1, td));
      }
    });

    candidateDates.forEach((dateObj, dateStr) => {
      const matchingTasks = filteredTasks.filter((t) =>
        isTaskScheduledOnDate(t, dateStr, dateObj, todayStr)
      );
      if (matchingTasks.length > 0) {
        map.set(dateStr, matchingTasks);
      }
    });

    return map;
  }, [filteredTasks, monthDays, weekDays, selectedDate, todayStr]);

  // Unscheduled tasks (active, without dueDate, and without recurrence)
  const unscheduledTasks = useMemo(() => {
    return filteredTasks.filter(
      (t) => !t.completed && !t.dueDate && (!t.recurrence || t.recurrence === 'none')
    );
  }, [filteredTasks]);

  // Overdue tasks
  const overdueTasks = useMemo(() => {
    return filteredTasks.filter((t) => !t.completed && t.dueDate && t.dueDate < todayStr);
  }, [filteredTasks, todayStr]);

  // Selected date tasks
  const selectedDateTasks = useMemo(() => {
    return tasksByDate.get(selectedDate) || [];
  }, [tasksByDate, selectedDate]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDate !== dateStr) {
      setDragOverDate(dateStr);
    }
  };

  const handleDragLeave = (_e: React.DragEvent, dateStr: string) => {
    if (dragOverDate === dateStr) {
      setDragOverDate(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      updateTask(taskId, { dueDate: targetDateStr });
    }
    setDragOverDate(null);
  };

  // Schedule unscheduled task to selected date
  const handleAssignToDate = (taskId: string, targetDate: string) => {
    updateTask(taskId, { dueDate: targetDate });
  };

  // Inline task submission for selected date
  const handleInlineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineTaskTitle.trim()) return;

    addTask({
      title: inlineTaskTitle.trim(),
      dueDate: selectedDate,
      projectId: selectedProjectId || undefined,
      priority: 'p3',
    });

    setInlineTaskTitle('');
  };

  // Formatted date string for selected date header
  const formattedSelectedDate = useMemo(() => {
    try {
      const parts = selectedDate.split('-');
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return d.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  const isSelectedDateToday = selectedDate === todayStr;

  return (
    <div className="h-full flex flex-col bg-[#FBFBF9] select-none overflow-hidden">
      {/* Calendar Header Controls */}
      <div className="px-4 sm:px-6 py-2.5 sm:py-3.5 border-b border-stone-200/80 bg-stone-50/40 backdrop-blur-xs flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        {/* Left: Month / Year Title & Navigation */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <h2 className="font-serif text-lg sm:text-xl font-medium text-charcoal tracking-tight">
              {currentMonthName} {currentYear}
            </h2>
            {viewMode === 'week' && (
              <span className="text-xs text-stone-500 font-sans ml-1">
                (Week of {weekDays[0]?.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})
              </span>
            )}
          </div>

          <div className="flex items-center bg-white border border-stone-200/80 rounded-mac p-0.5 shadow-2xs">
            <button
              onClick={handlePrev}
              className="p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-600 hover:text-charcoal hover:bg-stone-100 rounded-[5px] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              title="Previous month"
              aria-label="Previous month"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={handleToday}
              className="px-2.5 py-1 text-xs font-medium min-h-[36px] flex items-center justify-center text-stone-700 hover:text-charcoal hover:bg-stone-100 rounded-[5px] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              title="Jump to today"
              aria-label="Jump to today"
            >
              Today
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-600 hover:text-charcoal hover:bg-stone-100 rounded-[5px] transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              title="Next month"
              aria-label="Next month"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* Right: View Mode Toggle, Mobile Tab Switcher, & Backlog Tray Button */}
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {/* Overdue alert indicator */}
          {overdueTasks.length > 0 && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] bg-crimson-light/50 border border-crimson/20 rounded-mac text-crimson text-xs cursor-pointer hover:bg-crimson-light transition-colors"
              onClick={() => {
                setSelectedDate(todayStr);
                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                  setMobileTab('agenda');
                }
              }}
              title={`${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`}
            >
              <AlertCircle size={13} />
              <span className="font-medium">{overdueTasks.length} overdue</span>
            </div>
          )}

          {/* Mobile Calendar vs Agenda switcher */}
          <div className="flex lg:hidden items-center bg-stone-200/50 p-0.5 rounded-mac border border-stone-200/70 text-xs">
            <button
              onClick={() => setMobileTab('calendar')}
              className={`px-3 py-1.5 min-h-[36px] rounded-[6px] font-medium transition-all cursor-pointer ${
                mobileTab === 'calendar'
                  ? 'bg-white text-charcoal shadow-2xs'
                  : 'text-stone-600 hover:text-charcoal'
              }`}
            >
              Calendar
            </button>
            <button
              onClick={() => setMobileTab('agenda')}
              className={`px-3 py-1.5 min-h-[36px] rounded-[6px] font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                mobileTab === 'agenda'
                  ? 'bg-white text-charcoal shadow-2xs'
                  : 'text-stone-600 hover:text-charcoal'
              }`}
            >
              <span>Agenda</span>
              {selectedDateTasks.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-crimson text-white text-[10px] flex items-center justify-center font-mono font-semibold">
                  {selectedDateTasks.length}
                </span>
              )}
            </button>
          </div>

          {/* Month vs Week switcher */}
          <div className="flex items-center bg-stone-200/50 p-0.5 rounded-mac border border-stone-200/70 text-xs">
            <button
              onClick={() => setViewMode('month')}
              className={`px-2.5 py-1 min-h-[36px] sm:min-h-[30px] rounded-[6px] font-medium transition-all cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-white text-charcoal shadow-2xs'
                  : 'text-stone-600 hover:text-charcoal'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-2.5 py-1 min-h-[36px] sm:min-h-[30px] rounded-[6px] font-medium transition-all cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-white text-charcoal shadow-2xs'
                  : 'text-stone-600 hover:text-charcoal'
              }`}
            >
              Week
            </button>
          </div>

          {/* Toggle Unscheduled / Backlog Tray */}
          <button
            onClick={() => setShowBacklog(!showBacklog)}
            className={`flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] sm:min-h-[32px] text-xs rounded-mac border transition-all cursor-pointer ${
              showBacklog
                ? 'bg-charcoal text-white border-charcoal shadow-2xs'
                : 'bg-white text-stone-700 border-stone-200/90 hover:border-stone-300 shadow-2xs'
            }`}
            title="Toggle Unscheduled Tasks Backlog"
            aria-label="Toggle unscheduled tasks backlog"
          >
            <Layers size={13} />
            <span>Backlog</span>
            {unscheduledTasks.length > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  showBacklog ? 'bg-stone-700 text-stone-200' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {unscheduledTasks.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content: Split between Calendar Matrix and Selected Day Agenda */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Calendar Matrix View */}
        <div
          className={`flex-1 flex-col min-w-0 overflow-y-auto ${
            mobileTab === 'calendar' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Weekday Labels (Mon - Sun) */}
          <div className="grid grid-cols-7 border-b border-stone-200/80 bg-stone-50/60 sticky top-0 z-10">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
              <div
                key={day}
                className={`py-1.5 sm:py-2 text-center text-[10px] sm:text-[11px] font-mono font-medium tracking-wider uppercase border-r border-stone-200/60 last:border-r-0 ${
                  idx >= 5 ? 'text-stone-500' : 'text-stone-600'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Month / Week Grid */}
          <div
            className={`grid grid-cols-7 flex-1 auto-rows-fr bg-stone-200/40 gap-px ${
              viewMode === 'week' ? 'min-h-[450px] sm:min-h-[500px]' : 'min-h-[500px] sm:min-h-[600px]'
            }`}
          >
            {(viewMode === 'month' ? monthDays : weekDays).map((dayInfo) => {
              const { date, dateStr, isCurrentMonth } = dayInfo;
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const isDragOver = dragOverDate === dateStr;
              const dayTasks = tasksByDate.get(dateStr) || [];

              return (
                <div
                  key={dateStr}
                  onClick={() => {
                    setSelectedDate(dateStr);
                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                      setMobileTab('agenda');
                    }
                  }}
                  onDragOver={(e) => handleDragOver(e, dateStr)}
                  onDragLeave={(e) => handleDragLeave(e, dateStr)}
                  onDrop={(e) => handleDrop(e, dateStr)}
                  className={`group relative min-h-[72px] sm:min-h-[96px] p-1 sm:p-1.5 flex flex-col transition-all cursor-pointer ${
                    isDragOver
                      ? 'bg-crimson-light/40 ring-2 ring-crimson/40 z-10'
                      : isSelected
                      ? 'bg-white ring-1.5 ring-charcoal/30 z-1'
                      : isCurrentMonth
                      ? 'bg-white hover:bg-stone-50/70'
                      : 'bg-stone-50/70 hover:bg-stone-100/50 text-stone-600'
                  }`}
                >
                  {/* Day Cell Header: Date Number + Quick Add '+' trigger */}
                  <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                    <span
                      className={`text-[11px] sm:text-xs font-mono transition-all flex items-center justify-center ${
                        isToday
                          ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-crimson text-white font-semibold shadow-2xs'
                          : isSelected
                          ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-stone-200 text-charcoal font-semibold'
                          : isCurrentMonth
                          ? 'text-stone-800 font-medium px-0.5 sm:px-1'
                          : 'text-stone-600 px-0.5 sm:px-1'
                      }`}
                    >
                      {date.getDate()}
                    </span>

                    {/* Quick Add Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDate(dateStr);
                        setQuickAddOpen(true, dateStr);
                      }}
                      className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 p-1 text-stone-400 hover:text-charcoal hover:bg-stone-200/70 rounded transition-all cursor-pointer focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-stone-400 focus-visible:outline-none"
                      title={`Add task on ${dateStr}`}
                      aria-label={`Add task on ${dateStr}`}
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {/* Task Pills within Date Cell */}
                  <div className="flex-1 space-y-1 overflow-y-auto max-h-[90px] sm:max-h-[110px] scrollbar-none">
                    {dayTasks.slice(0, 3).map((task) => (
                      <div
                        key={task.id}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDate(dateStr);
                          openTaskDetail(task.id);
                        }}
                        className={`group/pill flex items-center gap-1 sm:gap-1.5 px-1 sm:px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] leading-tight border transition-all cursor-pointer ${
                          task.completed
                            ? 'bg-stone-100/80 text-stone-600 border-stone-200/60 line-through opacity-70'
                            : 'bg-white hover:bg-stone-50 text-charcoal border-stone-200/90 hover:border-stone-300 shadow-2xs'
                        }`}
                        title={`${task.title} (${task.priority.toUpperCase()})`}
                      >
                        {/* Tactile Completion Circle */}
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTaskComplete(task.id);
                          }}
                          className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                            task.completed
                              ? 'bg-crimson border-crimson text-white'
                              : 'border-stone-300 hover:border-crimson hover:bg-crimson-light/50'
                          }`}
                          aria-label={`Mark task ${task.title} complete`}
                        >
                          {task.completed && <Check size={8} strokeWidth={3} />}
                        </button>

                        {/* Priority indicator dot */}
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDots[task.priority]}`}
                        />

                        {/* Optional Due Time */}
                        {task.dueTime && (
                          <span className="text-[9px] sm:text-[10px] text-stone-500 font-mono hidden sm:inline">
                            {task.dueTime}
                          </span>
                        )}

                        {/* Task Title */}
                        <span className="truncate flex-1">{task.title}</span>
                      </div>
                    ))}

                    {/* Overflow Badge */}
                    {dayTasks.length > 3 && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDate(dateStr);
                          if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                            setMobileTab('agenda');
                          }
                        }}
                        className="text-[9px] sm:text-[10px] font-mono text-stone-500 hover:text-charcoal px-1 py-0.5 rounded hover:bg-stone-200/50 transition-colors"
                      >
                        +{dayTasks.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Sidebar: Selected Day Agenda & Quick Add */}
        <div
          className={`w-full lg:w-80 md:lg:w-96 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-stone-200/80 bg-white flex-col overflow-hidden ${
            mobileTab === 'agenda' ? 'flex flex-1 lg:flex-initial' : 'hidden lg:flex'
          }`}
        >
          {/* Agenda Header */}
          <div className="p-4 border-b border-stone-200/80 bg-stone-50/50">
            {/* Mobile Back Button */}
            <button
              type="button"
              onClick={() => setMobileTab('calendar')}
              className="lg:hidden inline-flex items-center gap-1 text-xs text-stone-500 hover:text-charcoal mb-2 font-medium cursor-pointer"
            >
              <ChevronLeft size={14} /> Back to Calendar
            </button>

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold">
                {isSelectedDateToday ? 'Today’s Schedule' : 'Day Agenda'}
              </span>
              <span className="text-xs font-mono text-stone-500">
                {selectedDateTasks.length} task{selectedDateTasks.length === 1 ? '' : 's'}
              </span>
            </div>

            <h3 className="font-serif text-lg font-medium text-charcoal mt-1 tracking-tight">
              {formattedSelectedDate}
            </h3>

            {/* Inline Quick Add for this day */}
            <form onSubmit={handleInlineSubmit} className="mt-3">
              <div className="relative">
                <input
                  type="text"
                  value={inlineTaskTitle}
                  onChange={(e) => setInlineTaskTitle(e.target.value)}
                  placeholder={`Add task for ${selectedDate}...`}
                  className="w-full bg-white border border-stone-200/90 rounded-mac px-3 py-2 text-base sm:text-xs text-charcoal placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-400 transition-all shadow-2xs pr-8"
                />
                <button
                  type="submit"
                  disabled={!inlineTaskTitle.trim()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-stone-400 hover:text-crimson disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="Add task"
                  aria-label="Add task"
                >
                  <Plus size={14} />
                </button>
              </div>
            </form>
          </div>

          {/* Agenda Task List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {selectedDateTasks.length === 0 ? (
              <div className="py-12 text-center text-stone-400">
                <CalendarIcon size={28} className="mx-auto mb-2 text-stone-300 stroke-[1.5]" />
                <p className="font-serif text-sm text-stone-600">No tasks scheduled</p>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Type above or drag tasks from the backlog
                </p>
              </div>
            ) : (
              selectedDateTasks.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))
            )}
          </div>
        </div>

        {/* Collapsible Backlog / Unscheduled Drawer */}
        {showBacklog && (
          <>
            {/* Mobile backdrop */}
            <div
              className="fixed inset-0 bg-black/20 z-40 lg:hidden backdrop-blur-2xs"
              onClick={() => setShowBacklog(false)}
            />
            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xs sm:w-80 lg:relative lg:inset-auto lg:z-auto flex-shrink-0 border-l border-stone-200/80 bg-stone-50/95 lg:bg-stone-50/70 flex flex-col overflow-hidden shadow-2xl lg:shadow-none animate-in slide-in-from-right-4 duration-200 safe-area-top safe-area-bottom">
              {/* Backlog Header */}
              <div className="p-4 border-b border-stone-200/80 flex items-center justify-between bg-stone-100/50">
                <div className="flex items-center gap-2">
                  <Inbox size={15} className="text-stone-500" />
                  <h3 className="font-serif text-sm font-semibold text-charcoal">
                    Unscheduled Backlog
                  </h3>
                  <span className="text-[11px] font-mono text-stone-500">
                    ({unscheduledTasks.length})
                  </span>
                </div>
                <button
                  onClick={() => setShowBacklog(false)}
                  className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-400 hover:text-charcoal hover:bg-stone-200/60 rounded transition-colors cursor-pointer"
                  aria-label="Close backlog"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Backlog Instruction */}
              <div className="px-4 py-2 bg-stone-200/40 border-b border-stone-200/60 text-[11px] text-stone-500">
                Drag tasks into any calendar day, or click schedule.
              </div>

              {/* Backlog Items */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {unscheduledTasks.length === 0 ? (
                  <div className="py-12 text-center text-stone-400">
                    <Check size={24} className="mx-auto mb-2 text-stone-300" />
                    <p className="font-serif text-sm text-stone-600">Backlog is empty</p>
                    <p className="text-[11px] text-stone-400 mt-0.5">
                      All tasks have scheduled dates!
                    </p>
                  </div>
                ) : (
                  unscheduledTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      className="p-2.5 bg-white border border-stone-200/80 rounded-card shadow-2xs hover:border-stone-300 transition-all flex flex-col gap-1.5 cursor-grab active:cursor-grabbing group/backlog"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDots[task.priority]}`}
                          />
                          <span className="text-xs font-medium text-charcoal truncate">
                            {task.title}
                          </span>
                        </div>

                        {/* Quick schedule to selected date */}
                        <button
                          onClick={() => handleAssignToDate(task.id, selectedDate)}
                          className="sm:opacity-0 sm:group-hover/backlog:opacity-100 opacity-100 p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-stone-500 hover:text-crimson hover:bg-stone-100 rounded transition-all cursor-pointer flex-shrink-0"
                          title={`Schedule to ${selectedDate}`}
                          aria-label={`Schedule to ${selectedDate}`}
                        >
                          <CalendarPlus size={13} />
                        </button>
                      </div>

                      {task.notes && (
                        <p className="text-[11px] text-stone-500 line-clamp-1">
                          {task.notes}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
