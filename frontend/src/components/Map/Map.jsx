import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { usePinnedStations } from '../../contexts/PinnedStationsContext.jsx';
import './Map.css';

const INDIA_CENTER = [22.5937, 78.9629];

function isValidCoordinate(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false;
  }

  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function createMarkerIcon(isSelected, safetyLabel) {
  const isSafe = safetyLabel === 'Safe';
  const color = isSafe ? '#22c55e' : '#ef4444';
  const glowColor = isSafe
    ? 'rgba(34,197,94,0.25)'
    : 'rgba(239,68,68,0.25)';
  const size = isSelected ? 20 : 12;
  const anchor = isSelected ? 10 : 6;

  return L.divIcon({
    className: `station-marker ${isSelected ? 'station-marker-selected' : ''}`,
    html: `<span class="station-marker-dot"
             style="background:${color};
                    box-shadow:0 0 0 3px ${glowColor};
                    width:${size}px;height:${size}px;
                    border-radius:50%;display:block;">
           </span>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
  });
}

function WaterQualityMap({ locations = [], selectedLocationId, onLocationSelect }) {
  const [mapInstance, setMapInstance] = useState(null);
  const { pinStation, isPinned, pinnedStations } = usePinnedStations();

  const renderPinButton = (location) => {
    if (isPinned(location.id)) {
      return (
        <button type="button" className="popup-pin-btn pinned" disabled>
          ✓ Pinned
        </button>
      );
    }

    if (pinnedStations.length >= 5) {
      return (
        <button type="button" className="popup-pin-btn maxed" disabled>
          📍 Max 5 reached
        </button>
      );
    }

    return (
      <button
        type="button"
        className="popup-pin-btn"
        onClick={() => pinStation(location)}
      >
        📍 Pin Station
      </button>
    );
  };

  const uniqueLocations = useMemo(() => {
    const normalized = locations
      .filter(
        (location) =>
          location?.id !== null
          && location?.id !== undefined
          && isValidCoordinate(location?.lat, location?.lon),
      )
      .map((location) => ({
        ...location,
        lat: Number(location.lat),
        lon: Number(location.lon),
      }));

    return Array.from(new Map(normalized.map((item) => [item.id, item])).values());
  }, [locations]);

  useEffect(() => {
    if (mapInstance && uniqueLocations.length > 0) {
      const bounds = uniqueLocations.map((location) => [location.lat, location.lon]);
      mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    }
  }, [mapInstance, uniqueLocations]);

  return (
    <div className="map-shell">
      <MapContainer
        ref={setMapInstance}
        center={INDIA_CENTER}
        zoom={5}
        className="map-canvas"
        zoomControl={true}
        attributionControl={true}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          maxZoom={19}
        />

        {uniqueLocations.map((location) => (
          <Marker
            key={location.id}
            position={[location.lat, location.lon]}
            icon={createMarkerIcon(
              String(location.id) === String(selectedLocationId),
              location.safety_label,
            )}
            eventHandlers={
              onLocationSelect
                ? {
                    click: () => onLocationSelect(location.id),
                  }
                : undefined
            }
          >
            <Popup>
              <div>
                <div><strong>{location.location || 'Unknown location'}</strong></div>
                <div>Pollution Score: {location.pollution_score ?? 'N/A'}</div>
                <div>Safety Label: {location.safety_label || 'N/A'}</div>
                {renderPinButton(location)}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

WaterQualityMap.propTypes = {
  locations: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      lat: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      lon: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      location: PropTypes.string,
      pollution_score: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      safety_label: PropTypes.string,
    }),
  ),
  onLocationSelect: PropTypes.func,
  selectedLocationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

export default WaterQualityMap;