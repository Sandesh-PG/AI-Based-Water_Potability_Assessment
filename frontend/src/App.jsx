import { useState, useEffect, useCallback } from 'react';
import WaterQualityMap from './components/Map/Map.jsx';
import Filters from './components/Filters/Filters.jsx';
import Forecast from './components/Forecast/Forecast.jsx';
import { fetchLocations, fetchForecast } from './services/api.js';
import './App.css';

const DEFAULT_FILTERS = {
  year: '',
  water_body_type: '',
  safety_label: '',
};

function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(false);

  const loadLocations = useCallback(async (activeFilters) => {
    setLocationsLoading(true);
    try {
      const data = await fetchLocations(activeFilters);
      setLocations(data);
    } catch (e) {
      console.error('Failed to load locations:', e);
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocations({});
  }, [loadLocations]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleApplyFilters = () => {
    loadLocations(filters);
  };

  const handleMarkerClick = async (loc) => {
    setSelectedLocation(loc);
    setForecastData(null);
    setForecastError(false);
    setForecastLoading(true);
    try {
      const data = await fetchForecast(loc.id, 5);
      setForecastData(data);
    } catch (e) {
      console.error('Forecast error:', e);
      setForecastError(true);
    } finally {
      setForecastLoading(false);
    }
  };

  return (
    <div className="app-layout">
      {/* Left Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">≋</span>
          <div>
            <div className="brand-name">AquaWatch</div>
            <div className="brand-sub">Water Quality Monitor</div>
          </div>
        </div>

        <Filters
          filters={filters}
          onChange={handleFilterChange}
          onApply={handleApplyFilters}
          loading={locationsLoading}
        />

        <div className="sidebar-stats">
          <div className="stat-row">
            <span className="stat-row-label">Stations</span>
            <span className="stat-row-val">{locations.length}</span>
          </div>
          <div className="stat-row">
            <span className="stat-row-label safe-label">Safe</span>
            <span className="stat-row-val">{locations.filter(l => l.safety_label === 'Safe').length}</span>
          </div>
          <div className="stat-row">
            <span className="stat-row-label unsafe-label">Unsafe</span>
            <span className="stat-row-val">{locations.filter(l => l.safety_label === 'Unsafe').length}</span>
          </div>
        </div>
      </aside>

      {/* Main dashboard area */}
      <main className="app-main">
        {/* Top stats bar */}
        <div className="dashboard-topbar">
          <div className="topbar-title">
            Water Quality Map
            {selectedLocation && (
              <span className="topbar-selected">— {selectedLocation.location}</span>
            )}
          </div>
          <div className="topbar-pills">
            <span className={`topbar-pill ${locationsLoading ? 'pulsing' : ''}`}>
              {locationsLoading ? 'Updating…' : `${locations.length} Stations`}
            </span>
          </div>
        </div>

        {/* Map */}
        <div className="map-wrapper">
          <WaterQualityMap
            locations={locations}
            onMarkerClick={handleMarkerClick}
            selectedId={selectedLocation?.id}
          />
        </div>

        {/* Bottom forecast panel */}
        <div className="forecast-bottom">
          <Forecast
            data={forecastData}
            loading={forecastLoading}
            error={forecastError}
          />
        </div>
      </main>
    </div>
  );
}

export default App;