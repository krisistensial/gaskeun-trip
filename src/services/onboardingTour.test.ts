import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTourStorageKey,
  hasCompletedTour,
  markTourCompleted,
  ONBOARDING_TOUR_STEPS,
  resetTourCompleted,
} from './onboardingTour';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

describe('onboardingTour service', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tracks tour completion per trip code and member independently', () => {
    expect(buildTourStorageKey('solo-27', 'm-kris')).toBe(
      'gaskeun_tour_done_v1_SOLO-27_m-kris',
    );
    expect(hasCompletedTour('SOLO-27', 'm-kris')).toBe(false);
    expect(hasCompletedTour('SOLO-27', 'm-rani')).toBe(false);

    markTourCompleted('SOLO-27', 'm-kris');
    expect(hasCompletedTour('SOLO-27', 'm-kris')).toBe(true);
    expect(hasCompletedTour('SOLO-27', 'm-rani')).toBe(false);
    expect(hasCompletedTour('BALI-28', 'm-kris')).toBe(false);

    resetTourCompleted('SOLO-27', 'm-kris');
    expect(hasCompletedTour('SOLO-27', 'm-kris')).toBe(false);
  });

  it('bypasses auto-tour for guest sessions and tours all 5 app pages', () => {
    expect(hasCompletedTour('SOLO-27', 'guest')).toBe(true);
    expect(hasCompletedTour('SOLO-27', null)).toBe(true);

    const tabs = new Set(ONBOARDING_TOUR_STEPS.map((s) => s.tab));
    expect(tabs).toEqual(new Set(['home', 'plan', 'wallet', 'album', 'prep']));
    const ids = new Set(ONBOARDING_TOUR_STEPS.map((s) => s.id));
    expect(ids.size).toBe(ONBOARDING_TOUR_STEPS.length);
    expect(ONBOARDING_TOUR_STEPS.some((s) => s.requiresDock)).toBe(true);
  });
});
