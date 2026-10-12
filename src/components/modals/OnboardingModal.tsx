import React, { useState, useRef } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { processAvatarImage } from '../../lib/avatarHelper';
import { MAX_LENGTHS } from '../../lib/validation';
import {
  ShieldCheck,
  Camera,
  Trash2,
  ArrowRight,
} from 'lucide-react';

export const OnboardingModal: React.FC = () => {
  const {
    onboardingModalOpen,
    completeOnboarding,
    user,
  } = useEkirumStore();

  const [name, setName] = useState(user.name === 'Ekirum' ? '' : user.name);
  const [avatar, setAvatar] = useState<string | undefined>(user.avatar);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!onboardingModalOpen) return null;

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
    completeOnboarding(name, avatar);
  };

  const displayMonogram = (name.trim() || 'Ekirum').slice(0, 2).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-xs p-0 sm:p-4 pb-[env(safe-area-inset-bottom,0px)] animate-in fade-in duration-200 select-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="relative w-full max-w-lg bg-white rounded-t-sheet sm:rounded-sheet border border-stone-200/90 shadow-modal overflow-y-auto max-h-[92dvh] p-5 sm:p-8 animate-in zoom-in-95 duration-200">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-stone-100 border border-stone-200/80 text-charcoal mb-1 shadow-2xs">
              <span className="font-serif text-xl font-semibold">E</span>
            </div>
            <h2 id="onboarding-title" className="font-serif text-2xl sm:text-3xl font-medium text-charcoal tracking-tight">
              Welcome to Ekirum
            </h2>
            <p className="text-xs sm:text-sm text-stone-600 font-sans leading-relaxed max-w-sm mx-auto">
              A simple, gamified space for your tasks and skills.
            </p>
          </div>

          <div className="bg-stone-50 border border-stone-200/80 rounded-card p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-serif font-semibold text-charcoal">
              <ShieldCheck size={16} className="text-stone-700" />
              <span>100% Private & Stored on Your Device</span>
            </div>
            <p className="text-xs text-stone-600 font-sans leading-relaxed">
              Everything you create lives exclusively inside your browser's local database. No tracking, no remote servers, and no accounts required.
            </p>
            <p className="text-xs text-stone-600 font-sans leading-relaxed">
              <strong>IMPORTANT:</strong> Clearing your browser history or cache will wipe local data. You can download a 1-click JSON backup or sync with a local file at any time.
            </p>
          </div>

          <div className="space-y-4 border-t border-stone-100 pt-5">
            <div className="flex items-center justify-between">
              <label htmlFor="character-name-input" className="font-serif text-sm font-semibold text-charcoal">
                Name Your Character
              </label>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative group flex-shrink-0">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleAvatarFileSelect}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="relative w-16 h-16 rounded-full ring-2 ring-stone-200/90 shadow-2xs overflow-hidden cursor-pointer transition-all hover:ring-stone-400 bg-stone-100 flex items-center justify-center"
                  title="Click to upload avatar"
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
                </div>

                {avatar && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    className="absolute -bottom-1 -right-1 p-1 bg-white hover:bg-stone-100 border border-stone-200 rounded-full text-stone-500 hover:text-crimson shadow-xs transition-colors cursor-pointer"
                    title="Remove avatar"
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

          <div className="pt-2 space-y-2 text-center">
            <button
              type="submit"
              className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 text-sm font-medium text-white bg-crimson hover:bg-crimson-hover rounded-mac shadow-xs transition-colors"
            >
              <span>Enter Ekirum</span>
              <ArrowRight size={14} />
            </button>
            <p className="text-[11px] text-stone-500 font-sans">
              You can change your character name, avatar, and backups at any time.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
