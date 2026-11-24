import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowUpRight, MapPin, Navigation, WifiOff } from 'lucide-react';
import { Badge, Button, CornerOrb, GlassCard } from '../../components/atoms';
import { getGoogleMapsRouteUrl, hasGoogleMapsRoute } from '../../services/planSchedule';
import { normalizeExternalUrl } from '../../services/planUtils';
import type { PlanItem, RouteTarget } from '../../types/trip';
import './plan.css';

// Prevent Leaflet from ever fetching default CDN marker PNGs
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: '',
  iconRetinaUrl: '',
  shadowUrl: '',
});

interface TrailStopPoint {
  id: string;
  title: string;
  time?: string;
  hint?: string;
  parkingNote?: string;
  mapsUrl?: string;
  coords?: [number, number];
  isFocused: boolean;
}

export interface RouteMapViewProps {
  target: RouteTarget;
  onBack: () => void;
  onSelectPlanItem?: (item: PlanItem) => void;
}

export function RouteMapView({ target, onBack, onSelectPlanItem }: RouteMapViewProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [tileFailed, setTileFailed] = useState<boolean>(false);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      setTileFailed(false);
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const stops: TrailStopPoint[] = useMemo(() => {
    if (target.dayItems && target.dayItems.length > 0) {
      return target.dayItems.map((item) => ({
        id: item.id,
        title: item.title,
        time: item.startTime,
        hint: item.locationHint,
        parkingNote: item.parkingNote,
        mapsUrl: item.mapsUrl,
        coords: item.coords,
        isFocused: target.focusedItemId
          ? item.id === target.focusedItemId
          : item.status === 'active',
      }));
    }
    return [
      {
        id: 'single-target',
        title: target.title,
        hint: target.subtitle || target.address,
        parkingNote: target.parkingNote,
        mapsUrl: target.mapsUrl,
        coords: target.coords,
        isFocused: true,
      },
    ];
  }, [target]);

  const mappable = useMemo(
    () => stops.filter((s) => Array.isArray(s.coords) && s.coords.length === 2),
    [stops],
  );

  const showSchematic = !isOnline || tileFailed || mappable.length === 0;

  useEffect(() => {
    if (showSchematic) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      return;
    }

    const container = mapElRef.current;
    if (!container) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const focused = mappable.find((s) => s.isFocused) ?? mappable[0];
    const center: [number, number] = focused?.coords ?? [-7.7956, 110.3695];
    const map = L.map(container, {
      center,
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
    });

    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    });
    let errorCount = 0;
    tiles.on('tileerror', () => {
      errorCount += 1;
      if (errorCount >= 2) {
        setTileFailed(true);
      }
    });
    tiles.addTo(map);

    const latLngs: [number, number][] = [];
    mappable.forEach((stop, idx) => {
      if (!stop.coords) return;
      latLngs.push(stop.coords);

      const bg = stop.isFocused ? '#2B946B' : '#4A7468';
      const size = stop.isFocused ? 30 : 24;
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:${size}px;height:${size}px;border-radius:${size / 2}px;background:${bg};color:#fff;font-family:Fredoka,sans-serif;font-weight:700;font-size:${stop.isFocused ? 13 : 11}px;display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;box-shadow:0 6px 14px rgba(24,36,32,0.28);">${idx + 1}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });

      const marker = L.marker(stop.coords, { icon }).addTo(map);
      marker.bindPopup(
        `<strong>${stop.time ? `${stop.time} · ` : ''}${stop.title}</strong>${stop.hint ? `<br/>${stop.hint}` : ''}`,
      );
      if (stop.isFocused) {
        marker.openPopup();
      }
    });

    if (latLngs.length >= 2) {
      L.polyline(latLngs, {
        color: '#4A7468',
        weight: 3.5,
        opacity: 0.85,
        dashArray: '6 8',
      }).addTo(map);
      map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36] });
    } else if (latLngs.length === 1) {
      map.setView(latLngs[0], 14);
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [showSchematic, mappable]);

  const focusedStop = stops.find((s) => s.isFocused) ?? stops[0];
  const externalMapsUrl =
    normalizeExternalUrl(target.mapsUrl || focusedStop?.mapsUrl) ??
    (focusedStop?.coords
      ? `https://www.google.com/maps/search/?api=1&query=${focusedStop.coords[0]},${focusedStop.coords[1]}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target.address || target.title)}`);

  // Crisp 100% Local Vector SVG Schematic Trail for Offline / Tile-Error resilience
  // Renders all stops cleanly (single curved trail up to 5 stops, serpentine 2-row path for 6+ stops)
  const schematicNodes = useMemo(() => {
    const count = stops.length;
    if (count <= 5) {
      return stops.map((stop, idx) => {
        const t = count <= 1 ? 0.5 : idx / (count - 1);
        const x = 44 + t * 272;
        const y = count <= 1 ? 112 : 144 - Math.sin(t * Math.PI) * 68 + (idx % 2 === 0 ? 8 : -8);
        return { stop, idx, x, y };
      });
    }
    const topCount = Math.ceil(count / 2);
    const bottomCount = count - topCount;
    return stops.map((stop, idx) => {
      if (idx < topCount) {
        const t = topCount <= 1 ? 0.5 : idx / (topCount - 1);
        return { stop, idx, x: 42 + t * 276, y: 60 };
      }
      const bIdx = idx - topCount;
      // Serpentine right-to-left on bottom row so connector flows naturally
      const t = bottomCount <= 1 ? 0.5 : 1 - bIdx / (bottomCount - 1);
      return { stop, idx, x: 42 + t * 276, y: 158 };
    });
  }, [stops]);

  const schematicPath = useMemo(() => {
    if (schematicNodes.length < 2) return '';
    return schematicNodes
      .map((pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `L ${pt.x} ${pt.y}`))
      .join(' ');
  }, [schematicNodes]);

  return (
    <section className="detail-root" aria-label="Route overview">
      <div className="detail-nav">
        <CornerOrb kind="back" ariaLabel="Back" onClick={onBack} />
        <Badge
          tone={showSchematic ? 'amber' : 'matcha'}
          icon={
            showSchematic ? (
              <WifiOff size={12} strokeWidth={2} />
            ) : (
              <Navigation size={12} strokeWidth={2} />
            )
          }
        >
          {showSchematic ? 'Schematic Trail' : target.dayLabel || 'Route Map'}
        </Badge>
      </div>

      <div>
        <h1 className="plan-title" style={{ fontSize: 26 }}>
          {target.title}
        </h1>
        {(target.subtitle || target.address) && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            {target.subtitle || target.address}
          </p>
        )}
      </div>

      {/* Interactive Leaflet Map OR Crisp SVG Schematic Trail when Offline / Tile Failure */}
      {showSchematic ? (
        <div className="route-map-frame" aria-label="Schematic route trail">
          <svg
            viewBox="0 0 360 220"
            width="100%"
            height="100%"
            role="img"
            aria-label="Convoy schematic route"
          >
            <defs>
              <linearGradient
                id="schBg"
                x1="0"
                y1="0"
                x2="360"
                y2="220"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#E6F0E8" />
                <stop offset="55%" stopColor="#F3F7F2" />
                <stop offset="100%" stopColor="#F5F1E2" />
              </linearGradient>
            </defs>
            <rect width="360" height="220" fill="url(#schBg)" />
            <circle cx="80" cy="40" r="76" fill="none" stroke="#CBE0CE" strokeWidth="1" opacity="0.65" />
            <circle cx="300" cy="185" r="88" fill="none" stroke="#CBE0CE" strokeWidth="1" opacity="0.65" />

            {schematicPath && (
              <path
                d={schematicPath}
                fill="none"
                stroke="#4A7468"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="6 7"
              />
            )}

            {schematicNodes.map(({ stop, idx, x, y }) => {
              const planStop = target.dayItems?.find((it) => it.id === stop.id);
              return (
                <g
                  key={stop.id}
                  style={planStop && onSelectPlanItem ? { cursor: 'pointer' } : undefined}
                  onClick={() => {
                    if (planStop && onSelectPlanItem) onSelectPlanItem(planStop);
                  }}
                >
                  {stop.isFocused && <circle cx={x} cy={y} r="19" fill="#2B946B" opacity="0.18" />}
                  <circle
                    cx={x}
                    cy={y}
                    r={stop.isFocused ? 13 : 10}
                    fill={stop.isFocused ? '#2B946B' : '#4A7468'}
                    stroke="#FFFFFF"
                    strokeWidth="2.5"
                  />
                  <text
                    x={x}
                    y={y + 4}
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize={stop.isFocused ? '11' : '10'}
                    fontWeight="700"
                    fontFamily="Fredoka, sans-serif"
                  >
                    {idx + 1}
                  </text>
                  <text
                    x={x}
                    y={y + (stop.isFocused ? 27 : 23)}
                    textAnchor="middle"
                    fill="#182420"
                    fontSize="9.5"
                    fontWeight="600"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {stop.title.length > 13 ? `${stop.title.slice(0, 12)}…` : stop.title}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div ref={mapElRef} className="route-map-frame" aria-label="Interactive route map" />
      )}

      {/* Primary Destination Card + Open in Google Maps CTA */}
      <GlassCard variant="spotlight" padding="lg">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 14,
              background: 'var(--brand-sage-tint)',
              color: 'var(--brand-forest)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <MapPin size={18} strokeWidth={1.8} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>
              {target.title}
            </div>
            {target.address && (
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                {target.address}
              </div>
            )}
            {target.parkingNote && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--brand-forest)',
                  marginTop: 5,
                  fontWeight: 600,
                }}
              >
                Parking: {target.parkingNote}
              </div>
            )}
          </div>
        </div>

        <Button
          variant="matcha"
          size="lg"
          fullWidth
          rightIcon={<ArrowUpRight size={18} strokeWidth={2} />}
          onClick={() => window.open(externalMapsUrl, '_blank', 'noopener,noreferrer')}
        >
          Open in Google Maps
        </Button>
      </GlassCard>

      {/* Day Convoy Sequence */}
      {target.dayItems && target.dayItems.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="gk-field__label" style={{ marginTop: 4 }}>
            DAY CONVOY SEQUENCE ({target.dayItems.length} STOPS)
          </div>
          {target.dayItems.map((stop, idx) => {
            const isFocused = stop.id === target.focusedItemId;
            return (
              <GlassCard
                key={stop.id}
                variant={isFocused ? 'tinted' : 'clear'}
                padding="sm"
                interactive
                onClick={() => onSelectPlanItem?.(stop)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Badge tone={isFocused ? 'mint' : 'matcha'}>{idx + 1}</Badge>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 15,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {stop.title}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                      {stop.startTime} · {stop.parkingNote || stop.locationHint}
                    </div>
                  </div>
                </div>
                {hasGoogleMapsRoute(stop) && (
                  <Button
                    variant="glass"
                    size="sm"
                    rightIcon={<ArrowUpRight size={13} strokeWidth={2} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      const url = getGoogleMapsRouteUrl(stop);
                      if (url) window.open(url, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    Maps
                  </Button>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </section>
  );
}
