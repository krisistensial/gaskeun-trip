import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, Compass, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '../atoms';
import { triggerFeedback } from '../../services/feedback';
import {
  buildOnboardingTourSteps,
  type OnboardingTourAccess,
  type OnboardingTourStep,
} from '../../services/onboardingTour';
import { useBackHandler } from '../../services/pwaHistory';
import type { DockTabId } from '../../types/trip';
import './OnboardingTour.css';

export interface OnboardingTourProps {
  open: boolean;
  tripTitle: string;
  memberName: string;
  /** Active user's edit permissions so the tour dynamically spotlights their unlocked edit buttons */
  access?: Partial<OnboardingTourAccess>;
  steps?: readonly OnboardingTourStep[];
  /** Switches the active main tab automatically when stepping across Home/Plan/Wallet/Album/Prep */
  onNavigateTab?: (tab: DockTabId) => void;
  /** Called before measuring a step that requires the Floating Glass Dock to be revealed */
  onRevealDock?: () => void;
  onFinish: () => void;
  onSkip: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
}

const TOOLTIP_WIDTH_MAX = 348;
const TOOLTIP_EST_HEIGHT = 220;
const EDGE_MARGIN = 14;

export function OnboardingTour({
  open,
  tripTitle,
  memberName,
  access,
  steps,
  onNavigateTab,
  onRevealDock,
  onFinish,
  onSkip,
}: OnboardingTourProps) {
  const resolvedSteps = useMemo(
    () => (steps ? [...steps] : buildOnboardingTourSteps(access)),
    [
      steps,
      access?.isHost,
      access?.canEditCrew,
      access?.canEditPlan,
      access?.canEditWallet,
      access?.canEditPrep,
    ],
  );

  const [stage, setStage] = useState<'welcome' | 'tour'>('welcome');
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [tooltipHeight, setTooltipHeight] = useState(TOOLTIP_EST_HEIGHT);

  useEffect(() => {
    if (open) {
      setStage('welcome');
      setStepIdx(0);
      setRect(null);
    }
  }, [open]);

  const safeStepIdx = Math.min(stepIdx, Math.max(0, resolvedSteps.length - 1));
  const activeStep = resolvedSteps[safeStepIdx] ?? resolvedSteps[0];

  // Android / PWA hardware Back integration
  useBackHandler(
    open,
    () => {
      if (stage === 'tour' && safeStepIdx > 0) {
        triggerFeedback('tap');
        setStepIdx((i) => Math.max(0, i - 1));
      } else {
        triggerFeedback('tap');
        onSkip();
      }
    },
    'sheet',
    'onboarding-tour',
  );

  const measureTarget = useCallback((): boolean => {
    if (!open || stage !== 'tour' || !activeStep) {
      setRect(null);
      return false;
    }
    const el = document.querySelector<HTMLElement>(activeStep.targetSelector);
    if (!el) {
      return false;
    }
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) {
      return false;
    }
    const pad = activeStep.spotlightPadding ?? 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(6, r.left - pad);
    const top = Math.max(6, r.top - pad);
    const right = Math.min(vw - 6, r.right + pad);
    const bottom = Math.min(vh - 6, r.bottom + pad);
    setRect({
      top,
      left,
      width: Math.max(28, right - left),
      height: Math.max(28, bottom - top),
      radius: activeStep.spotlightRadius ?? 22,
    });
    return true;
  }, [open, stage, activeStep]);

  useEffect(() => {
    if (!open || stage !== 'tour' || !activeStep) return;

    if (activeStep.requiresDock) {
      onRevealDock?.();
    }
    onNavigateTab?.(activeStep.tab);

    let scrolledToTarget = false;
    const tryScrollAndMeasure = () => {
      const el = document.querySelector<HTMLElement>(activeStep.targetSelector);
      if (el) {
        if (!scrolledToTarget) {
          scrolledToTarget = true;
          if (activeStep.scrollBlock === 'start') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else if (activeStep.scrollBlock !== 'nearest') {
            el.scrollIntoView({
              behavior: 'smooth',
              block: activeStep.scrollBlock ?? 'center',
            });
          }
        }
        measureTarget();
        return true;
      }
      return false;
    };

    tryScrollAndMeasure();

    // Retry gracefully while lazy-loaded tab screens mount & settle
    let attempts = 0;
    const pollId = window.setInterval(() => {
      attempts += 1;
      const found = tryScrollAndMeasure();
      if (found && attempts >= 5) {
        window.clearInterval(pollId);
      } else if (attempts >= 22) {
        window.clearInterval(pollId);
      }
    }, 90);

    const t1 = window.setTimeout(measureTarget, 140);
    const t2 = window.setTimeout(measureTarget, 420);
    const t3 = window.setTimeout(measureTarget, 760);

    const onViewportChange = () => measureTarget();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, { passive: true });

    return () => {
      window.clearInterval(pollId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange);
    };
  }, [open, stage, activeStep, onNavigateTab, onRevealDock, measureTarget]);

  useLayoutEffect(() => {
    if (!tooltipRef.current) return;
    const h = tooltipRef.current.offsetHeight;
    if (h > 40) setTooltipHeight(h);
  }, [stage, safeStepIdx, rect]);

  if (!open || typeof document === 'undefined' || !activeStep) return null;

  const isFirst = safeStepIdx === 0;
  const isLast = safeStepIdx >= resolvedSteps.length - 1;
  const progressPct = Math.round(((safeStepIdx + 1) / resolvedSteps.length) * 100);

  const hasAnyEditAccess = Boolean(
    access?.isHost ||
      access?.canEditCrew ||
      access?.canEditPlan ||
      access?.canEditWallet ||
      access?.canEditPrep,
  );

  // Smart tooltip positioning (above or below spotlight, clamped inside viewport)
  const computeTooltipPosition = (): { top: number; left: number } => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 844;
    const cardW = Math.min(vw - EDGE_MARGIN * 2, TOOLTIP_WIDTH_MAX);
    const cardH = tooltipHeight;

    if (!rect) {
      return {
        top: Math.max(EDGE_MARGIN, Math.round((vh - cardH) / 2)),
        left: Math.round((vw - cardW) / 2),
      };
    }

    const gap = 16;
    const spaceBelow = vh - (rect.top + rect.height) - EDGE_MARGIN;
    const spaceAbove = rect.top - EDGE_MARGIN;

    let top: number;
    if (spaceBelow >= cardH + gap || spaceBelow >= spaceAbove) {
      top = rect.top + rect.height + gap;
    } else {
      top = rect.top - cardH - gap;
    }

    top = Math.max(EDGE_MARGIN, Math.min(vh - cardH - EDGE_MARGIN, top));
    const idealLeft = rect.left + rect.width / 2 - cardW / 2;
    const left = Math.max(EDGE_MARGIN, Math.min(vw - cardW - EDGE_MARGIN, idealLeft));

    return { top: Math.round(top), left: Math.round(left) };
  };

  const tooltipPos = computeTooltipPosition();

  return createPortal(
    <div
      className="gk-tour-layer"
      role="dialog"
      aria-modal="true"
      aria-label="GASKEUN Guided App Tour"
    >
      {stage === 'welcome' ? (
        <div className="gk-tour-welcome-backdrop">
          <div className="gk-tour-welcome-card">
            <div className="gk-tour-welcome-emblem" aria-hidden="true">
              <Compass size={32} strokeWidth={2} />
            </div>
            <span className="gk-tour-welcome-pill">
              <Sparkles size={11} strokeWidth={2.4} />
              <span>
                {access?.isHost
                  ? 'Host Guide'
                  : hasAnyEditAccess
                    ? 'Editor Guide'
                    : 'Quick Guide'}
              </span>
            </span>
            <h2 className="gk-tour-welcome-title">
              Welcome, {memberName || 'Crew'}!
            </h2>
            <p className="gk-tour-welcome-sub">
              You&apos;re in <strong>{tripTitle}</strong>. Let&apos;s walk through{' '}
              <strong>Home, Plan, Wallet, Album, and Prep</strong> — customized for your exact access.
            </p>
            <div className="gk-tour-welcome-actions">
              <Button
                variant="glass"
                size="md"
                onClick={() => {
                  triggerFeedback('tap');
                  onSkip();
                }}
              >
                Skip
              </Button>
              <Button
                variant="matcha"
                size="md"
                fullWidth
                rightIcon={<ArrowRight size={16} strokeWidth={2.2} />}
                onClick={() => {
                  triggerFeedback('success');
                  setStepIdx(0);
                  setStage('tour');
                }}
              >
                Start Tour
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {rect ? (
            <div
              className="gk-tour-spotlight-box"
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
                borderRadius: rect.radius,
              }}
              aria-hidden="true"
            >
              <span className="gk-tour-spotlight-pulse" />
              <span className="gk-tour-step-badge">{safeStepIdx + 1}</span>
            </div>
          ) : (
            <div className="gk-tour-fallback-scrim" aria-hidden="true" />
          )}

          <div
            ref={tooltipRef}
            key={activeStep.id}
            className="gk-tour-tooltip"
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
          >
            <div className="gk-tour-tooltip__head">
              <div className="gk-tour-tooltip__badges">
                <span className="gk-tour-tooltip__counter">
                  {safeStepIdx + 1}/{resolvedSteps.length} · {activeStep.tabLabel}
                </span>
                {activeStep.roleTag && (
                  <span className="gk-tour-tooltip__role-pill">
                    <ShieldCheck size={11} strokeWidth={2.3} />
                    <span>{activeStep.roleTag}</span>
                  </span>
                )}
              </div>
              <button
                type="button"
                className="gk-tour-tooltip__skip"
                onClick={() => {
                  triggerFeedback('tap');
                  onSkip();
                }}
              >
                Skip
              </button>
            </div>

            <h3 className="gk-tour-tooltip__title">{activeStep.title}</h3>
            <p className="gk-tour-tooltip__desc">{activeStep.description}</p>

            <div className="gk-tour-tooltip__footer">
              <div className="gk-tour-tooltip__progress" aria-hidden="true">
                <div
                  className="gk-tour-tooltip__progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="gk-tour-tooltip__nav">
                {!isFirst && (
                  <Button
                    variant="glass"
                    size="sm"
                    leftIcon={<ArrowLeft size={14} strokeWidth={2.2} />}
                    onClick={() => {
                      triggerFeedback('tap');
                      setStepIdx((i) => Math.max(0, i - 1));
                    }}
                  >
                    Back
                  </Button>
                )}
                <Button
                  variant="matcha"
                  size="sm"
                  rightIcon={
                    isLast ? (
                      <Check size={14} strokeWidth={2.4} />
                    ) : (
                      <ArrowRight size={14} strokeWidth={2.2} />
                    )
                  }
                  onClick={() => {
                    if (isLast) {
                      triggerFeedback('success');
                      onFinish();
                    } else {
                      triggerFeedback('tap');
                      setStepIdx((i) => Math.min(resolvedSteps.length - 1, i + 1));
                    }
                  }}
                >
                  {isLast ? "Let's Go!" : 'Next'}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
