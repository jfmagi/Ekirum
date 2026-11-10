import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { processAvatarImage } from '../../lib/avatarHelper';
import { MAX_LENGTHS } from '../../lib/validation';
import { tokenizeTaskInput, getTokenClasses } from '../../lib/taskSyntax';
import {
  ShieldCheck,
  Camera,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Flag,
  Repeat,
  BookOpen,
  Wind,
  X,
} from 'lucide-react';

const INTRO_STEPS = 3; // Steps 0–2 are the introduction; step 3 is name & avatar (first run only)
const QUICK_ADD_EXAMPLE = 'Finish chapter draft tomorrow 4pm p1 @Writing';

/* ---------- Step previews (built from real app styling) ---------- */

const ProgressionPreview: React.FC = () => (
  <div className="bg-stone-50 border border-stone-200/80 rounded-card p-4 space-y-3" aria-hidden="true">
    <div className="flex items-center justify-between gap-3 bg-white border border-stone-200/80 rounded-mac px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-4 h-4 rounded-full border-2 border-stone-300 flex-shrink-0" />
        <span className="text-xs text-charcoal font-sans truncate">Finish chapter draft</span>
      </div>
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-crimson text-white text-[10px] font-mono font-medium tracking-wider flex-shrink-0">
        <Flag size={9} /> P1
      </span>
    </div>
    <div className="flex items-center justify-center text-[11px] font-mono text-gold font-semibold">
      +20 XP
    </div>
    <div className="bg-white border border-stone-200/80 rounded-mac px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between text-xs font-sans">
        <span className="font-serif font-semibold text-charcoal">Writing</span>
        <span className="text-[11px] font-mono text-stone-500">Lv 3</span>
      </div>
      <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
        <div className="h-full w-[62%] bg-gold rounded-full" />
      </div>
    </div>
  </div>
);

const QuickAddPreview: React.FC = () => {
  const tokens = useMemo(() => tokenizeTaskInput(QUICK_ADD_EXAMPLE), []);
  return (
    <div className="bg-stone-50 border border-stone-200/80 rounded-card p-4 space-y-3" aria-hidden="true">
      <div className="bg-white border border-stone-200 rounded-mac px-3 py-2.5 font-sans text-xs sm:text-sm leading-relaxed break-words">
        {tokens.map((t, i) => (
          <span key={i} className={getTokenClasses(t)}>
            {t.text}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px] font-sans text-stone-600">
        <div><span className="text-amber-800 font-medium">tomorrow 4pm</span><br />due date</div>
        <div><span className="text-crimson font-medium">p1</span><br />priority</div>
        <div><span className="text-indigo-700 font-medium">@Writing</span><br />project</div>
      </div>
    </div>
  );
};

const SpacesPreview: React.FC = () => {
  const rows = [
    { icon: <Repeat size={14} />, title: 'Habits', text: 'Recurring rituals with streaks.' },
    { icon: <BookOpen size={14} />, title: 'Library', text: 'Books and films, from queue to finished.' },
    { icon: <Wind size={14} />, title: 'Defusion chamber', text: 'Write a thought down, then seal it or burn it.' },
  ];
  return (
    <div className="space-y-2" aria-hidden="true">
      {rows.map((r) => (
        <div key={r.title} className="flex items-start gap-3 bg-stone-50 border border-stone-200/80 rounded-mac px-3 py-2.5">
          <span className="mt-0.5 text-stone-500 flex-shrink-0">{r.icon}</span>
          <div className="min-w-0">
            <div className="font-serif text-sm font-semibold text-charcoal">{r.title}</div>
            <div className="text-xs text-stone-600 font-sans">{r.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ---------- Modal ---------- */

export const OnboardingModal: React.FC = () => {
  const onboardingModalOpen = useEkirumStore((s) => s.onboardingModalOpen);
  const isReplay = useEkirumStore((s) => s.onboardingReplay);
  const completeOnboarding = useEkirumStore((s) => s.completeOnboarding);
  const setOnboardingModalOpen = useEkirumStore((s) => s.setOnboardingModalOpen);
  const user = useEkirumStore((s) => s.user);

  const [step, setStep] = useState(0);
  const [name, setName] = useState(user.name === 'Ekirum' ? '' : user.name);
  const [avatar, setAvatar] = useState<string | undefined>(user.avatar);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const totalSteps = isReplay ? INTRO_STEPS : INTRO_STEPS + 1;
  const isLastStep = step === totalSteps - 1;
  const isProfileStep = !isReplay && step === INTRO_STEPS;

  // Move focus to the step heading so screen readers announce each step
  useEffect(() => {
    if (!isProfileStep) headingRef.current?.focus();
  }, [step, isProfileStep]);

  // Esc closes only when replaying; first run must finish with a name
  useEffect(() => {
    if (!isReplay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOnboardingModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isReplay, setOnboardingModalOpen]);

  if (!onboardingModalOpen) return null;

  const goNext = () => {
    if (isLastStep) {
      if (isReplay) setOnboardingModalOpen(false);
      return;
    }
    setStep((s) => s + 1);
  };
  const goBack = () => setStep((s) => Math.max(0, s - 1));
  const skipToProfile = () => setStep(INTRO_STEPS);

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setAvatarError(null);
      const dataUrl = await processAvatarImage(file);
      setAvatar(dataUrl);
    } catch (err: any) {
      setAvatarError(err?.message || 'Failed to process avatar image');
      setTimeout(() => setAvatarError(null), 4000);
    } finally {
      e.target.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    setAvatar(undefined);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isProfileStep) {
      completeOnboarding(name, avatar);
    } else {
      goNext();
    }
  };

  const displayMonogram = (name.trim() || 'Ekirum').slice(0, 2).toUpperCase();

  const introSteps = [
    {
      title: 'Welcome to Ekirum',
      body: 'Every project you create becomes a skill. Completing tasks earns XP for that skill, so your character grows with the work you actually do.',
      preview: <ProgressionPreview />,
    },
    {
      title: 'Add tasks in plain words',
      body: (
        <>
          Press <kbd className="px-1.5 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono text-[11px] text-charcoal">Q</kbd> and type. Dates, times, priorities, and projects are picked up as you write. P1 tasks are worth the most XP.
        </>
      ),
      preview: <QuickAddPreview />,
    },
    {
      title: 'Beyond tasks',
      body: 'Three more spaces in the sidebar. Each one feeds your character in its own way.',
      preview: <SpacesPreview />,
    },
  ];

  const current = !isProfileStep ? introSteps[step] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 pb-[env(safe-area-inset-bottom,0px)] animate-in fade-in duration-200 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="relative w-full max-w-lg bg-white rounded-t-sheet sm:rounded-sheet border border-stone-200/90 shadow-modal overflow-y-auto max-h-[92dvh] p-5 sm:p-8 animate-in zoom-in-95 duration-200">
        {isReplay && (
          <button
            type="button"
            onClick={() => setOnboardingModalOpen(false)}
            className="absolute top-3 right-3 min-w-[36px] min-h-[36px] flex items-center justify-center text-stone-400 hover:text-charcoal hover:bg-stone-100 rounded-mac transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
            aria-label="Close introduction"
          >
            <X size={16} />
          </button>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <p className="sr-only" aria-live="polite">
            Step {step + 1} of {totalSteps}
          </p>

          {current && (
            <div key={step} className="space-y-5 animate-intro-step">
              <div className="text-center space-y-2">
                <h2
                  id="onboarding-title"
                  ref={headingRef}
                  tabIndex={-1}
                  className="font-serif text-2xl sm:text-3xl font-medium text-charcoal tracking-tight focus:outline-none"
                >
                  {current.title}
                </h2>
                <p className="text-xs sm:text-sm text-stone-600 font-sans leading-relaxed max-w-sm mx-auto">
                  {current.body}
                </p>
              </div>
              {current.preview}
            </div>
          )}

          {isProfileStep && (
            <div key="profile" className="space-y-6 animate-intro-step">
              <div className="text-center space-y-2">
                <h2 id="onboarding-title" className="font-serif text-2xl sm:text-3xl font-medium text-charcoal tracking-tight">
                  Your data stays here
                </h2>
              </div>

              <div className="bg-stone-50 border border-stone-200/80 rounded-card p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-serif font-semibold text-charcoal">
                  <ShieldCheck size={16} className="text-stone-700" />
                  <span>100% Private &amp; Stored on Your Device</span>
                </div>
                <p className="text-xs text-stone-600 font-sans leading-relaxed">
                  Everything you create lives exclusively inside your browser's local database. No tracking, no remote servers, and no accounts required.
                </p>
                <p className="text-xs text-stone-600 font-sans leading-relaxed">
                  <strong>IMPORTANT:</strong> Clearing your browser history or cache will wipe local data. You can download a 1-click JSON backup or sync with a local file at any time.
                </p>
              </div>

              <div className="space-y-4 border-t border-stone-100 pt-5">
                <label htmlFor="character-name-input" className="font-serif text-sm font-semibold text-charcoal block">
                  Name Your Character
                </label>

                <div className="flex items-center gap-4">
                  <div className="relative group flex-shrink-0">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handleAvatarFileSelect}
                      className="hidden"
                    />

                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="relative w-16 h-16 rounded-full ring-2 ring-stone-200/90 shadow-2xs overflow-hidden cursor-pointer transition-all hover:ring-stone-400 bg-stone-100 flex items-center justify-center focus-visible:ring-stone-500 focus-visible:outline-none"
                      title="Click to upload avatar"
                      aria-label="Upload avatar"
                    >
                      {avatar ? (
                        <img
                          src={avatar}
                          alt="Avatar preview"
                          className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-200"
                        />
                      ) : (
                        <div className="w-full h-full bg-stone-900 text-white font-serif text-lg flex items-center justify-center">
                          {displayMonogram}
                        </div>
                      )}

                      <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-150">
                        <Camera size={16} />
                        <span className="text-[11px] font-sans font-medium mt-0.5">Upload</span>
                      </div>
                    </button>

                    {avatar && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="absolute -bottom-1 -right-1 p-1 bg-white hover:bg-stone-100 border border-stone-200 rounded-full text-stone-500 hover:text-crimson shadow-xs transition-colors cursor-pointer"
                        title="Remove avatar"
                        aria-label="Remove avatar"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <input
                      id="character-name-input"
                      type="text"
                      maxLength={MAX_LENGTHS.USER_NAME}
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Character name (e.g. Aurelius)..."
                      className="w-full text-base sm:text-sm font-sans bg-white border border-stone-300 rounded-mac px-3 py-2.5 sm:py-2 text-charcoal placeholder-stone-400 focus:outline-none focus:border-crimson"
                    />
                    <p className="text-[11px] text-stone-500 mt-1 font-sans">
                      Click the circle on the left to upload an avatar picture.
                    </p>
                  </div>
                </div>

                {avatarError && (
                  <p className="text-xs text-crimson font-sans">{avatarError}</p>
                )}
              </div>
            </div>
          )}

          {/* Step dots */}
          <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === step ? 'w-4 bg-crimson' : 'w-1.5 bg-stone-300'
                }`}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-stone-600 hover:text-charcoal bg-white hover:bg-stone-50 border border-stone-200 rounded-mac transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
                >
                  <ArrowLeft size={14} />
                  <span>Back</span>
                </button>
              )}
              <button
                type="submit"
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 text-sm font-medium text-white bg-crimson hover:bg-crimson-hover rounded-mac shadow-xs transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
              >
                <span>{isProfileStep ? 'Enter Ekirum' : isLastStep ? 'Done' : 'Next'}</span>
                {!(isReplay && isLastStep) && <ArrowRight size={14} />}
              </button>
            </div>

            <div className="text-center min-h-[20px]">
              {!isReplay && step < INTRO_STEPS && (
                <button
                  type="button"
                  onClick={skipToProfile}
                  className="text-[11px] text-stone-500 hover:text-charcoal font-sans underline-offset-2 hover:underline cursor-pointer"
                >
                  Skip intro
                </button>
              )}
              {isProfileStep && (
                <p className="text-[11px] text-stone-500 font-sans">
                  You can change your character name, avatar, and backups at any time.
                </p>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
