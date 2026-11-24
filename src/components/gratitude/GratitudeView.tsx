import React, { useState, useEffect, useMemo } from 'react';
import { useEkirumStore, calculateHabitStreak } from '../../store/useEkirumStore';
import { useShallow } from 'zustand/react/shallow';
import {
  Heart,
  Lock,
  Folder,
  Trash2,
  ShieldCheck,
  Check,
  Flame,
  Edit3,
  Search,
  X,
} from 'lucide-react';
import {
  DecryptedGratitudePayload,
  decryptGratitudeEntry,
} from '../../lib/defusionCrypto';
import { MAX_LENGTHS } from '../../lib/validation';
import { formatLocalDate, formatLastCompletedDisplay } from '../../lib/dateParser';
import { Project } from '../../types';
import {
  useVaultSession,
  VaultControls,
  VaultUnlockedBanner,
  VaultPassphraseModal,
} from '../common/VaultPassphraseModal';

interface GratitudeFormProps {
  initialItems?: string[];
  initialNote?: string;
  initialProjectId?: string;
  activeProjects: Project[];
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (data: { items: string[]; note: string; projectId: string }) => Promise<void>;
  onCancel?: () => void;
}

const ITEM_PLACEHOLDERS = [
  '1. Something good that happened or felt grounding today…',
  '2. A person, quiet moment, or small detail you noticed…',
  '3. One more thing you appreciate right now (optional)…',
];

const GratitudeForm: React.FC<GratitudeFormProps> = ({
  initialItems,
  initialNote = '',
  initialProjectId = '',
  activeProjects,
  submitLabel,
  isSubmitting,
  onSubmit,
  onCancel,
}) => {
  const [items, setItems] = useState<[string, string, string]>([
    initialItems?.[0] || '',
    initialItems?.[1] || '',
    initialItems?.[2] || '',
  ]);
  const [note, setNote] = useState(initialNote);
  const [projectId, setProjectId] = useState(initialProjectId);

  const hasAtLeastOne = items.some((i) => i.trim().length > 0);

  const handleItemChange = (index: 0 | 1 | 2, value: string) => {
    const clipped = value.slice(0, MAX_LENGTHS.GRATITUDE_ITEM);
    setItems((prev) => {
      const next: [string, string, string] = [...prev] as [string, string, string];
      next[index] = clipped;
      return next;
    });
  };

  const handleFormSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!hasAtLeastOne || isSubmitting) return;
    await onSubmit({
      items: items.map((i) => i.trim()).filter(Boolean),
      note: note.trim(),
      projectId,
    });
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-3.5">
      <div className="space-y-2">
        {([0, 1, 2] as const).map((idx) => (
          <div key={idx} className="flex items-center gap-2.5">
            <span className="w-5 h-5 rounded-full bg-stone-100 border border-stone-200/80 text-[11px] font-mono text-stone-500 flex items-center justify-center flex-shrink-0">
              {idx + 1}
            </span>
            <input
              type="text"
              value={items[idx]}
              disabled={isSubmitting}
              maxLength={MAX_LENGTHS.GRATITUDE_ITEM}
              onChange={(e) => handleItemChange(idx, e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleFormSubmit();
                }
              }}
              placeholder={ITEM_PLACEHOLDERS[idx]}
              aria-label={`Gratitude item ${idx + 1}`}
              className="flex-1 min-w-0 text-base sm:text-sm bg-stone-50/50 hover:bg-white focus:bg-white border border-stone-200/90 rounded-mac px-3 py-2 text-charcoal placeholder:text-stone-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 transition-colors font-sans"
            />
          </div>
        ))}
      </div>

      <div>
        <textarea
          value={note}
          disabled={isSubmitting}
          maxLength={MAX_LENGTHS.GRATITUDE_NOTE}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_LENGTHS.GRATITUDE_NOTE))}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleFormSubmit();
            }
          }}
          rows={2}
          placeholder="Optional reflection or context for today… (Cmd/Ctrl + Enter to seal)"
          aria-label="Optional reflection note"
          className="w-full resize-y min-h-[60px] text-base sm:text-sm bg-stone-50/50 hover:bg-white focus:bg-white border border-stone-200/90 rounded-mac px-3 py-2 text-charcoal placeholder:text-stone-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 transition-colors font-sans leading-relaxed"
        />
      </div>

      <div className="pt-2 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative inline-flex items-center">
          <Folder size={13} className="absolute left-2.5 text-stone-500 pointer-events-none" />
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Connect gratitude entry to project"
            className="pl-8 pr-6 py-1.5 min-h-[36px] text-xs bg-stone-50 border border-stone-200 rounded-mac text-stone-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 cursor-pointer"
          >
            <option value="">No project link</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="px-3 py-2 min-h-[36px] text-xs font-medium text-stone-600 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-colors cursor-pointer font-sans"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!hasAtLeastOne || isSubmitting}
            className="px-4 py-2 min-h-[38px] rounded-mac text-xs font-sans font-semibold bg-crimson hover:bg-crimson-hover text-white disabled:opacity-45 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            <ShieldCheck size={14} />
            <span>{submitLabel}</span>
          </button>
        </div>
      </div>
    </form>
  );
};

export const GratitudeView: React.FC = () => {
  const {
    gratitudeEntries,
    defusionVault,
    projects,
    saveGratitudeEntry,
    deleteGratitudeEntry,
    saveDefusionVaultConfig,
  } = useEkirumStore(
    useShallow((s) => ({
      gratitudeEntries: s.gratitudeEntries,
      defusionVault: s.defusionVault,
      projects: s.projects,
      saveGratitudeEntry: s.saveGratitudeEntry,
      deleteGratitudeEntry: s.deleteGratitudeEntry,
      saveDefusionVaultConfig: s.saveDefusionVaultConfig,
    }))
  );

  const [decryptedMap, setDecryptedMap] = useState<Record<string, DecryptedGratitudePayload>>({});
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSavedFeedback, setJustSavedFeedback] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Archive filters (available when unlocked)
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  const todayStr = formatLocalDate();
  const activeProjects = useMemo(() => projects.filter((p) => !p.isDeleted), [projects]);
  const projectMap = useMemo(() => new Map(activeProjects.map((p) => [p.id, p])), [activeProjects]);

  const {
    unlockedPrivateKey,
    isUnlocked,
    lockVault,
    openUnlockModal,
    openChangePassphraseModal,
    modalProps,
  } = useVaultSession(defusionVault, saveDefusionVaultConfig, () => {
    setDecryptedMap({});
    setEditingId(null);
    setSearchQuery('');
  });

  useEffect(() => {
    return () => setDecryptedMap({});
  }, []);

  // Decrypt gratitude entries whenever unlocked or entries change while unlocked
  useEffect(() => {
    if (!unlockedPrivateKey) return;
    let cancelled = false;

    const decryptAll = async () => {
      const active = gratitudeEntries.filter((e) => !e.isDeleted && e.ciphertext);
      const toDecrypt = active.filter((e) => !decryptedMap[e.id]);
      if (toDecrypt.length === 0) return;

      setIsDecrypting(true);
      const nextEntries: Record<string, DecryptedGratitudePayload> = {};
      for (const entry of toDecrypt) {
        try {
          const payload = await decryptGratitudeEntry(unlockedPrivateKey, entry);
          if (payload) {
            nextEntries[entry.id] = payload;
          }
        } catch {
          // Unable to decrypt with current key
        }
      }
      if (!cancelled && Object.keys(nextEntries).length > 0) {
        setDecryptedMap((prev) => ({ ...prev, ...nextEntries }));
      }
      if (!cancelled) {
        setIsDecrypting(false);
      }
    };

    void decryptAll();
    return () => {
      cancelled = true;
    };
  }, [unlockedPrivateKey, gratitudeEntries, decryptedMap]);

  const activeEntries = useMemo(
    () =>
      gratitudeEntries
        .filter((e) => !e.isDeleted)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [gratitudeEntries]
  );

  const todayEntry = useMemo(
    () => activeEntries.find((e) => e.date === todayStr) || null,
    [activeEntries, todayStr]
  );

  const pastEntries = useMemo(
    () => activeEntries.filter((e) => e.date !== todayStr),
    [activeEntries, todayStr]
  );

  const filteredPastEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return pastEntries.filter((entry) => {
      if (projectFilter !== 'all' && entry.projectId !== projectFilter) return false;
      if (q && isUnlocked) {
        const dec = decryptedMap[entry.id];
        if (!dec) return false;
        const inItems = dec.items.some((it) => it.toLowerCase().includes(q));
        const inNote = dec.note ? dec.note.toLowerCase().includes(q) : false;
        return inItems || inNote;
      }
      return true;
    });
  }, [pastEntries, projectFilter, searchQuery, isUnlocked, decryptedMap]);

  const streakStats = useMemo(() => {
    const dates = activeEntries.map((e) => e.date);
    const { current, longest } = calculateHabitStreak(dates);
    return {
      current,
      longest,
      totalDays: new Set(dates).size,
    };
  }, [activeEntries]);

  const formatEntryDate = (dateStr: string) => {
    const relative = formatLastCompletedDisplay(dateStr);
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const full = dt.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (relative === 'Today' || relative === 'Yesterday') {
      return `${relative} · ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return full;
  };

  const handleSaveToday = async (data: { items: string[]; note: string; projectId: string }) => {
    setIsSaving(true);
    try {
      const res = await saveGratitudeEntry({
        date: todayStr,
        items: data.items,
        note: data.note,
        projectId: data.projectId || undefined,
      });
      if (res.entry && isUnlocked) {
        setDecryptedMap((prev) => ({
          ...prev,
          [res.entry!.id]: {
            items: data.items,
            ...(data.note ? { note: data.note } : {}),
          },
        }));
      }
      setJustSavedFeedback('Sealed');
      setTimeout(() => setJustSavedFeedback(null), 2600);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async (
    entryDate: string,
    entryId: string,
    data: { items: string[]; note: string; projectId: string }
  ) => {
    setIsSaving(true);
    try {
      const res = await saveGratitudeEntry({
        id: entryId,
        date: entryDate,
        items: data.items,
        note: data.note,
        projectId: data.projectId || undefined,
      });
      if (res.entry) {
        setDecryptedMap((prev) => ({
          ...prev,
          [entryId]: {
            items: data.items,
            ...(data.note ? { note: data.note } : {}),
          },
        }));
      }
      setEditingId(null);
    } finally {
      setIsSaving(false);
    }
  };

  const renderEntryCard = (entry: typeof activeEntries[number], isTodayCard = false) => {
    const project = entry.projectId ? projectMap.get(entry.projectId) : undefined;
    const decrypted = decryptedMap[entry.id];
    const isEditing = editingId === entry.id && isUnlocked;

    return (
      <article
        key={entry.id}
        className="bg-white border border-stone-200/90 rounded-xl shadow-xs p-4 sm:p-5 space-y-3 transition-all"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-serif text-sm font-semibold text-charcoal">
              {formatEntryDate(entry.date)}
            </span>
            {project && (
              <span className="inline-flex items-center gap-1 text-[11px] font-sans text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: project.color || '#8B1528' }}
                />
                <span>{project.name}</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {isUnlocked && decrypted && !isEditing && (
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmId(null);
                  setEditingId(entry.id);
                }}
                className="p-2 min-w-[34px] min-h-[34px] flex items-center justify-center text-stone-500 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-colors cursor-pointer"
                title="Edit entry"
                aria-label={`Edit gratitude entry for ${entry.date}`}
              >
                <Edit3 size={14} />
              </button>
            )}

            {!isEditing && (
              deleteConfirmId === entry.id ? (
                <div className="flex items-center gap-1.5 bg-crimson/10 border border-crimson/25 px-2.5 py-1 rounded-mac text-xs font-sans text-crimson animate-fade-in">
                  <button
                    type="button"
                    onClick={() => {
                      deleteGratitudeEntry(entry.id);
                      setDeleteConfirmId(null);
                    }}
                    className="font-semibold hover:underline cursor-pointer"
                  >
                    Confirm delete
                  </button>
                  <span className="text-crimson/40">·</span>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(null)}
                    className="text-stone-600 hover:text-charcoal cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(entry.id)}
                  className="p-2 min-w-[34px] min-h-[34px] flex items-center justify-center text-stone-400 hover:text-crimson hover:bg-stone-100 rounded-mac transition-colors cursor-pointer"
                  title="Delete entry"
                  aria-label={`Delete gratitude entry for ${entry.date}`}
                >
                  <Trash2 size={14} />
                </button>
              )
            )}
          </div>
        </div>

        {isUnlocked ? (
          isEditing && decrypted ? (
            <GratitudeForm
              initialItems={decrypted.items}
              initialNote={decrypted.note || ''}
              initialProjectId={entry.projectId || ''}
              activeProjects={activeProjects}
              submitLabel="Save Changes"
              isSubmitting={isSaving}
              onSubmit={(data) => handleSaveEdit(entry.date, entry.id, data)}
              onCancel={() => setEditingId(null)}
            />
          ) : decrypted ? (
            <div className="space-y-3">
              <ol className="space-y-2">
                {decrypted.items.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-charcoal font-sans leading-relaxed">
                    <span className="w-5 h-5 mt-0.5 rounded-full bg-amber-50 border border-amber-200/70 text-[11px] font-mono text-amber-900 flex items-center justify-center flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span className="flex-1 min-w-0 break-words">{item}</span>
                  </li>
                ))}
              </ol>
              {decrypted.note && (
                <p className="text-xs text-stone-600 font-sans leading-relaxed pl-3 border-l-2 border-stone-200 whitespace-pre-wrap">
                  {decrypted.note}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-stone-500 italic font-sans">
              {isDecrypting ? 'Decrypting sealed gratitude…' : 'Unable to decrypt entry with current key.'}
            </p>
          )
        ) : (
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-2 text-stone-500 select-none">
              <Lock size={13} className="text-stone-400" />
              <span className="font-serif italic text-xs text-stone-600">
                {isTodayCard ? "Today's gratitude is sealed" : 'Sealed gratitude entry'}
              </span>
            </div>
            <button
              type="button"
              onClick={openUnlockModal}
              className="text-xs font-sans text-stone-700 hover:text-charcoal underline cursor-pointer flex-shrink-0"
            >
              {isTodayCard ? 'Unlock to view or add more' : 'Unlock to read'}
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="flex-1 h-full overflow-y-auto px-4 sm:px-8 py-6 pb-28 md:pb-12 bg-[#FBFBF9]">
      <div className="max-w-3xl mx-auto space-y-7">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-crimson" />
              <h2 className="font-serif text-2xl font-medium text-charcoal">
                Gratitude journal
              </h2>
            </div>
            <p className="text-xs text-stone-500 font-sans mt-0.5 max-w-xl leading-relaxed">
              Write up to three things you appreciate each day. Encrypted with your shared vault passphrase.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
            {/* Quiet streak & total days pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-mac border text-xs font-mono ${
                streakStats.current > 0
                  ? 'bg-amber-50 border-amber-200/80 text-amber-800'
                  : 'bg-stone-100/80 border-stone-200/80 text-stone-600'
              }`}
              title={`Current streak: ${streakStats.current}d · Best: ${streakStats.longest}d · Total days: ${streakStats.totalDays}`}
            >
              <Flame
                size={12}
                className={streakStats.current > 0 ? 'fill-amber-500 text-amber-500' : 'text-stone-400'}
              />
              <span>{streakStats.current}d</span>
              <span className="text-stone-300">·</span>
              <span>{streakStats.totalDays} {streakStats.totalDays === 1 ? 'day' : 'days'}</span>
            </div>

            <VaultControls
              isUnlocked={isUnlocked}
              onOpenUnlock={openUnlockModal}
              onOpenChangePassphrase={openChangePassphraseModal}
              onLock={lockVault}
            />
          </div>
        </header>

        {/* Auto-lock Notice Banner when Unlocked */}
        {isUnlocked && <VaultUnlockedBanner onLock={lockVault} />}

        {/* Today's Entry Composer OR Sealed/Decrypted Card */}
        <section aria-label="Today's gratitude">
          {todayEntry ? (
            <div className="space-y-2">
              {justSavedFeedback && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-xs font-mono text-emerald-800">
                  <Check size={12} />
                  <span>{justSavedFeedback}</span>
                </div>
              )}
              {renderEntryCard(todayEntry, true)}
            </div>
          ) : (
            <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs p-4 sm:p-5 space-y-4">
              <div className="pb-2.5 border-b border-stone-100">
                <span className="text-[11px] font-mono uppercase tracking-wider text-stone-500 font-semibold block">
                  Today’s Notice
                </span>
                <h3 className="font-serif text-base font-medium text-charcoal mt-0.5">
                  {formatEntryDate(todayStr)}
                </h3>
              </div>

              <GratitudeForm
                activeProjects={activeProjects}
                submitLabel="Seal Today’s Entry"
                isSubmitting={isSaving}
                onSubmit={handleSaveToday}
              />
            </div>
          )}
        </section>

        {/* Previous Days Archive */}
        <section aria-label="Previous gratitude entries" className="space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-lg font-medium text-charcoal">
                Previous Entries
              </h3>
              <span className="text-xs font-mono text-stone-500">
                {pastEntries.length}
              </span>
            </div>

            {pastEntries.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {isUnlocked && (
                  <div className="relative flex items-center">
                    <Search size={13} className="absolute left-2.5 text-stone-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search gratitude…"
                      aria-label="Search past gratitude entries"
                      className="pl-8 pr-7 py-1.5 text-xs bg-white border border-stone-200/90 rounded-mac text-charcoal placeholder:text-stone-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 w-44 sm:w-52"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 text-stone-400 hover:text-charcoal cursor-pointer"
                        aria-label="Clear search"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                )}

                {activeProjects.length > 0 && (
                  <select
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    aria-label="Filter gratitude entries by project"
                    className="px-2.5 py-1.5 text-xs bg-white border border-stone-200/90 rounded-mac text-stone-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 cursor-pointer"
                  >
                    <option value="all">All Projects</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          {filteredPastEntries.length === 0 ? (
            <div className="bg-white/60 border border-stone-200/70 rounded-xl p-8 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-stone-100 border border-stone-200/70 flex items-center justify-center mx-auto text-stone-400">
                <Heart size={18} strokeWidth={1.5} />
              </div>
              <p className="font-serif text-base text-charcoal">
                {pastEntries.length === 0 ? 'No past entries yet' : 'No matching entries'}
              </p>
              <p className="text-xs text-stone-500 font-sans max-w-sm mx-auto leading-relaxed">
                {pastEntries.length === 0
                  ? 'Your previous daily gratitude entries will collect here over time.'
                  : 'Try clearing your search or choosing another project filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPastEntries.map((entry) => renderEntryCard(entry, false))}
            </div>
          )}
        </section>
      </div>

      {/* Shared Passphrase Setup / Unlock / Change Modal */}
      <VaultPassphraseModal {...modalProps} />
    </div>
  );
};
