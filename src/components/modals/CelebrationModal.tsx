import React, { useEffect } from 'react';
import { useEkirumStore } from '../../store/useEkirumStore';
import { Sparkles, Award, X } from 'lucide-react';

export const CelebrationModal: React.FC = () => {
  const celebration = useEkirumStore((s) => s.celebration);
  const dismissCelebration = useEkirumStore((s) => s.dismissCelebration);

  useEffect(() => {
    if (!celebration) return;

    // Auto-dismiss after 6 seconds if not manually clicked
    const timer = setTimeout(() => {
      dismissCelebration();
    }, 6000);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismissCelebration();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [celebration, dismissCelebration]);

  if (!celebration || !celebration.show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-300 motion-reduce:animate-none"
      onClick={dismissCelebration}
    >
      <div
        className="relative w-full max-w-sm bg-white rounded-sheet border-2 border-gold/40 shadow-spotlight p-8 text-center overflow-hidden animate-in zoom-in-95 duration-300 motion-reduce:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Spotlight sweep beam effect */}
        <div className="absolute -inset-full bg-gradient-to-r from-transparent via-gold/10 to-transparent rotate-45 transform pointer-events-none animate-pulse motion-reduce:animate-none" />

        {/* Dismiss icon */}
        <button
          onClick={dismissCelebration}
          className="absolute top-2.5 right-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 text-stone-500 hover:text-stone-800 rounded-mac transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none cursor-pointer"
          aria-label="Close celebration notification"
        >
          <X size={16} />
        </button>

        {/* Medal / Gilded Crest */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gold-subtle border-2 border-gold/60 flex items-center justify-center text-gold shadow-md">
          <Award size={30} strokeWidth={1.5} />
        </div>

        {/* Title & Rank */}
        <div className="space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-gold font-semibold">
            {celebration.type === 'capReached'
              ? 'Mindful Horizon'
              : celebration.type === 'achievement'
              ? 'Achievement Unlocked'
              : 'Advancement Unlocked'}
          </span>
          <h3 className="font-serif text-2xl font-medium text-charcoal">
            {celebration.title}
          </h3>
          <p className="text-xs text-stone-500 font-sans mt-2">
            {celebration.subtitle}
          </p>
        </div>

        {/* XP bonus pill */}
        {celebration.xpEarned !== undefined && (
          <div className="mt-5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-100 text-stone-700 border border-stone-200 text-xs font-mono">
            <Sparkles size={12} className="text-gold" />
            <span>
              {celebration.type === 'capReached'
                ? 'Daily Cap Complete · 500/500 XP'
                : `+${celebration.xpEarned} XP Awarded`}
            </span>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-stone-100">
          <button
            onClick={dismissCelebration}
            className="w-full py-2 px-4 text-xs font-medium text-white bg-charcoal hover:bg-stone-800 rounded-mac transition-colors shadow-xs"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
