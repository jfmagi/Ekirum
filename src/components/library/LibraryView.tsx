import React, { useMemo, useState } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { LibraryItem, LibraryItemType, LibraryDifficulty } from '../../types';
import {
  LIBRARY_DIFFICULTY_LABELS,
  LIBRARY_TYPE_LABELS,
} from '../../lib/library';
import { formatLocalDate } from '../../lib/dateParser';
import {
  BookOpen,
  Film,
  Plus,
  Check,
  X,
  Trash2,
  Pencil,
  RotateCcw,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

type Tab = 'queue' | 'gallery';
type TypeFilter = 'all' | LibraryItemType;

const TypeIcon: React.FC<{ type: LibraryItemType; size?: number; className?: string }> = ({
  type,
  size = 14,
  className,
}) => (type === 'book' ? <BookOpen size={size} className={className} /> : <Film size={size} className={className} />);

interface ItemFormProps {
  initial?: LibraryItem;
  onSubmit: (data: {
    title: string;
    type: LibraryItemType;
    creator?: string;
    url?: string;
    notes?: string;
    difficulty: LibraryDifficulty;
    projectId?: string;
  }) => void;
  onCancel?: () => void;
  submitLabel: string;
}

const ItemForm: React.FC<ItemFormProps> = ({ initial, onSubmit, onCancel, submitLabel }) => {
  const projects = useEkirumStore((s) => s.projects);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState<LibraryItemType>(initial?.type ?? 'book');
  const [creator, setCreator] = useState(initial?.creator ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [difficulty, setDifficulty] = useState<LibraryDifficulty>(initial?.difficulty ?? 1);
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({ title, type, creator, url, notes, difficulty, projectId: projectId || undefined });
    if (!initial) {
      setTitle('');
      setCreator('');
      setUrl('');
      setNotes('');
      setProjectId('');
    }
  };

  const fieldClass =
    'w-full px-3 py-2 min-h-[40px] text-base sm:text-sm bg-white border border-stone-200 rounded-mac text-charcoal placeholder-stone-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 font-sans';
  const labelClass = 'block text-[11px] font-sans uppercase tracking-wider font-semibold text-stone-600 mb-1';

  return (
    <form
      onSubmit={submit}
      className="bg-white border border-stone-200/90 rounded-card p-3.5 sm:p-4 shadow-2xs space-y-3"
    >
      <div className="flex gap-1 p-1 bg-stone-100 rounded-mac w-fit" role="group" aria-label="Item type">
        {(['book', 'movie'] as LibraryItemType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            aria-pressed={type === t}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] text-xs font-medium rounded-mac cursor-pointer transition-colors font-sans focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none ${
              type === t ? 'bg-white text-charcoal shadow-2xs' : 'text-stone-600 hover:text-charcoal'
            }`}
          >
            <TypeIcon type={t} size={13} />
            {LIBRARY_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="lib-title">Title</label>
          <input
            id="lib-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'book' ? 'e.g. The Name of the Rose' : 'e.g. Stalker'}
            className={fieldClass}
            autoFocus={!initial}
            required
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="lib-creator">{type === 'book' ? 'Author' : 'Director'}</label>
          <input
            id="lib-creator"
            value={creator}
            onChange={(e) => setCreator(e.target.value)}
            placeholder="Optional"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <span className={labelClass}>Difficulty</span>
          <div className="flex gap-1.5" role="group" aria-label="Difficulty">
            {([0, 1, 2] as LibraryDifficulty[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                aria-pressed={difficulty === d}
                className={`flex-1 px-2 py-1.5 min-h-[36px] text-xs font-medium rounded-mac border cursor-pointer transition-colors font-sans focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none ${
                  difficulty === d
                    ? 'bg-stone-800 text-white border-stone-800'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                }`}
              >
                {LIBRARY_DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelClass} htmlFor="lib-skill">Linked skill</label>
          <select
            id="lib-skill"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className={fieldClass}
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass} htmlFor="lib-url">Link</label>
          <input
            id="lib-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… (optional)"
            className={fieldClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="lib-notes">Notes</label>
          <input
            id="lib-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why it's on the list (optional)"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 min-h-[36px] text-xs font-medium text-stone-600 hover:text-charcoal hover:bg-stone-100 rounded-mac cursor-pointer font-sans focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!title.trim()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] text-xs font-medium text-white bg-crimson hover:bg-crimson-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-mac shadow-xs transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer font-sans"
        >
          <Plus size={14} />
          {submitLabel}
        </button>
      </div>
    </form>
  );
};

const FinishForm: React.FC<{
  onConfirm: (details: { review: string; finishedDate: string }) => void;
  onCancel: () => void;
}> = ({ onConfirm, onCancel }) => {
  const [review, setReview] = useState('');
  const [finishedDate, setFinishedDate] = useState(formatLocalDate());

  return (
    <div className="mt-3 pt-3 border-t border-stone-100 space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5">
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          rows={2}
          placeholder="A short review (optional)"
          aria-label="Review"
          className="w-full px-3 py-2 text-base sm:text-sm bg-white border border-stone-200 rounded-mac text-charcoal placeholder-stone-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 font-sans resize-none"
          autoFocus
        />
        <input
          type="date"
          value={finishedDate}
          max={formatLocalDate()}
          onChange={(e) => setFinishedDate(e.target.value)}
          aria-label="Finished date"
          className="px-3 py-2 min-h-[40px] text-base sm:text-sm bg-white border border-stone-200 rounded-mac text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 font-sans"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-2 min-h-[36px] text-xs font-medium text-stone-600 hover:text-charcoal hover:bg-stone-100 rounded-mac cursor-pointer font-sans focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
        >
          Cancel
        </button>
        <button
          onClick={() => onConfirm({ review, finishedDate: finishedDate || formatLocalDate() })}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[36px] text-xs font-medium text-white bg-crimson hover:bg-crimson-hover rounded-mac shadow-xs transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer font-sans"
        >
          <Check size={14} />
          Finish
        </button>
      </div>
    </div>
  );
};

const iconButton =
  'min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-500 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none';

export const LibraryView: React.FC = () => {
  const {
    libraryItems,
    projects,
    addLibraryItem,
    updateLibraryItem,
    deleteLibraryItem,
    completeLibraryItem,
    reopenLibraryItem,
  } = useEkirumStore();

  const [tab, setTab] = useState<Tab>('queue');
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [finishingId, setFinishingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const projectName = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [projects]);

  const { queue, gallery, queueCount, galleryCount } = useMemo(() => {
    const active = libraryItems.filter((i) => !i.isDeleted);
    const todo = active.filter((i) => i.status === 'todo');
    const done = active
      .filter((i) => i.status === 'done')
      .sort((a, b) => {
        const ad = a.finishedDate || a.completedAt || '';
        const bd = b.finishedDate || b.completedAt || '';
        if (ad !== bd) return bd.localeCompare(ad);
        return (b.completedAt || '').localeCompare(a.completedAt || '');
      });
    const byType = (i: LibraryItem) => filter === 'all' || i.type === filter;
    return {
      queue: todo.filter(byType),
      gallery: done.filter(byType),
      queueCount: todo.length,
      galleryCount: done.length,
    };
  }, [libraryItems, filter]);

  const booksDone = libraryItems.filter((i) => !i.isDeleted && i.status === 'done' && i.type === 'book').length;
  const moviesDone = libraryItems.filter((i) => !i.isDeleted && i.status === 'done' && i.type === 'movie').length;

  const items = tab === 'queue' ? queue : gallery;

  const renderMeta = (item: LibraryItem) => (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-stone-600 font-sans">
      {item.creator && <span>{item.creator}</span>}
      <span className="px-1.5 py-0.5 rounded bg-stone-100 font-medium">
        {LIBRARY_DIFFICULTY_LABELS[item.difficulty]}
      </span>
      {item.projectId && projectName.get(item.projectId) && (
        <span className="px-1.5 py-0.5 rounded bg-stone-100 font-medium">{projectName.get(item.projectId)}</span>
      )}
      {item.status === 'done' && item.finishedDate && (
        <span className="font-mono text-stone-500">
          {new Date(item.finishedDate + 'T12:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      )}
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-stone-600 hover:text-charcoal underline underline-offset-2"
        >
          <ExternalLink size={11} />
          Link
        </a>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto w-full px-3.5 sm:px-6 py-4 sm:py-8 select-none space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-crimson" />
            <h2 className="font-serif text-2xl font-medium text-charcoal">Library</h2>
          </div>
          <p className="text-xs text-stone-500 font-sans mt-0.5">
            Books to read and films to watch. Finishing one fills your gallery.
          </p>
        </div>
        <button
          onClick={() => {
            setTab('queue');
            setAdding((v) => !v);
          }}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[36px] text-xs font-medium text-white bg-crimson hover:bg-crimson-hover rounded-mac shadow-xs transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-stone-400 cursor-pointer font-sans"
        >
          {adding ? <X size={14} /> : <Plus size={14} />}
          <span>{adding ? 'Close' : 'Add to Library'}</span>
        </button>
      </div>

      {adding && (
        <ItemForm
          submitLabel="Add"
          onSubmit={(data) => addLibraryItem(data)}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Tabs and filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div role="tablist" aria-label="Library sections" className="flex gap-1 p-1 bg-stone-100 rounded-mac w-fit">
          {(
            [
              { id: 'queue', label: 'Queue', count: queueCount },
              { id: 'gallery', label: 'Gallery', count: galleryCount },
            ] as { id: Tab; label: string; count: number }[]
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-1.5 min-h-[36px] text-xs font-medium rounded-mac cursor-pointer transition-colors font-sans focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none ${
                tab === t.id ? 'bg-white text-charcoal shadow-2xs' : 'text-stone-600 hover:text-charcoal'
              }`}
            >
              {t.label} <span className="font-mono text-stone-500">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="flex gap-1.5" role="group" aria-label="Filter by type">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'book', label: 'Books' },
              { id: 'movie', label: 'Movies' },
            ] as { id: TypeFilter; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
              className={`px-3 py-1.5 min-h-[32px] text-xs font-medium rounded-full border cursor-pointer transition-colors font-sans focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none ${
                filter === f.id
                  ? 'bg-stone-800 text-white border-stone-800'
                  : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'gallery' && galleryCount > 0 && (
        <div className="flex items-center gap-4 text-xs text-stone-600 font-sans">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen size={13} className="text-stone-500" />
            {booksDone} {booksDone === 1 ? 'book' : 'books'} read
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Film size={13} className="text-stone-500" />
            {moviesDone} {moviesDone === 1 ? 'movie' : 'movies'} watched
          </span>
        </div>
      )}

      {/* List */}
      {items.length === 0 ? (
        <div className="py-14 text-center border border-dashed border-stone-200 rounded-card bg-white/60">
          <Sparkles size={20} className="mx-auto text-stone-400 mb-2" />
          <p className="text-sm text-stone-700 font-sans font-medium">
            {tab === 'queue' ? 'Nothing in the queue' : 'The gallery is empty'}
          </p>
          <p className="text-xs text-stone-500 font-sans mt-1">
            {tab === 'queue'
              ? 'Add a book or a movie you want to get to.'
              : 'Finished books and movies will appear here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => {
            if (editingId === item.id) {
              return (
                <li key={item.id}>
                  <ItemForm
                    initial={item}
                    submitLabel="Save"
                    onSubmit={(data) => {
                      updateLibraryItem(item.id, {
                        title: data.title.trim(),
                        type: data.type,
                        creator: data.creator?.trim() || undefined,
                        url: data.url?.trim() || undefined,
                        notes: data.notes?.trim() || undefined,
                        difficulty: data.difficulty,
                        projectId: data.projectId,
                      });
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                </li>
              );
            }

            return (
              <li
                key={item.id}
                className="bg-white border border-stone-200/90 rounded-card p-3.5 sm:p-4 shadow-2xs"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 w-8 h-8 flex-shrink-0 rounded-mac bg-stone-100 flex items-center justify-center text-stone-600">
                    <TypeIcon type={item.type} size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-charcoal font-sans break-words">{item.title}</div>
                    {renderMeta(item)}
                    {tab === 'queue' && item.notes && (
                      <p className="text-xs text-stone-600 font-sans mt-1.5 break-words">{item.notes}</p>
                    )}
                    {tab === 'gallery' && item.review && (
                      <p className="text-xs text-stone-700 font-serif italic mt-2 break-words whitespace-pre-wrap">
                        “{item.review}”
                      </p>
                    )}
                  </div>
                  <div className="flex items-center flex-shrink-0 -mr-1.5">
                    {tab === 'queue' ? (
                      <button
                        onClick={() => setFinishingId(finishingId === item.id ? null : item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-medium text-charcoal bg-stone-100 hover:bg-stone-200 rounded-mac cursor-pointer transition-colors font-sans focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
                        aria-expanded={finishingId === item.id}
                      >
                        <Check size={13} />
                        Done
                      </button>
                    ) : (
                      <button
                        onClick={() => reopenLibraryItem(item.id)}
                        className={iconButton}
                        title="Move back to queue"
                        aria-label={`Move ${item.title} back to queue`}
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setEditingId(item.id)}
                      className={iconButton}
                      title="Edit"
                      aria-label={`Edit ${item.title}`}
                    >
                      <Pencil size={14} />
                    </button>
                    {confirmDeleteId === item.id ? (
                      <button
                        onClick={() => {
                          deleteLibraryItem(item.id);
                          setConfirmDeleteId(null);
                        }}
                        onBlur={() => setConfirmDeleteId(null)}
                        autoFocus
                        className="px-2.5 py-1.5 min-h-[36px] text-xs font-medium text-white bg-crimson hover:bg-crimson-hover rounded-mac cursor-pointer font-sans focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
                      >
                        Delete?
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(item.id)}
                        className={iconButton}
                        title="Delete"
                        aria-label={`Delete ${item.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {tab === 'queue' && finishingId === item.id && (
                  <FinishForm
                    onCancel={() => setFinishingId(null)}
                    onConfirm={(details) => {
                      completeLibraryItem(item.id, details);
                      setFinishingId(null);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
