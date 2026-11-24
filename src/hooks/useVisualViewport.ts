import { useEffect } from 'react';

/**
 * Tracks mobile virtual keyboard height via `window.visualViewport` and updates
 * root CSS custom properties:
 * - `--keyboard-offset`: pixels occluded by the active software keyboard (0px when closed
 *   or when `interactive-widget=resizes-content` already resized the layout viewport).
 * - `--vvh`: current visible viewport height in pixels so bottom sheets clamp cleanly above keyboard.
 * - `data-keyboard-open`: `'true'` when software keyboard reduces visible height significantly.
 */
export function useKeyboardOffset(): void {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const root = document.documentElement;
    let rafId = 0;

    const updateViewportVars = () => {
      rafId = 0;
      const vv = window.visualViewport;
      const layoutH = window.innerHeight || 0;
      const visibleH = vv ? Math.round(vv.height) : layoutH;
      const offsetTop = vv ? Math.round(vv.offsetTop) : 0;
      const keyboardHeight = vv ? Math.max(0, Math.round(layoutH - vv.height - offsetTop)) : 0;

      root.style.setProperty('--keyboard-offset', `${keyboardHeight}px`);
      if (visibleH > 0) {
        root.style.setProperty('--vvh', `${visibleH}px`);
      }

      // Consider keyboard active if visualViewport shrank by >80px OR height is compact while an input is focused
      const activeTag = document.activeElement?.tagName;
      const inputFocused =
        activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
      const isCompactFocused = inputFocused && visibleH > 0 && visibleH < 560;
      const isKeyboardOpen = keyboardHeight > 80 || isCompactFocused;
      root.setAttribute('data-keyboard-open', isKeyboardOpen ? 'true' : 'false');
    };

    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateViewportVars);
    };

    updateViewportVars();

    const vv = window.visualViewport;
    vv?.addEventListener('resize', scheduleUpdate);
    vv?.addEventListener('scroll', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    document.addEventListener('focusin', scheduleUpdate);
    document.addEventListener('focusout', scheduleUpdate);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      vv?.removeEventListener('resize', scheduleUpdate);
      vv?.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      document.removeEventListener('focusin', scheduleUpdate);
      document.removeEventListener('focusout', scheduleUpdate);
      root.style.setProperty('--keyboard-offset', '0px');
      root.removeAttribute('data-keyboard-open');
    };
  }, []);
}
