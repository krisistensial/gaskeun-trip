import { useEffect, useState, type RefObject } from 'react';

export type ScrollFadeMode = 'none' | 'left' | 'right' | 'both';

export interface ScrollFadeState {
  fadeLeft: boolean;
  fadeRight: boolean;
  dataFade: ScrollFadeMode;
}

const EDGE_THRESHOLD_PX = 4;

/**
 * Pure computation for horizontal scroll overflow alpha-mask state.
 */
export function computeScrollFadeState(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
): ScrollFadeState {
  const fadeLeft = scrollLeft > EDGE_THRESHOLD_PX;
  const fadeRight = scrollLeft + clientWidth < scrollWidth - EDGE_THRESHOLD_PX;
  const dataFade: ScrollFadeMode =
    fadeLeft && fadeRight ? 'both' : fadeLeft ? 'left' : fadeRight ? 'right' : 'none';
  return { fadeLeft, fadeRight, dataFade };
}

/**
 * Tracks left/right horizontal scroll overflow on a pill slider container using
 * passive `scroll` + `ResizeObserver` so CSS `mask-image` fades appear seamlessly
 * only on edges that actually overflow.
 */
export function useHorizontalScrollFade<T extends HTMLElement>(
  ref: RefObject<T | null>,
  deps: readonly unknown[] = [],
): ScrollFadeState {
  const [state, setState] = useState<ScrollFadeState>({
    fadeLeft: false,
    fadeRight: false,
    dataFade: 'none',
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      setState({ fadeLeft: false, fadeRight: false, dataFade: 'none' });
      return;
    }

    const update = () => {
      const next = computeScrollFadeState(el.scrollLeft, el.clientWidth, el.scrollWidth);
      setState((prev) =>
        prev.fadeLeft === next.fadeLeft && prev.fadeRight === next.fadeRight ? prev : next,
      );
    };

    update();
    const rafId = window.requestAnimationFrame(update);
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);

  return state;
}
