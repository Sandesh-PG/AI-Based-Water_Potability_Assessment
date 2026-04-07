import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './Map.css';

const INDIA_CENTER = [22.5937, 78.9629];

function FitBounds({ locations }) {
  const map = useMap();
  useEffect(() => {
    if (locations && locations.length > 0) {
      const bounds = locations.map(l => [l.lat, l.lon]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    }
  }, [locations, map]);
  return null;
}

function WaterQualityMap({ locations = [], onMarkerClick, selectedId }) {
  return (
    <MapContainer
      center={INDIA_CENTER}
      zoom={5}
      className="map-container"
      zoomControl={true}
      attributionControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={19}
      />

      {locations.length > 0 && <FitBounds locations={locations} />}

      {locations.map(loc => {
        const isSafe = loc.safety_label === 'Safe';
        const isSelected = loc.id === selectedId;
        return (
          <CircleMarker
            key={loc.id}
            center={[loc.lat, loc.lon]}
            radius={isSelected ? 10 : 7}
            pathOptions={{
              fillColor: isSafe ? '#22c55e' : '#ef4444',
              fillOpacity: isSelected ? 1 : 0.82,
              color: isSelected ? '#0f172a' : (isSafe ? '#15803d' : '#b91c1c'),
              weight: isSelected ? 2.5 : 1.2,
            }}
            eventHandlers={{
              click: () => onMarkerClick(loc),
            }}
          >
            <Popup className="custom-popup">
              <div className="popup-content">
                <div className="popup-location">{loc.location}</div>
                <div className="popup-meta">
                  <span className="popup-type">{loc.water_body_type}</span>
                  <span className={`popup-badge ${isSafe ? 'badge-safe' : 'badge-unsafe'}`}>
                    {loc.safety_label}
                  </span>
                </div>
                <div className="popup-score">
                  <span className="score-label">Pollution Score</span>
                  <span className="score-value">{loc.pollution_score?.toFixed(2)}</span>
                </div>
                <button className="popup-forecast-btn" onClick={() => onMarkerClick(loc)}>
                  View Forecast →
                </button>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

export default WaterQualityMap;