import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Lock,
  Unlock,
  KeyRound,
  Clock,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { DefusionVaultConfig } from '../../types';
import {
  initializeDefusionVault,
  configureVaultPassphrase,
  unlockDefusionVault,
} from '../../lib/defusionCrypto';

const AUTO_LOCK_MS = 5 * 60 * 1000; // 5 minutes of inactivity

export type VaultModalMode = 'unlock' | 'setup' | 'change' | null;

export interface VaultSessionHandle {
  unlockedPrivateKey: CryptoKey | null;
  isUnlocked: boolean;
  lockVault: () => void;
  openUnlockModal: () => void;
  openChangePassphraseModal: () => void;
  modalProps: VaultPassphraseModalProps;
}

export interface VaultPassphraseModalProps {
  mode: VaultModalMode;
  currentPassInput: string;
  passInput: string;
  confirmPassInput: string;
  showPassphrase: boolean;
  passError: string | null;
  isProcessingKey: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onChangeCurrentPass: (val: string) => void;
  onChangePass: (val: string) => void;
  onChangeConfirmPass: (val: string) => void;
  onToggleShowPass: () => void;
}

/**
 * Shared in-memory private key session hook for encrypted spaces (Defusion & Gratitude).
 * Handles 5-minute inactivity auto-lock, unmount wipe, and passphrase setup/unlock/rotation.
 */
export function useVaultSession(
  defusionVault: DefusionVaultConfig | null,
  saveDefusionVaultConfig: (vault: DefusionVaultConfig) => Promise<void>,
  onLock?: () => void
): VaultSessionHandle {
  const [unlockedPrivateKey, setUnlockedPrivateKey] = useState<CryptoKey | null>(null);
  const [passphraseModalMode, setPassphraseModalMode] = useState<VaultModalMode>(null);
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [isProcessingKey, setIsProcessingKey] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const onLockRef = useRef(onLock);
  onLockRef.current = onLock;

  const lockVault = useCallback(() => {
    setUnlockedPrivateKey(null);
    setPassphraseModalMode(null);
    setCurrentPassInput('');
    setPassInput('');
    setConfirmPassInput('');
    setPassError(null);
    onLockRef.current?.();
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

  // Wipe key immediately when leaving the tab (component unmount)
  useEffect(() => {
    return () => {
      setUnlockedPrivateKey(null);
    };
  }, []);

  const resetInputs = () => {
    setPassError(null);
    setCurrentPassInput('');
    setPassInput('');
    setConfirmPassInput('');
    setShowPassphrase(false);
  };

  const openUnlockModal = useCallback(() => {
    resetInputs();
    if (!defusionVault || !defusionVault.passphraseConfigured) {
      setPassphraseModalMode('setup');
    } else {
      setPassphraseModalMode('unlock');
    }
  }, [defusionVault]);

  const openChangePassphraseModal = useCallback(() => {
    resetInputs();
    setPassphraseModalMode('change');
  }, []);

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
        if (!defusionVault) {
          const freshVault = await initializeDefusionVault(passInput);
          await saveDefusionVaultConfig(freshVault);
          const key = await unlockDefusionVault(freshVault, passInput);
          setUnlockedPrivateKey(key);
        } else {
          const { updatedVault, privateKey } = await configureVaultPassphrase(defusionVault, passInput);
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

  return {
    unlockedPrivateKey,
    isUnlocked: Boolean(unlockedPrivateKey),
    lockVault,
    openUnlockModal,
    openChangePassphraseModal,
    modalProps: {
      mode: passphraseModalMode,
      currentPassInput,
      passInput,
      confirmPassInput,
      showPassphrase,
      passError,
      isProcessingKey,
      onClose: () => setPassphraseModalMode(null),
      onSubmit: handlePassphraseSubmit,
      onChangeCurrentPass: setCurrentPassInput,
      onChangePass: setPassInput,
      onChangeConfirmPass: setConfirmPassInput,
      onToggleShowPass: () => setShowPassphrase((prev) => !prev),
    },
  };
}

export const VaultControls: React.FC<{
  isUnlocked: boolean;
  onOpenUnlock: () => void;
  onOpenChangePassphrase: () => void;
  onLock: () => void;
}> = ({ isUnlocked, onOpenUnlock, onOpenChangePassphrase, onLock }) => (
  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
    {isUnlocked ? (
      <>
        <button
          type="button"
          onClick={onOpenChangePassphrase}
          className="px-2.5 py-1.5 rounded-mac text-[11px] font-sans font-medium text-stone-600 hover:text-charcoal bg-stone-100 hover:bg-stone-200/70 border border-stone-200/80 transition-colors flex items-center gap-1.5 cursor-pointer"
          title="Change vault passphrase"
        >
          <KeyRound size={12} />
          <span>Passphrase</span>
        </button>
        <button
          type="button"
          onClick={onLock}
          className="px-3 py-1.5 rounded-mac text-xs font-sans font-semibold text-amber-900 bg-amber-100/90 hover:bg-amber-200/80 border border-amber-300/80 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
        >
          <Lock size={13} />
          <span>Lock Vault</span>
        </button>
      </>
    ) : (
      <button
        type="button"
        onClick={onOpenUnlock}
        className="px-3 py-1.5 rounded-mac text-xs font-sans font-medium text-stone-700 hover:text-charcoal bg-white hover:bg-stone-100/90 border border-stone-200/90 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
      >
        <Unlock size={13} className="text-stone-500" />
        <span>Unlock Vault</span>
      </button>
    )}
  </div>
);

export const VaultUnlockedBanner: React.FC<{ onLock: () => void }> = ({ onLock }) => (
  <div className="bg-stone-100/90 border border-stone-200/90 rounded-mac px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-stone-700">
    <div className="flex items-center gap-2">
      <Clock size={13} className="text-stone-500 flex-shrink-0" />
      <span>
        Vault is unlocked for reading. Re-locks after 5 minutes of inactivity or when leaving this view.
      </span>
    </div>
    <button
      type="button"
      onClick={onLock}
      className="text-xs font-medium text-stone-700 underline hover:text-charcoal flex-shrink-0 cursor-pointer"
    >
      Lock now
    </button>
  </div>
);

export const VaultPassphraseModal: React.FC<VaultPassphraseModalProps> = ({
  mode,
  currentPassInput,
  passInput,
  confirmPassInput,
  showPassphrase,
  passError,
  isProcessingKey,
  onClose,
  onSubmit,
  onChangeCurrentPass,
  onChangePass,
  onChangeConfirmPass,
  onToggleShowPass,
}) => {
  if (!mode) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
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
                {mode === 'setup'
                  ? 'First-Time Vault Key Setup'
                  : mode === 'change'
                    ? 'Update Vault Passphrase'
                    : 'Encrypted Vault Access'}
              </span>
            </div>
            <h2 className="font-serif text-xl font-semibold text-charcoal mt-0.5">
              {mode === 'setup'
                ? 'Create Vault Passphrase'
                : mode === 'change'
                  ? 'Change Vault Passphrase'
                  : 'Unlock Private Vault'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-charcoal rounded-mac cursor-pointer"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-xs text-stone-600 leading-relaxed">
          {mode === 'setup'
            ? 'Choose a personal passphrase to protect your private decryption key across Defusion and Gratitude. You never need it to seal entries—only when unlocking to read. This passphrase cannot be recovered if forgotten.'
            : mode === 'change'
              ? 'Update your shared vault passphrase. All existing sealed entries will seamlessly carry over to your new passphrase.'
              : 'Enter your passphrase to temporarily unlock and read your sealed entries. The vault automatically re-locks after 5 minutes of inactivity.'}
        </p>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === 'change' && (
            <div>
              <label className="block text-[11px] font-sans font-medium text-stone-700 mb-1">
                Current Passphrase
              </label>
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={currentPassInput}
                onChange={(e) => onChangeCurrentPass(e.target.value)}
                autoFocus
                required
                className="w-full px-3 py-2 rounded-mac text-xs bg-white border border-stone-300 focus:outline-none focus:ring-1 focus:ring-charcoal"
                placeholder="Enter current passphrase…"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] font-sans font-medium text-stone-700 mb-1">
              {mode === 'change' ? 'New Passphrase' : 'Vault Passphrase'}
            </label>
            <div className="relative flex items-center">
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={passInput}
                onChange={(e) => onChangePass(e.target.value)}
                autoFocus={mode !== 'change'}
                required
                className="w-full pl-3 pr-9 py-2 rounded-mac text-xs bg-white border border-stone-300 focus:outline-none focus:ring-1 focus:ring-charcoal"
                placeholder={
                  mode === 'unlock'
                    ? 'Enter passphrase to unlock…'
                    : 'At least 4 characters…'
                }
              />
              <button
                type="button"
                onClick={onToggleShowPass}
                className="absolute right-2.5 text-stone-500 hover:text-charcoal cursor-pointer p-1 rounded"
                aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
              >
                {showPassphrase ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {(mode === 'setup' || mode === 'change') && (
            <div>
              <label className="block text-[11px] font-sans font-medium text-stone-700 mb-1">
                Confirm Passphrase
              </label>
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={confirmPassInput}
                onChange={(e) => onChangeConfirmPass(e.target.value)}
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
              onClick={onClose}
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
                : mode === 'setup'
                  ? 'Set Passphrase & Unlock'
                  : mode === 'change'
                    ? 'Save Passphrase'
                    : 'Unlock Vault'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
