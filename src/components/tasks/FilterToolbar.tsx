import React, { useState, useMemo } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { Priority } from '../../types';
import { Filter, X, LayoutList, Clock } from 'lucide-react';

export const FilterToolbar: React.FC = () => {
  const {
    tasks,
    projects,
    selectedPriorityFilter,
    setPriorityFilter,
    selectedLabelFilter,
    setLabelFilter,
    selectedProjectFilter,
    setProjectFilter,
    displayMode,
    setDisplayMode,
    currentView,
  } = useEkirumStore();

  const [isOpen, setIsOpen] = useState(false);

  // Extract all distinct labels from active tasks
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (!t.isDeleted && t.labels) {
        for (const l of t.labels) {
          set.add(l);
        }
      }
    }
    return Array.from(set);
  }, [tasks]);

  const hasActiveFilter =
    selectedPriorityFilter !== 'all' ||
    selectedLabelFilter !== 'all' ||
    selectedProjectFilter !== 'all';

  const clearFilters = () => {
    setPriorityFilter('all');
    setLabelFilter('all');
    setProjectFilter('all');
  };

  const priorityDescriptions: Record<Priority, string> = {
    p1: 'Filter by P1 (Urgent / High Focus)',
    p2: 'Filter by P2 (High Focus)',
    p3: 'Filter by P3 (Low Focus)',
    p4: 'Filter by P4 (None / Unassigned)',
  };

  const renderViewModeSegment = () => {
    if (currentView === 'completed') return null;
    return (
      <div className="flex items-center bg-stone-200/50 p-0.5 rounded-mac border border-stone-300/40">
        <button
          onClick={() => setDisplayMode('list')}
          className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] sm:min-h-[30px] rounded-[5px] text-xs transition-all cursor-pointer active:scale-95 ${
            displayMode === 'list'
              ? 'bg-white text-charcoal shadow-2xs font-medium'
              : 'text-stone-500 hover:text-charcoal'
          }`}
          title="List view"
          aria-label="Switch to list view"
        >
          <LayoutList size={13} />
          <span>List</span>
        </button>
        <button
          onClick={() => setDisplayMode('timeline')}
          className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[34px] sm:min-h-[30px] rounded-[5px] text-xs transition-all cursor-pointer active:scale-95 ${
            displayMode === 'timeline'
              ? 'bg-white text-charcoal shadow-2xs font-medium'
              : 'text-stone-500 hover:text-charcoal'
          }`}
          title="Timeline view"
          aria-label="Switch to timeline view"
        >
          <Clock size={13} />
          <span>Timeline</span>
        </button>
      </div>
    );
  };

  return (
    <div className="mb-4 text-xs">
      {!isOpen && !hasActiveFilter ? (
        <div className="flex items-center justify-between">
          {renderViewModeSegment()}
          <button
            onClick={() => setIsOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[34px] sm:min-h-[30px] text-xs font-mono text-stone-500 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-colors cursor-pointer active:scale-95 ml-auto"
            title="Filter by priority or label"
          >
            <Filter size={12} />
            <span>Filter</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {renderViewModeSegment() && (
            <div className="flex items-center justify-between">
              {renderViewModeSegment()}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2.5 p-2 rounded-mac bg-stone-100/60 border border-stone-200/60 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] text-stone-500 font-mono uppercase tracking-wider font-semibold">
              <Filter size={11} />
            </span>

            {/* Priority Filter */}
            <div className="flex items-center bg-white p-0.5 rounded-mac border border-stone-200/80 shadow-2xs">
              <button
                onClick={() => setPriorityFilter('all')}
                className={`px-2.5 py-1 min-h-[34px] sm:min-h-[28px] rounded-[5px] text-xs transition-all cursor-pointer ${
                  selectedPriorityFilter === 'all'
                    ? 'bg-stone-800 text-white font-medium'
                    : 'text-stone-600 hover:text-charcoal'
                }`}
                title="Show all priorities"
              >
                All
              </button>
              {(['p1', 'p2', 'p3', 'p4'] as Priority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-2 py-1 min-h-[34px] sm:min-h-[28px] rounded-[5px] text-xs font-mono transition-all cursor-pointer ${
                    selectedPriorityFilter === p
                      ? 'bg-stone-800 text-white font-medium'
                      : 'text-stone-600 hover:text-charcoal'
                  }`}
                  title={priorityDescriptions[p]}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Project Filter */}
            {currentView !== 'project' && (
              <select
                value={selectedProjectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="text-base sm:text-[11px] min-h-[34px] sm:min-h-[28px] bg-white border border-stone-200/80 rounded-mac px-2 py-0.5 text-stone-700 focus:outline-none focus:border-stone-400 cursor-pointer shadow-2xs font-sans"
                aria-label="Filter by project"
              >
                <option value="all">All Projects</option>
                <option value="inbox">Inbox</option>
                {projects
                  .filter((p) => !p.isDeleted)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            )}

            {/* Label Filter */}
            {allLabels.length > 0 && (
              <select
                value={selectedLabelFilter}
                onChange={(e) => setLabelFilter(e.target.value)}
                className="text-base sm:text-[11px] min-h-[34px] sm:min-h-[28px] bg-white border border-stone-200/80 rounded-mac px-2 py-0.5 text-stone-700 focus:outline-none focus:border-stone-400 cursor-pointer shadow-2xs"
                aria-label="Filter by label"
              >
                <option value="all">All Labels</option>
                {allLabels.map((lbl) => (
                  <option key={lbl} value={lbl}>
                    #{lbl}
                  </option>
                ))}
              </select>
            )}

            {hasActiveFilter && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 min-h-[34px] sm:min-h-[28px] text-[11px] text-stone-500 hover:text-crimson transition-colors rounded px-2 py-1 hover:bg-stone-200/50 cursor-pointer"
                aria-label="Reset all filters"
              >
                <X size={11} />
                <span>Reset</span>
              </button>
            )}
          </div>

          {!hasActiveFilter && (
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 min-w-[32px] min-h-[32px] flex items-center justify-center text-stone-400 hover:text-stone-600 rounded transition-colors cursor-pointer"
              title="Close filter bar"
            >
              <X size={12} />
            </button>
          )}
          </div>
        </div>
      )}
    </div>
  );
};
