import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  MessageCircle,
  Reply,
  Send,
  Smile,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { Avatar, CornerOrb, LiquidBottomSheet } from '../../components/atoms';
import { useRegisterOverlay } from '../../context/OverlayContext';
import {
  buildReplyPreview,
  CHAT_QUICK_REACTIONS,
  countTotalReactions,
  CREW_STICKER_PACK,
  formatChatDayDivider,
  formatChatTime,
  getChatDateKey,
  getStickerById,
  isGroupedWithPrevious,
  sanitizeChatText,
} from '../../services/chat';
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
  onSendSticker: (stickerId: string, replyTo?: ChatReplyPreview) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onUnsendMessage: (messageId: string) => void;
  onTypingChange: (isTyping: boolean) => void;
  onMarkRead: () => void;
  onBack: () => void;
}

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
  onBack,
}: CrewChatScreenProps) {
  const [draft, setDraft] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatReplyPreview | null>(null);
  const [menuMessage, setMenuMessage] = useState<ChatMessage | null>(null);
  const [onlineSheetOpen, setOnlineSheetOpen] = useState(false);
  const [heartPopId, setHeartPopId] = useState<string | null>(null);
  const [flashMessageId, setFlashMessageId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ id: string; at: number } | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const isNearBottomRef = useRef(true);

  useRegisterOverlay(Boolean(menuMessage));
  useBackHandler(
    Boolean(menuMessage),
    () => setMenuMessage(null),
    'sheet',
    'crew-chat-msg-menu',
  );
  useBackHandler(
    showStickers && !menuMessage && !onlineSheetOpen,
    () => setShowStickers(false),
    'sheet',
    'crew-chat-stickers',
  );

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

  // Mark read on entry and whenever new incoming messages arrive while chat is open
  useEffect(() => {
    onMarkRead();
  }, [messages.length, onMarkRead]);

  // Auto-scroll to bottom on initial mount or when user is already near bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, typingUsers.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
      }
      if (longPressTimerRef.current) {
        window.clearTimeout(longPressTimerRef.current);
      }
      onTypingChange(false);
    };
  }, [onTypingChange]);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowScrollBottom(false);
    isNearBottomRef.current = true;
  };

  const handleScrollStream = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 110;
    setShowScrollBottom(distanceFromBottom > 180);
  };

  const handleDraftChange = (val: string) => {
    setDraft(val);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(108, ta.scrollHeight)}px`;
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
    }
    isNearBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom());
  };

  const handleSendSticker = (stickerId: string) => {
    primeFeedbackAudio();
    triggerFeedback('tap');
    onSendSticker(stickerId, replyTarget ?? undefined);
    setReplyTarget(null);
    setShowStickers(false);
    isNearBottomRef.current = true;
    requestAnimationFrame(() => scrollToBottom());
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

  const startLongPress = (msg: ChatMessage, clientX: number, clientY: number) => {
    if (msg.deleted) return;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
    pressOriginRef.current = { x: clientX, y: clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      triggerFeedback('toggle');
      setMenuMessage(msg);
    }, 380);
  };

  const moveLongPress = (clientX: number, clientY: number) => {
    if (!longPressTimerRef.current || !pressOriginRef.current) return;
    const dx = Math.abs(clientX - pressOriginRef.current.x);
    const dy = Math.abs(clientY - pressOriginRef.current.y);
    if (dx > 10 || dy > 10) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressOriginRef.current = null;
  };

  const handleBubbleTap = (msg: ChatMessage) => {
    if (msg.deleted) return;
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
  const menuCanUnsend =
    menuMessage &&
    !menuMessage.deleted &&
    (menuMessage.senderId === activeMemberId || isHost);

  return (
    <div className="crew-chat-screen" role="dialog" aria-label="Crew Chat">
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

      {/* Messages Stream */}
      <div className="crew-chat-scroll-wrap">
        <div
          ref={scrollRef}
          className="crew-chat-scroll"
          onScroll={handleScrollStream}
        >
          {messages.length === 0 ? (
            <div className="crew-chat-empty">
              <div className="crew-chat-empty__icon" aria-hidden="true">
                <MessageCircle size={25} strokeWidth={1.85} />
              </div>
              <h2 className="crew-chat-empty__title">Start the Crew Chat</h2>
              <p className="crew-chat-empty__desc">
                Coordinate meetups, quick check-ins, and hype stickers with your crew — text &amp; stickers only.
              </p>
              <div className="crew-chat-empty__starters">
                {CREW_STICKER_PACK.slice(0, 3).map((stk) => (
                  <button
                    key={stk.id}
                    type="button"
                    className="crew-chat-starter-chip tactile"
                    onClick={() => handleSendSticker(stk.id)}
                  >
                    <span>{stk.emoji}</span>
                    <span>{stk.caption}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const prevMsg = idx > 0 ? messages[idx - 1] : undefined;
              const nextMsg = idx < messages.length - 1 ? messages[idx + 1] : undefined;
              const showDayDivider =
                !prevMsg || getChatDateKey(prevMsg.createdAt) !== getChatDateKey(msg.createdAt);
              const groupedWithPrev = isGroupedWithPrevious(prevMsg, msg);
              const groupedWithNext = Boolean(nextMsg && isGroupedWithPrevious(msg, nextMsg));
              const isOwn = Boolean(activeMemberId && msg.senderId === activeMemberId);
              const senderMember = memberById.get(msg.senderId);
              const sticker = msg.kind === 'sticker' ? getStickerById(msg.stickerId) : undefined;
              const reactionEntries = countTotalReactions(msg.reactions);

              return (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {showDayDivider && (
                    <div className="crew-chat-day-divider">
                      {formatChatDayDivider(msg.createdAt)}
                    </div>
                  )}

                  <div
                    data-chat-id={msg.id}
                    className={[
                      'crew-chat-row',
                      isOwn ? 'crew-chat-row--own' : 'crew-chat-row--other',
                      groupedWithPrev ? 'crew-chat-row--grouped' : '',
                      flashMessageId === msg.id ? 'crew-chat-row--flash' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {!isOwn && (
                      <div className="crew-chat-avatar-col">
                        {!groupedWithNext && (
                          <Avatar
                            initials={senderMember?.initials ?? msg.senderName.slice(0, 2).toUpperCase()}
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
                      {!isOwn && !groupedWithPrev && (
                        <div className="crew-chat-sender">
                          {senderMember?.name ?? msg.senderName}
                        </div>
                      )}

                      <div className="crew-chat-bubble-shell">
                        {msg.deleted ? (
                          <div className="crew-chat-bubble crew-chat-bubble--deleted">
                            Message unsent
                          </div>
                        ) : sticker ? (
                          <div
                            className={`crew-chat-sticker-card crew-chat-sticker-card--${sticker.tone}`}
                            onClick={() => handleBubbleTap(msg)}
                            onPointerDown={(e) => startLongPress(msg, e.clientX, e.clientY)}
                            onPointerMove={(e) => moveLongPress(e.clientX, e.clientY)}
                            onPointerUp={cancelLongPress}
                            onPointerCancel={cancelLongPress}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setMenuMessage(msg);
                            }}
                          >
                            {msg.replyTo && (
                              <button
                                type="button"
                                className="crew-chat-reply-quote"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  jumpToQuotedMessage(msg.replyTo!.id);
                                }}
                              >
                                <span className="crew-chat-reply-quote__author">
                                  {msg.replyTo.senderName}
                                </span>
                                <span className="crew-chat-reply-quote__text">
                                  {msg.replyTo.text}
                                </span>
                              </button>
                            )}
                            <span className="crew-chat-sticker-emoji" aria-label={sticker.caption}>
                              {sticker.emoji}
                            </span>
                            <span className="crew-chat-sticker-caption">{sticker.caption}</span>
                            <div className="crew-chat-meta">
                              <span>{formatChatTime(msg.createdAt)}</span>
                            </div>
                            {heartPopId === msg.id && (
                              <span className="crew-chat-heart-pop" aria-hidden="true">
                                ❤️
                              </span>
                            )}
                          </div>
                        ) : (
                          <div
                            className={`crew-chat-bubble ${
                              isOwn ? 'crew-chat-bubble--own' : 'crew-chat-bubble--other'
                            }`}
                            onClick={() => handleBubbleTap(msg)}
                            onPointerDown={(e) => startLongPress(msg, e.clientX, e.clientY)}
                            onPointerMove={(e) => moveLongPress(e.clientX, e.clientY)}
                            onPointerUp={cancelLongPress}
                            onPointerCancel={cancelLongPress}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setMenuMessage(msg);
                            }}
                          >
                            {msg.replyTo && (
                              <button
                                type="button"
                                className="crew-chat-reply-quote"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  jumpToQuotedMessage(msg.replyTo!.id);
                                }}
                              >
                                <span className="crew-chat-reply-quote__author">
                                  {msg.replyTo.senderName}
                                </span>
                                <span className="crew-chat-reply-quote__text">
                                  {msg.replyTo.text}
                                </span>
                              </button>
                            )}
                            <p className="crew-chat-text">{msg.text}</p>
                            <div className="crew-chat-meta">
                              <span>{formatChatTime(msg.createdAt)}</span>
                            </div>
                            {heartPopId === msg.id && (
                              <span className="crew-chat-heart-pop" aria-hidden="true">
                                ❤️
                              </span>
                            )}
                          </div>
                        )}

                        {!msg.deleted && (
                          <button
                            type="button"
                            className="crew-chat-more-btn"
                            aria-label="React or reply to message"
                            onClick={() => {
                              triggerFeedback('tap');
                              setMenuMessage(msg);
                            }}
                          >
                            <Smile size={14} strokeWidth={1.9} />
                          </button>
                        )}
                      </div>

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
            })
          )}

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

        {showScrollBottom && (
          <button
            type="button"
            className="crew-chat-scroll-bottom tactile"
            aria-label="Scroll to latest messages"
            onClick={scrollToBottom}
          >
            <ChevronDown size={15} strokeWidth={2.2} />
            <span>Latest</span>
          </button>
        )}
      </div>

      {/* Composer (Strict Text + Built-in Stickers Only — Zero Media/Calls) */}
      <footer className="crew-chat-composer-wrap">
        {replyTarget && (
          <div className="crew-chat-reply-banner">
            <Reply size={15} strokeWidth={2} style={{ color: 'var(--brand-matcha)' }} />
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

        {showStickers && (
          <div className="crew-chat-sticker-tray" aria-label="Crew sticker pack">
            <div className="crew-chat-sticker-tray__head">
              <span className="crew-chat-sticker-tray__label">Crew Stickers</span>
              <span className="crew-chat-sticker-tray__hint">Tap to send</span>
            </div>
            <div className="crew-chat-sticker-grid">
              {CREW_STICKER_PACK.map((stk) => (
                <button
                  key={stk.id}
                  type="button"
                  className="crew-chat-sticker-btn tactile"
                  onClick={() => handleSendSticker(stk.id)}
                >
                  <span className="crew-chat-sticker-btn__emoji">{stk.emoji}</span>
                  <span className="crew-chat-sticker-btn__caption">{stk.caption}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="crew-chat-input-row">
          <button
            type="button"
            className={`crew-chat-sticker-toggle tactile ${
              showStickers ? 'crew-chat-sticker-toggle--active' : ''
            }`}
            aria-label={showStickers ? 'Close sticker tray' : 'Open sticker tray'}
            aria-pressed={showStickers}
            onClick={() => {
              triggerFeedback('toggle');
              setShowStickers((prev) => !prev);
            }}
          >
            {showStickers ? (
              <X size={19} strokeWidth={2} />
            ) : (
              <Sparkles size={19} strokeWidth={1.9} />
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
              onFocus={() => setShowStickers(false)}
              onChange={(e) => handleDraftChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <button
            type="button"
            className="crew-chat-send-btn tactile"
            aria-label="Send message"
            disabled={!canSendText}
            onClick={handleSendText}
          >
            <Send size={17} strokeWidth={2.1} />
          </button>
        </div>
      </footer>

      {/* Portaled IG/WA Reaction + Reply/Unsend Bar */}
      {menuMessage &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="crew-chat-action-backdrop"
            role="presentation"
            onClick={() => setMenuMessage(null)}
          >
            <div
              className="crew-chat-action-preview"
              onClick={(e) => e.stopPropagation()}
            >
              <strong>{menuMessage.senderName}:</strong>{' '}
              {menuMessage.kind === 'sticker'
                ? `${getStickerById(menuMessage.stickerId)?.emoji ?? ''} ${menuMessage.text}`
                : menuMessage.text}
            </div>

            <div
              className="crew-chat-reaction-bar"
              role="group"
              aria-label="Quick emoji reactions"
              onClick={(e) => e.stopPropagation()}
            >
              {CHAT_QUICK_REACTIONS.map((emoji) => {
                const list = menuMessage.reactions?.[emoji] ?? [];
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
                      onToggleReaction(menuMessage.id, emoji);
                      setMenuMessage(null);
                    }}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>

            <div
              className="crew-chat-action-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="crew-chat-action-item"
                onClick={() => {
                  triggerFeedback('tap');
                  setReplyTarget(buildReplyPreview(menuMessage));
                  setMenuMessage(null);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
              >
                <span>Reply</span>
                <Reply size={16} strokeWidth={2} />
              </button>

              {menuCanUnsend && (
                <button
                  type="button"
                  className="crew-chat-action-item crew-chat-action-item--danger"
                  onClick={() => {
                    triggerFeedback('warning');
                    onUnsendMessage(menuMessage.id);
                    setMenuMessage(null);
                  }}
                >
                  <span>Unsend</span>
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              )}
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
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
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
