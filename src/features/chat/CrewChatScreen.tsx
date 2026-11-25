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
import {
  ChevronDown,
  Copy,
  MessageCircle,
  Reply,
  Search,
  Send,
  Smile,
  Sticker,
  Trash2,
  X,
} from 'lucide-react';
import { Avatar, CornerOrb, LiquidBottomSheet, type ToastTone } from '../../components/atoms';
import { useRegisterOverlay } from '../../context/OverlayContext';
import {
  buildReplyPreview,
  CHAT_EMOJI_CATEGORIES,
  CHAT_QUICK_REACTIONS,
  countTotalReactions,
  CREW_STICKER_PACK,
  formatChatDayDivider,
  formatChatTime,
  getChatDateKey,
  getStickerById,
  isGroupedWithPrevious,
  sanitizeChatText,
  searchBuiltInStickers,
} from '../../services/chat';
import {
  processPastedStickerBlob,
  searchExternalTransparentStickers,
  type ExternalStickerResult,
} from '../../services/stickerSearch';
import { primeFeedbackAudio, triggerFeedback } from '../../services/feedback';
import { useBackHandler } from '../../services/pwaHistory';
import type {
  ChatMessage,
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

export function CrewChatScreen({
  trip,
  messages,
  activeMemberId,
  activeMemberName,
  isHost,
  onlineMembers,
  typingUsers,
  onSendText,
  onSendSticker,
  onToggleReaction,
  onUnsendMessage,
  onTypingChange,
  onMarkRead,
  onNotify,
  onBack,
}: CrewChatScreenProps) {
  const [draft, setDraft] = useState('');
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('none');
  const [emojiCategory, setEmojiCategory] = useState(CHAT_EMOJI_CATEGORIES[0].id);
  const [stickerQuery, setStickerQuery] = useState('');
  const [externalStickers, setExternalStickers] = useState<ExternalStickerResult[]>([]);
  const [searchingStickers, setSearchingStickers] = useState(false);

  const [replyTarget, setReplyTarget] = useState<ChatReplyPreview | null>(null);
  const [holdTarget, setHoldTarget] = useState<{
    message: ChatMessage;
    isOwn: boolean;
  } | null>(null);
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

  useRegisterOverlay(Boolean(holdTarget));
  useBackHandler(
    Boolean(holdTarget),
    () => setHoldTarget(null),
    'sheet',
    'crew-chat-msg-menu',
  );
  useBackHandler(
    drawerMode !== 'none' && !holdTarget && !onlineSheetOpen,
    () => setDrawerMode('none'),
    'sheet',
    'crew-chat-drawer',
  );

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

  const builtInFilteredStickers = useMemo(
    () => searchBuiltInStickers(stickerQuery),
    [stickerQuery],
  );

  // Live debounced search for external transparent PNG/WebP stickers (with built-in fallback)
  useEffect(() => {
    if (drawerMode !== 'sticker') return;
    const q = stickerQuery.trim();
    if (q.length < 2) {
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
    }, 320);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [drawerMode, stickerQuery]);

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

  // Keep pinned to bottom when mobile keyboard opens/resizes or sticker drawer opens
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
      // Keep focus in input so mobile keyboard never collapses on Send
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
    if (msg.deleted) return;
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

  const handleRowPointerDown = (
    msg: ChatMessage,
    isOwn: boolean,
    e: PointerEvent<HTMLDivElement>,
  ) => {
    if (msg.deleted || e.button > 0) return;
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
      setHoldTarget({ message: msg, isOwn });
    }, 360);
  };

  const handleRowPointerMove = (msg: ChatMessage, e: PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (g.msg?.id !== msg.id || g.pointerId !== e.pointerId) return;

    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;

    if (!g.swiping) {
      if (Math.abs(dy) > 10 || Math.abs(dx) > 10) {
        clearLongPress();
      }
      // Lock horizontal right-swipe gesture once horizontal motion clearly dominates
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
    if (msg.deleted || gestureRef.current.swiping) return;
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
      ? `${onlineOthers.length + 1} online · ${trip.code}`
      : `${trip.code} · Text & stickers only`;

  const canSendText = sanitizeChatText(draft).length > 0;
  const activeEmojiList =
    CHAT_EMOJI_CATEGORIES.find((c) => c.id === emojiCategory)?.emojis ??
    CHAT_EMOJI_CATEGORIES[0].emojis;

  const holdCanUnsend =
    holdTarget &&
    !holdTarget.message.deleted &&
    (holdTarget.message.senderId === activeMemberId || isHost);

  const renderStickerMessage = (msg: ChatMessage, inHoldOverlay = false) => {
    const builtIn = getStickerById(msg.stickerId);
    const primaryUrl = msg.stickerUrl ?? builtIn?.url;
    const fallbackUrl = builtIn?.fallbackUrl ?? builtIn?.url;

    return (
      <div
        className="crew-chat-sticker-pure"
        onClick={inHoldOverlay ? undefined : () => handleBubbleTap(msg)}
        onContextMenu={
          inHoldOverlay
            ? undefined
            : (e) => {
                e.preventDefault();
                setHoldTarget({
                  message: msg,
                  isOwn: Boolean(activeMemberId && msg.senderId === activeMemberId),
                });
              }
        }
      >
        {msg.replyTo && !inHoldOverlay && (
          <button
            type="button"
            className="crew-chat-sticker-reply-pill"
            onClick={(e) => {
              e.stopPropagation();
              jumpToQuotedMessage(msg.replyTo!.id);
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
        <span className="crew-chat-sticker-meta">{formatChatTime(msg.createdAt)}</span>
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
              setHoldTarget({ message: msg, isOwn });
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
              jumpToQuotedMessage(msg.replyTo!.id);
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
      </div>
      {!inHoldOverlay && heartPopId === msg.id && (
        <span className="crew-chat-heart-pop" aria-hidden="true">
          ❤️
        </span>
      )}
    </div>
  );

  return (
    <div
      ref={screenRef}
      className="crew-chat-screen"
      role="dialog"
      aria-label="Crew Chat"
    >
      {/* Header (Text & Stickers Only — Zero Call/VC/Media Controls) */}
      <header className="crew-chat-header">
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
      </header>

      {/* Bottom-Anchored Message Stream */}
      <div className="crew-chat-scroll-wrap">
        <div
          ref={scrollRef}
          className="crew-chat-scroll"
          onScroll={handleScrollStream}
        >
          {messages.length === 0 ? (
            <div className="crew-chat-empty">
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
            </div>
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

                const isBeingSwiped = swipeUi.id === msg.id;
                const offset = isBeingSwiped ? swipeUi.offset : 0;
                const swipeProgress = Math.min(1, offset / 46);
                const swipeReady = offset >= 46;

                return (
                  <div
                    key={msg.id}
                    data-chat-id={msg.id}
                    className={`crew-chat-swipe-stage ${
                      groupedWithPrev && !showDayDivider ? 'crew-chat-swipe-stage--grouped' : ''
                    }`}
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

                        {!msg.deleted && reactionEntries.length > 0 && (
                          <div className="crew-chat-reactions">
                            {reactionEntries.map(({ emoji, memberIds }) => {
                              const mine = Boolean(
                                activeMemberId && memberIds.includes(activeMemberId),
                              );
                              const names = memberIds
                                .map((id) => memberById.get(id)?.name ?? id)
                                .join(', ');
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  className={`crew-chat-reaction-chip tactile ${
                                    mine ? 'crew-chat-reaction-chip--mine' : ''
                                  }`}
                                  title={names}
                                  onClick={() => {
                                    primeFeedbackAudio();
                                    triggerFeedback('check');
                                    onToggleReaction(msg.id, emoji);
                                  }}
                                >
                                  <span>{emoji}</span>
                                  {memberIds.length > 1 && <span>{memberIds.length}</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {typingText && (
                <div className="crew-chat-typing-row" aria-live="polite">
                  <div className="crew-chat-typing-bubble">
                    <span className="crew-chat-typing-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    <span>{typingText}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {showScrollBottom && (
          <button
            type="button"
            className="crew-chat-scroll-bottom tactile"
            aria-label="Scroll to latest messages"
            onClick={() => scrollToBottom(true)}
          >
            <ChevronDown size={15} strokeWidth={2.2} />
            <span>Latest</span>
          </button>
        )}
      </div>

      {/* Composer (Emoji Picker + Transparent Stickers + Text — Zero Media/Calls) */}
      <footer className="crew-chat-composer-wrap">
        {replyTarget && (
          <div className="crew-chat-reply-banner">
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
          </div>
        )}

        {drawerMode === 'emoji' && (
          <div className="crew-chat-drawer" aria-label="Emoji picker">
            <div className="crew-chat-drawer__tabs">
              <div className="crew-chat-drawer__pills">
                {CHAT_EMOJI_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`crew-chat-drawer__pill ${
                      emojiCategory === cat.id ? 'crew-chat-drawer__pill--active' : ''
                    }`}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      triggerFeedback('tap');
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
            <div className="crew-chat-emoji-grid">
              {activeEmojiList.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="crew-chat-emoji-btn"
                  aria-label={`Insert ${emoji}`}
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertEmojiAtCursor(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {drawerMode === 'sticker' && (
          <div className="crew-chat-drawer" aria-label="Transparent stickers">
            <div className="crew-chat-sticker-search-row">
              <Search size={15} strokeWidth={2} />
              <input
                type="search"
                className="crew-chat-sticker-search"
                placeholder="Search stickers (e.g. happy, motor, food)..."
                value={stickerQuery}
                onChange={(e) => setStickerQuery(e.target.value)}
              />
              {stickerQuery && (
                <button
                  type="button"
                  className="crew-chat-reply-banner__close"
                  aria-label="Clear sticker search"
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
                    emojiFallback="✨"
                    alt={ext.caption}
                    className="crew-chat-sticker-btn__img"
                  />
                  <span className="crew-chat-sticker-btn__caption">{ext.caption}</span>
                </button>
              ))}
            </div>

            {searchingStickers ? (
              <div className="crew-chat-sticker-status">Searching online stickers...</div>
            ) : (
              builtInFilteredStickers.length === 0 &&
              externalStickers.length === 0 && (
                <div className="crew-chat-sticker-status">
                  No matching stickers found — try another keyword or paste from your keyboard
                </div>
              )
            )}
          </div>
        )}

        <div className="crew-chat-input-row">
          <button
            type="button"
            className={`crew-chat-icon-btn tactile ${
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
          </button>

          <button
            type="button"
            className={`crew-chat-icon-btn tactile ${
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
          </button>

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

          <button
            type="button"
            className="crew-chat-send-btn tactile"
            aria-label="Send message"
            disabled={!canSendText}
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleSendText}
          >
            <Send size={17} strokeWidth={2.1} />
          </button>
        </div>
      </footer>

      {/* Portaled IG-Style Long-Press (Hold) Menu with Dynamic Left/Right Alignment */}
      {holdTarget &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="crew-chat-action-backdrop"
            role="presentation"
            onClick={() => setHoldTarget(null)}
          >
            <div
              className={`crew-chat-hold-stack ${
                holdTarget.isOwn ? 'crew-chat-hold-stack--own' : 'crew-chat-hold-stack--other'
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Emoji Reaction Bar ABOVE held message */}
              <div
                className="crew-chat-reaction-bar"
                role="group"
                aria-label="Quick emoji reactions"
              >
                {CHAT_QUICK_REACTIONS.map((emoji) => {
                  const list = holdTarget.message.reactions?.[emoji] ?? [];
                  const active = Boolean(activeMemberId && list.includes(activeMemberId));
                  return (
                    <button
                      key={emoji}
                      type="button"
                      className={`crew-chat-reaction-pick tactile ${
                        active ? 'crew-chat-reaction-pick--active' : ''
                      }`}
                      aria-label={`React with ${emoji}`}
                      aria-pressed={active}
                      onClick={() => {
                        primeFeedbackAudio();
                        triggerFeedback('check');
                        onToggleReaction(holdTarget.message.id, emoji);
                        setHoldTarget(null);
                      }}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>

              {/* Highlighted Message Preview */}
              <div className="crew-chat-hold-preview">
                {holdTarget.message.kind === 'sticker'
                  ? renderStickerMessage(holdTarget.message, true)
                  : renderTextMessage(holdTarget.message, holdTarget.isOwn, true)}
              </div>

              {/* Action Menu BELOW held message */}
              <div className="crew-chat-action-sheet">
                <button
                  type="button"
                  className="crew-chat-action-item"
                  onClick={() => {
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

                {holdTarget.message.kind === 'text' && (
                  <button
                    type="button"
                    className="crew-chat-action-item"
                    onClick={() => {
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

                {holdCanUnsend && (
                  <button
                    type="button"
                    className="crew-chat-action-item crew-chat-action-item--danger"
                    onClick={() => {
                      triggerFeedback('warning');
                      onUnsendMessage(holdTarget.message.id);
                      setHoldTarget(null);
                    }}
                  >
                    <span>Unsend</span>
                    <Trash2 size={16} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

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
    </div>
  );
}
export default CrewChatScreen;
