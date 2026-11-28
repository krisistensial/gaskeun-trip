import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  Compass,
  Download,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { Button } from '../atoms';
import { triggerFeedback } from '../../services/feedback';
import {
  getDeviceNotificationPermission,
  getDeviceNotificationsEnabled,
  requestDeviceNotificationPermission,
  setDeviceNotificationsEnabled,
  tryShowDeviceNotification,
  type DeviceNotificationPermission,
} from '../../services/notifications';
import {
  buildOnboardingTourSteps,
  type OnboardingTourAccess,
  type OnboardingTourStep,
} from '../../services/onboardingTour';
import { ensureWebPushSubscription } from '../../services/pushNotifications';
import {
  canPromptNativeInstall,
  detectPwaPlatform,
  isAppInstalledStandalone,
  promptNativePwaInstall,
  subscribePwaInstallState,
} from '../../services/pwaInstall';
import { useBackHandler } from '../../services/pwaHistory';
import type { DockTabId } from '../../types/trip';
import './OnboardingTour.css';

export interface OnboardingTourProps {
  open: boolean;
  tripCode?: string;
  tripTitle: string;
  activeMemberId?: string | null;
  memberName: string;
  /** Active user's edit permissions so the tour dynamically spotlights their unlocked edit buttons */
  access?: Partial<OnboardingTourAccess>;
  steps?: readonly OnboardingTourStep[];
  /** Switches the active main tab automatically when stepping across Home/Plan/Wallet/Album/Prep */
  onNavigateTab?: (tab: DockTabId) => void;
  /** Called before measuring a step that requires the Floating Glass Dock to be revealed */
  onRevealDock?: () => void;
  onNotify?: (message: string, tone?: 'success' | 'info' | 'error') => void;
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
  tripCode = '',
  tripTitle,
  activeMemberId = null,
  memberName,
  access,
  steps,
  onNavigateTab,
  onRevealDock,
  onNotify,
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

  const platform = useMemo(() => detectPwaPlatform(), []);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => isAppInstalledStandalone());
  const [canNativeInstall, setCanNativeInstall] = useState<boolean>(() => canPromptNativeInstall());
  const [installBusy, setInstallBusy] = useState(false);

  const [notifPerm, setNotifPerm] = useState<DeviceNotificationPermission>(() =>
    getDeviceNotificationPermission(),
  );
  const [notifOn, setNotifOn] = useState<boolean>(() => getDeviceNotificationsEnabled());
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifFeedback, setNotifFeedback] = useState<string>('');

  useEffect(() => {
    if (open) {
      setStage('welcome');
      setStepIdx(0);
      setRect(null);
      setIsStandalone(isAppInstalledStandalone());
      setCanNativeInstall(canPromptNativeInstall());
      setNotifPerm(getDeviceNotificationPermission());
      setNotifOn(getDeviceNotificationsEnabled());
      setNotifFeedback('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return subscribePwaInstallState(() => {
      setIsStandalone(isAppInstalledStandalone());
      setCanNativeInstall(canPromptNativeInstall());
    });
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
    if (!open || stage !== 'tour' || !activeStep || !activeStep.targetSelector) {
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
    setNotifPerm(getDeviceNotificationPermission());
    setNotifOn(getDeviceNotificationsEnabled());

    if (!activeStep.targetSelector) {
      setRect(null);
      if (activeStep.scrollBlock === 'start') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

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
  }, [stage, safeStepIdx, rect, isStandalone, canNativeInstall, notifPerm, notifOn, notifFeedback]);

  const handleInstallClick = async () => {
    if (installBusy) return;
    triggerFeedback('tap');
    setInstallBusy(true);
    try {
      const outcome = await promptNativePwaInstall();
      setIsStandalone(isAppInstalledStandalone());
      setCanNativeInstall(canPromptNativeInstall());
      if (outcome === 'accepted') {
        triggerFeedback('success');
        onNotify?.('Installing GASKEUN! to your Home Screen', 'success');
      } else if (outcome === 'dismissed') {
        onNotify?.('You can install anytime from your browser menu', 'info');
      }
    } finally {
      setInstallBusy(false);
    }
  };

  const handleEnableNotificationsClick = async () => {
    if (notifBusy) return;
    triggerFeedback('tap');
    setNotifBusy(true);
    setNotifFeedback('');
    try {
      const currentPerm = getDeviceNotificationPermission();
      if (currentPerm === 'granted') {
        setDeviceNotificationsEnabled(true);
        setNotifPerm('granted');
        setNotifOn(true);
        if (tripCode) {
          void ensureWebPushSubscription(tripCode, activeMemberId);
        }
        const testRes = await tryShowDeviceNotification({
          title: 'GASKEUN! Alerts Ready',
          body: `Live Crew Chat & trip alerts are active for ${tripTitle}.`,
          tag: `gaskeun-tour-test-${Date.now()}`,
        });
        triggerFeedback('success');
        const msg = testRes.ok
          ? 'Phone notifications active!'
          : testRes.error || 'Alerts enabled on this device';
        setNotifFeedback(msg);
        onNotify?.(msg, 'success');
        return;
      }

      const res = await requestDeviceNotificationPermission();
      setNotifPerm(res.permission);
      setNotifOn(res.granted);
      if (res.granted) {
        triggerFeedback('success');
        if (tripCode) {
          void ensureWebPushSubscription(tripCode, activeMemberId);
        }
        const msg = res.shown
          ? 'Phone notifications enabled!'
          : res.error || 'Notifications enabled on this device';
        setNotifFeedback(msg);
        onNotify?.(msg, 'success');
      } else {
        const msg = res.error || 'Notification permission declined';
        setNotifFeedback(msg);
        onNotify?.(msg, 'info');
      }
    } finally {
      setNotifBusy(false);
    }
  };

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
              <strong>Home, Plan, Wallet, Album, Prep</strong>, plus installing the app &amp;
              turning on phone alerts.
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

            {activeStep.interactiveKind === 'install-app' && (
              <div className="gk-tour-setup-box">
                {isStandalone ? (
                  <div className="gk-tour-setup-status gk-tour-setup-status--ok">
                    <Check size={14} strokeWidth={2.6} />
                    <span>Installed on your Home Screen</span>
                  </div>
                ) : (
                  <>
                    {canNativeInstall && (
                      <Button
                        variant="matcha"
                        size="sm"
                        fullWidth
                        disabled={installBusy}
                        leftIcon={<Download size={14} strokeWidth={2.2} />}
                        onClick={() => void handleInstallClick()}
                      >
                        {installBusy ? 'Opening Installer...' : 'Install GASKEUN! App'}
                      </Button>
                    )}

                    {platform === 'ios' ? (
                      <ol className="gk-tour-setup-steps">
                        <li className="gk-tour-setup-step">
                          <span className="gk-tour-setup-num">1</span>
                          <span>
                            Tap the <strong>Share</strong> icon in Safari&apos;s bottom bar
                          </span>
                        </li>
                        <li className="gk-tour-setup-step">
                          <span className="gk-tour-setup-num">2</span>
                          <span>
                            Scroll down and tap <strong>Add to Home Screen</strong>
                          </span>
                        </li>
                        <li className="gk-tour-setup-step">
                          <span className="gk-tour-setup-num">3</span>
                          <span>
                            Open <strong>GASKEUN!</strong> from your Home Screen to enable iOS alerts
                          </span>
                        </li>
                      </ol>
                    ) : platform === 'android' ? (
                      <ol className="gk-tour-setup-steps">
                        <li className="gk-tour-setup-step">
                          <span className="gk-tour-setup-num">1</span>
                          <span>
                            Tap <strong>⋮</strong> (top-right menu) in Chrome
                          </span>
                        </li>
                        <li className="gk-tour-setup-step">
                          <span className="gk-tour-setup-num">2</span>
                          <span>
                            Tap <strong>Add to Home screen</strong> → <strong>Install</strong>
                          </span>
                        </li>
                      </ol>
                    ) : (
                      <div className="gk-tour-setup-step">
                        <Smartphone size={15} strokeWidth={2} color="var(--brand-matcha)" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>
                          Click the <strong>Install</strong> icon in your browser address bar, or open{' '}
                          <strong>Menu → Install GASKEUN!</strong>
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeStep.interactiveKind === 'enable-notifications' && (
              <div className="gk-tour-setup-box">
                {notifPerm === 'granted' && notifOn ? (
                  <div className="gk-tour-setup-status gk-tour-setup-status--ok">
                    <Check size={14} strokeWidth={2.6} />
                    <span>Phone notifications are active</span>
                  </div>
                ) : notifPerm === 'denied' ? (
                  <div className="gk-tour-setup-status gk-tour-setup-status--warn">
                    <Bell size={14} strokeWidth={2.2} />
                    <span>Blocked in browser — allow in Site Settings</span>
                  </div>
                ) : notifPerm === 'unsupported' ? (
                  <div className="gk-tour-setup-status gk-tour-setup-status--warn">
                    <Smartphone size={14} strokeWidth={2.2} />
                    <span>
                      {platform === 'ios'
                        ? 'Install via Share → Add to Home Screen first'
                        : 'Browser does not support push alerts'}
                    </span>
                  </div>
                ) : (
                  <Button
                    variant="matcha"
                    size="sm"
                    fullWidth
                    disabled={notifBusy}
                    leftIcon={<Bell size={14} strokeWidth={2.2} />}
                    onClick={() => void handleEnableNotificationsClick()}
                  >
                    {notifBusy ? 'Enabling Alerts...' : 'Turn On Notifications'}
                  </Button>
                )}
                {notifFeedback && <p className="gk-tour-setup-hint">{notifFeedback}</p>}
              </div>
            )}

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
