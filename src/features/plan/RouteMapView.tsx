import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowUpRight, MapPin } from 'lucide-react';
import { Badge, Button, EmptyState, GlassCard } from '../../components/atoms';
import type { PlanItem } from '../../types/trip';
import './plan.css';

export interface RouteMapViewProps {
  dayLabel: string;
  items: PlanItem[];
  onSelectItem: (item: PlanItem) => void;
}

export function RouteMapView({ dayLabel, items, onSelectItem }: RouteMapViewProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const mappable = items.filter((item) => Array.isArray(item.coords) && item.coords.length === 2);

  useEffect(() => {
    const container = mapElRef.current;
    if (!container) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const center: [number, number] = mappable[0]?.coords ?? [-7.7956, 110.3695];
    const map = L.map(container, {
      center,
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
    }).addTo(map);

    const latLngs: [number, number][] = [];
    mappable.forEach((stop, idx) => {
      if (!stop.coords) return;
      latLngs.push(stop.coords);

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:26px;height:26px;border-radius:13px;background:#4A7468;color:#fff;font-family:Fredoka,sans-serif;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 4px 10px rgba(24,36,32,0.3);">${idx + 1}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      L.marker(stop.coords, { icon })
        .addTo(map)
        .bindPopup(`<strong>${stop.startTime} · ${stop.title}</strong><br/>${stop.locationHint}`);
    });

    if (latLngs.length >= 2) {
      L.polyline(latLngs, {
        color: '#4A7468',
        weight: 3.5,
        opacity: 0.85,
        dashArray: '6 8',
      }).addTo(map);
      map.fitBounds(L.latLngBounds(latLngs), { padding: [32, 32] });
    } else if (latLngs.length === 1) {
      map.setView(latLngs[0], 13);
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [mappable.map((m) => `${m.id}:${m.coords?.join(',')}`).join('|')]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<MapPin size={22} strokeWidth={1.8} />}
        title={`No stops on ${dayLabel}`}
        description="Add places with Google Maps links to plot your convoy route."
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div ref={mapElRef} className="route-map-frame" aria-label="Day route map" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((stop, idx) => (
          <GlassCard
            key={stop.id}
            variant="clear"
            padding="sm"
            interactive
            onClick={() => onSelectItem(stop)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <Badge tone={stop.status === 'active' ? 'mint' : 'matcha'}>{idx + 1}</Badge>
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
            {stop.mapsUrl && (
              <Button
                variant="glass"
                size="sm"
                rightIcon={<ArrowUpRight size={13} strokeWidth={2} />}
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(stop.mapsUrl, '_blank', 'noopener,noreferrer');
                }}
              >
                Route
              </Button>
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
