import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

interface OverlayContextValue {
  overlayCount: number;
  register: () => () => void;
}

const OverlayContext = createContext<OverlayContextValue>({
  overlayCount: 0,
  register: () => () => {},
});

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [overlayCount, setOverlayCount] = useState(0);

  const register = useCallback(() => {
    setOverlayCount((c) => c + 1);
    return () => {
      setOverlayCount((c) => Math.max(0, c - 1));
    };
  }, []);

  return (
    <OverlayContext.Provider value={{ overlayCount, register }}>
      {children}
    </OverlayContext.Provider>
  );
}

/**
 * Registers an active modal, bottom sheet, or full-screen editor so the
 * ExpandingGlassDock automatically slides down and never overlaps forms.
 */
export function useRegisterOverlay(active: boolean): void {
  const { register } = useContext(OverlayContext);
  useEffect(() => {
    if (!active) return;
    return register();
  }, [active, register]);
}

export function useHasActiveOverlay(): boolean {
  return useContext(OverlayContext).overlayCount > 0;
}
