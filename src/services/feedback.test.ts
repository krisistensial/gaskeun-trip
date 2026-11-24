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

  it('uses sensible defaults: haptics ON, UI sounds OFF', () => {
    const prefs = getFeedbackPreferences();
    expect(prefs).toEqual({
      hapticsEnabled: true,
      soundEnabled: false,
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

    expect(vibrateMock).toHaveBeenNthCalledWith(1, HAPTIC_PATTERNS.tap);
    expect(vibrateMock).toHaveBeenNthCalledWith(2, HAPTIC_PATTERNS.toggle);
    expect(vibrateMock).toHaveBeenNthCalledWith(3, HAPTIC_PATTERNS.success);
    expect(vibrateMock).toHaveBeenNthCalledWith(4, HAPTIC_PATTERNS.warning);

    expect(HAPTIC_PATTERNS.tap).toBe(8);
    expect(HAPTIC_PATTERNS.toggle).toBe(12);
    expect(HAPTIC_PATTERNS.success).toEqual([10, 35, 14]);
    expect(HAPTIC_PATTERNS.warning).toEqual([24, 30, 24]);
  });

  it('respects hapticsEnabled=false unless forceHaptic is passed', () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { vibrate: vibrateMock });

    setHapticsEnabled(false);
    expect(triggerHaptic('tap')).toBe(false);
    expect(vibrateMock).not.toHaveBeenCalled();

    expect(triggerHaptic('toggle', true)).toBe(true);
    expect(vibrateMock).toHaveBeenCalledWith(12);
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

    // Default soundEnabled=false -> silent
    expect(playGlassSound('tap')).toBe(false);
    expect(oscStart).not.toHaveBeenCalled();

    // Enable sound -> plays 2-tone success chord with low gain <= 0.06
    setSoundEnabled(true);
    expect(playGlassSound('success')).toBe(true);
    expect(oscStart).toHaveBeenCalledTimes(2);
    expect(oscStop).toHaveBeenCalledTimes(2);
    expect(expRamp).toHaveBeenCalledTimes(2);
    for (const [peakGain] of linearRamp.mock.calls) {
      expect(peakGain).toBeGreaterThan(0);
      expect(peakGain).toBeLessThanOrEqual(0.06);
    }
  });
});
