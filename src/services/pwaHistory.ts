import { useEffect, useRef } from 'react';

export type PwaNavKind = 'root' | 'tab' | 'view' | 'sheet';

export interface PwaHistoryState {
  __gkNav: true;
  id: number;
  depth: number;
  kind: PwaNavKind;
  key?: string;
}

export interface BackStackEntry {
  id: number;
  kind: Exclude<PwaNavKind, 'root'>;
  key?: string;
  onBack: () => void;
}

export interface PushBackEntryInput {
  kind: Exclude<PwaNavKind, 'root'>;
  key?: string;
  onBack: () => void;
}

export interface HistoryLike {
  readonly state: unknown;
  pushState: (data: unknown, unused: string, url?: string | URL | null) => void;
  replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
  go: (delta?: number) => void;
}

export interface PwaHistoryEnv {
  history: HistoryLike;
  getHref: () => string;
  addPopStateListener: (listener: (ev: PopStateEvent) => void) => () => void;
  scheduleMicrotask?: (fn: () => void) => void;
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
}

const KIND_PRIORITY: Record<Exclude<PwaNavKind, 'root'>, number> = {
  sheet: 3,
  view: 2,
  tab: 1,
};

function createBrowserEnv(): PwaHistoryEnv | null {
  if (typeof window === 'undefined' || !window.history) return null;
  return {
    history: window.history,
    getHref: () => window.location.href,
    addPopStateListener: (listener) => {
      window.addEventListener('popstate', listener);
      return () => window.removeEventListener('popstate', listener);
    },
    scheduleMicrotask: (fn) => {
      if (typeof queueMicrotask === 'function') queueMicrotask(fn);
      else void Promise.resolve().then(fn);
    },
    setTimeoutFn: (fn, ms) =>
      window.setTimeout(fn, ms) as unknown as ReturnType<typeof setTimeout>,
    clearTimeoutFn: (id) => window.clearTimeout(id as unknown as number),
  };
}

export interface PwaHistoryController {
  initRoot: () => void;
  destroy: () => void;
  push: (input: PushBackEntryInput) => number | null;
  remove: (id: number) => void;
  clearByKind: (kind: Exclude<PwaNavKind, 'root'>) => void;
  clearAll: () => void;
  getStack: () => ReadonlyArray<Readonly<BackStackEntry>>;
  getDepth: () => number;
  isHandlingPop: () => boolean;
}

/**
 * Native-like Android/PWA History API back-stack manager.
 * - Never modifies `window.location.pathname` (passes `window.location.href` to pushState/replaceState)
 *   so Vercel & GitHub Pages static routing and refreshes stay 100% intact.
 * - Enforces strict back priority: `sheet` -> `view` -> `tab` -> root exit.
 * - Synchronizes manual UI closes via microtask-batched `history.go(-n)` so zero ghost history remains.
 * - Consumes queued back steps via `replaceState` when one sheet/view closes and another opens in the same tick.
 */
export function createPwaHistoryController(customEnv?: PwaHistoryEnv | null): PwaHistoryController {
  const env = customEnv === undefined ? createBrowserEnv() : customEnv;
  const stack: BackStackEntry[] = [];
  let nextId = 1;
  let initialized = false;
  let removePopListener: (() => void) | null = null;
  let handlingPop = false;
  let queuedBackSteps = 0;
  let backFlushScheduled = false;
  let pendingProgrammaticPops = 0;
  let safetyResetTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleMicro = (fn: () => void) => {
    if (env?.scheduleMicrotask) {
      env.scheduleMicrotask(fn);
    } else if (typeof queueMicrotask === 'function') {
      queueMicrotask(fn);
    } else {
      void Promise.resolve().then(fn);
    }
  };

  const buildState = (id: number, depth: number, kind: PwaNavKind, key?: string): PwaHistoryState => ({
    __gkNav: true,
    id,
    depth,
    kind,
    ...(key ? { key } : {}),
  });

  const safeHref = (): string | undefined => {
    if (!env) return undefined;
    try {
      return env.getHref();
    } catch {
      return undefined;
    }
  };

  const clearSafetyTimer = () => {
    if (safetyResetTimer !== null && env?.clearTimeoutFn) {
      env.clearTimeoutFn(safetyResetTimer);
      safetyResetTimer = null;
    }
  };

  const flushProgrammaticBacks = () => {
    backFlushScheduled = false;
    if (!env || queuedBackSteps <= 0) {
      queuedBackSteps = 0;
      return;
    }
    const delta = queuedBackSteps;
    queuedBackSteps = 0;
    pendingProgrammaticPops += 1;

    clearSafetyTimer();
    if (env.setTimeoutFn) {
      safetyResetTimer = env.setTimeoutFn(() => {
        pendingProgrammaticPops = 0;
        safetyResetTimer = null;
      }, 450);
    }

    try {
      env.history.go(-delta);
    } catch {
      pendingProgrammaticPops = Math.max(0, pendingProgrammaticPops - 1);
      clearSafetyTimer();
    }
  };

  const enqueueProgrammaticBack = (steps = 1) => {
    if (!env || steps <= 0) return;
    queuedBackSteps += steps;
    if (!backFlushScheduled) {
      backFlushScheduled = true;
      scheduleMicro(flushProgrammaticBacks);
    }
  };

  const findHighestPriorityIndex = (): number => {
    if (stack.length === 0) return -1;
    let bestIdx = -1;
    let bestPriority = -1;
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const p = KIND_PRIORITY[stack[i].kind];
      if (p > bestPriority) {
        bestPriority = p;
        bestIdx = i;
        if (bestPriority === KIND_PRIORITY.sheet) break;
      }
    }
    return bestIdx;
  };

  const handlePopState = () => {
    if (pendingProgrammaticPops > 0) {
      pendingProgrammaticPops -= 1;
      if (pendingProgrammaticPops === 0) {
        clearSafetyTimer();
      }
      return;
    }

    const idx = findHighestPriorityIndex();
    if (idx < 0) return;

    const [entry] = stack.splice(idx, 1);
    handlingPop = true;
    try {
      entry.onBack();
    } finally {
      handlingPop = false;
    }
  };

  const initRoot = () => {
    if (!env || initialized) return;
    initialized = true;
    try {
      env.history.replaceState(buildState(0, 0, 'root'), '', safeHref());
    } catch {
      // Ignore restricted history environments
    }
    removePopListener = env.addPopStateListener(handlePopState);
  };

  const destroy = () => {
    clearSafetyTimer();
    removePopListener?.();
    removePopListener = null;
    initialized = false;
    stack.length = 0;
    queuedBackSteps = 0;
    backFlushScheduled = false;
    pendingProgrammaticPops = 0;
    handlingPop = false;
  };

  const push = (input: PushBackEntryInput): number | null => {
    if (!env) return null;
    if (!initialized) initRoot();

    // Prevent pushState loops triggered while processing a browser popstate event
    if (handlingPop) return null;

    // Prevent consecutive duplicate tab history entries (e.g. tapping the active tab again)
    if (input.kind === 'tab' && input.key) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].kind === 'tab') {
          if (stack[i].key === input.key) return null;
          break;
        }
      }
    }

    const id = nextId++;
    stack.push({
      id,
      kind: input.kind,
      key: input.key,
      onBack: input.onBack,
    });
    const depth = stack.length;
    const state = buildState(id, depth, input.kind, input.key);

    try {
      // If a previous entry closed in this exact tick, replace its slot in-place cleanly!
      if (queuedBackSteps > 0) {
        queuedBackSteps -= 1;
        env.history.replaceState(state, '', safeHref());
      } else {
        env.history.pushState(state, '', safeHref());
      }
    } catch {
      // Fallback: keep logical stack intact even if history API throws
    }

    return id;
  };

  const remove = (id: number) => {
    const idx = stack.findIndex((e) => e.id === id);
    if (idx < 0) {
      // Already popped by browser hardware Back — do NOT call history.go(-1)!
      return;
    }
    stack.splice(idx, 1);
    enqueueProgrammaticBack(1);
  };

  const clearByKind = (kind: Exclude<PwaNavKind, 'root'>) => {
    let removed = 0;
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      if (stack[i].kind === kind) {
        stack.splice(i, 1);
        removed += 1;
      }
    }
    if (removed > 0) {
      enqueueProgrammaticBack(removed);
    }
  };

  const clearAll = () => {
    const count = stack.length;
    if (count === 0) return;
    stack.length = 0;
    enqueueProgrammaticBack(count);
  };

  return {
    initRoot,
    destroy,
    push,
    remove,
    clearByKind,
    clearAll,
    getStack: () => stack.slice(),
    getDepth: () => stack.length,
    isHandlingPop: () => handlingPop,
  };
}

export const pwaHistory = createPwaHistoryController();

/**
 * Registers an active sheet, modal, lightbox, or sub-screen with the global PWA back stack.
 * - Opening (`active: true`) pushes a history state without altering `location.pathname`.
 * - Pressing Android/PWA hardware Back pops this entry and invokes `onBack()`.
 * - Closing via in-app UI button (`active: false`) removes the entry and syncs `history.go(-1)`
 *   so no ghost history entries accumulate.
 */
export function useBackHandler(
  active: boolean,
  onBack: () => void,
  kind: Exclude<PwaNavKind, 'root'> = 'sheet',
  key?: string,
): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    const id = pwaHistory.push({
      kind,
      key,
      onBack: () => onBackRef.current(),
    });
    if (id === null) return;
    return () => {
      pwaHistory.remove(id);
    };
  }, [active, kind, key]);
}
