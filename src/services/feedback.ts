/**
 * Zero-dependency multisensory feedback engine for GASKEUN!
 * - Haptics via `navigator.vibrate` (Android Chrome/PWA, safe no-op on iOS/desktop).
 *   Pulse durations tuned above Android ERM/LRA motor spin-up threshold (>= 9ms).
 * - Audible, crisp glassy & mechanical rotary UI tones synthesized via Web Audio API
 *   (no external audio files; auto-unlocks suspended AudioContext on first touch/click).
 * - Preferences stored locally per device in `localStorage`.
 */

export type FeedbackKind = 'tap' | 'toggle' | 'success' | 'warning' | 'tick' | 'settle';

export interface FeedbackPreferences {
  hapticsEnabled: boolean;
  soundEnabled: boolean;
}

export const HAPTICS_STORAGE_KEY = 'gaskeun_haptics_enabled';
export const SOUND_STORAGE_KEY = 'gaskeun_sound_enabled';

export const HAPTIC_PATTERNS: Record<FeedbackKind, number | number[]> = {
  tap: 10,
  toggle: 14,
  success: [12, 36, 18],
  warning: [26, 32, 26],
  tick: 9,
  settle: 18,
};

interface AudioWindow extends Window {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

let sharedAudioCtx: AudioContext | null = null;
let cachedClickNoiseBuffer: AudioBuffer | null = null;
let globalUnlockInstalled = false;

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
      cachedClickNoiseBuffer = null;
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Installs a lightweight one-time gesture listener so mobile Safari/Chrome
 * unlocks the Web Audio pipeline on the user's very first tap or drag.
 */
function ensureGlobalAudioUnlock(): void {
  if (globalUnlockInstalled || typeof document === 'undefined') return;
  globalUnlockInstalled = true;

  const unlock = () => {
    if (!getFeedbackPreferences().soundEnabled) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      void ctx.resume().catch(() => {});
    }
  };

  document.addEventListener('pointerdown', unlock, { passive: true, capture: true });
  document.addEventListener('touchstart', unlock, { passive: true, capture: true });
}

function getClickNoiseBuffer(ctx: AudioContext): AudioBuffer | null {
  if (
    typeof ctx.createBuffer !== 'function' ||
    typeof ctx.createBufferSource !== 'function' ||
    typeof ctx.createBiquadFilter !== 'function'
  ) {
    return null;
  }
  if (cachedClickNoiseBuffer) return cachedClickNoiseBuffer;

  try {
    const sampleRate = ctx.sampleRate || 44100;
    const length = Math.max(64, Math.floor(sampleRate * 0.014)); // 14ms crisp click impulse
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      const env = Math.pow(1 - i / length, 2.4);
      data[i] = (Math.random() * 2 - 1) * env;
    }
    cachedClickNoiseBuffer = buffer;
    return buffer;
  } catch {
    return null;
  }
}

function scheduleClickNoise(
  ctx: AudioContext,
  options: {
    centerFreq: number;
    q: number;
    gainPeak: number;
    durationSec: number;
    delaySec?: number;
  },
): void {
  const buffer = getClickNoiseBuffer(ctx);
  if (!buffer) return;

  const now = ctx.currentTime + (options.delaySec ?? 0);
  const end = now + options.durationSec;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(options.centerFreq, now);
  filter.Q.setValueAtTime(options.q, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(options.gainPeak, now + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  src.start(now);
  src.stop(end + 0.004);
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

  // Smooth fast attack + exponential decay prevents speaker pops while staying loud & crisp on phones
  const attackSec = Math.min(0.004, options.durationSec * 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(options.gainPeak, now + attackSec);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(end + 0.006);
}

function renderSoundForKind(ctx: AudioContext, kind: FeedbackKind): void {
  switch (kind) {
    case 'tap':
      // Clean glassy UI click audible on phone speakers
      scheduleClickNoise(ctx, {
        centerFreq: 2400,
        q: 2.4,
        gainPeak: 0.18,
        durationSec: 0.012,
      });
      scheduleTone(ctx, {
        type: 'sine',
        startFreq: 860,
        endFreq: 560,
        gainPeak: 0.18,
        durationSec: 0.032,
      });
      break;
    case 'toggle':
      // Crisp switch pop
      scheduleClickNoise(ctx, {
        centerFreq: 2200,
        q: 2.2,
        gainPeak: 0.2,
        durationSec: 0.012,
      });
      scheduleTone(ctx, {
        type: 'triangle',
        startFreq: 620,
        endFreq: 960,
        gainPeak: 0.2,
        durationSec: 0.038,
      });
      break;
    case 'success':
      // Soft two-note glassy chime (D5 -> A5)
      scheduleTone(ctx, {
        type: 'sine',
        startFreq: 587.33,
        endFreq: 620,
        gainPeak: 0.2,
        durationSec: 0.048,
        delaySec: 0,
      });
      scheduleTone(ctx, {
        type: 'sine',
        startFreq: 880,
        endFreq: 932,
        gainPeak: 0.22,
        durationSec: 0.068,
        delaySec: 0.045,
      });
      break;
    case 'warning':
      // Gentle double low knock
      scheduleTone(ctx, {
        type: 'triangle',
        startFreq: 310,
        endFreq: 240,
        gainPeak: 0.24,
        durationSec: 0.045,
        delaySec: 0,
      });
      scheduleTone(ctx, {
        type: 'triangle',
        startFreq: 245,
        endFreq: 190,
        gainPeak: 0.24,
        durationSec: 0.055,
        delaySec: 0.06,
      });
      break;
    case 'tick':
      // Authentic rotary picker / mechanical wheel notch ("trr-trr-trr")
      scheduleClickNoise(ctx, {
        centerFreq: 2900,
        q: 3.0,
        gainPeak: 0.28,
        durationSec: 0.011,
      });
      scheduleTone(ctx, {
        type: 'triangle',
        startFreq: 1650,
        endFreq: 480,
        gainPeak: 0.2,
        durationSec: 0.015,
      });
      break;
    case 'settle':
      // Unmistakable resonant landing click ("TEK!") when scroll momentum locks onto a card
      scheduleClickNoise(ctx, {
        centerFreq: 1950,
        q: 2.2,
        gainPeak: 0.3,
        durationSec: 0.014,
      });
      scheduleTone(ctx, {
        type: 'sine',
        startFreq: 680,
        endFreq: 210,
        gainPeak: 0.28,
        durationSec: 0.036,
      });
      scheduleTone(ctx, {
        type: 'triangle',
        startFreq: 1420,
        endFreq: 420,
        gainPeak: 0.16,
        durationSec: 0.014,
      });
      break;
  }
}

/**
 * Unlocks/resumes the shared Web AudioContext inside a direct user gesture
 * (e.g. `touchstart` / `pointerdown`) so subsequent scroll-driven rotary ticks
 * play immediately on mobile Chrome/Safari without autoplay blocks.
 */
export function primeFeedbackAudio(): void {
  ensureGlobalAudioUnlock();
  if (!getFeedbackPreferences().soundEnabled) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    void ctx.resume().catch(() => {});
  }
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
 * Synthesizes crisp glassy/mechanical UI sounds using Web Audio API when enabled.
 * If the AudioContext is suspended (common on mobile first tap), resumes first and
 * schedules the tone right when ready so the sound is never silently dropped.
 */
export function playGlassSound(kind: FeedbackKind, force = false): boolean {
  ensureGlobalAudioUnlock();
  if (!force && !getFeedbackPreferences().soundEnabled) return false;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      void ctx
        .resume()
        .then(() => {
          try {
            renderSoundForKind(ctx, kind);
          } catch {
            // ignore playback errors
          }
        })
        .catch(() => {});
      return true;
    }
    renderSoundForKind(ctx, kind);
    return true;
  } catch {
    return false;
  }
}

/**
 * Triggers paired haptic + optional glassy/mechanical audio feedback for a UI interaction.
 */
export function triggerFeedback(
  kind: FeedbackKind,
  options?: { forceHaptic?: boolean; forceSound?: boolean },
): void {
  triggerHaptic(kind, Boolean(options?.forceHaptic));
  playGlassSound(kind, Boolean(options?.forceSound));
}

/**
 * Plays a short rotary-wheel demo ("trr-trr-TEK!") when the user enables UI Sounds.
 */
export function playRotarySoundDemo(): void {
  playGlassSound('tick', true);
  if (typeof window !== 'undefined') {
    window.setTimeout(() => playGlassSound('tick', true), 55);
    window.setTimeout(() => playGlassSound('settle', true), 125);
  }
}

/**
 * Resets cached AudioContext singleton (for isolated unit tests).
 */
export function resetFeedbackEngineForTests(): void {
  sharedAudioCtx = null;
  cachedClickNoiseBuffer = null;
  globalUnlockInstalled = false;
}
