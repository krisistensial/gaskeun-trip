/**
 * Zero-dependency multisensory feedback engine for GASKEUN!
 * - Haptics via `navigator.vibrate` (Android Chrome/PWA, safe no-op on iOS/desktop).
 * - Soft glassy UI tones synthesized via Web Audio API (no external audio assets).
 * - Preferences stored locally per device in `localStorage`.
 */

export type FeedbackKind = 'tap' | 'toggle' | 'success' | 'warning';

export interface FeedbackPreferences {
  hapticsEnabled: boolean;
  soundEnabled: boolean;
}

export const HAPTICS_STORAGE_KEY = 'gaskeun_haptics_enabled';
export const SOUND_STORAGE_KEY = 'gaskeun_sound_enabled';

export const HAPTIC_PATTERNS: Record<FeedbackKind, number | number[]> = {
  tap: 8,
  toggle: 12,
  success: [10, 35, 14],
  warning: [24, 30, 24],
};

interface AudioWindow extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

let sharedAudioCtx: AudioContext | null = null;

function safeReadStorage(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota / private-mode restrictions
  }
}

export function getFeedbackPreferences(): FeedbackPreferences {
  const rawHaptics = safeReadStorage(HAPTICS_STORAGE_KEY);
  const rawSound = safeReadStorage(SOUND_STORAGE_KEY);

  return {
    // Default ON unless explicitly disabled
    hapticsEnabled: rawHaptics !== 'false',
    // Default OFF unless explicitly enabled
    soundEnabled: rawSound === 'true',
  };
}

export function setHapticsEnabled(enabled: boolean): FeedbackPreferences {
  safeWriteStorage(HAPTICS_STORAGE_KEY, String(Boolean(enabled)));
  return getFeedbackPreferences();
}

export function setSoundEnabled(enabled: boolean): FeedbackPreferences {
  safeWriteStorage(SOUND_STORAGE_KEY, String(Boolean(enabled)));
  return getFeedbackPreferences();
}

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const audioWin = window as AudioWindow;
  const Ctor = audioWin.AudioContext ?? audioWin.webkitAudioContext;
  if (typeof Ctor !== 'function') return null;

  try {
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new Ctor();
    }
    if (sharedAudioCtx.state === 'suspended' && typeof sharedAudioCtx.resume === 'function') {
      void sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

function scheduleTone(
  ctx: AudioContext,
  options: {
    type: OscillatorType;
    startFreq: number;
    endFreq: number;
    gainPeak: number;
    durationSec: number;
    delaySec?: number;
  },
): void {
  const now = ctx.currentTime + (options.delaySec ?? 0);
  const end = now + options.durationSec;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = options.type;
  osc.frequency.setValueAtTime(options.startFreq, now);
  if (options.endFreq !== options.startFreq) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFreq), end);
  }

  // Smooth attack + exponential release prevents audible speaker clicks
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(options.gainPeak, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(end + 0.005);
}

/**
 * Triggers a subtle device haptic pulse when supported and enabled.
 * Returns `true` if `navigator.vibrate` was invoked.
 */
export function triggerHaptic(kind: FeedbackKind, force = false): boolean {
  if (!force && !getFeedbackPreferences().hapticsEnabled) return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  try {
    navigator.vibrate(HAPTIC_PATTERNS[kind]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Synthesizes an ultra-soft glassy tone using Web Audio API when enabled.
 * Returns `true` if a tone was scheduled.
 */
export function playGlassSound(kind: FeedbackKind, force = false): boolean {
  if (!force && !getFeedbackPreferences().soundEnabled) return false;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  try {
    switch (kind) {
      case 'tap':
        scheduleTone(ctx, {
          type: 'sine',
          startFreq: 680,
          endFreq: 540,
          gainPeak: 0.04,
          durationSec: 0.024,
        });
        break;
      case 'toggle':
        scheduleTone(ctx, {
          type: 'triangle',
          startFreq: 520,
          endFreq: 760,
          gainPeak: 0.045,
          durationSec: 0.03,
        });
        break;
      case 'success':
        scheduleTone(ctx, {
          type: 'sine',
          startFreq: 587.33,
          endFreq: 620,
          gainPeak: 0.048,
          durationSec: 0.032,
          delaySec: 0,
        });
        scheduleTone(ctx, {
          type: 'sine',
          startFreq: 880,
          endFreq: 920,
          gainPeak: 0.052,
          durationSec: 0.042,
          delaySec: 0.036,
        });
        break;
      case 'warning':
        scheduleTone(ctx, {
          type: 'triangle',
          startFreq: 290,
          endFreq: 235,
          gainPeak: 0.055,
          durationSec: 0.034,
          delaySec: 0,
        });
        scheduleTone(ctx, {
          type: 'triangle',
          startFreq: 235,
          endFreq: 190,
          gainPeak: 0.055,
          durationSec: 0.04,
          delaySec: 0.048,
        });
        break;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Triggers paired haptic + optional glassy audio feedback for a UI interaction.
 */
export function triggerFeedback(
  kind: FeedbackKind,
  options?: { forceHaptic?: boolean; forceSound?: boolean },
): void {
  triggerHaptic(kind, Boolean(options?.forceHaptic));
  playGlassSound(kind, Boolean(options?.forceSound));
}

/**
 * Resets cached AudioContext singleton (for isolated unit tests).
 */
export function resetFeedbackEngineForTests(): void {
  sharedAudioCtx = null;
}
