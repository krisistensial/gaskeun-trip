import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  CheckSquare,
  ChevronDown,
  Copy,
  Eye,
  MessageCircle,
  Plus,
  Reply,
  Search,
  Send,
  Smile,
  Sticker,
  Trash2,
  X,
} from 'lucide-react';
import {
  Avatar,
  ConfirmDialog,
  CornerOrb,
  LiquidBottomSheet,
  type ToastTone,
} from '../../components/atoms';
import { useRegisterOverlay } from '../../context/OverlayContext';
import {
  buildReplyPreview,
  CHAT_QUICK_REACTIONS,
  countTotalReactions,
  CREW_STICKER_PACK,
  formatChatDayDivider,
  formatChatTime,
  getChatDateKey,
  getMessageSeenByMembers,
  getStickerById,
  isGroupedWithPrevious,
  sanitizeChatText,
} from '../../services/chat';
import { FULL_EMOJI_GROUPS, searchEmojiCatalog } from '../../services/emojiCatalog';
import {
  deleteCustomSticker,
  loadCustomStickers,
  saveCustomSticker,
  type SavedCustomSticker,
} from '../../services/customStickers';
import {
  getDeviceNotificationPermission,
  getDeviceNotificationsEnabled,
  requestDeviceNotificationPermission,
  setDeviceNotificationsEnabled,
  tryShowDeviceNotification,
} from '../../services/notifications';
import {
  expandStickerSearchTerms,
  processPastedStickerBlob,
  searchExternalTransparentStickers,
  type ExternalStickerResult,
} from '../../services/stickerSearch';
import { primeFeedbackAudio, triggerFeedback } from '../../services/feedback';
import { useBackHandler } from '../../services/pwaHistory';
import { CreateStickerSheet } from './CreateStickerSheet';
import type {
  ChatMessage,
  ChatReadReceipt,
  ChatReplyPreview,
  OnlinePresenceUser,
  SharedTrip,
  TripMember,
} from '../../types/trip';
import './chat.css';

export interface StickerSendPayload {
  stickerId?: string;
  stickerUrl?: string;
  stickerCaption?: string;
}

export interface CrewChatScreenProps {
  trip: SharedTrip;
  messages: ChatMessage[];
  readReceipts?: Record<string, ChatReadReceipt>;
  activeMemberId: string | null;
  activeMember?: TripMember;
  activeMemberName: string;
  isHost: boolean;
  onlineMembers: OnlinePresenceUser[];
  typingUsers: Array<{ memberId: string; memberName: string }>;
  onSendText: (text: string, replyTo?: ChatReplyPreview) => void;
  onSendSticker: (payload: StickerSendPayload, replyTo?: ChatReplyPreview) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onUnsendMessage: (messageId: string) => void;
  onUnsendMultiple?: (messageIds: string[]) => void;
  onDeleteSelected?: (messageIds: string[]) => void;
  onTypingChange: (isTyping: boolean) => void;
  onMarkRead: () => void;
  onNotify?: (message: string, tone?: ToastTone) => void;
  onBack: () => void;
}

interface TransparentStickerGraphicProps {
  src?: string;
  fallbackSrc?: string;
  emojiFallback?: string;
  alt: string;
  className: string;
}

function TransparentStickerGraphic({
  src,
  fallbackSrc,
  emojiFallback = '✨',
  alt,
  className,
}: TransparentStickerGraphicProps) {
  const [stage, setStage] = useState<'primary' | 'fallback' | 'emoji'>(
    src ? 'primary' : fallbackSrc ? 'fallback' : 'emoji',
  );

  useEffect(() => {
    setStage(src ? 'primary' : fallbackSrc ? 'fallback' : 'emoji');
  }, [src, fallbackSrc]);

  if (stage === 'emoji') {
    return (
      <span className="crew-chat-sticker-emoji-fallback" aria-label={alt}>
        {emojiFallback}
      </span>
    );
  }

  const activeSrc = stage === 'primary' ? src : fallbackSrc;
  if (!activeSrc) {
    return (
      <span className="crew-chat-sticker-emoji-fallback" aria-label={alt}>
        {emojiFallback}
      </span>
    );
  }

  return (
    <img
      src={activeSrc}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => {
        if (stage === 'primary' && fallbackSrc && fallbackSrc !== src) {
          setStage('fallback');
        } else {
          setStage('emoji');
        }
      }}
    />
  );
}

type DrawerMode = 'none' | 'emoji' | 'sticker';
type StickerTabMode = 'browse' | 'mine';

const SPRING_BUBBLE = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 32,
  mass: 0.72,
};

const SPRING_PANEL = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 32,
  mass: 0.8,
};

export function CrewChatScreen({
  trip,
  messages,
  readReceipts,
  activeMemberId,
  activeMemberName,
  isHost,
  onlineMembers,
  typingUsers,
  onSendText,
  onSendSticker,
  onToggleReaction,
  onUnsendMessage,
  onUnsendMultiple,
  onDeleteSelected,
  onTypingChange,
  onMarkRead,
  onNotify,
  onBack,
}: CrewChatScreenProps) {
  const [draft, setDraft] = useState('');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('none');
  const [emojiCategory, setEmojiCategory] = useState(FULL_EMOJI_GROUPS[0].id);
  const [emojiQuery, setEmojiQuery] = useState('');

  // Sticker Drawer + Search + Dedicated Sticker Studio Popup
  const [stickerTab, setStickerTab] = useState<StickerTabMode>('browse');
  const [stickerQuery, setStickerQuery] = useState('');
  const [externalStickers, setExternalStickers] = useState<ExternalStickerResult[]>([]);
  const [searchingStickers, setSearchingStickers] = useState(false);
  const [customStickers, setCustomStickers] = useState<SavedCustomSticker[]>(() =>
    loadCustomStickers(),
  );
  const [createStickerOpen, setCreateStickerOpen] = useState(false);

  // Device notification shortcut state in Chat header
  const [notifPerm, setNotifPerm] = useState(() => getDeviceNotificationPermission());
  const [notifOn, setNotifOn] = useState(() => getDeviceNotificationsEnabled());

  const [replyTarget, setReplyTarget] = useState<ChatReplyPreview | null>(null);

  // IG Hold Overlay + Release Guard (prevents accidental tap/Unsend on finger lift!)
  const [holdTarget, setHoldTarget] = useState<{
    message: ChatMessage;
    isOwn: boolean;
  } | null>(null);
  const [holdInteractable, setHoldInteractable] = useState(false);

  // WA-style Multi-Select Delete Mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

  // Seen-by sheet & Online sheet
  const [seenSheetMsg, setSeenSheetMsg] = useState<ChatMessage | null>(null);
  const [onlineSheetOpen, setOnlineSheetOpen] = useState(false);
  const [heartPopId, setHeartPopId] = useState<string | null>(null);
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Horizontal swipe-to-reply state (active only for the dragged row)
  const [swipeUi, setSwipeUi] = useState<{
    id: string | null;
    offset: number;
    snapping: boolean;
  }>({ id: null, offset: 0, snapping: false });

  // Track initial history IDs so history opens instantly while new messages spring in smoothly
  const initialIdsRef = useRef<Set<string> | null>(null);
  if (initialIdsRef.current === null) {
    initialIdsRef.current = new Set(messages.map((m) => m.id));
  }

  const screenRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ id: string; at: number } | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const isNearBottomRef = useRef(true);
  const gestureRef = useRef<{
    msg: ChatMessage | null;
    pointerId: number;
    startX: number;
    startY: number;
    swiping: boolean;
    offset: number;
    thresholdHit: boolean;
  }>({
    msg: null,
    pointerId: -1,
    startX: 0,
    startY: 0,
    swiping: false,
    offset: 0,
    thresholdHit: false,
  });

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setConfirmBatchDelete(false);
  };

  useRegisterOverlay(Boolean(holdTarget) || Boolean(seenSheetMsg) || confirmBatchDelete);
  useBackHandler(
    Boolean(holdTarget),
    () => setHoldTarget(null),
    'sheet',
    'crew-chat-msg-menu',
  );
  useBackHandler(
    selectMode && !holdTarget && !seenSheetMsg && !confirmBatchDelete,
    exitSelectMode,
    'sheet',
    'crew-chat-select',
  );
  useBackHandler(
    drawerMode !== 'none' && !holdTarget && !onlineSheetOpen && !selectMode,
    () => setDrawerMode('none'),
    'sheet',
    'crew-chat-drawer',
  );

  // Release Guard for IG Hold Menu: stay non-interactive while finger is still pressed down!
  useEffect(() => {
    if (!holdTarget) {
      setHoldInteractable(false);
      return;
    }

    let released = false;
    let delayTimer: number | null = null;
    const unlock = () => {
      if (released) return;
      released = true;
      delayTimer = window.setTimeout(() => {
        setHoldInteractable(true);
      }, 95);
    };

    const safetyTimer = window.setTimeout(unlock, 340);
    window.addEventListener('pointerup', unlock, { once: true });
    window.addEventListener('touchend', unlock, { once: true });
    window.addEventListener('pointercancel', unlock, { once: true });

    return () => {
      window.clearTimeout(safetyTimer);
      if (delayTimer !== null) window.clearTimeout(delayTimer);
      window.removeEventListener('pointerup', unlock);
      window.removeEventListener('touchend', unlock);
      window.removeEventListener('pointercancel', unlock);
    };
  }, [holdTarget]);

  // Disable pinch-zoom & double-tap zoom strictly while Crew Chat is mounted (restores cleanly on close)
  useEffect(() => {
    const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const previousViewport = viewportMeta?.getAttribute('content') ?? null;
    if (viewportMeta) {
      viewportMeta.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content',
      );
    }

    const screenEl = screenRef.current;
    const blockPinch = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    const blockGesture = (e: Event) => {
      e.preventDefault();
    };
    screenEl?.addEventListener('touchstart', blockPinch, { passive: false });
    screenEl?.addEventListener('touchmove', blockPinch, { passive: false });
    screenEl?.addEventListener('gesturestart', blockGesture, { passive: false });

    return () => {
      if (viewportMeta && previousViewport !== null) {
        viewportMeta.setAttribute('content', previousViewport);
      }
      screenEl?.removeEventListener('touchstart', blockPinch);
      screenEl?.removeEventListener('touchmove', blockPinch);
      screenEl?.removeEventListener('gesturestart', blockGesture);
    };
  }, []);

  const memberById = useMemo(() => {
    const map = new Map<string, TripMember>();
    for (const m of trip.members) {
      map.set(m.id, m);
    }
    return map;
  }, [trip.members]);

  const onlineOthers = useMemo(
    () =>
      onlineMembers.filter(
        (u) => !activeMemberId || u.memberId !== activeMemberId,
      ),
    [onlineMembers, activeMemberId],
  );
  const visibleOnlineStack = onlineOthers.slice(0, 3);

  const builtInFilteredStickers = useMemo(() => {
    const q = stickerQuery.trim();
    if (!q) return [...CREW_STICKER_PACK];
    const terms = expandStickerSearchTerms(q);
    return CREW_STICKER_PACK.filter((s) => {
      const hay = `${s.caption} ${s.emoji} ${s.tags.join(' ')}`.toLowerCase();
      return terms.some((t) => hay.includes(t));
    });
  }, [stickerQuery]);

  // Live debounced search across 881 Noto Animated WebP + GIPHY/Tenor/Wikimedia transparent stickers
  useEffect(() => {
    if (drawerMode !== 'sticker' || stickerTab !== 'browse') return;
    const q = stickerQuery.trim();
    if (q.length < 1) {
      setExternalStickers([]);
      setSearchingStickers(false);
      return;
    }

    const controller = new AbortController();
    setSearchingStickers(true);
    const timer = window.setTimeout(() => {
      void searchExternalTransparentStickers(q, controller.signal)
        .then((results) => {
          if (!controller.signal.aborted) {
            setExternalStickers(results);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearchingStickers(false);
          }
        });
    }, 240);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [drawerMode, stickerTab, stickerQuery]);

  // Mark read on entry and whenever messages arrive while chat is open
  useEffect(() => {
    onMarkRead();
  }, [messages.length, onMarkRead]);

  // Keep stream anchored cleanly to the bottom as new messages / typing arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isNearBottomRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages.length, typingUsers.length]);

  // Keep pinned to bottom when mobile keyboard opens/resizes or drawer opens
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        if (isNearBottomRef.current && scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
      observer.observe(el);
    }

    return () => {
      observer?.disconnect();
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
      onTypingChange(false);
    };
  }, [onTypingChange]);

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto',
    });
    setShowScrollBottom(false);
    isNearBottomRef.current = true;
  };

  const handleScrollStream = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 110;
    setShowScrollBottom(distanceFromBottom > 160);
  };

  const handleDraftChange = (val: string) => {
    setDraft(val);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(102, ta.scrollHeight)}px`;
    }

    const hasContent = val.trim().length > 0;
    onTypingChange(hasContent);
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    if (hasContent) {
      typingTimeoutRef.current = window.setTimeout(() => {
        onTypingChange(false);
      }, 2600);
    }
  };

  const insertEmojiAtCursor = (emoji: string) => {
    triggerFeedback('tap');
    const ta = textareaRef.current;
    if (!ta) {
      handleDraftChange(draft + emoji);
      return;
    }
    const start = ta.selectionStart ?? draft.length;
    const end = ta.selectionEnd ?? draft.length;
    const nextVal = draft.slice(0, start) + emoji + draft.slice(end);
    handleDraftChange(nextVal);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus({ preventScroll: true });
        const pos = start + emoji.length;
        textareaRef.current.setSelectionRange(pos, pos);
      }
    });
  };

  const handleSendText = () => {
    const clean = sanitizeChatText(draft);
    if (!clean) return;
    primeFeedbackAudio();
    triggerFeedback('check');
    onSendText(clean, replyTarget ?? undefined);
    setDraft('');
    setReplyTarget(null);
    onTypingChange(false);
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus({ preventScroll: true });
    }
    isNearBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom(true));
  };

  const handleSendSticker = (payload: StickerSendPayload) => {
    primeFeedbackAudio();
    triggerFeedback('tap');
    onSendSticker(payload, replyTarget ?? undefined);
    setReplyTarget(null);
    setDrawerMode('none');
    isNearBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom(true));
  };

  // Support pasting keyboard stickers (Gboard / Samsung / iOS) without allowing photo uploads
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
    if (!imageItem) return;
    const blob = imageItem.getAsFile();
    if (!blob) return;

    e.preventDefault();
    void processPastedStickerBlob(blob).then((res) => {
      if (res.ok) {
        handleSendSticker({
          stickerId: 'stk-keyboard',
          stickerUrl: res.dataUrl,
          stickerCaption: 'Sticker',
        });
      } else {
        triggerFeedback('warning');
        onNotify?.(res.reason, 'info');
      }
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
    ) {
      e.preventDefault();
      handleSendText();
    }
  };

  const triggerHeartPop = (msg: ChatMessage) => {
    if (msg.deleted || selectMode) return;
    primeFeedbackAudio();
    triggerFeedback('check');
    onToggleReaction(msg.id, '❤️');
    setHeartPopId(msg.id);
    window.setTimeout(() => {
      setHeartPopId((curr) => (curr === msg.id ? null : curr));
    }, 660);
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const toggleSelectMessage = (msg: ChatMessage) => {
    triggerFeedback('tap');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msg.id)) {
        next.delete(msg.id);
      } else {
        next.add(msg.id);
      }
      return next;
    });
  };

  const handleRowPointerDown = (
    msg: ChatMessage,
    isOwn: boolean,
    e: PointerEvent<HTMLDivElement>,
  ) => {
    if (e.button > 0 || selectMode) return;
    clearLongPress();

    gestureRef.current = {
      msg,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      swiping: false,
      offset: 0,
      thresholdHit: false,
    };

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      if (gestureRef.current.swiping) return;
      triggerFeedback('toggle');
      setHoldInteractable(false);
      setHoldTarget({ message: msg, isOwn });
    }, 380);
  };

  const handleRowPointerMove = (msg: ChatMessage, e: PointerEvent<HTMLDivElement>) => {
    if (selectMode || msg.deleted) return;
    const g = gestureRef.current;
    if (g.msg?.id !== msg.id || g.pointerId !== e.pointerId) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (!g.swiping) {
      if (Math.abs(dy) > 10 || Math.abs(dx) > 10) {
        clearLongPress();
      }
      if (dx > 12 && dx > Math.abs(dy) * 1.25) {
        g.swiping = true;
      } else {
        return;
      }
    }

    const offset = Math.max(0, Math.min(72, dx * 0.62));
    g.offset = offset;
    if (offset >= 46 && !g.thresholdHit) {
      g.thresholdHit = true;
      triggerFeedback('tick');
    } else if (offset < 42) {
      g.thresholdHit = false;
    }

    setSwipeUi({ id: msg.id, offset, snapping: false });
  };

  const handleRowPointerEnd = (msg: ChatMessage, e: PointerEvent<HTMLDivElement>) => {
    clearLongPress();
    if (selectMode) return;
    const g = gestureRef.current;
    if (g.msg?.id !== msg.id || g.pointerId !== e.pointerId) return;

    const wasSwiping = g.swiping;
    const hitReply = g.thresholdHit || g.offset >= 46;
    gestureRef.current.msg = null;
    gestureRef.current.pointerId = -1;

    if (wasSwiping) {
      setSwipeUi({ id: msg.id, offset: 0, snapping: true });
      window.setTimeout(() => {
        setSwipeUi((curr) =>
          curr.id === msg.id ? { id: null, offset: 0, snapping: false } : curr,
        );
      }, 240);
      if (hitReply && !msg.deleted) {
        triggerFeedback('check');
        setReplyTarget(buildReplyPreview(msg));
        requestAnimationFrame(() =>
          textareaRef.current?.focus({ preventScroll: true }),
        );
      }
    }
  };

  const handleBubbleTap = (msg: ChatMessage) => {
    if (selectMode) {
      toggleSelectMessage(msg);
      return;
    }
    if (msg.deleted || gestureRef.current.swiping || holdTarget) return;
    const now = Date.now();
    const prevTap = lastTapRef.current;
    if (prevTap && prevTap.id === msg.id && now - prevTap.at < 290) {
      lastTapRef.current = null;
      triggerHeartPop(msg);
      return;
    }
    lastTapRef.current = { id: msg.id, at: now };
  };

  const jumpToQuotedMessage = (targetId: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-chat-id="${CSS.escape(targetId)}"]`,
    );
    if (!el) return;
    triggerFeedback('tap');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashMessageId(targetId);
    window.setTimeout(() => {
      setFlashMessageId((curr) => (curr === targetId ? null : curr));
    }, 1100);
  };

  const typingText = useMemo(() => {
    const others = typingUsers.filter(
      (u) => !activeMemberId || u.memberId !== activeMemberId,
    );
    if (others.length === 0) return '';
    if (others.length === 1) return `${others[0].memberName} is typing...`;
    if (others.length === 2)
      return `${others[0].memberName} & ${others[1].memberName} are typing...`;
    return `${others.length} crew members are typing...`;
  }, [typingUsers, activeMemberId]);

  const headerSubText = typingText
    ? typingText
    : onlineOthers.length > 0
      ? `${trip.title} · ${onlineOthers.length + 1} online`
      : trip.title;

  const canSendText = sanitizeChatText(draft).length > 0;
  const activeEmojiItems = useMemo(() => {
    if (emojiQuery.trim()) {
      return searchEmojiCatalog(emojiQuery);
    }
    return (
      FULL_EMOJI_GROUPS.find((g) => g.id === emojiCategory)?.emojis ??
      FULL_EMOJI_GROUPS[0].emojis
    );
  }, [emojiQuery, emojiCategory]);

  const holdCanUnsend =
    holdTarget &&
    !holdTarget.message.deleted &&
    (holdTarget.message.senderId === activeMemberId || isHost);

  const holdSeenList = useMemo(() => {
    if (!holdTarget) return [];
    return getMessageSeenByMembers(
      holdTarget.message,
      readReceipts,
      trip.members,
      activeMemberId,
    );
  }, [holdTarget, readReceipts, trip.members, activeMemberId]);

  const seenSheetDetails = useMemo(() => {
    if (!seenSheetMsg) return { seen: [], unseen: [] as TripMember[] };
    const seen = getMessageSeenByMembers(
      seenSheetMsg,
      readReceipts,
      trip.members,
      activeMemberId,
    );
    const seenIds = new Set(seen.map((s) => s.member.id));
    const unseen = trip.members.filter(
      (m) =>
        (!activeMemberId || m.id !== activeMemberId) &&
        m.id !== seenSheetMsg.senderId &&
        !seenIds.has(m.id),
    );
    return { seen, unseen };
  }, [seenSheetMsg, readReceipts, trip.members, activeMemberId]);

  const openHoldViaContextMenu = (msg: ChatMessage, isOwn: boolean) => {
    if (msg.deleted || selectMode) return;
    setHoldInteractable(true);
    setHoldTarget({ message: msg, isOwn });
  };

  const renderWhatsAppTicks = (msg: ChatMessage, isOwn: boolean) => {
    if (!isOwn || msg.deleted) return null;
    const seenByCount = getMessageSeenByMembers(
      msg,
      readReceipts,
      trip.members,
      activeMemberId,
    ).length;
    if (seenByCount > 0) {
      return (
        <CheckCheck
          size={13}
          strokeWidth={2.3}
          className="crew-chat-tick crew-chat-tick--read"
          aria-label="Read"
        />
      );
    }
    if (onlineOthers.length > 0 || (typeof navigator !== 'undefined' && navigator.onLine !== false)) {
      return (
        <CheckCheck
          size={13}
          strokeWidth={2.1}
          className="crew-chat-tick"
          aria-label="Delivered"
        />
      );
    }
    return (
      <Check
        size={12}
        strokeWidth={2.2}
        className="crew-chat-tick"
        aria-label="Sent"
      />
    );
  };

  const renderStickerMessage = (msg: ChatMessage, inHoldOverlay = false) => {
    const builtIn = getStickerById(msg.stickerId);
    const primaryUrl = msg.stickerUrl ?? builtIn?.url;
    const fallbackUrl = builtIn?.fallbackUrl ?? builtIn?.url;
    const isOwn = Boolean(activeMemberId && msg.senderId === activeMemberId);

    return (
      <div
        className="crew-chat-sticker-pure"
        onClick={inHoldOverlay ? undefined : () => handleBubbleTap(msg)}
        onContextMenu={
          inHoldOverlay
            ? undefined
            : (e) => {
                e.preventDefault();
                openHoldViaContextMenu(msg, isOwn);
              }
        }
      >
        {msg.replyTo && !inHoldOverlay && (
          <button
            type="button"
            className="crew-chat-sticker-reply-pill"
            onClick={(e) => {
              e.stopPropagation();
              if (selectMode) {
                toggleSelectMessage(msg);
              } else {
                jumpToQuotedMessage(msg.replyTo!.id);
              }
            }}
          >
            <span className="crew-chat-reply-quote__author">{msg.replyTo.senderName}</span>
            <span className="crew-chat-reply-quote__text">{msg.replyTo.text}</span>
          </button>
        )}
        <TransparentStickerGraphic
          src={primaryUrl}
          fallbackSrc={fallbackUrl}
          emojiFallback={builtIn?.emoji ?? '✨'}
          alt={msg.text || 'Sticker'}
          className="crew-chat-sticker-img"
        />
        <span className="crew-chat-sticker-meta">
          <span>{formatChatTime(msg.createdAt)}</span>
          {renderWhatsAppTicks(msg, isOwn)}
        </span>
        {!inHoldOverlay && heartPopId === msg.id && (
          <span className="crew-chat-heart-pop" aria-hidden="true">
            ❤️
          </span>
        )}
      </div>
    );
  };

  const renderTextMessage = (
    msg: ChatMessage,
    isOwn: boolean,
    inHoldOverlay = false,
  ) => (
    <div
      className={`crew-chat-bubble ${
        isOwn ? 'crew-chat-bubble--own' : 'crew-chat-bubble--other'
      }`}
      onClick={inHoldOverlay ? undefined : () => handleBubbleTap(msg)}
      onContextMenu={
        inHoldOverlay
          ? undefined
          : (e) => {
              e.preventDefault();
              openHoldViaContextMenu(msg, isOwn);
            }
      }
    >
      {msg.replyTo && (
        <button
          type="button"
          className="crew-chat-reply-quote"
          onClick={(e) => {
            e.stopPropagation();
            if (!inHoldOverlay) {
              if (selectMode) {
                toggleSelectMessage(msg);
              } else {
                jumpToQuotedMessage(msg.replyTo!.id);
              }
            }
          }}
        >
          <span className="crew-chat-reply-quote__author">{msg.replyTo.senderName}</span>
          <span className="crew-chat-reply-quote__text">{msg.replyTo.text}</span>
        </button>
      )}
      <p className="crew-chat-text">{msg.text}</p>
      <div className="crew-chat-meta">
        <span>{formatChatTime(msg.createdAt)}</span>
        {renderWhatsAppTicks(msg, isOwn)}
      </div>
      {!inHoldOverlay && heartPopId === msg.id && (
        <span className="crew-chat-heart-pop" aria-hidden="true">
          ❤️
        </span>
      )}
    </div>
  );

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        ref={screenRef}
        className="crew-chat-screen"
        role="dialog"
        aria-label="Crew Chat"
        initial={{ opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING_PANEL}
      >
        {/* Header: Normal Chat Header OR WA-Style Multi-Select Header */}
        <header className="crew-chat-header">
          {selectMode ? (
            <>
              <CornerOrb
                kind="close"
                ariaLabel="Cancel multi-select"
                onClick={() => {
                  triggerFeedback('tap');
                  exitSelectMode();
                }}
              />
              <div className="crew-chat-header__meta">
                <h1 className="crew-chat-header__title">
                  {selectedIds.size} selected
                </h1>
                <div className="crew-chat-header__sub">
                  Tap messages to delete from chat view
                </div>
              </div>
              <div className="crew-chat-header-actions">
                {messages.length > 0 && (
                  <button
                    type="button"
                    className="crew-chat-header-btn tactile"
                    onClick={() => {
                      triggerFeedback('tap');
                      const allSelected = selectedIds.size === messages.length;
                      setSelectedIds(
                        allSelected ? new Set() : new Set(messages.map((m) => m.id)),
                      );
                    }}
                  >
                    {selectedIds.size === messages.length ? 'None' : 'All'}
                  </button>
                )}
                <button
                  type="button"
                  className="crew-chat-header-btn crew-chat-header-btn--danger tactile"
                  disabled={selectedIds.size === 0}
                  onClick={() => {
                    triggerFeedback('warning');
                    setConfirmBatchDelete(true);
                  }}
                >
                  <Trash2 size={14} strokeWidth={2.2} />
                  <span>Delete</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <CornerOrb
                kind="back"
                ariaLabel="Back to trip hub"
                onClick={() => {
                  triggerFeedback('tap');
                  onBack();
                }}
              />
              <div className="crew-chat-header__meta">
                <h1 className="crew-chat-header__title">Crew Chat</h1>
                <div
                  className={`crew-chat-header__sub ${typingText ? 'crew-chat-header__sub--typing' : ''}`}
                >
                  {headerSubText}
                </div>
              </div>

              <button
                type="button"
                className={`crew-chat-bell-orb tactile ${
                  notifPerm === 'granted' && notifOn ? 'crew-chat-bell-orb--on' : ''
                }`}
                aria-label="Phone chat notifications"
                title="Phone chat alerts"
                onClick={() => {
                  if (notifPerm === 'default') {
                    triggerFeedback('tap');
                    void requestDeviceNotificationPermission().then((res) => {
                      setNotifPerm(res.permission);
                      setNotifOn(res.granted);
                      onNotify?.(
                        res.granted
                          ? res.shown
                            ? 'Phone notifications enabled!'
                            : res.error || 'Permission granted — check device notifications'
                          : res.error || 'Notification permission declined',
                        res.granted ? 'success' : 'info',
                      );
                    });
                    return;
                  }
                  if (notifPerm !== 'granted') {
                    triggerFeedback('warning');
                    void tryShowDeviceNotification({ title: 'Test', body: 'Test' }).then((r) => {
                      onNotify?.(r.error || 'Notifications unavailable on this browser', 'info');
                    });
                    return;
                  }
                  const next = !notifOn;
                  setDeviceNotificationsEnabled(next);
                  setNotifOn(next);
                  if (next) {
                    triggerFeedback('toggle');
                    void tryShowDeviceNotification({
                      title: 'GASKEUN! Chat Alerts Active',
                      body: `Notifications enabled for ${trip.title}.`,
                      tag: `chat-test-${Date.now()}`,
                    }).then((r) => {
                      onNotify?.(
                        r.ok ? 'Test alert sent to this phone!' : r.error || 'Blocked by OS',
                        r.ok ? 'success' : 'info',
                      );
                    });
                  } else {
                    triggerFeedback('tap');
                    onNotify?.('Phone notifications paused on this device', 'info');
                  }
                }}
              >
                {notifPerm === 'granted' && notifOn ? (
                  <Bell size={15} strokeWidth={2} />
                ) : (
                  <BellOff size={15} strokeWidth={1.9} />
                )}
              </button>

              {visibleOnlineStack.length > 0 && (
                <button
                  type="button"
                  className="crew-chat-online-pill tactile"
                  aria-label={`${onlineOthers.length} online right now`}
                  onClick={() => {
                    triggerFeedback('tap');
                    setOnlineSheetOpen(true);
                  }}
                >
                  <span className="crew-chat-online-stack">
                    {visibleOnlineStack.map((u, idx) => (
                      <span
                        key={u.memberId}
                        className="crew-chat-online-avatar"
                        style={{ zIndex: visibleOnlineStack.length - idx }}
                      >
                        <Avatar
                          initials={u.initials}
                          name={u.name}
                          src={u.avatarDataUrl}
                          size="sm"
                          bg={u.avatarBg}
                          color={u.avatarColor}
                          variant="solid"
                        />
                      </span>
                    ))}
                  </span>
                  <span className="crew-chat-online-dot" aria-hidden="true" />
                </button>
              )}
            </>
          )}
        </header>

        {/* Bottom-Anchored Message Stream */}
        <div className="crew-chat-scroll-wrap">
          <div
            ref={scrollRef}
            className="crew-chat-scroll"
            onScroll={handleScrollStream}
          >
            {messages.length === 0 ? (
              <motion.div
                className="crew-chat-empty"
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={SPRING_PANEL}
              >
                <div className="crew-chat-empty__icon" aria-hidden="true">
                  <MessageCircle size={24} strokeWidth={1.85} />
                </div>
                <h2 className="crew-chat-empty__title">Start the Crew Chat</h2>
                <p className="crew-chat-empty__desc">
                  Coordinate meetups, quick check-ins, and transparent stickers with your crew — text &amp; stickers only.
                </p>
                <div className="crew-chat-empty__starters">
                  {CREW_STICKER_PACK.slice(0, 3).map((stk) => (
                    <button
                      key={stk.id}
                      type="button"
                      className="crew-chat-starter-sticker tactile"
                      onClick={() => handleSendSticker({ stickerId: stk.id })}
                    >
                      <TransparentStickerGraphic
                        src={stk.url}
                        fallbackSrc={stk.fallbackUrl}
                        emojiFallback={stk.emoji}
                        alt={stk.caption}
                        className="crew-chat-sticker-btn__img"
                      />
                      <span className="crew-chat-starter-sticker__label">{stk.caption}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <div className="crew-chat-stream-inner">
                {messages.map((msg, idx) => {
                  const prevMsg = idx > 0 ? messages[idx - 1] : undefined;
                  const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : undefined;
                  const showDayDivider =
                    !prevMsg || getChatDateKey(prevMsg.createdAt) !== getChatDateKey(msg.createdAt);
                  const groupedWithPrev = isGroupedWithPrevious(prevMsg, msg);
                  const groupedWithNext = Boolean(nextMsg && isGroupedWithPrevious(msg, nextMsg));
                  const isOwn = Boolean(activeMemberId && msg.senderId === activeMemberId);
                  const senderMember = memberById.get(msg.senderId);
                  const reactionEntries = countTotalReactions(msg.reactions);

                  const isNewMessage = !initialIdsRef.current?.has(msg.id);
                  const isBeingSwiped = swipeUi.id === msg.id;
                  const offset = isBeingSwiped ? swipeUi.offset : 0;
                  const swipeProgress = Math.min(1, offset / 46);
                  const swipeReady = offset >= 46;
                  const isSelected = selectedIds.has(msg.id);

                  return (
                    <motion.div
                      key={msg.id}
                      data-chat-id={msg.id}
                      layout="position"
                      initial={
                        isNewMessage
                          ? { opacity: 0, y: 18, scale: 0.93 }
                          : false
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={SPRING_BUBBLE}
                      className={[
                        'crew-chat-swipe-stage',
                        groupedWithPrev && !showDayDivider ? 'crew-chat-swipe-stage--grouped' : '',
                        selectMode ? 'crew-chat-swipe-stage--selectable' : '',
                        selectMode && isSelected ? 'crew-chat-swipe-stage--selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={
                        selectMode
                          ? () => toggleSelectMessage(msg)
                          : undefined
                      }
                    >
                      {showDayDivider && (
                        <div className="crew-chat-day-divider">
                          {formatChatDayDivider(msg.createdAt)}
                        </div>
                      )}

                      {!msg.deleted && offset > 4 && (
                        <div
                          className={`crew-chat-swipe-indicator ${
                            swipeReady ? 'crew-chat-swipe-indicator--ready' : ''
                          }`}
                          style={{
                            opacity: swipeProgress,
                            transform: `scale(${0.65 + swipeProgress * 0.4})`,
                          }}
                          aria-hidden="true"
                        >
                          <Reply size={15} strokeWidth={2.2} />
                        </div>
                      )}

                      <div
                        className={[
                          'crew-chat-row',
                          isOwn ? 'crew-chat-row--own' : 'crew-chat-row--other',
                          isBeingSwiped && swipeUi.snapping ? 'crew-chat-row--snap' : '',
                          flashMessageId === msg.id ? 'crew-chat-row--flash' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={
                          offset > 0
                            ? { transform: `translate3d(${offset}px, 0, 0)` }
                            : undefined
                        }
                        onPointerDown={(e) => handleRowPointerDown(msg, isOwn, e)}
                        onPointerMove={(e) => handleRowPointerMove(msg, e)}
                        onPointerUp={(e) => handleRowPointerEnd(msg, e)}
                        onPointerCancel={(e) => handleRowPointerEnd(msg, e)}
                      >
                        {selectMode && (
                          <span
                            className={`crew-chat-select-check ${
                              isSelected ? 'crew-chat-select-check--on' : ''
                            }`}
                            aria-hidden="true"
                          >
                            {isSelected && <Check size={13} strokeWidth={2.8} />}
                          </span>
                        )}

                        {!isOwn && (
                          <div className="crew-chat-avatar-col">
                            {!groupedWithNext && (
                              <Avatar
                                initials={
                                  senderMember?.initials ??
                                  msg.senderName.slice(0, 2).toUpperCase()
                                }
                                name={senderMember?.name ?? msg.senderName}
                                src={senderMember?.avatarDataUrl}
                                size="sm"
                                bg={senderMember?.avatarBg ?? '#E3EDE6'}
                                color={senderMember?.avatarColor ?? '#2D4A42'}
                                variant="solid"
                              />
                            )}
                          </div>
                        )}

                        <div className="crew-chat-col">
                          {!isOwn && (!groupedWithPrev || showDayDivider) && (
                            <div className="crew-chat-sender">
                              {senderMember?.name ?? msg.senderName}
                            </div>
                          )}

                          {msg.deleted ? (
                            <div className="crew-chat-bubble crew-chat-bubble--deleted">
                              Message unsent
                            </div>
                          ) : msg.kind === 'sticker' ? (
                            renderStickerMessage(msg, false)
                          ) : (
                            renderTextMessage(msg, isOwn, false)
                          )}

                          <AnimatePresence initial={false}>
                            {!msg.deleted && reactionEntries.length > 0 && (
                              <motion.div
                                className="crew-chat-reactions"
                                initial={{ opacity: 0, scale: 0.85, y: 4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.8 }}
                                transition={SPRING_BUBBLE}
                              >
                                {reactionEntries.map(({ emoji, memberIds }) => {
                                  const mine = Boolean(
                                    activeMemberId && memberIds.includes(activeMemberId),
                                  );
                                  const names = memberIds
                                    .map((id) => memberById.get(id)?.name ?? id)
                                    .join(', ');
                                  return (
                                    <motion.button
                                      key={emoji}
                                      layout
                                      type="button"
                                      whileTap={{ scale: 0.9 }}
                                      className={`crew-chat-reaction-chip ${
                                        mine ? 'crew-chat-reaction-chip--mine' : ''
                                      }`}
                                      title={names}
                                      onClick={(e) => {
                                        if (selectMode) return;
                                        e.stopPropagation();
                                        primeFeedbackAudio();
                                        triggerFeedback('check');
                                        onToggleReaction(msg.id, emoji);
                                      }}
                                    >
                                      <span>{emoji}</span>
                                      {memberIds.length > 1 && <span>{memberIds.length}</span>}
                                    </motion.button>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                <AnimatePresence>
                  {typingText && (
                    <motion.div
                      key="typing-indicator"
                      className="crew-chat-typing-row"
                      aria-live="polite"
                      initial={{ opacity: 0, y: 8, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.94 }}
                      transition={SPRING_BUBBLE}
                    >
                      <div className="crew-chat-typing-bubble">
                        <span className="crew-chat-typing-dots" aria-hidden="true">
                          <span />
                          <span />
                          <span />
                        </span>
                        <span>{typingText}</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <AnimatePresence>
            {showScrollBottom && (
              <motion.button
                key="scroll-bottom"
                type="button"
                className="crew-chat-scroll-bottom"
                aria-label="Scroll to latest messages"
                initial={{ opacity: 0, y: 12, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                whileTap={{ scale: 0.94 }}
                transition={SPRING_BUBBLE}
                onClick={() => scrollToBottom(true)}
              >
                <ChevronDown size={15} strokeWidth={2.2} />
                <span>Latest</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Composer (Hidden in Multi-Select Mode) */}
        {!selectMode && (
          <footer className="crew-chat-composer-wrap">
            <AnimatePresence initial={false}>
              {replyTarget && (
                <motion.div
                  key="reply-banner"
                  className="crew-chat-reply-banner"
                  initial={{ opacity: 0, y: 8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: 6, height: 0 }}
                  transition={SPRING_PANEL}
                >
                  <Reply size={14} strokeWidth={2} style={{ color: 'var(--brand-matcha)' }} />
                  <div className="crew-chat-reply-banner__body">
                    <div className="crew-chat-reply-banner__title">
                      Replying to {replyTarget.senderName}
                    </div>
                    <div className="crew-chat-reply-banner__snippet">{replyTarget.text}</div>
                  </div>
                  <button
                    type="button"
                    className="crew-chat-reply-banner__close"
                    aria-label="Cancel reply"
                    onClick={() => setReplyTarget(null)}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {drawerMode === 'emoji' && (
                <motion.div
                  key="drawer-emoji"
                  className="crew-chat-drawer"
                  aria-label="Full emoji picker"
                  initial={{ opacity: 0, y: 14, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.97 }}
                  transition={SPRING_PANEL}
                >
                  <div className="crew-chat-drawer__tabs">
                    <div className="crew-chat-drawer__pills">
                      {FULL_EMOJI_GROUPS.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          className={`crew-chat-drawer__pill ${
                            !emojiQuery && emojiCategory === cat.id
                              ? 'crew-chat-drawer__pill--active'
                              : ''
                          }`}
                          onPointerDown={(e) => e.preventDefault()}
                          onClick={() => {
                            triggerFeedback('tap');
                            setEmojiQuery('');
                            setEmojiCategory(cat.id);
                          }}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="crew-chat-reply-banner__close"
                      aria-label="Close emoji picker"
                      onClick={() => setDrawerMode('none')}
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
                  </div>

                  <div className="crew-chat-sticker-search-row">
                    <Search size={15} strokeWidth={2} />
                    <input
                      type="text"
                      inputMode="search"
                      enterKeyHint="search"
                      className="crew-chat-sticker-search"
                      placeholder="Search emoji (e.g. batu, moai, fire, nangis)..."
                      value={emojiQuery}
                      onChange={(e) => setEmojiQuery(e.target.value)}
                    />
                    {emojiQuery && (
                      <button
                        type="button"
                        className="crew-chat-reply-banner__close"
                        aria-label="Clear emoji search"
                        onClick={() => setEmojiQuery('')}
                      >
                        <X size={13} strokeWidth={2} />
                      </button>
                    )}
                  </div>

                  <div className="crew-chat-emoji-grid">
                    {activeEmojiItems.slice(0, 160).map((item) => (
                      <button
                        key={item.emoji}
                        type="button"
                        className="crew-chat-emoji-btn"
                        aria-label={`Insert ${item.name}`}
                        title={item.name}
                        onPointerDown={(e) => e.preventDefault()}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertEmojiAtCursor(item.emoji)}
                      >
                        {item.emoji}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {drawerMode === 'sticker' && (
                <motion.div
                  key="drawer-sticker"
                  className="crew-chat-drawer"
                  aria-label="Transparent stickers"
                  initial={{ opacity: 0, y: 14, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.97 }}
                  transition={SPRING_PANEL}
                >
                  <div className="crew-chat-drawer__tabs">
                    <div className="crew-chat-drawer__pills">
                      <button
                        type="button"
                        className={`crew-chat-drawer__pill ${
                          stickerTab === 'browse' ? 'crew-chat-drawer__pill--active' : ''
                        }`}
                        onClick={() => {
                          triggerFeedback('tap');
                          setStickerTab('browse');
                        }}
                      >
                        Stickers
                      </button>
                      <button
                        type="button"
                        className={`crew-chat-drawer__pill ${
                          stickerTab === 'mine' ? 'crew-chat-drawer__pill--active' : ''
                        }`}
                        onClick={() => {
                          triggerFeedback('tap');
                          setStickerTab('mine');
                        }}
                      >
                        My Stickers {customStickers.length > 0 ? `(${customStickers.length})` : ''}
                      </button>
                      <button
                        type="button"
                        className="crew-chat-drawer__pill"
                        onClick={() => {
                          triggerFeedback('tap');
                          setDrawerMode('none');
                          setCreateStickerOpen(true);
                        }}
                      >
                        <Plus size={12} strokeWidth={2.5} />
                        <span>Create</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      className="crew-chat-reply-banner__close"
                      aria-label="Close stickers"
                      onClick={() => setDrawerMode('none')}
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
                  </div>

                  {stickerTab === 'browse' && (
                    <>
                      <div className="crew-chat-sticker-search-row">
                        <Search size={15} strokeWidth={2} />
                        <input
                          type="text"
                          inputMode="search"
                          enterKeyHint="search"
                          className="crew-chat-sticker-search"
                          placeholder="Search stickers (e.g. keren, cat, coffee)..."
                          value={stickerQuery}
                          onChange={(e) => setStickerQuery(e.target.value)}
                        />
                        {stickerQuery && (
                          <button
                            type="button"
                            className="crew-chat-reply-banner__close"
                            aria-label="Clear search"
                            onClick={() => setStickerQuery('')}
                          >
                            <X size={13} strokeWidth={2} />
                          </button>
                        )}
                      </div>

                      <div className="crew-chat-sticker-grid">
                        {builtInFilteredStickers.map((stk) => (
                          <button
                            key={stk.id}
                            type="button"
                            className="crew-chat-sticker-btn tactile"
                            onClick={() =>
                              handleSendSticker({
                                stickerId: stk.id,
                                stickerUrl: stk.url,
                                stickerCaption: stk.caption,
                              })
                            }
                          >
                            <TransparentStickerGraphic
                              src={stk.url}
                              fallbackSrc={stk.fallbackUrl}
                              emojiFallback={stk.emoji}
                              alt={stk.caption}
                              className="crew-chat-sticker-btn__img"
                            />
                            <span className="crew-chat-sticker-btn__caption">{stk.caption}</span>
                          </button>
                        ))}

                        {externalStickers.map((ext) => (
                          <button
                            key={ext.id}
                            type="button"
                            className="crew-chat-sticker-btn tactile"
                            onClick={() =>
                              handleSendSticker({
                                stickerId: ext.id,
                                stickerUrl: ext.url,
                                stickerCaption: ext.caption,
                              })
                            }
                          >
                            <TransparentStickerGraphic
                              src={ext.url}
                              fallbackSrc={ext.fallbackUrl}
                              emojiFallback={ext.emojiFallback ?? '✨'}
                              alt={ext.caption}
                              className="crew-chat-sticker-btn__img"
                            />
                            <span className="crew-chat-sticker-btn__caption">{ext.caption}</span>
                          </button>
                        ))}
                      </div>

                      {searchingStickers ? (
                        <div className="crew-chat-sticker-status">
                          Searching online transparent stickers...
                        </div>
                      ) : (
                        builtInFilteredStickers.length === 0 &&
                        externalStickers.length === 0 && (
                          <div className="crew-chat-sticker-status">
                            No matches — try &quot;cool&quot;, &quot;love&quot;, or tap + Create to make your own!
                          </div>
                        )
                      )}
                    </>
                  )}

                  {stickerTab === 'mine' && (
                    <>
                      {customStickers.length === 0 ? (
                        <div className="crew-chat-sticker-status">
                          No custom stickers yet — tap <strong>+ Create</strong> to design your own!
                        </div>
                      ) : (
                        <div className="crew-chat-sticker-grid">
                          {customStickers.map((mine) => (
                            <div key={mine.id} className="crew-chat-sticker-item-wrap">
                              <button
                                type="button"
                                className="crew-chat-sticker-delete"
                                aria-label={`Delete ${mine.caption}`}
                                onClick={() => {
                                  triggerFeedback('warning');
                                  setCustomStickers(deleteCustomSticker(mine.id));
                                }}
                              >
                                <X size={10} strokeWidth={2.5} />
                              </button>
                              <button
                                type="button"
                                className="crew-chat-sticker-btn tactile"
                                onClick={() =>
                                  handleSendSticker({
                                    stickerId: mine.id,
                                    stickerUrl: mine.dataUrl,
                                    stickerCaption: mine.caption,
                                  })
                                }
                              >
                                <img
                                  src={mine.dataUrl}
                                  alt={mine.caption}
                                  className="crew-chat-sticker-btn__img"
                                />
                                <span className="crew-chat-sticker-btn__caption">{mine.caption}</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="crew-chat-input-row">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                className={`crew-chat-icon-btn ${
                  drawerMode === 'emoji' ? 'crew-chat-icon-btn--active' : ''
                }`}
                aria-label={drawerMode === 'emoji' ? 'Close emoji picker' : 'Open emoji picker'}
                aria-pressed={drawerMode === 'emoji'}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  triggerFeedback('toggle');
                  setDrawerMode((prev) => (prev === 'emoji' ? 'none' : 'emoji'));
                }}
              >
                <Smile size={19} strokeWidth={1.9} />
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                className={`crew-chat-icon-btn ${
                  drawerMode === 'sticker' ? 'crew-chat-icon-btn--active' : ''
                }`}
                aria-label={drawerMode === 'sticker' ? 'Close stickers' : 'Open stickers'}
                aria-pressed={drawerMode === 'sticker'}
                onClick={() => {
                  triggerFeedback('toggle');
                  setDrawerMode((prev) => (prev === 'sticker' ? 'none' : 'sticker'));
                }}
              >
                {drawerMode === 'sticker' ? (
                  <X size={18} strokeWidth={2} />
                ) : (
                  <Sticker size={19} strokeWidth={1.9} />
                )}
              </motion.button>

              <div className="crew-chat-input-box">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  className="crew-chat-textarea"
                  placeholder={`Message as ${activeMemberName}...`}
                  value={draft}
                  maxLength={1000}
                  onFocus={() => setDrawerMode('none')}
                  onPaste={handlePaste}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
              </div>

              <motion.button
                type="button"
                whileTap={canSendText ? { scale: 0.88 } : undefined}
                className="crew-chat-send-btn"
                aria-label="Send message"
                disabled={!canSendText}
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleSendText}
              >
                <Send size={17} strokeWidth={2.1} />
              </motion.button>
            </div>
          </footer>
        )}

        {/* Portaled IG-Style Long-Press (Hold) Menu with Release Guard & Dynamic Alignment */}
        {typeof document !== 'undefined' &&
          createPortal(
            <AnimatePresence>
              {holdTarget && (
                <motion.div
                  key="ig-hold-overlay"
                  className="crew-chat-action-backdrop"
                  role="presentation"
                  style={{ pointerEvents: holdInteractable ? 'auto' : 'none' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  onClick={() => {
                    if (!holdInteractable) return;
                    setHoldTarget(null);
                  }}
                >
                  <div
                    className={`crew-chat-hold-stack ${
                      holdTarget.isOwn ? 'crew-chat-hold-stack--own' : 'crew-chat-hold-stack--other'
                    }`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Emoji Reaction Bar ABOVE held message (normal messages only) */}
                    {!holdTarget.message.deleted && (
                      <motion.div
                        className="crew-chat-reaction-bar"
                        role="group"
                        aria-label="Quick emoji reactions"
                        initial={{ opacity: 0, y: 10, scale: 0.88 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.9 }}
                        transition={SPRING_BUBBLE}
                      >
                        {CHAT_QUICK_REACTIONS.map((emoji) => {
                          const list = holdTarget.message.reactions?.[emoji] ?? [];
                          const active = Boolean(activeMemberId && list.includes(activeMemberId));
                          return (
                            <motion.button
                              key={emoji}
                              type="button"
                              whileTap={{ scale: 0.85 }}
                              className={`crew-chat-reaction-pick ${
                                active ? 'crew-chat-reaction-pick--active' : ''
                              }`}
                              aria-label={`React with ${emoji}`}
                              aria-pressed={active}
                              onClick={() => {
                                if (!holdInteractable) return;
                                primeFeedbackAudio();
                                triggerFeedback('check');
                                onToggleReaction(holdTarget.message.id, emoji);
                                setHoldTarget(null);
                              }}
                            >
                              {emoji}
                            </motion.button>
                          );
                        })}
                      </motion.div>
                    )}

                    {/* Highlighted Message Preview */}
                    <motion.div
                      className="crew-chat-hold-preview"
                      initial={{ opacity: 0, scale: 0.94 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={SPRING_BUBBLE}
                    >
                      {holdTarget.message.deleted ? (
                        <div className="crew-chat-bubble crew-chat-bubble--deleted">
                          Message unsent
                        </div>
                      ) : holdTarget.message.kind === 'sticker' ? (
                        renderStickerMessage(holdTarget.message, true)
                      ) : (
                        renderTextMessage(holdTarget.message, holdTarget.isOwn, true)
                      )}
                    </motion.div>

                    {/* Action Menu BELOW held message */}
                    <motion.div
                      className="crew-chat-action-sheet"
                      initial={{ opacity: 0, y: -10, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.94 }}
                      transition={{ ...SPRING_BUBBLE, delay: 0.03 }}
                    >
                      {!holdTarget.message.deleted && (
                        <button
                          type="button"
                          className="crew-chat-action-item"
                          onClick={() => {
                            if (!holdInteractable) return;
                            triggerFeedback('tap');
                            setReplyTarget(buildReplyPreview(holdTarget.message));
                            setHoldTarget(null);
                            requestAnimationFrame(() =>
                              textareaRef.current?.focus({ preventScroll: true }),
                            );
                          }}
                        >
                          <span>Reply</span>
                          <Reply size={16} strokeWidth={2} />
                        </button>
                      )}

                      {!holdTarget.message.deleted && holdTarget.message.kind === 'text' && (
                        <button
                          type="button"
                          className="crew-chat-action-item"
                          onClick={() => {
                            if (!holdInteractable) return;
                            triggerFeedback('check');
                            if (navigator.clipboard?.writeText) {
                              void navigator.clipboard.writeText(holdTarget.message.text);
                            }
                            setHoldTarget(null);
                            onNotify?.('Message copied', 'info');
                          }}
                        >
                          <span>Copy</span>
                          <Copy size={16} strokeWidth={2} />
                        </button>
                      )}

                      <button
                        type="button"
                        className="crew-chat-action-item"
                        onClick={() => {
                          if (!holdInteractable) return;
                          triggerFeedback('tap');
                          const target = holdTarget.message;
                          setHoldTarget(null);
                          setSelectMode(true);
                          setSelectedIds(new Set([target.id]));
                        }}
                      >
                        <span>Select</span>
                        <CheckSquare size={16} strokeWidth={2} />
                      </button>

                      {!holdTarget.message.deleted && (
                        <button
                          type="button"
                          className="crew-chat-action-item"
                          onClick={() => {
                            if (!holdInteractable) return;
                            triggerFeedback('tap');
                            const target = holdTarget.message;
                            setHoldTarget(null);
                            setSeenSheetMsg(target);
                          }}
                        >
                          <span>
                            Seen by {holdSeenList.length > 0 ? `(${holdSeenList.length})` : ''}
                          </span>
                          <Eye size={16} strokeWidth={2} />
                        </button>
                      )}

                      <button
                        type="button"
                        className="crew-chat-action-item crew-chat-action-item--danger"
                        onClick={() => {
                          if (!holdInteractable) return;
                          triggerFeedback('warning');
                          const id = holdTarget.message.id;
                          setHoldTarget(null);
                          onDeleteSelected?.([id]);
                        }}
                      >
                        <span>Delete</span>
                        <Trash2 size={16} strokeWidth={2} />
                      </button>

                      {holdCanUnsend && (
                        <button
                          type="button"
                          className="crew-chat-action-item crew-chat-action-item--danger"
                          onClick={() => {
                            if (!holdInteractable) return;
                            triggerFeedback('warning');
                            onUnsendMessage(holdTarget.message.id);
                            setHoldTarget(null);
                          }}
                        >
                          <span>Unsend</span>
                          <Trash2 size={16} strokeWidth={2} />
                        </button>
                      )}
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>,
            document.body,
          )}

        {/* Batch Delete Confirmation (Clean removal from chat view, never leaves "Message unsent") */}
        <ConfirmDialog
          open={confirmBatchDelete}
          title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? 'message' : 'messages'}?`}
          description='Clears selected messages cleanly from your chat view without leaving "Message unsent" notices.'
          confirmLabel="Delete"
          destructive
          onCancel={() => setConfirmBatchDelete(false)}
          onConfirm={() => {
            const ids = Array.from(selectedIds);
            setConfirmBatchDelete(false);
            if (onDeleteSelected) {
              onDeleteSelected(ids);
            } else if (onUnsendMultiple) {
              onUnsendMultiple(ids);
            } else {
              for (const id of ids) onUnsendMessage(id);
            }
            exitSelectMode();
          }}
        />

        {/* Seen By Detail Bottom Sheet */}
        <LiquidBottomSheet
          open={Boolean(seenSheetMsg)}
          onClose={() => setSeenSheetMsg(null)}
          title="Seen By"
          subtitle={
            seenSheetMsg
              ? `Message at ${formatChatTime(seenSheetMsg.createdAt)}`
              : undefined
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--brand-forest)',
              }}
            >
              Read ({seenSheetDetails.seen.length})
            </div>

            {seenSheetDetails.seen.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '4px 0' }}>
                No crew members have opened chat since this message yet.
              </div>
            ) : (
              seenSheetDetails.seen.map(({ member, seenAt }) => (
                <div
                  key={member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 10px',
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.72)',
                    border: '1px solid rgba(45,74,66,0.08)',
                  }}
                >
                  <Avatar
                    initials={member.initials}
                    name={member.name}
                    src={member.avatarDataUrl}
                    size="sm"
                    bg={member.avatarBg}
                    color={member.avatarColor}
                    variant="solid"
                  />
                  <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: '0.88rem' }}>
                    {member.name}
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: 'var(--brand-matcha)',
                    }}
                  >
                    <CheckCheck size={14} strokeWidth={2.2} />
                    <span>{formatChatTime(seenAt)}</span>
                  </div>
                </div>
              ))
            )}

            {seenSheetDetails.unseen.length > 0 && (
              <>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--text-muted)',
                  }}
                >
                  Not Yet ({seenSheetDetails.unseen.length})
                </div>
                {seenSheetDetails.unseen.map((member) => (
                  <div
                    key={member.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '6px 10px',
                      borderRadius: 14,
                      background: 'rgba(255,255,255,0.45)',
                      opacity: 0.72,
                    }}
                  >
                    <Avatar
                      initials={member.initials}
                      name={member.name}
                      src={member.avatarDataUrl}
                      size="sm"
                      bg={member.avatarBg}
                      color={member.avatarColor}
                      variant="solid"
                    />
                    <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{member.name}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </LiquidBottomSheet>

        {/* Online Now Sheet */}
        <LiquidBottomSheet
          open={onlineSheetOpen}
          onClose={() => setOnlineSheetOpen(false)}
          title="Online Now"
          subtitle={`${onlineOthers.length + 1} active in ${trip.code}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {onlineMembers.map((u) => {
              const isYou = Boolean(activeMemberId && u.memberId === activeMemberId);
              return (
                <div
                  key={u.memberId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '8px 10px',
                    borderRadius: 16,
                    background: 'rgba(255,255,255,0.68)',
                    border: '1px solid rgba(45,74,66,0.08)',
                  }}
                >
                  <Avatar
                    initials={u.initials}
                    name={u.name}
                    src={u.avatarDataUrl}
                    size="sm"
                    bg={u.avatarBg}
                    color={u.avatarColor}
                    variant="solid"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {u.name} {isYou ? '(You)' : ''}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Active in {trip.code}
                    </div>
                  </div>
                  <span className="crew-chat-online-dot" aria-hidden="true" />
                </div>
              );
            })}
          </div>
        </LiquidBottomSheet>

        {/* Dedicated Popup Sticker Maker Studio (Gallery -> Crop -> Text) */}
        <CreateStickerSheet
          open={createStickerOpen}
          onSaveAndSend={(created) => {
            setCustomStickers(saveCustomSticker(created));
            setStickerTab('mine');
            handleSendSticker({
              stickerId: created.id,
              stickerUrl: created.dataUrl,
              stickerCaption: created.caption,
            });
          }}
          onClose={() => setCreateStickerOpen(false)}
        />
      </motion.div>
    </MotionConfig>
  );
}
export default CrewChatScreen;
