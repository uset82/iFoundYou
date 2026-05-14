import { useCallback, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useEWS } from '../../lib/EWSContext';
import type { AircraftPosition, CohortType } from '../../lib/ews';
import './AircraftOverlay.css';

interface AircraftOverlayProps {
  map: maplibregl.Map | null;
  visible: boolean;
  onToggle: () => void;
}

const SOURCE_ID = 'ews-aircraft';
const LAYER_ID = 'ews-aircraft-layer';
const HALO_LAYER_ID = 'ews-aircraft-halo';

const COHORT_COLORS: Record<CohortType, string> = {
  business: '#3b82f6',
  military: '#22c55e',
  untracked: '#f97316',
};

function buildGeoJSON(aircraft: AircraftPosition[]) {
  return {
    type: 'geojson' as const,
    data: {
      type: 'FeatureCollection' as const,
      features: aircraft.map((a) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [a.lon, a.lat],
        },
        properties: {
          hex: a.hex,
          heading: a.heading ?? 0,
          altitude: a.altitude ?? null,
          speed: a.speed ?? null,
          label: a.label ?? 'Unknown',
        },
      })),
    },
  };
}

export default function AircraftOverlay({ map, visible, onToggle }: AircraftOverlayProps) {
  const { dashboard, cohort } = useEWS();
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const layerAddedRef = useRef(false);

  const color = COHORT_COLORS[cohort] ?? COHORT_COLORS.business;
  const aircraft = dashboard?.signal?.aircraft ?? [];

  const setupLayer = useCallback(() => {
    if (!map || !map.isStyleLoaded()) return;

    // Remove existing layers/source
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getLayer(HALO_LAYER_ID)) map.removeLayer(HALO_LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);

    if (!visible || aircraft.length === 0) {
      layerAddedRef.current = false;
      return;
    }

    map.addSource(SOURCE_ID, buildGeoJSON(aircraft));

    map.addLayer({
      id: HALO_LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': 6,
        'circle-color': color,
        'circle-opacity': 0.2,
        'circle-blur': 0.8,
      },
    });

    map.addLayer({
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': 4,
        'circle-color': color,
        'circle-opacity': 0.9,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.5,
      },
    });

    layerAddedRef.current = true;
  }, [map, visible, aircraft, color]);

  useEffect(() => {
    if (!map) return;

    if (map.isStyleLoaded()) {
      setupLayer();
    } else {
      map.once('load', setupLayer);
    }

    return () => {
      if (map && map.isStyleLoaded()) {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getLayer(HALO_LAYER_ID)) map.removeLayer(HALO_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      }
      layerAddedRef.current = false;
    };
  }, [map, setupLayer]);

  // Click handler for aircraft popups
  useEffect(() => {
    if (!map || !layerAddedRef.current) return;

    const handleClick = (e: any) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [LAYER_ID] });
      if (!features || features.length === 0) return;

      const feature = features[0];
      const props = feature.properties;
      const coords = (feature.geometry as any).coordinates.slice();

      // Close existing popup
      if (popupRef.current) {
        popupRef.current.remove();
      }

      const altStr = props.altitude ? `${Math.round(props.altitude)} ft` : 'N/A';
      const spdStr = props.speed ? `${Math.round(props.speed)} kt` : 'N/A';

      const html = `
        <div class="ews-aircraft-popup">
          <strong>${props.label || 'Unknown'}</strong>
          <span class="ews-aircraft-popup__hex">${props.hex || '—'}</span>
          <div class="ews-aircraft-popup__stats">
            <span>Alt: ${altStr}</span>
            <span>Spd: ${spdStr}</span>
          </div>
        </div>
      `;

      // Use maplibregl Popup from the imported module
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '200px' })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
    };

    map.on('click', LAYER_ID, handleClick);
    map.on('mouseenter', LAYER_ID, () => {
      if (map.getCanvas()) map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', LAYER_ID, () => {
      if (map.getCanvas()) map.getCanvas().style.cursor = '';
    });

    return () => {
      map.off('click', LAYER_ID, handleClick);
      if (popupRef.current) {
        popupRef.current.remove();
      }
    };
  }, [map, visible, aircraft]);

  return (
    <button
      type="button"
      className={`ews-aircraft-toggle ${visible ? 'is-active' : ''}`}
      onClick={onToggle}
      title={visible ? 'Hide EWS aircraft' : 'Show EWS aircraft'}
    >
      <span className="ews-aircraft-toggle__icon">✈</span>
      <span className="ews-aircraft-toggle__count">
        {aircraft.length > 0 ? aircraft.length : '—'}
      </span>
    </button>
  );
}
