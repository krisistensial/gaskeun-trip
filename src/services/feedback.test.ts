import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFeedbackPreferences,
  HAPTIC_PATTERNS,
  HAPTICS_STORAGE_KEY,
  playGlassSound,
  resetFeedbackEngineForTests,
  setHapticsEnabled,
  setSoundEnabled,
  SOUND_STORAGE_KEY,
  triggerFeedback,
  triggerHaptic,
} from './feedback';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (idx: number) => Array.from(map.keys())[idx] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, val: string) => {
      map.set(key, String(val));
    },
  };
}

describe('feedback multisensory engine', () => {
  beforeEach(() => {
    resetFeedbackEngineForTests();
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses sensible defaults: haptics ON, UI sounds ON', () => {
    const prefs = getFeedbackPreferences();
    expect(prefs).toEqual({
      hapticsEnabled: true,
      soundEnabled: true,
    });
  });

  it('persists haptic and sound preferences in localStorage', () => {
    setHapticsEnabled(false);
    setSoundEnabled(true);

    expect(localStorage.getItem(HAPTICS_STORAGE_KEY)).toBe('false');
    expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('true');
    expect(getFeedbackPreferences()).toEqual({
      hapticsEnabled: false,
      soundEnabled: true,
    });
  });

  it('invokes navigator.vibrate with the exact micro-patterns when enabled', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { vibrate: vibrateMock });

    triggerFeedback('tap');
    triggerFeedback('toggle');
    triggerFeedback('success');
    triggerFeedback('warning');
    triggerFeedback('tick');
    triggerFeedback('settle');
    triggerFeedback('check');
    triggerFeedback('uncheck');
    triggerFeedback('complete');

    expect(vibrateMock).toHaveBeenNthCalledWith(1, HAPTIC_PATTERNS.tap);
    expect(vibrateMock).toHaveBeenNthCalledWith(2, HAPTIC_PATTERNS.toggle);
    expect(vibrateMock).toHaveBeenNthCalledWith(3, HAPTIC_PATTERNS.success);
    expect(vibrateMock).toHaveBeenNthCalledWith(4, HAPTIC_PATTERNS.warning);
    expect(vibrateMock).toHaveBeenNthCalledWith(5, HAPTIC_PATTERNS.tick);
    expect(vibrateMock).toHaveBeenNthCalledWith(6, HAPTIC_PATTERNS.settle);
    expect(vibrateMock).toHaveBeenNthCalledWith(7, HAPTIC_PATTERNS.check);
    expect(vibrateMock).toHaveBeenNthCalledWith(8, HAPTIC_PATTERNS.uncheck);
    expect(vibrateMock).toHaveBeenNthCalledWith(9, HAPTIC_PATTERNS.complete);

    expect(HAPTIC_PATTERNS.tap).toBe(10);
    expect(HAPTIC_PATTERNS.toggle).toBe(14);
    expect(HAPTIC_PATTERNS.success).toEqual([12, 36, 18]);
    expect(HAPTIC_PATTERNS.warning).toEqual([26, 32, 26]);
    expect(HAPTIC_PATTERNS.tick).toBe(9);
    expect(HAPTIC_PATTERNS.settle).toBe(18);
    expect(HAPTIC_PATTERNS.check).toBe(12);
    expect(HAPTIC_PATTERNS.uncheck).toBe(9);
    expect(HAPTIC_PATTERNS.complete).toEqual([12, 34, 14, 34, 20]);
  });

  it('respects hapticsEnabled=false unless forceHaptic is passed', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { vibrate: vibrateMock });

    setHapticsEnabled(false);
    expect(triggerHaptic('tap')).toBe(false);
    expect(vibrateMock).not.toHaveBeenCalled();

    expect(triggerHaptic('toggle', true)).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith(14);
  });

  it('safely no-ops when navigator.vibrate and AudioContext are unavailable', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', {});
    setSoundEnabled(true);

    expect(() => triggerFeedback('tap')).not.toThrow();
    expect(() => triggerFeedback('success')).not.toThrow();
    expect(triggerHaptic('warning')).toBe(false);
    expect(playGlassSound('success')).toBe(false);
  });

  it('synthesizes soft Web Audio tones only when soundEnabled is true', () => {
    const linearRamp = vi.fn();
    const expRamp = vi.fn();
    const oscStart = vi.fn();
    const oscStop = vi.fn();

    class MockAudioContext {
      state = 'running';
      currentTime = 1.0;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      createOscillator() {
        return {
          type: 'sine',
          frequency: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          start: oscStart,
          stop: oscStop,
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: linearRamp,
            exponentialRampToValueAtTime: expRamp,
          },
          connect: vi.fn(),
        };
      }
    }

    vi.stubGlobal('window', { AudioContext: MockAudioContext });

    // Explicitly muted -> silent
    setSoundEnabled(false);
    expect(playGlassSound('tap')).toBe(false);
    expect(oscStart).not.toHaveBeenCalled();

    // Enable sound -> plays audible success + tick + settle + check + uncheck + complete
    setSoundEnabled(true);
    expect(playGlassSound('success')).toBe(true);
    expect(playGlassSound('tick')).toBe(true);
    expect(playGlassSound('settle')).toBe(true);
    expect(playGlassSound('check')).toBe(true);
    expect(playGlassSound('uncheck')).toBe(true);
    expect(playGlassSound('complete')).toBe(true);
    expect(oscStart).toHaveBeenCalledTimes(12);
    expect(oscStop).toHaveBeenCalledTimes(12);
    expect(expRamp).toHaveBeenCalledTimes(12);
    for (const [peakGain] of linearRamp.mock.calls) {
      expect(peakGain).toBeGreaterThanOrEqual(0.1);
      expect(peakGain).toBeLessThanOrEqual(0.35);
    }
  });

  it('awaits AudioContext.resume() before scheduling tone when mobile AudioContext starts suspended', async () => {
    const oscStart = vi.fn();
    let resolveResume!: () => void;

    class SuspendedAudioContext {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      resume = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveResume = () => {
              this.state = 'running';
              resolve();
            };
          }),
      );
      createOscillator() {
        return {
          type: 'sine',
          frequency: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          start: oscStart,
          stop: vi.fn(),
        };
      }
      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
      }
    }

    vi.stubGlobal('window', { AudioContext: SuspendedAudioContext });
    setSoundEnabled(true);

    expect(playGlassSound('tap')).toBe(true);
    // Tone must wait for resume() instead of firing into a suspended context
    expect(oscStart).not.toHaveBeenCalled();

    resolveResume();
    await Promise.resolve();
    expect(oscStart).toHaveBeenCalledTimes(1);
  });
});
