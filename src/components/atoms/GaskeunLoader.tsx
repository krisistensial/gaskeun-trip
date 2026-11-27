import { useEffect, useState } from 'react';
import './GaskeunLoader.css';

const PLAYFUL_MESSAGES = [
  'Warming up the scooters...',
  'Mapping the best trail...',
  'Packing the trip vibes...',
  'Checking on the crew...',
] as const;

export interface GaskeunLoaderProps {
  /** Optional custom loading message (rotates playful trip phrases when omitted) */
  label?: string;
  /** 'full' renders a centered Crystal Liquid Glass card; 'compact' renders a slim pill */
  size?: 'full' | 'compact';
  className?: string;
}

/**
 * Playful GASKEUN! brand loader — a bouncy Matcha scooter cruising along a
 * scrolling dotted trail with fluttering scarf, puffing exhaust clouds,
 * and passing map-pin markers inside a Light Liquid Glass capsule.
 */
export function GaskeunLoader({
  label,
  size = 'full',
  className = '',
}: GaskeunLoaderProps) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    if (label) return;
    const timer = window.setInterval(() => {
      setMsgIdx((prev) => (prev + 1) % PLAYFUL_MESSAGES.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [label]);

  const activeText = label || PLAYFUL_MESSAGES[msgIdx];

  return (
    <div
      className={[
        'gk-loader-wrap',
        size === 'compact' ? 'gk-loader-wrap--compact' : 'gk-loader-wrap--full',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={activeText}
    >
      <div className="gk-loader-card">
        <div className="gk-loader-stage" aria-hidden="true">
          <svg
            className="gk-loader-svg"
            viewBox="0 0 220 112"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <radialGradient id="gkLoaderGlow" cx="50%" cy="56%" r="48%">
                <stop offset="0%" stopColor="#CBE0CE" stopOpacity="0.72" />
                <stop offset="65%" stopColor="#F5F2E4" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#F6F8F5" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="gkHeadlampBeam" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#F6D58E" stopOpacity="0.68" />
                <stop offset="100%" stopColor="#F6D58E" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="gkScooterBody" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#5D8B7E" />
                <stop offset="100%" stopColor="#355B50" />
              </linearGradient>
            </defs>

            {/* Soft sunlit matcha halo */}
            <ellipse cx="110" cy="64" rx="84" ry="42" fill="url(#gkLoaderGlow)" />

            {/* Drifting clouds */}
            <g className="gk-loader-cloud gk-loader-cloud--1">
              <path
                d="M28 28h22a6 6 0 0 0 0-12 8.5 8.5 0 0 0-16.2-1.8A5.5 5.5 0 0 0 28 28Z"
                fill="#FFFFFF"
                fillOpacity="0.88"
              />
            </g>
            <g className="gk-loader-cloud gk-loader-cloud--2">
              <path
                d="M156 24h18a5 5 0 0 0 0-10 7 7 0 0 0-13.2-1.4A4.5 4.5 0 0 0 156 24Z"
                fill="#FFFFFF"
                fillOpacity="0.78"
              />
            </g>

            {/* Passing background landmarks (mini map-pin & matcha hills) */}
            <g className="gk-loader-scenery">
              {/* Mini map pin #1 */}
              <g transform="translate(182 46)">
                <path
                  d="M8 0C3.6 0 0 3.6 0 8c0 5.4 8 13 8 13s8-7.6 8-13c0-4.4-3.6-8-8-8Z"
                  fill="#D99136"
                  fillOpacity="0.88"
                />
                <circle cx="8" cy="7.5" r="2.8" fill="#FFFDF8" />
              </g>
              {/* Soft matcha pine tree */}
              <g transform="translate(46 53)">
                <rect x="6.5" y="13" width="3" height="6" rx="1.5" fill="#7D6B5D" fillOpacity="0.55" />
                <path d="M8 0 15 14H1L8 0Z" fill="#7FA597" fillOpacity="0.65" />
              </g>
            </g>

            {/* Ground shadow pulsing under scooter */}
            <ellipse
              className="gk-loader-shadow"
              cx="112"
              cy="94"
              rx="38"
              ry="4.5"
              fill="#2D4A42"
              fillOpacity="0.16"
            />

            {/* Scrolling dotted adventure road */}
            <g className="gk-loader-road">
              <line
                x1="-20"
                y1="95"
                x2="260"
                y2="95"
                stroke="#4A7468"
                strokeOpacity="0.32"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="10 12"
              />
            </g>

            {/* Playful exhaust puffs */}
            <circle className="gk-loader-puff gk-loader-puff--1" cx="68" cy="81" r="4.5" fill="#FFFFFF" />
            <circle className="gk-loader-puff gk-loader-puff--2" cx="62" cy="77" r="6" fill="#E3EDE6" />
            <circle className="gk-loader-puff gk-loader-puff--3" cx="55" cy="72" r="3.8" fill="#FFFFFF" />

            {/* Bouncy Scooter + Cute Helmeted Rider */}
            <g className="gk-loader-scooter">
              {/* Warm headlamp glow beam */}
              <polygon points="145,54 188,43 188,69 145,62" fill="url(#gkHeadlampBeam)" />

              {/* Cute Rider */}
              <g className="gk-loader-rider">
                {/* Fluttering little amber scarf */}
                <path
                  className="gk-loader-scarf"
                  d="M99 44c-8 1-14-3-20 0-3 1.5-5 4-8 3 4-5 8-8 14-8 5 0 9 2 14 1Z"
                  fill="#E8A94E"
                />
                {/* Rider torso jacket */}
                <path
                  d="M96 44c0-3 3-5 7-5h6c4 0 8 3 10 8l3 9h-22l-4-12Z"
                  fill="#2D4A42"
                />
                {/* Backpack */}
                <rect x="88" y="42" width="9" height="14" rx="4.5" fill="#D99136" />
                {/* Rider arm reaching handlebars */}
                <path
                  d="M111 47c6 1 12 1 18 0"
                  stroke="#F5D9C4"
                  strokeWidth="4.2"
                  strokeLinecap="round"
                />
                {/* Rounded helmet + cute visor + blush */}
                <circle cx="107" cy="31" r="10.5" fill="#4A7468" />
                <path
                  d="M107 20.5c5.8 0 10.5 4.7 10.5 10.5 0 1.4-.3 2.7-.8 3.9H107c-3.8 0-6.2-2.6-6.2-6.2 0-4.6 2.7-8.2 6.2-8.2Z"
                  fill="#FFFFFF"
                  fillOpacity="0.92"
                />
                {/* Helmet stripe */}
                <path
                  d="M98.5 26.5c2.2-3.4 5.2-5.4 8.5-5.8"
                  stroke="#E8A94E"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                {/* Happy visor eye dot */}
                <circle cx="113.5" cy="30.5" r="1.4" fill="#182420" />
              </g>

              {/* Scooter rear body & rounded vintage fender */}
              <path
                d="M72 78c0-11 8-19 20-19h17l8 16h12c3-14 6-24 10-29h6c-3 8-4 17-3 28 3 1 5 4 5 7v2H72v-5Z"
                fill="url(#gkScooterBody)"
              />
              {/* Cream foot-deck trim */}
              <path
                d="M106 75h23c1.5 0 2.5 1 2.5 2.5S130.5 80 129 80h-23v-5Z"
                fill="#F5F2E4"
              />
              {/* Cream seat */}
              <rect x="83" y="54" width="24" height="7" rx="3.5" fill="#F5F2E4" />
              <rect x="84" y="54" width="22" height="3.2" rx="1.6" fill="#FFFFFF" fillOpacity="0.7" />
              {/* Tailpipe */}
              <rect x="69" y="79" width="8" height="3.5" rx="1.75" fill="#8EA89E" />
              {/* Handlebars & retro headlamp */}
              <path
                d="M128 45h12"
                stroke="#2D4A42"
                strokeWidth="3.2"
                strokeLinecap="round"
              />
              <circle cx="143" cy="56" r="4.6" fill="#FFFDF5" stroke="#2D4A42" strokeWidth="1.8" />
              <circle cx="144" cy="56" r="2.2" fill="#F3C36B" />
              {/* Cute windshield */}
              <path
                d="M137 46c1-6 4-10 7-11"
                stroke="#FFFFFF"
                strokeOpacity="0.88"
                strokeWidth="2.6"
                strokeLinecap="round"
              />

              {/* Rear wheel (spinning) */}
              <g className="gk-loader-wheel gk-loader-wheel--rear">
                <circle cx="88" cy="84" r="10.5" fill="#182420" />
                <circle cx="88" cy="84" r="6" fill="#E3EDE6" />
                <line x1="88" y1="78.5" x2="88" y2="89.5" stroke="#4A7468" strokeWidth="1.6" />
                <line x1="82.5" y1="84" x2="93.5" y2="84" stroke="#4A7468" strokeWidth="1.6" />
                <circle cx="88" cy="84" r="2.2" fill="#2D4A42" />
              </g>

              {/* Front wheel (spinning) */}
              <g className="gk-loader-wheel gk-loader-wheel--front">
                <circle cx="139" cy="84" r="10.5" fill="#182420" />
                <circle cx="139" cy="84" r="6" fill="#E3EDE6" />
                <line x1="139" y1="78.5" x2="139" y2="89.5" stroke="#4A7468" strokeWidth="1.6" />
                <line x1="133.5" y1="84" x2="144.5" y2="84" stroke="#4A7468" strokeWidth="1.6" />
                <circle cx="139" cy="84" r="2.2" fill="#2D4A42" />
              </g>
            </g>
          </svg>
        </div>

        <div className="gk-loader-copy">
          <span className="gk-loader-brand">GASKEUN!</span>
          <div className="gk-loader-text-row">
            <span className="gk-loader-text">{activeText}</span>
            <span className="gk-loader-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
