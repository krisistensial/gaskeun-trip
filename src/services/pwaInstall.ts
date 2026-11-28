export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export type PwaPlatform = 'ios' | 'android' | 'desktop';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedInSession = false;
let initialized = false;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore subscriber errors
    }
  });
}

export function initPwaInstallCapture(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    installedInSession = true;
    deferredPrompt = null;
    notifyListeners();
  });
}

export function detectPwaPlatform(
  userAgent?: string,
  maxTouchPoints?: number,
): PwaPlatform {
  const ua =
    userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const touchPoints =
    maxTouchPoints ??
    (typeof navigator !== 'undefined' ? navigator.maxTouchPoints ?? 0 : 0);

  const isIosUa = /iPad|iPhone|iPod/i.test(ua);
  const isIpadOs = /Macintosh/i.test(ua) && touchPoints > 1;
  if (isIosUa || isIpadOs) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function isAppInstalledStandalone(): boolean {
  if (installedInSession) return true;
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav?.standalone === true) return true;
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

export function canPromptNativeInstall(): boolean {
  return Boolean(deferredPrompt) && !isAppInstalledStandalone();
}

export async function promptNativePwaInstall(): Promise<
  'accepted' | 'dismissed' | 'unavailable'
> {
  if (!deferredPrompt) return 'unavailable';
  const promptEvent = deferredPrompt;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') {
      installedInSession = true;
      deferredPrompt = null;
    }
    notifyListeners();
    return choice.outcome;
  } catch {
    return 'unavailable';
  }
}

export function subscribePwaInstallState(listener: () => void): () => void {
  initPwaInstallCapture();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
