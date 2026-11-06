import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { useShallow } from 'zustand/react/shallow';
import {
  Wind,
  Lock,
  Unlock,
  Flame,
  Folder,
  Trash2,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Check,
  Eye,
  EyeOff,
  Clock,
  X,
} from 'lucide-react';
import {
  DEFUSION_PREFIXES,
  DecryptedDefusionPayload,
  initializeDefusionVault,
  configureVaultPassphrase,
  unlockDefusionVault,
  decryptDefusionEntry,
} from '../../lib/defusionCrypto';
import { MAX_LENGTHS } from '../../lib/validation';

const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes of inactivity

export const DefusionView: React.FC = () => {
  const {
    defusionEntries,
    defusionVault,
    projects,
    defuseThought,
    burnDefusionEntry,
    deleteDefusionEntry,
    saveDefusionVaultConfig,
  } = useEkirumStore(
    useShallow((s) => ({
      defusionEntries: s.defusionEntries,
      defusionVault: s.defusionVault,
      projects: s.projects,
      defuseThought: s.defuseThought,
      burnDefusionEntry: s.burnDefusionEntry,
      deleteDefusionEntry: s.deleteDefusionEntry,
      saveDefusionVaultConfig: s.saveDefusionVaultConfig,
    }))
  );

  // Composer state
  const [thoughtText, setThoughtText] = useState('');
  const [selectedPrefix, setSelectedPrefix] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [burnOnDefuse, setBurnOnDefuse] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBurningInComposer, setIsBurningInComposer] = useState(false);
  const [justDefusedMode, setJustDefusedMode] = useState<'sealed' | 'burned' | null>(null);

  // Archive interactions
  const [burnConfirmId, setBurnConfirmId] = useState<string | null>(null);
  const [burningCardId, setBurningCardId] = useState<string | null>(null);

  // Filter state
  const [filterMode, setFilterMode] = useState<'all' | 'sealed' | 'burned'>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  // Vault unlock & in-memory decryption state (wiped on unmount or 5m inactivity)
  const [unlockedPrivateKey, setUnlockedPrivateKey] = useState<CryptoKey | null>(null);
  const [decryptedMap, setDecryptedMap] = useState<Record<string, DecryptedDefusionPayload>>({});
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Passphrase modal state
  const [passphraseModalMode, setPassphraseModalMode] = useState<'unlock' | 'setup' | 'change' | null>(null);
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [isProcessingKey, setIsProcessingKey] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const activeProjects = useMemo(() => projects.filter((p) => !p.isDeleted), [projects]);
  const projectMap = useMemo(() => new Map(activeProjects.map((p) => [p.id, p])), [activeProjects]);

  const lockVault = useCallback(() => {
    setUnlockedPrivateKey(null);
    setDecryptedMap({});
    setPassphraseModalMode(null);
    setCurrentPassInput('');
    setPassInput('');
    setConfirmPassInput('');
    setPassError(null);
  }, []);

  // Auto-lock after 5 minutes of inactivity while unlocked
  useEffect(() => {
    if (!unlockedPrivateKey) return;

    lastActivityRef.current = Date.now();
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach((ev) => window.addEventListener(ev, updateActivity, { passive: true }));

    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current >= AUTO_LOCK_MS) {
        lockVault();
      }
    }, 5000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, updateActivity));
      clearInterval(interval);
    };
  }, [unlockedPrivateKey, lockVault]);

  // Ensure vault locks immediately when leaving the Defusion tab (component unmount)
  useEffect(() => {
    return () => {
      setUnlockedPrivateKey(null);
      setDecryptedMap({});
    };
  }, []);

  // Decrypt sealed entries whenever vault is unlocked or new sealed entries arrive while unlocked
  useEffect(() => {
    if (!unlockedPrivateKey) return;
    let cancelled = false;

    const decryptMissing = async () => {
      const sealedToDecrypt = defusionEntries.filter(
        (e) => !e.isDeleted && !e.burned && e.ciphertext && !decryptedMap[e.id]
      );
      if (sealedToDecrypt.length === 0) return;

      setIsDecrypting(true);
      const nextEntries: Record<string, DecryptedDefusionPayload> = {};
      for (const entry of sealedToDecrypt) {
        try {
          const res = await decryptDefusionEntry(unlockedPrivateKey, entry);
          if (res) {
            nextEntries[entry.id] = res;
          }
        } catch {
          // Entry could not be decrypted with current key
        }
      }
      if (!cancelled && Object.keys(nextEntries).length > 0) {
        setDecryptedMap((prev) => ({ ...prev, ...nextEntries }));
      }
      if (!cancelled) {
        setIsDecrypting(false);
      }
    };

    void decryptMissing();
    return () => {
      cancelled = true;
    };
  }, [unlockedPrivateKey, defusionEntries, decryptedMap]);

  const handleDefuseSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = thoughtText.trim();
    if (!trimmed || isSubmitting || isBurningInComposer) return;

    if (burnOnDefuse) {
      setIsBurningInComposer(true);
      await new Promise((resolve) => setTimeout(resolve, 800));
      setIsSubmitting(true);
      try {
        await defuseThought({
          text: trimmed,
          prefix: selectedPrefix || undefined,
          projectId: selectedProjectId || undefined,
          burned: true,
        });
        setThoughtText('');
        setIsBurningInComposer(false);
        setJustDefusedMode('burned');
        setTimeout(() => {
          setJustDefusedMode((prev) => (prev === 'burned' ? null : prev));
        }, 2400);
      } finally {
        setIsSubmitting(false);
        setIsBurningInComposer(false);
      }
    } else {
      setIsSubmitting(true);
      try {
        await defuseThought({
          text: trimmed,
          prefix: selectedPrefix || undefined,
          projectId: selectedProjectId || undefined,
          burned: false,
        });
        setThoughtText('');
        setJustDefusedMode('sealed');
        setTimeout(() => {
          setJustDefusedMode((prev) => (prev === 'sealed' ? null : prev));
        }, 2400);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleConfirmBurnArchived = async (entryId: string) => {
    setBurningCardId(entryId);
    setBurnConfirmId(null);
    await new Promise((resolve) => setTimeout(resolve, 800));
    await burnDefusionEntry(entryId);
    setBurningCardId(null);
  };

  const handleOpenUnlockModal = () => {
    setPassError(null);
    setCurrentPassInput('');
    setPassInput('');
    setConfirmPassInput('');
    setShowPassphrase(false);
    if (!defusionVault || !defusionVault.passphraseConfigured) {
      setPassphraseModalMode('setup');
    } else {
      setPassphraseModalMode('unlock');
    }
  };

  const handleOpenChangePassphraseModal = () => {
    setPassError(null);
    setCurrentPassInput('');
    setPassInput('');
    setConfirmPassInput('');
    setShowPassphrase(false);
    setPassphraseModalMode('change');
  };

  const handlePassphraseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessingKey) return;
    setPassError(null);

    try {
      setIsProcessingKey(true);
      if (passphraseModalMode === 'setup') {
        if (passInput.trim().length < 4) {
          setPassError('Passphrase must be at least 4 characters.');
          return;
        }
        if (passInput !== confirmPassInput) {
          setPassError('Passphrases do not match.');
          return;
        }
        let vaultToConfigure = defusionVault;
        if (!vaultToConfigure) {
          const freshVault = await initializeDefusionVault(passInput);
          await saveDefusionVaultConfig(freshVault);
          const key = await unlockDefusionVault(freshVault, passInput);
          setUnlockedPrivateKey(key);
        } else {
          const { updatedVault, privateKey } = await configureVaultPassphrase(vaultToConfigure, passInput);
          await saveDefusionVaultConfig(updatedVault);
          setUnlockedPrivateKey(privateKey);
        }
        setPassphraseModalMode(null);
      } else if (passphraseModalMode === 'unlock') {
        if (!defusionVault) {
          setPassError('Vault is not initialized yet.');
          return;
        }
        const key = await unlockDefusionVault(defusionVault, passInput);
        setUnlockedPrivateKey(key);
        setPassphraseModalMode(null);
      } else if (passphraseModalMode === 'change') {
        if (!defusionVault) return;
        if (passInput.trim().length < 4) {
          setPassError('New passphrase must be at least 4 characters.');
          return;
        }
        if (passInput !== confirmPassInput) {
          setPassError('New passphrases do not match.');
          return;
        }
        const { updatedVault, privateKey } = await configureVaultPassphrase(
          defusionVault,
          passInput,
          currentPassInput
        );
        await saveDefusionVaultConfig(updatedVault);
        setUnlockedPrivateKey(privateKey);
        setPassphraseModalMode(null);
      }
    } catch (err) {
      setPassError(err instanceof Error ? err.message : 'Failed to unlock vault.');
    } finally {
      setIsProcessingKey(false);
    }
  };

  const filteredEntries = useMemo(() => {
    return defusionEntries.filter((entry) => {
      if (entry.isDeleted) return false;
      if (filterMode === 'sealed' && entry.burned) return false;
      if (filterMode === 'burned' && !entry.burned) return false;
      if (projectFilter !== 'all' && entry.projectId !== projectFilter) return false;
      return true;
    });
  }, [defusionEntries, filterMode, projectFilter]);

  const counts = useMemo(() => {
    let total = 0;
    let sealed = 0;
    let burned = 0;
    for (const e of defusionEntries) {
      if (e.isDeleted) continue;
      total++;
      if (e.burned) burned++;
      else sealed++;
    }
    return { total, sealed, burned };
  }, [defusionEntries]);

  const isUnlocked = Boolean(unlockedPrivateKey);

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
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
                Defusion chamber
              </h2>
            </div>
            <p className="text-xs text-stone-500 font-sans mt-0.5 max-w-xl leading-relaxed">
              Step back from tangled thoughts by writing them down and releasing them. Thoughts are sealed with one-way encryption by default, or burned to ash on release.
            </p>
          </div>

          {/* Vault Status Pill & Unlock / Lock Controls */}
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            {isUnlocked ? (
              <>
                <button
                  type="button"
                  onClick={handleOpenChangePassphraseModal}
                  className="px-2.5 py-1.5 rounded-mac text-[11px] font-sans font-medium text-stone-600 hover:text-charcoal bg-stone-100 hover:bg-stone-200/70 border border-stone-200/80 transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Change vault passphrase"
                >
                  <KeyRound size={12} />
                  <span>Passphrase</span>
                </button>
                <button
                  type="button"
                  onClick={lockVault}
                  className="px-3 py-1.5 rounded-mac text-xs font-sans font-semibold text-amber-900 bg-amber-100/90 hover:bg-amber-200/80 border border-amber-300/80 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Lock size={13} />
                  <span>Lock Vault</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleOpenUnlockModal}
                className="px-3 py-1.5 rounded-mac text-xs font-sans font-medium text-stone-700 hover:text-charcoal bg-white hover:bg-stone-100/90 border border-stone-200/90 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Unlock size={13} className="text-stone-500" />
                <span>Unlock Vault</span>
              </button>
            )}
          </div>
        </header>

        {/* Auto-lock Notice Banner when Unlocked */}
        {isUnlocked && (
          <div className="bg-stone-100/90 border border-stone-200/90 rounded-mac px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-stone-700">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-stone-500 flex-shrink-0" />
              <span>
                Vault is unlocked for reading. Re-locks after 5 minutes of inactivity or when leaving this view.
              </span>
            </div>
            <button
              type="button"
              onClick={lockVault}
              className="text-xs font-medium text-stone-700 underline hover:text-charcoal flex-shrink-0 cursor-pointer"
            >
              Lock now
            </button>
          </div>
        )}

        {/* 1-Step Thought Dump Composer */}
        <section
          aria-label="Defuse a thought"
          className="bg-white border border-stone-200/90 rounded-xl shadow-xs overflow-hidden transition-all"
        >
          {/* Optional Cognitive Defusion Framing Prompts */}
          <div className="px-4 pt-3.5 pb-2.5 bg-stone-50/70 border-b border-stone-200/60">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] font-sans uppercase tracking-wider font-semibold text-stone-500 flex items-center gap-1.5">
                <Sparkles size={11} className="text-gold" />
                <span>Optional Defusion Framing</span>
              </span>
              {selectedPrefix && (
                <button
                  type="button"
                  onClick={() => setSelectedPrefix('')}
                  className="text-[10px] text-stone-500 hover:text-charcoal cursor-pointer"
                >
                  Clear framing
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEFUSION_PREFIXES.map((prefix) => {
                const isSelected = selectedPrefix === prefix;
                return (
                  <button
                    key={prefix}
                    type="button"
                    onClick={() => setSelectedPrefix(isSelected ? '' : prefix)}
                    className={`px-3 py-1.5 min-h-[32px] rounded-full text-xs font-sans transition-all cursor-pointer border flex items-center ${
                      isSelected
                        ? 'bg-charcoal text-[#FBFBF9] border-charcoal font-medium shadow-2xs'
                        : 'bg-white text-stone-600 border-stone-200/80 hover:border-stone-300 hover:text-charcoal'
                    }`}
                  >
                    {prefix}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thought Input Area */}
          <form onSubmit={handleDefuseSubmit} className="p-4 space-y-3.5">
            {selectedPrefix && (
              <div className="font-serif italic text-sm text-stone-600 pl-2.5 border-l-2 border-gold/70">
                {selectedPrefix}
              </div>
            )}

            <textarea
              value={thoughtText}
              disabled={isSubmitting || isBurningInComposer}
              onChange={(e) => setThoughtText(e.target.value.slice(0, MAX_LENGTHS.DEFUSION_TEXT))}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleDefuseSubmit();
                }
              }}
              rows={4}
              placeholder="Dump the thought occupying your mind… (Cmd/Ctrl + Enter to defuse)"
              aria-label="Thought to defuse"
              className={`w-full resize-y min-h-[96px] bg-transparent text-sm text-charcoal placeholder:text-stone-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-stone-400 rounded-mac p-1 leading-relaxed font-sans transition-all ${
                isBurningInComposer ? 'animate-ember-burn pointer-events-none select-none' : ''
              }`}
            />

            {/* Composer Footer: Project Link, Burn Toggle, Submit */}
            <div className="pt-3 border-t border-stone-200/60 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* Project Connection Selector */}
                <div className="relative flex items-center">
                  <Folder size={13} className="text-stone-400 absolute left-2.5 pointer-events-none" />
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    aria-label="Connect thought to project"
                    className="pl-7 pr-6 py-1.5 rounded-mac text-xs font-sans bg-stone-100/90 hover:bg-stone-200/60 text-stone-700 border border-stone-200/80 focus:outline-none focus:ring-1 focus:ring-stone-400 cursor-pointer"
                  >
                    <option value="">No project connection</option>
                    {activeProjects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Burn After Defusing Toggle */}
                <button
                  type="button"
                  onClick={() => setBurnOnDefuse((prev) => !prev)}
                  aria-pressed={burnOnDefuse}
                  className={`px-3 py-1.5 min-h-[32px] rounded-mac text-xs font-sans flex items-center gap-1.5 border transition-all cursor-pointer ${
                    burnOnDefuse
                      ? 'bg-crimson/10 text-crimson border-crimson/30 font-medium'
                      : 'bg-stone-100/80 text-stone-600 border-stone-200/80 hover:text-charcoal'
                  }`}
                  title={
                    burnOnDefuse
                      ? 'Thought text will be permanently vaporized upon defusing'
                      : 'Thought text will be encrypted and sealed in the vault'
                  }
                >
                  <Flame size={13} className={burnOnDefuse ? 'text-crimson' : 'text-stone-400'} />
                  <span>{burnOnDefuse ? 'Burn after defusing' : 'Seal in vault'}</span>
                </button>
              </div>

              <div className="flex items-center gap-3 ml-auto">
                {thoughtText.length > 0 && !isBurningInComposer && (
                  <span className="text-[11px] font-mono text-stone-400 self-center hidden sm:inline">
                    {MAX_LENGTHS.DEFUSION_TEXT - thoughtText.length}
                  </span>
                )}

                {justDefusedMode && (
                  <span className="text-xs font-sans text-stone-600 flex items-center gap-1.5 animate-fade-in">
                    {justDefusedMode === 'burned' ? (
                      <>
                        <Flame size={13} className="text-crimson" />
                        <span>Defused & burned</span>
                      </>
                    ) : (
                      <>
                        <Check size={13} className="text-emerald-700" />
                        <span>Defused & sealed</span>
                      </>
                    )}
                  </span>
                )}

                <button
                  type="submit"
                  disabled={!thoughtText.trim() || isSubmitting || isBurningInComposer}
                  className={`px-4 py-2 min-h-[36px] rounded-mac text-xs font-sans font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs ${
                    burnOnDefuse
                      ? 'bg-crimson text-white hover:bg-crimson/90'
                      : 'bg-charcoal text-[#FBFBF9] hover:bg-stone-800'
                  }`}
                >
                  {burnOnDefuse ? <Flame size={13} /> : <Lock size={13} />}
                  <span>{burnOnDefuse ? 'Defuse & Burn' : 'Defuse & Seal'}</span>
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Archive Section */}
        <section aria-label="Defused thoughts archive" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded-mac text-xs font-sans transition-colors cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-stone-200/90 text-charcoal font-semibold'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                All ({counts.total})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('sealed')}
                className={`px-2.5 py-1 rounded-mac text-xs font-sans transition-colors cursor-pointer flex items-center gap-1 ${
                  filterMode === 'sealed'
                    ? 'bg-stone-200/90 text-charcoal font-semibold'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <Lock size={11} />
                <span>Sealed ({counts.sealed})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('burned')}
                className={`px-2.5 py-1 rounded-mac text-xs font-sans transition-colors cursor-pointer flex items-center gap-1 ${
                  filterMode === 'burned'
                    ? 'bg-stone-200/90 text-charcoal font-semibold'
                    : 'text-stone-600 hover:bg-stone-100'
                }`}
              >
                <Flame size={11} />
                <span>Burned ({counts.burned})</span>
              </button>
            </div>

            {activeProjects.length > 0 && (
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                aria-label="Filter defused thoughts by project"
                className="px-2.5 py-1 rounded-mac text-xs font-sans bg-white text-stone-700 border border-stone-200/80 focus:outline-none cursor-pointer"
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

          {filteredEntries.length === 0 ? (
            <div className="border border-dashed border-stone-200 rounded-xl p-10 text-center space-y-2 bg-stone-50/40">
              <Wind size={22} className="text-stone-400 mx-auto" />
              <p className="font-serif text-base text-stone-700 font-medium">
                {counts.total === 0 ? 'Your vault is quiet and clear.' : 'No entries match this filter.'}
              </p>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                {counts.total === 0
                  ? 'Whenever an intrusive or overwhelming thought arises, dump it above to step back from it.'
                  : 'Try switching filters to view other sealed or burned releases.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredEntries.map((entry) => {
                const project = entry.projectId ? projectMap.get(entry.projectId) : undefined;
                const decrypted = decryptedMap[entry.id];

                return (
                  <article
                    key={entry.id}
                    className={`rounded-xl border px-4 py-3.5 transition-all ${
                      entry.burned
                        ? 'bg-stone-100/50 border-stone-200/70'
                        : isUnlocked && decrypted
                          ? 'bg-white border-stone-300/90 shadow-2xs'
                          : 'bg-white/80 border-stone-200/80'
                    } ${burningCardId === entry.id ? 'animate-ember-burn pointer-events-none' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500 font-sans">
                        <span>{formatTimestamp(entry.createdAt)}</span>
                        {project && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200/80 text-stone-700 font-medium">
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: project.color || '#8B1528' }}
                            />
                            <span>{project.name}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {entry.burned ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-sans font-medium bg-stone-200/70 text-stone-600">
                            <Flame size={11} className="text-crimson/80" />
                            <span>Burned</span>
                          </span>
                        ) : isUnlocked ? (
                          burnConfirmId === entry.id ? (
                            <div className="flex items-center gap-1.5 bg-crimson/10 border border-crimson/25 px-2.5 py-1 rounded-mac text-xs font-sans text-crimson animate-fade-in">
                              <span className="font-medium">Burn to ash?</span>
                              <button
                                type="button"
                                onClick={() => void handleConfirmBurnArchived(entry.id)}
                                className="font-semibold underline hover:text-crimson-hover cursor-pointer px-1 py-0.5"
                              >
                                Yes
                              </button>
                              <button
                                type="button"
                                onClick={() => setBurnConfirmId(null)}
                                className="text-stone-500 hover:text-charcoal cursor-pointer px-1 py-0.5 ml-0.5"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setBurnConfirmId(entry.id)}
                                className="px-2.5 py-1 rounded text-xs font-sans text-stone-600 hover:text-crimson hover:bg-crimson/5 transition-colors flex items-center gap-1.5 cursor-pointer min-h-[32px]"
                                title="Burn this thought (permanently erase encrypted text)"
                              >
                                <Flame size={12} className="text-crimson/70" />
                                <span>Burn</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteDefusionEntry(entry.id)}
                                className="p-1.5 rounded text-stone-500 hover:text-crimson hover:bg-stone-100 transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                                title="Delete entry"
                                aria-label="Delete entry"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-sans font-medium bg-stone-100 text-stone-600 border border-stone-200/70">
                            <ShieldCheck size={12} className="text-stone-500" />
                            <span>Sealed</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    {entry.burned ? (
                      <p className="text-xs italic font-serif text-stone-500 select-none">
                        Released and burned to ash — no text retained.
                      </p>
                    ) : isUnlocked ? (
                      decrypted ? (
                        <div className="space-y-1.5 pt-0.5">
                          {decrypted.prefix && (
                            <p className="font-serif italic text-xs text-stone-500">
                              {decrypted.prefix}
                            </p>
                          )}
                          <p className="text-sm font-sans text-charcoal whitespace-pre-wrap leading-relaxed">
                            {decrypted.text}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-stone-600 italic font-sans">
                          {isDecrypting ? 'Decrypting sealed thought…' : 'Unable to decrypt entry with current key.'}
                        </p>
                      )
                    ) : (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-2 text-stone-500 select-none">
                          <Lock size={12} className="text-stone-400" />
                          <span className="font-serif italic text-xs text-stone-600">
                            Sealed thought reflection
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenUnlockModal}
                          className="text-xs font-sans text-stone-600 hover:text-charcoal underline cursor-pointer flex-shrink-0"
                        >
                          Unlock to read
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Passphrase Setup / Unlock / Change Modal */}
      {passphraseModalMode && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPassphraseModalMode(null)}
        >
          <div
            className="bg-[#FBFBF9] border border-stone-200 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-sans uppercase tracking-wider font-semibold text-stone-500">
                  <KeyRound size={12} className="text-crimson" />
                  <span>
                    {passphraseModalMode === 'setup'
                      ? 'First-Time Vault Key Setup'
                      : passphraseModalMode === 'change'
                        ? 'Update Vault Passphrase'
                        : 'Encrypted Vault Access'}
                  </span>
                </div>
                <h2 className="font-serif text-xl font-semibold text-charcoal mt-0.5">
                  {passphraseModalMode === 'setup'
                    ? 'Create Vault Passphrase'
                    : passphraseModalMode === 'change'
                      ? 'Change Vault Passphrase'
                      : 'Unlock Defusion Vault'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPassphraseModalMode(null)}
                className="p-1 text-stone-400 hover:text-charcoal rounded-mac cursor-pointer"
                aria-label="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-stone-600 leading-relaxed">
              {passphraseModalMode === 'setup'
                ? 'Choose a personal passphrase to protect your private decryption key. You never need it to dump or seal thoughts—only when you choose to unlock and read your vault. Because your reflections are end-to-end encrypted, this passphrase cannot be recovered if forgotten.'
                : passphraseModalMode === 'change'
                  ? 'Update your vault passphrase. All existing sealed thoughts will seamlessly carry over to your new passphrase.'
                  : 'Enter your passphrase to temporarily unlock and read your sealed thoughts. The vault automatically re-locks after 5 minutes of inactivity.'}
            </p>

            <form onSubmit={handlePassphraseSubmit} className="space-y-3">
              {passphraseModalMode === 'change' && (
                <div>
                  <label className="block text-[11px] font-sans font-medium text-stone-700 mb-1">
                    Current Passphrase
                  </label>
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    value={currentPassInput}
                    onChange={(e) => setCurrentPassInput(e.target.value)}
                    autoFocus
                    required
                    className="w-full px-3 py-2 rounded-mac text-xs bg-white border border-stone-300 focus:outline-none focus:ring-1 focus:ring-charcoal"
                    placeholder="Enter current passphrase…"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-sans font-medium text-stone-700 mb-1">
                  {passphraseModalMode === 'change' ? 'New Passphrase' : 'Vault Passphrase'}
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    value={passInput}
                    onChange={(e) => setPassInput(e.target.value)}
                    autoFocus={passphraseModalMode !== 'change'}
                    required
                    className="w-full pl-3 pr-9 py-2 rounded-mac text-xs bg-white border border-stone-300 focus:outline-none focus:ring-1 focus:ring-charcoal"
                    placeholder={
                      passphraseModalMode === 'unlock'
                        ? 'Enter passphrase to unlock…'
                        : 'At least 4 characters…'
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase((prev) => !prev)}
                    className="absolute right-2.5 text-stone-500 hover:text-charcoal cursor-pointer p-1 rounded"
                    aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
                  >
                    {showPassphrase ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {(passphraseModalMode === 'setup' || passphraseModalMode === 'change') && (
                <div>
                  <label className="block text-[11px] font-sans font-medium text-stone-700 mb-1">
                    Confirm Passphrase
                  </label>
                  <input
                    type={showPassphrase ? 'text' : 'password'}
                    value={confirmPassInput}
                    onChange={(e) => setConfirmPassInput(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-mac text-xs bg-white border border-stone-300 focus:outline-none focus:ring-1 focus:ring-charcoal"
                    placeholder="Re-enter passphrase…"
                  />
                </div>
              )}

              {passError && (
                <p className="text-xs text-crimson font-medium bg-crimson/5 border border-crimson/20 rounded-mac px-3 py-2">
                  {passError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPassphraseModalMode(null)}
                  className="px-3 py-1.5 rounded-mac text-xs font-sans text-stone-600 hover:bg-stone-200/60 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingKey}
                  className="px-4 py-1.5 rounded-mac text-xs font-sans font-semibold bg-charcoal text-[#FBFBF9] hover:bg-stone-800 disabled:opacity-50 cursor-pointer"
                >
                  {isProcessingKey
                    ? 'Unlocking…'
                    : passphraseModalMode === 'setup'
                      ? 'Set Passphrase & Unlock'
                      : passphraseModalMode === 'change'
                        ? 'Save Passphrase'
                        : 'Unlock Vault'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
