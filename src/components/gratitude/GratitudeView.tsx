import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Flame,
  Folder,
  Heart,
  Lock,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { calculateHabitStreak, useEkirumStore } from '../../store/useEkirumStore';
import {
  DecryptedGratitudePayload,
  GRATITUDE_DAILY_TARGET,
  decryptGratitudeEntry,
} from '../../lib/defusionCrypto';
import { formatLastCompletedDisplay, formatLocalDate } from '../../lib/dateParser';
import { MAX_LENGTHS } from '../../lib/validation';
import { GratitudeEntry, Project } from '../../types';
import {
  VaultControls,
  VaultPassphraseModal,
  VaultUnlockedBanner,
  useVaultSession,
} from '../common/VaultPassphraseModal';

interface InlineEditFormProps {
  initialItems: string[];
  initialNote?: string;
  initialProjectId?: string;
  activeProjects: Project[];
  isSubmitting: boolean;
  onSubmit: (data: { items: string[]; note?: string; projectId: string }) => Promise<void>;
  onCancel: () => void;
}

const InlineEditForm: React.FC<InlineEditFormProps> = ({
  initialItems,
  initialNote = '',
  initialProjectId = '',
  activeProjects,
  isSubmitting,
  onSubmit,
  onCancel,
}) => {
  const isLegacyMulti = initialItems.length > 1 || Boolean(initialNote.trim());
  const [items, setItems] = useState<string[]>(
    initialItems.length > 0 ? initialItems : ['']
  );
  const [note, setNote] = useState(initialNote);
  const [projectId, setProjectId] = useState(initialProjectId);

  const hasValidItem = items.some((it) => it.trim().length > 0);

  const handleItemChange = (index: number, value: string) => {
    const clipped = value.slice(0, MAX_LENGTHS.GRATITUDE_ITEM);
    setItems((prev) => prev.map((it, i) => (i === index ? clipped : it)));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!hasValidItem || isSubmitting) return;
    await onSubmit({
      items: items.map((it) => it.trim()).filter(Boolean),
      note: note.trim() || undefined,
      projectId,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 bg-stone-50/70 border border-stone-200/80 rounded-lg p-3">
      <div className="space-y-2">
        {items.map((val, idx) => (
          <input
            key={idx}
            type="text"
            value={val}
            disabled={isSubmitting}
            maxLength={MAX_LENGTHS.GRATITUDE_ITEM}
            onChange={(e) => handleItemChange(idx, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
              } else if (!isLegacyMulti && e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Something you appreciate…"
            aria-label={isLegacyMulti ? `Gratitude item ${idx + 1}` : 'Edit gratitude item'}
            autoFocus={idx === 0}
            className="w-full text-base sm:text-sm bg-white border border-stone-200/90 rounded-mac px-3 py-1.5 text-charcoal placeholder:text-stone-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 transition-colors font-sans"
          />
        ))}
      </div>

      {isLegacyMulti && (
        <textarea
          value={note}
          disabled={isSubmitting}
          maxLength={MAX_LENGTHS.GRATITUDE_NOTE}
          onChange={(e) => setNote(e.target.value.slice(0, MAX_LENGTHS.GRATITUDE_NOTE))}
          rows={2}
          placeholder="Optional reflection note…"
          aria-label="Edit reflection note"
          className="w-full resize-y min-h-[56px] text-base sm:text-sm bg-white border border-stone-200/90 rounded-mac px-3 py-1.5 text-charcoal placeholder:text-stone-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 transition-colors font-sans leading-relaxed"
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="relative inline-flex items-center">
          <Folder size={13} className="absolute left-2.5 text-stone-500 pointer-events-none" />
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            aria-label="Connect gratitude item to project"
            className="pl-8 pr-6 py-1 min-h-[32px] text-xs bg-white border border-stone-200 rounded-mac text-stone-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 cursor-pointer"
          >
            <option value="">No project link</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="px-2.5 py-1.5 min-h-[32px] text-xs font-medium text-stone-600 hover:text-charcoal hover:bg-stone-200/60 rounded-mac transition-colors cursor-pointer font-sans"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!hasValidItem || isSubmitting}
            className="px-3 py-1.5 min-h-[32px] rounded-mac text-xs font-sans font-semibold bg-crimson hover:bg-crimson-hover text-white disabled:opacity-45 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </form>
  );
};

interface DayGroup {
  date: string;
  entries: GratitudeEntry[];
  totalItems: number;
}

const getEntryItemCount = (
  entry: GratitudeEntry,
  decrypted?: DecryptedGratitudePayload
): number => {
  if (typeof entry.itemCount === 'number' && entry.itemCount > 0) {
    return entry.itemCount;
  }
  if (decrypted?.items?.length) {
    return decrypted.items.length;
  }
  return 1;
};

const groupEntriesByDate = (
  entries: GratitudeEntry[],
  decryptedMap: Record<string, DecryptedGratitudePayload>
): DayGroup[] => {
  const byDate = new Map<string, GratitudeEntry[]>();
  for (const entry of entries) {
    const existing = byDate.get(entry.date);
    if (existing) {
      existing.push(entry);
    } else {
      byDate.set(entry.date, [entry]);
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => {
      const ordered = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const totalItems = ordered.reduce(
        (sum, entry) => sum + getEntryItemCount(entry, decryptedMap[entry.id]),
        0
      );
      return { date, entries: ordered, totalItems };
    });
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

  const [draftText, setDraftText] = useState('');
  const [draftProjectId, setDraftProjectId] = useState('');
  const [decryptedMap, setDecryptedMap] = useState<Record<string, DecryptedGratitudePayload>>({});
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [justSavedFeedback, setJustSavedFeedback] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Archive filters
  const [searchQuery, setSearchQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const todayStr = formatLocalDate();
  const activeProjects = useMemo(() => projects.filter((p) => !p.isDeleted), [projects]);
  const projectMap = useMemo(() => new Map(activeProjects.map((p) => [p.id, p])), [activeProjects]);

  const {
    unlockedPrivateKeys,
    isUnlocked,
    lockVault,
    openUnlockModal,
    openChangePassphraseModal,
    modalProps,
  } = useVaultSession(defusionVault, saveDefusionVaultConfig, () => {
    setDecryptedMap({});
    setEditingId(null);
    setDeleteConfirmId(null);
    setSearchQuery('');
  });

  useEffect(() => {
    return () => {
      setDecryptedMap({});
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  // Decrypt gratitude entries whenever unlocked or entries change while unlocked
  useEffect(() => {
    if (unlockedPrivateKeys.length === 0) return;
    let cancelled = false;

    const decryptAll = async () => {
      const active = gratitudeEntries.filter((e) => !e.isDeleted && e.ciphertext);
      const toDecrypt = active.filter((e) => !decryptedMap[e.id]);
      if (toDecrypt.length === 0) return;

      setIsDecrypting(true);
      const nextEntries: Record<string, DecryptedGratitudePayload> = {};
      for (const entry of toDecrypt) {
        try {
          const payload = await decryptGratitudeEntry(unlockedPrivateKeys, entry);
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
  }, [unlockedPrivateKeys, gratitudeEntries, decryptedMap]);

  const activeEntries = useMemo(
    () => gratitudeEntries.filter((e) => !e.isDeleted),
    [gratitudeEntries]
  );

  const todayEntries = useMemo(
    () =>
      activeEntries
        .filter((e) => e.date === todayStr)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [activeEntries, todayStr]
  );

  const todayItemCount = useMemo(
    () =>
      todayEntries.reduce(
        (sum, entry) => sum + getEntryItemCount(entry, decryptedMap[entry.id]),
        0
      ),
    [todayEntries, decryptedMap]
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

  const pastDayGroups = useMemo(
    () => groupEntriesByDate(filteredPastEntries, decryptedMap),
    [filteredPastEntries, decryptedMap]
  );

  const streakStats = useMemo(() => {
    const countsByDate = new Map<string, number>();
    for (const entry of activeEntries) {
      const count = getEntryItemCount(entry, decryptedMap[entry.id]);
      countsByDate.set(entry.date, (countsByDate.get(entry.date) ?? 0) + count);
    }
    const qualifyingDates = Array.from(countsByDate.entries())
      .filter(([, count]) => count >= GRATITUDE_DAILY_TARGET)
      .map(([date]) => date);
    const { current, longest } = calculateHabitStreak(qualifyingDates);
    return {
      current,
      longest,
      totalDays: qualifyingDates.length,
    };
  }, [activeEntries, decryptedMap]);

  const showSavedFeedback = (message: string) => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    setJustSavedFeedback(message);
    feedbackTimerRef.current = window.setTimeout(() => {
      setJustSavedFeedback(null);
      feedbackTimerRef.current = null;
    }, 3000);
  };

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

  const handleAddItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = draftText.trim();
    if (!trimmed || isSaving) return;

    setIsSaving(true);
    try {
      const nextCount = todayItemCount + 1;
      const res = await saveGratitudeEntry({
        date: todayStr,
        items: [trimmed],
        projectId: draftProjectId || undefined,
      });
      if (res.entry) {
        if (isUnlocked) {
          setDecryptedMap((prev) => ({
            ...prev,
            [res.entry!.id]: { items: [trimmed] },
          }));
        }
        setDraftText('');
        showSavedFeedback(
          nextCount === GRATITUDE_DAILY_TARGET
            ? 'Sealed · Daily streak met'
            : 'Sealed'
        );
        window.requestAnimationFrame(() => composerInputRef.current?.focus());
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async (
    entry: GratitudeEntry,
    data: { items: string[]; note?: string; projectId: string }
  ) => {
    setIsSaving(true);
    try {
      const res = await saveGratitudeEntry({
        id: entry.id,
        date: entry.date,
        items: data.items,
        note: data.note,
        projectId: data.projectId || undefined,
      });
      if (res.entry && isUnlocked) {
        setDecryptedMap((prev) => ({
          ...prev,
          [res.entry!.id]: {
            items: data.items,
            note: data.note,
          },
        }));
      }
      setEditingId(null);
    } finally {
      setIsSaving(false);
    }
  };

  const renderUnlockedEntry = (entry: GratitudeEntry, itemNumber: number) => {
    const decrypted = decryptedMap[entry.id];
    const isEditing = editingId === entry.id;
    const project = entry.projectId ? projectMap.get(entry.projectId) : undefined;

    if (isEditing && decrypted) {
      return (
        <li key={entry.id}>
          <InlineEditForm
            initialItems={decrypted.items}
            initialNote={decrypted.note || ''}
            initialProjectId={entry.projectId || ''}
            activeProjects={activeProjects}
            isSubmitting={isSaving}
            onSubmit={(data) => handleSaveEdit(entry, data)}
            onCancel={() => setEditingId(null)}
          />
        </li>
      );
    }

    if (!decrypted) {
      return (
        <li key={entry.id} className="text-xs text-stone-500 italic font-sans py-1">
          {isDecrypting ? 'Decrypting sealed gratitude…' : 'Unable to decrypt item with current key.'}
        </li>
      );
    }

    return (
      <li
        key={entry.id}
        className="group flex items-start justify-between gap-2.5 py-1.5 border-b border-stone-100 last:border-b-0"
      >
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <span className="w-5 h-5 mt-0.5 rounded-full bg-amber-50 border border-amber-200/70 text-[11px] font-mono text-amber-900 flex items-center justify-center flex-shrink-0">
            {itemNumber}
          </span>
          <div className="flex-1 min-w-0 space-y-1.5">
            {decrypted.items.map((text, idx) => (
              <p key={idx} className="text-sm text-charcoal font-sans leading-relaxed break-words">
                {text}
              </p>
            ))}
            {decrypted.note && (
              <p className="text-xs text-stone-600 font-sans leading-relaxed pl-2.5 border-l-2 border-stone-200 whitespace-pre-wrap">
                {decrypted.note}
              </p>
            )}
            {project && (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-sans border border-stone-200/80 bg-stone-50 text-stone-600"
                title={`Linked project: ${project.name}`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: project.color }}
                />
                <span>{project.name}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => {
              setEditingId(entry.id);
              setDeleteConfirmId(null);
            }}
            className="p-1.5 min-w-[30px] min-h-[30px] flex items-center justify-center text-stone-400 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-colors cursor-pointer opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
            title="Edit item"
            aria-label={`Edit gratitude item ${itemNumber} for ${entry.date}`}
          >
            <Pencil size={13} />
          </button>

          {deleteConfirmId === entry.id ? (
            <div className="flex items-center gap-1.5 bg-crimson/10 border border-crimson/25 px-2 py-1 rounded-mac text-[11px] font-sans text-crimson animate-fade-in">
              <button
                type="button"
                onClick={() => {
                  deleteGratitudeEntry(entry.id);
                  setDeleteConfirmId(null);
                }}
                className="font-semibold hover:underline cursor-pointer"
              >
                Confirm
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
              className="p-1.5 min-w-[30px] min-h-[30px] flex items-center justify-center text-stone-400 hover:text-crimson hover:bg-stone-100 rounded-mac transition-colors cursor-pointer opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
              title="Delete item"
              aria-label={`Delete gratitude item ${itemNumber} for ${entry.date}`}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </li>
    );
  };

  const renderDayCard = (group: DayGroup, isTodayCard: boolean) => {
    const streakMet = group.totalItems >= GRATITUDE_DAILY_TARGET;
    const itemCountLabel = `${group.totalItems} ${group.totalItems === 1 ? 'item' : 'items'}`;
    let runningNumber = 1;

    return (
      <article
        key={group.date}
        className="bg-white border border-stone-200/90 rounded-xl shadow-xs p-4 sm:p-5 space-y-3 transition-shadow hover:shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-100">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <time dateTime={group.date} className="font-serif text-base font-medium text-charcoal">
              {formatEntryDate(group.date)}
            </time>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono border ${
                streakMet
                  ? 'bg-amber-50 border-amber-200/80 text-amber-800'
                  : 'bg-stone-50 border-stone-200/80 text-stone-500'
              }`}
              title={
                streakMet
                  ? `${GRATITUDE_DAILY_TARGET}+ items logged on this day`
                  : `${GRATITUDE_DAILY_TARGET} items needed to count toward streak`
              }
            >
              {streakMet && <Check size={10} className="text-amber-700" />}
              <span>{itemCountLabel}</span>
            </span>
          </div>
        </div>

        {isUnlocked ? (
          <ol className="space-y-1">
            {group.entries.map((entry) => {
              const currentNum = runningNumber;
              runningNumber += getEntryItemCount(entry, decryptedMap[entry.id]);
              return renderUnlockedEntry(entry, currentNum);
            })}
          </ol>
        ) : (
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex items-center gap-2 text-stone-500 select-none">
              <Lock size={13} className="text-stone-400" />
              <span className="font-serif italic text-xs text-stone-600">
                {isTodayCard
                  ? `${itemCountLabel} sealed today`
                  : `${itemCountLabel} sealed`}
              </span>
            </div>
            <button
              type="button"
              onClick={openUnlockModal}
              className="text-xs font-sans text-stone-700 hover:text-charcoal underline cursor-pointer flex-shrink-0"
            >
              Unlock to read
            </button>
          </div>
        )}
      </article>
    );
  };

  const todayTargetMet = todayItemCount >= GRATITUDE_DAILY_TARGET;

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
              Log gratitude one item at a time — add as many as you like. Three a day maintains your streak. Encrypted with your shared vault passphrase.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
            {/* Quiet streak & total qualifying days pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-mac border text-xs font-mono ${
                streakStats.current > 0
                  ? 'bg-amber-50 border-amber-200/80 text-amber-800'
                  : 'bg-stone-100/80 border-stone-200/80 text-stone-600'
              }`}
              title={`Current streak: ${streakStats.current}d · Best: ${streakStats.longest}d · ${GRATITUDE_DAILY_TARGET}+ item days: ${streakStats.totalDays}`}
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

        {/* Today's Always-Ready Single-Item Composer + Today's Items */}
        <section aria-label="Today's gratitude" className="space-y-4">
          <div className="bg-white border border-stone-200/90 rounded-xl shadow-xs p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-stone-100">
              <h3 className="font-serif text-base font-medium text-charcoal">
                {formatEntryDate(todayStr)}
              </h3>

              {/* 3-dot daily goal progress indicator */}
              <div
                className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[11px] font-mono transition-colors ${
                  todayTargetMet
                    ? 'bg-amber-50 border-amber-200/80 text-amber-800'
                    : 'bg-stone-50 border-stone-200/80 text-stone-500'
                }`}
                title={`List ${GRATITUDE_DAILY_TARGET} things today to keep your streak`}
              >
                <span className="inline-flex items-center gap-1" aria-hidden="true">
                  {Array.from({ length: GRATITUDE_DAILY_TARGET }).map((_, idx) => (
                    <span
                      key={idx}
                      className={`w-2 h-2 rounded-full border transition-colors ${
                        idx < todayItemCount
                          ? 'bg-amber-500 border-amber-500'
                          : 'bg-stone-100 border-stone-300'
                      }`}
                    />
                  ))}
                </span>
                <span>
                  {todayTargetMet
                    ? `${todayItemCount} today`
                    : `${todayItemCount} / ${GRATITUDE_DAILY_TARGET}`}
                </span>
              </div>
            </div>

            <form onSubmit={handleAddItem} className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  ref={composerInputRef}
                  type="text"
                  value={draftText}
                  disabled={isSaving}
                  maxLength={MAX_LENGTHS.GRATITUDE_ITEM}
                  onChange={(e) => setDraftText(e.target.value.slice(0, MAX_LENGTHS.GRATITUDE_ITEM))}
                  placeholder="Something you appreciate right now…"
                  aria-label="New gratitude item"
                  className="flex-1 min-w-0 text-base sm:text-sm bg-stone-50/50 hover:bg-white focus:bg-white border border-stone-200/90 rounded-mac px-3 py-2 text-charcoal placeholder:text-stone-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 transition-colors font-sans"
                />

                <button
                  type="submit"
                  disabled={!draftText.trim() || isSaving}
                  className="px-4 py-2 min-h-[38px] rounded-mac text-xs font-sans font-semibold bg-crimson hover:bg-crimson-hover text-white disabled:opacity-45 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none shrink-0"
                >
                  <ShieldCheck size={14} />
                  <span>Seal</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative inline-flex items-center">
                  <Folder size={13} className="absolute left-2.5 text-stone-500 pointer-events-none" />
                  <select
                    value={draftProjectId}
                    onChange={(e) => setDraftProjectId(e.target.value)}
                    aria-label="Connect gratitude item to project"
                    className="pl-8 pr-6 py-1.5 min-h-[34px] text-xs bg-stone-50 border border-stone-200 rounded-mac text-stone-700 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 cursor-pointer"
                  >
                    <option value="">No project link</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                {justSavedFeedback && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-mono text-emerald-800 animate-fade-in">
                    <Check size={11} />
                    <span>{justSavedFeedback}</span>
                  </div>
                )}
              </div>
            </form>
          </div>

          {todayEntries.length > 0 &&
            renderDayCard(
              {
                date: todayStr,
                entries: todayEntries,
                totalItems: todayItemCount,
              },
              true
            )}
        </section>

        {/* Archive */}
        <section aria-label="Past gratitude entries" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
              Previous Entries ({pastDayGroups.length})
            </h3>

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

          {pastDayGroups.length === 0 ? (
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
              {pastDayGroups.map((group) => renderDayCard(group, false))}
            </div>
          )}
        </section>
      </div>

      {/* Shared Passphrase Setup / Unlock / Change Modal */}
      <VaultPassphraseModal {...modalProps} />
    </div>
  );
};
