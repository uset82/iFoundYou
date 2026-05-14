import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { AircraftPosition, CohortType } from '../../lib/ews';
import './EWSWorldMap.css';

interface EWSWorldMapProps {
  aircraft: AircraftPosition[];
  cohort: CohortType;
}

const COHORT_COLORS: Record<CohortType, string> = {
  business: '#0000ee',
  military: '#16a34a',
  untracked: '#ea580c',
};

const PLANE_SVG = `
<svg width="14" height="14" viewBox="-10 -10 20 20" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 -9 L2.2 -1.5 L8 1.2 L8 3.4 L1.8 2.1 L1.8 6.4 L4.2 8 L4.2 9 L0 7.5 L-4.2 9 L-4.2 8 L-1.8 6.4 L-1.8 2.1 L-8 3.4 L-8 1.2 L-2.2 -1.5 Z" fill="currentColor"/>
</svg>
`;

export default function EWSWorldMap({ aircraft, cohort }: EWSWorldMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const color = COHORT_COLORS[cohort] ?? COHORT_COLORS.business;

  // Initialize map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'raster-tiles': {
            type: 'raster',
            tiles: [
              'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors © CARTO',
          },
        },
        layers: [
          {
            id: 'simple-tiles',
            type: 'raster',
            source: 'raster-tiles',
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      center: [0, 25],
      zoom: 1.2,
      attributionControl: false,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update aircraft markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const a of aircraft) {
      if (!Number.isFinite(a.lat) || !Number.isFinite(a.lon)) continue;
      if (a.isAirborne === false) continue;

      const el = document.createElement('div');
      el.className = 'ews-world-map__plane';
      el.style.color = color;
      el.innerHTML = PLANE_SVG;

      if (Number.isFinite(a.heading)) {
        const inner = el.querySelector('svg');
        if (inner) inner.style.transform = `rotate(${a.heading}deg)`;
      }

      el.title = `${a.label || 'Unknown'} ${a.registration ? `(${a.registration})` : ''}`;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([a.lon, a.lat])
        .setPopup(
          new maplibregl.Popup({ closeButton: true, maxWidth: '220px' }).setHTML(
            `<div class="ews-world-map__popup">
              <strong>${a.label || 'Unknown'}</strong>
              ${a.registration ? `<span class="ews-world-map__reg">${a.registration}</span>` : ''}
              <div class="ews-world-map__stats">
                ${Number.isFinite(a.altitude) ? `<span>${Math.round(a.altitude!)} ft</span>` : ''}
                ${Number.isFinite(a.speed) ? `<span>${Math.round(a.speed!)} kt</span>` : ''}
              </div>
              <div class="ews-world-map__hex">${a.hex}</div>
            </div>`,
          ),
        )
        .addTo(map);

      markersRef.current.push(marker);
    }

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [aircraft, color]);

  return (
    <div className="ews-world-map">
      <div ref={mapContainerRef} className="ews-world-map__container" />
    </div>
  );
}
