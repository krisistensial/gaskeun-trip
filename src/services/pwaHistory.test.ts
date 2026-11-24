import { describe, expect, it, vi } from 'vitest';
import {
  createPwaHistoryController,
  type HistoryLike,
  type PwaHistoryEnv,
  type PwaHistoryState,
} from './pwaHistory';

interface MockHistoryHarness {
  env: PwaHistoryEnv;
  entries: Array<{ state: unknown; url: string }>;
  getIndex: () => number;
  pressHardwareBack: () => boolean;
  flushMicrotasks: () => void;
}

function createMockHistoryHarness(initialHref = 'https://gaskeun.app/gaskeun-trip/'): MockHistoryHarness {
  const entries: Array<{ state: unknown; url: string }> = [{ state: null, url: initialHref }];
  let index = 0;
  let popListener: ((ev: PopStateEvent) => void) | null = null;
  const microtasks: Array<() => void> = [];

  const firePopState = () => {
    if (popListener) {
      popListener({ state: entries[index]?.state } as PopStateEvent);
    }
  };

  const history: HistoryLike = {
    get state() {
      return entries[index]?.state ?? null;
    },
    pushState(data, _unused, url) {
      const nextUrl = typeof url === 'string' ? url : initialHref;
      entries.splice(index + 1);
      entries.push({ state: data, url: nextUrl });
      index = entries.length - 1;
    },
    replaceState(data, _unused, url) {
      const nextUrl = typeof url === 'string' ? url : entries[index]?.url ?? initialHref;
      entries[index] = { state: data, url: nextUrl };
    },
    go(delta = 0) {
      if (delta === 0) return;
      const nextIndex = Math.max(0, Math.min(entries.length - 1, index + delta));
      if (nextIndex === index) return;
      index = nextIndex;
      firePopState();
    },
  };

  const env: PwaHistoryEnv = {
    history,
    getHref: () => entries[index]?.url ?? initialHref,
    addPopStateListener: (listener) => {
      popListener = listener;
      return () => {
        popListener = null;
      };
    },
    scheduleMicrotask: (fn) => {
      microtasks.push(fn);
    },
  };

  return {
    env,
    entries,
    getIndex: () => index,
    pressHardwareBack: () => {
      if (index === 0) {
        // Reached root: browser exits PWA naturally
        return false;
      }
      index -= 1;
      firePopState();
      return true;
    },
    flushMicrotasks: () => {
      while (microtasks.length > 0) {
        const fn = microtasks.shift();
        fn?.();
      }
    },
  };
}

describe('pwaHistory mobile back-stack controller', () => {
  it('enforces back priority: sheet -> sub-view -> tab history -> root exit without altering pathname', () => {
    const baseHref = 'https://krisistensial.github.io/gaskeun-trip/';
    const harness = createMockHistoryHarness(baseHref);
    const ctrl = createPwaHistoryController(harness.env);
    ctrl.initRoot();

    const closedOrder: string[] = [];

    // 1. Navigate tabs: Home -> Plan -> Wallet
    ctrl.push({ kind: 'tab', key: 'plan', onBack: () => closedOrder.push('tab:home') });
    ctrl.push({ kind: 'tab', key: 'wallet', onBack: () => closedOrder.push('tab:plan') });

    // 2. Open full sub-view (e.g. PlanDetailEditScreen / RouteMapView)
    ctrl.push({ kind: 'view', key: 'route-map', onBack: () => closedOrder.push('view:route-map') });

    // 3. Open top sheet (e.g. TripMenuSheet / PinUnlockSheet)
    ctrl.push({ kind: 'sheet', key: 'trip-menu', onBack: () => closedOrder.push('sheet:trip-menu') });

    expect(ctrl.getDepth()).toBe(4);
    expect(harness.getIndex()).toBe(4);

    // Verify pathname/href was never altered on any pushState/replaceState
    for (const e of harness.entries) {
      expect(e.url).toBe(baseHref);
    }

    // Back #1 -> closes top sheet
    expect(harness.pressHardwareBack()).toBe(true);
    expect(closedOrder).toEqual(['sheet:trip-menu']);
    expect(ctrl.getDepth()).toBe(3);

    // Back #2 -> closes sub-view
    expect(harness.pressHardwareBack()).toBe(true);
    expect(closedOrder).toEqual(['sheet:trip-menu', 'view:route-map']);
    expect(ctrl.getDepth()).toBe(2);

    // Back #3 -> returns Wallet -> Plan
    expect(harness.pressHardwareBack()).toBe(true);
    expect(closedOrder).toEqual(['sheet:trip-menu', 'view:route-map', 'tab:plan']);
    expect(ctrl.getDepth()).toBe(1);

    // Back #4 -> returns Plan -> Home
    expect(harness.pressHardwareBack()).toBe(true);
    expect(closedOrder).toEqual(['sheet:trip-menu', 'view:route-map', 'tab:plan', 'tab:home']);
    expect(ctrl.getDepth()).toBe(0);
    expect(harness.getIndex()).toBe(0);

    // Back #5 -> at root (depth 0), lets PWA exit naturally
    expect(harness.pressHardwareBack()).toBe(false);
    expect((harness.entries[0].state as PwaHistoryState).kind).toBe('root');
  });

  it('prevents consecutive duplicate tab entries when tapping the same tab repeatedly', () => {
    const harness = createMockHistoryHarness();
    const ctrl = createPwaHistoryController(harness.env);
    ctrl.initRoot();

    const id1 = ctrl.push({ kind: 'tab', key: 'plan', onBack: vi.fn() });
    const id2 = ctrl.push({ kind: 'tab', key: 'plan', onBack: vi.fn() });
    const id3 = ctrl.push({ kind: 'tab', key: 'plan', onBack: vi.fn() });

    expect(id1).not.toBeNull();
    expect(id2).toBeNull();
    expect(id3).toBeNull();
    expect(ctrl.getDepth()).toBe(1);
    expect(harness.getIndex()).toBe(1);

    // Switching to another tab works, then switching back to plan works too
    const idWallet = ctrl.push({ kind: 'tab', key: 'wallet', onBack: vi.fn() });
    const idPlanAgain = ctrl.push({ kind: 'tab', key: 'plan', onBack: vi.fn() });
    expect(idWallet).not.toBeNull();
    expect(idPlanAgain).not.toBeNull();
    expect(ctrl.getDepth()).toBe(3);
  });

  it('keeps history clean with zero ghost entries when sheets/views are closed manually via UI buttons', () => {
    const harness = createMockHistoryHarness();
    const ctrl = createPwaHistoryController(harness.env);
    ctrl.initRoot();

    const backToHome = vi.fn();
    const closeSheet = vi.fn();

    // Home -> Plan -> open Sheet
    ctrl.push({ kind: 'tab', key: 'plan', onBack: backToHome });
    const sheetId = ctrl.push({ kind: 'sheet', key: 'settings', onBack: closeSheet });
    expect(ctrl.getDepth()).toBe(2);
    expect(harness.getIndex()).toBe(2);

    // User clicks Close button in UI (not hardware Back)
    ctrl.remove(sheetId!);
    harness.flushMicrotasks();

    // Browser history synced back to index 1 WITHOUT invoking closeSheet or backToHome
    expect(ctrl.getDepth()).toBe(1);
    expect(harness.getIndex()).toBe(1);
    expect(closeSheet).not.toHaveBeenCalled();
    expect(backToHome).not.toHaveBeenCalled();

    // Single hardware Back press immediately returns Plan -> Home (no 2x Back ghost bug!)
    expect(harness.pressHardwareBack()).toBe(true);
    expect(backToHome).toHaveBeenCalledTimes(1);
    expect(ctrl.getDepth()).toBe(0);
    expect(harness.getIndex()).toBe(0);
  });

  it('replaces history slot cleanly in-place when closing one sheet and opening another in the same tick', () => {
    const harness = createMockHistoryHarness();
    const ctrl = createPwaHistoryController(harness.env);
    ctrl.initRoot();

    const closeMenu = vi.fn();
    const closeSettings = vi.fn();

    const menuId = ctrl.push({ kind: 'sheet', key: 'menu', onBack: closeMenu });
    expect(harness.getIndex()).toBe(1);

    // Same tick: Menu closes, Settings opens
    ctrl.remove(menuId!);
    ctrl.push({ kind: 'sheet', key: 'settings', onBack: closeSettings });
    harness.flushMicrotasks();

    expect(ctrl.getDepth()).toBe(1);
    expect(harness.getIndex()).toBe(1);

    // One hardware Back closes Settings and lands directly on root
    expect(harness.pressHardwareBack()).toBe(true);
    expect(closeSettings).toHaveBeenCalledTimes(1);
    expect(closeMenu).not.toHaveBeenCalled();
    expect(harness.getIndex()).toBe(0);
  });

  it('prioritizes closing an open sheet before any underlying view or tab entry', () => {
    const harness = createMockHistoryHarness();
    const ctrl = createPwaHistoryController(harness.env);
    ctrl.initRoot();

    const events: string[] = [];
    ctrl.push({ kind: 'sheet', key: 'modal', onBack: () => events.push('sheet') });
    ctrl.push({ kind: 'tab', key: 'wallet', onBack: () => events.push('tab') });

    harness.pressHardwareBack();
    expect(events).toEqual(['sheet']);

    harness.pressHardwareBack();
    expect(events).toEqual(['sheet', 'tab']);
  });
});
