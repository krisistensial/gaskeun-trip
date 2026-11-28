import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowUpRight,
  LocateFixed,
  MapPin,
  Navigation,
  Radio,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { Avatar, Badge, Button, CornerOrb, GlassCard } from '../../components/atoms';
import { useRegisterOverlay } from '../../context/OverlayContext';
import {
  CONVOY_STATUS_META,
  formatPinRelativeAge,
  formatRadarDistance,
  getConvoyStatusInfo,
  haversineDistanceMeters,
  isCrewPinLive,
} from '../../services/crewRadar';
import { triggerFeedback } from '../../services/feedback';
import { getGoogleMapsRouteUrl, hasGoogleMapsRoute } from '../../services/planSchedule';
import { normalizeExternalUrl } from '../../services/planUtils';
import type {
  ConvoyStatusKind,
  CrewLivePin,
  PlanItem,
  RouteTarget,
  SharedTrip,
  TripMember,
} from '../../types/trip';
import './plan.css';

// Prevent Leaflet from ever fetching default CDN marker PNGs
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: '',
  iconRetinaUrl: '',
  shadowUrl: '',
});

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  trip?: SharedTrip;
  activeMemberId?: string | null;
  activeMemberName?: string;
  livePins?: Record<string, CrewLivePin>;
  onUpsertCrewPin?: (
    pin: CrewLivePin,
    options?: { syncLayer1?: boolean; toastMsg?: string },
  ) => void;
  onClearOwnPin?: () => void;
  onNotify?: (msg: string, tone?: 'success' | 'info' | 'error') => void;
  onBack: () => void;
  onSelectPlanItem?: (item: PlanItem) => void;
}

export function RouteMapView({
  target,
  trip,
  activeMemberId = null,
  activeMemberName = 'Crew',
  livePins = {},
  onUpsertCrewPin,
  onClearOwnPin,
  onNotify,
  onBack,
  onSelectPlanItem,
}: RouteMapViewProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  useRegisterOverlay(true);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const crewLayerRef = useRef<L.LayerGroup | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastBroadcastMsRef = useRef<number>(0);
  const lastPersistMsRef = useRef<number>(0);
  const hasAutoFitCrewRef = useRef<boolean>(false);

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [tileFailed, setTileFailed] = useState<boolean>(false);
  const [sharingLive, setSharingLive] = useState<boolean>(false);
  const [checkingIn, setCheckingIn] = useState<boolean>(false);
  const [nowTickMs, setNowTickMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowTickMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

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

  const memberById = useMemo(() => {
    const map = new Map<string, TripMember>();
    for (const m of trip?.members ?? []) {
      map.set(m.id, m);
    }
    return map;
  }, [trip?.members]);

  const ownPin = activeMemberId ? livePins[activeMemberId] : undefined;
  const ownPinRef = useRef<CrewLivePin | undefined>(ownPin);
  ownPinRef.current = ownPin;

  const activePinEntries = useMemo(() => {
    return Object.values(livePins)
      .filter((p) => {
        const hasCoords =
          typeof p.lat === 'number' &&
          Number.isFinite(p.lat) &&
          typeof p.lng === 'number' &&
          Number.isFinite(p.lng);
        return hasCoords || Boolean(p.convoyStatus);
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [livePins]);

  const mappableCrewPins = useMemo(
    () =>
      activePinEntries.filter(
        (p): p is CrewLivePin & { lat: number; lng: number } =>
          typeof p.lat === 'number' &&
          Number.isFinite(p.lat) &&
          typeof p.lng === 'number' &&
          Number.isFinite(p.lng),
      ),
    [activePinEntries],
  );

  // Cleanly stop geolocation watch on unmount or toggle off
  const stopLiveGps = (markOffline = true) => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setSharingLive(false);
    const curr = ownPinRef.current;
    if (markOffline && activeMemberId && activeMemberId !== 'guest' && curr?.isLiveStreaming) {
      onUpsertCrewPin?.(
        {
          ...curr,
          memberId: activeMemberId,
          memberName: activeMemberName,
          isLiveStreaming: false,
          updatedAt: new Date().toISOString(),
        },
        { syncLayer1: true },
      );
    }
  };

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  const handleToggleLiveGps = () => {
    if (!activeMemberId || activeMemberId === 'guest') {
      onNotify?.('Sign into a crew profile to share live GPS', 'info');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onNotify?.('GPS location is not supported on this browser', 'error');
      return;
    }
    if (sharingLive) {
      triggerFeedback('tap');
      stopLiveGps(true);
      onNotify?.('Live GPS paused — last pin kept on map', 'info');
      return;
    }

    triggerFeedback('success');
    setSharingLive(true);
    lastBroadcastMsRef.current = 0;
    lastPersistMsRef.current = 0;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastBroadcastMsRef.current < 3800) return;
        lastBroadcastMsRef.current = now;

        const shouldPersist = now - lastPersistMsRef.current >= 25_000;
        if (shouldPersist) lastPersistMsRef.current = now;

        const curr = ownPinRef.current;
        onUpsertCrewPin?.(
          {
            memberId: activeMemberId,
            memberName: activeMemberName,
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracyMeters: Math.round(pos.coords.accuracy),
            isLiveStreaming: true,
            convoyStatus: curr?.convoyStatus,
            updatedAt: new Date(now).toISOString(),
          },
          { syncLayer1: shouldPersist },
        );
      },
      (err) => {
        stopLiveGps(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied — allow GPS in browser settings'
            : 'Could not read GPS signal right now';
        onNotify?.(msg, 'error');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 12_000,
      },
    );
  };

  const handleOneTapCheckIn = () => {
    if (!activeMemberId || activeMemberId === 'guest') {
      onNotify?.('Sign into a crew profile to drop a check-in pin', 'info');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onNotify?.('GPS location is not supported on this browser', 'error');
      return;
    }
    triggerFeedback('tap');
    setCheckingIn(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCheckingIn(false);
        triggerFeedback('success');
        const curr = ownPinRef.current;
        onUpsertCrewPin?.(
          {
            memberId: activeMemberId,
            memberName: activeMemberName,
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            accuracyMeters: Math.round(pos.coords.accuracy),
            isLiveStreaming: sharingLive,
            convoyStatus: curr?.convoyStatus,
            updatedAt: new Date().toISOString(),
          },
          { syncLayer1: true, toastMsg: 'Check-in GPS pin updated on map' },
        );
      },
      () => {
        setCheckingIn(false);
        triggerFeedback('warning');
        onNotify?.('Could not capture GPS check-in — check location access', 'error');
      },
      {
        enableHighAccuracy: true,
        maximumAge: 8000,
        timeout: 10_000,
      },
    );
  };

  const handleSetStatus = (nextStatus: ConvoyStatusKind) => {
    if (!activeMemberId || activeMemberId === 'guest') {
      onNotify?.('Sign into a crew profile to share your status', 'info');
      return;
    }
    triggerFeedback('check');
    const curr = ownPinRef.current;
    const toggled = curr?.convoyStatus === nextStatus ? undefined : nextStatus;
    onUpsertCrewPin?.(
      {
        memberId: activeMemberId,
        memberName: activeMemberName,
        lat: curr?.lat,
        lng: curr?.lng,
        accuracyMeters: curr?.accuracyMeters,
        isLiveStreaming: sharingLive ? true : curr?.isLiveStreaming,
        convoyStatus: toggled,
        updatedAt: new Date().toISOString(),
      },
      {
        syncLayer1: true,
        toastMsg: toggled
          ? `Status set: ${getConvoyStatusInfo(toggled)?.label ?? toggled}`
          : 'Status cleared',
      },
    );
  };

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

  const hasAnyMapCoords = mappable.length > 0 || mappableCrewPins.length > 0;
  const showSchematic = !isOnline || tileFailed || !hasAnyMapCoords;

  useEffect(() => {
    if (showSchematic) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        crewLayerRef.current = null;
      }
      hasAutoFitCrewRef.current = false;
      return;
    }

    const container = mapElRef.current;
    if (!container) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      crewLayerRef.current = null;
    }

    const focused = mappable.find((s) => s.isFocused) ?? mappable[0];
    const fallbackPin = mappableCrewPins[0];
    const center: [number, number] =
      focused?.coords ??
      (fallbackPin ? [fallbackPin.lat, fallbackPin.lng] : [-7.7956, 110.3695]);

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
        `<strong>${stop.time ? `${escapeHtml(stop.time)} · ` : ''}${escapeHtml(stop.title)}</strong>${stop.hint ? `<br/>${escapeHtml(stop.hint)}` : ''}`,
      );
      if (stop.isFocused && mappableCrewPins.length === 0) {
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

    const crewLayer = L.layerGroup().addTo(map);
    crewLayerRef.current = crewLayer;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      crewLayerRef.current = null;
    };
  }, [showSchematic, mappable]);

  // Update Live Crew GPS pins incrementally without resetting user zoom/pan
  useEffect(() => {
    const map = mapInstanceRef.current;
    const crewLayer = crewLayerRef.current;
    if (!map || !crewLayer) return;

    crewLayer.clearLayers();
    const crewPoints: [number, number][] = [];

    for (const pin of mappableCrewPins) {
      crewPoints.push([pin.lat, pin.lng]);
      const member = memberById.get(pin.memberId);
      const liveNow = isCrewPinLive(pin, nowTickMs);
      const isSelf = Boolean(activeMemberId && pin.memberId === activeMemberId);
      const ringColor = liveNow ? '#2B946B' : '#E0922B';
      const initials = escapeHtml(member?.initials || pin.memberName.slice(0, 1).toUpperCase());
      const bg = member?.avatarBg || '#E3EDE6';
      const fg = member?.avatarColor || '#2D4A42';
      const statusInfo = getConvoyStatusInfo(pin.convoyStatus);
      const age = liveNow ? 'Live now' : formatPinRelativeAge(pin.updatedAt, nowTickMs);

      const icon = L.divIcon({
        className: '',
        html: `<div class="${liveNow ? 'crew-radar-marker-live' : ''}" style="width:32px;height:32px;border-radius:16px;background:${bg};color:${fg};font-family:Fredoka,sans-serif;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;border:2.5px solid ${ringColor};box-shadow:0 4px 12px rgba(24,36,32,0.32);">${initials}</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([pin.lat, pin.lng], { icon, zIndexOffset: 500 }).addTo(crewLayer);
      marker.bindPopup(
        `<strong>${escapeHtml(pin.memberName)}${isSelf ? ' (You)' : ''}</strong><br/>${escapeHtml(age)}${statusInfo ? ` · ${escapeHtml(statusInfo.label)}` : ''}`,
      );
    }

    if (!hasAutoFitCrewRef.current && crewPoints.length > 0 && mappable.length === 0) {
      hasAutoFitCrewRef.current = true;
      if (crewPoints.length === 1) {
        map.setView(crewPoints[0], 15);
      } else {
        map.fitBounds(L.latLngBounds(crewPoints), { padding: [42, 42] });
      }
    }
  }, [mappableCrewPins, memberById, activeMemberId, nowTickMs, mappable.length]);

  const handleFitMap = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    triggerFeedback('tap');
    const allPts: [number, number][] = [
      ...mappable.map((s) => s.coords!).filter(Boolean),
      ...mappableCrewPins.map((p): [number, number] => [p.lat, p.lng]),
    ];
    if (allPts.length === 1) {
      map.setView(allPts[0], 15, { animate: true });
    } else if (allPts.length > 1) {
      map.fitBounds(L.latLngBounds(allPts), { padding: [40, 40], animate: true });
    }
  };

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

      {/* Live Crew GPS Radar + 1-Tap Check-In + Convoy Status Controls */}
      {onUpsertCrewPin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="radar-controls-row">
            <Button
              variant={sharingLive ? 'matcha' : 'glass'}
              size="sm"
              leftIcon={<Radio size={14} strokeWidth={2.1} />}
              onClick={handleToggleLiveGps}
            >
              {sharingLive ? 'Live GPS: On' : 'Share Live GPS'}
            </Button>
            <Button
              variant="glass"
              size="sm"
              disabled={checkingIn}
              leftIcon={<MapPin size={14} strokeWidth={2} />}
              onClick={handleOneTapCheckIn}
            >
              {checkingIn ? 'Locating...' : '1-Tap Check-In'}
            </Button>
            {typeof ownPin?.lat === 'number' && onClearOwnPin && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Trash2 size={13.5} strokeWidth={2} />}
                onClick={() => {
                  stopLiveGps(false);
                  onClearOwnPin();
                }}
              >
                Clear Pin
              </Button>
            )}
          </div>

          <div className="radar-status-row" role="group" aria-label="My convoy status">
            {CONVOY_STATUS_META.map((st) => {
              const active = ownPin?.convoyStatus === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  aria-pressed={active}
                  className={`plan-chip tactile ${active ? 'plan-chip--active' : ''}`}
                  onClick={() => handleSetStatus(st.id)}
                >
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
        <div className="route-map-wrap">
          <div ref={mapElRef} className="route-map-frame" aria-label="Interactive route map" />
          <button
            type="button"
            className="route-map-fit-btn tactile"
            onClick={handleFitMap}
          >
            <LocateFixed size={13} strokeWidth={2.2} />
            <span>Fit Map</span>
          </button>
        </div>
      )}

      {/* Live Crew Pins & Convoy Radar Cards */}
      {activePinEntries.length > 0 && (
        <div className="radar-crew-list">
          <div className="gk-field__label">
            CREW RADAR ({activePinEntries.length})
          </div>
          {activePinEntries.map((pin) => {
            const member = memberById.get(pin.memberId);
            const liveNow = isCrewPinLive(pin, nowTickMs);
            const statusInfo = getConvoyStatusInfo(pin.convoyStatus);
            const hasCoords =
              typeof pin.lat === 'number' &&
              Number.isFinite(pin.lat) &&
              typeof pin.lng === 'number' &&
              Number.isFinite(pin.lng);
            const distText =
              hasCoords && focusedStop?.coords
                ? formatRadarDistance(
                    haversineDistanceMeters(
                      pin.lat!,
                      pin.lng!,
                      focusedStop.coords[0],
                      focusedStop.coords[1],
                    ),
                  )
                : '';

            return (
              <GlassCard
                key={pin.memberId}
                variant="clear"
                padding="sm"
                interactive={hasCoords && !showSchematic}
                onClick={() => {
                  if (hasCoords && mapInstanceRef.current && !showSchematic) {
                    triggerFeedback('tap');
                    mapInstanceRef.current.setView([pin.lat!, pin.lng!], 15, { animate: true });
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar
                    initials={member?.initials ?? pin.memberName.slice(0, 1).toUpperCase()}
                    name={pin.memberName}
                    src={member?.avatarDataUrl}
                    size="sm"
                    bg={member?.avatarBg ?? '#E3EDE6'}
                    color={member?.avatarColor ?? '#2D4A42'}
                    variant={liveNow ? 'selected' : 'solid'}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {pin.memberName}
                      {activeMemberId === pin.memberId ? ' (You)' : ''}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                      {hasCoords
                        ? `${liveNow ? 'Live GPS' : formatPinRelativeAge(pin.updatedAt, nowTickMs)}${
                            distText ? ` · ${distText}` : ''
                          }`
                        : `Status updated ${formatPinRelativeAge(pin.updatedAt, nowTickMs)}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {statusInfo && <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>}
                  {hasCoords && <Badge tone={liveNow ? 'mint' : 'amber'}>{liveNow ? 'Live' : 'Pin'}</Badge>}
                </div>
              </GlassCard>
            );
          })}
        </div>
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
