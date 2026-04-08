import { useMemo, useState } from 'react';
import WaterQualityMap from './components/Map/Map.jsx';
import Filters from './components/Filters/Filters.jsx';
import Forecast from './components/Forecast/Forecast.jsx';
import './App.css';

const DEFAULT_FILTERS = {
  year: '',
  water_body_type: '',
  safety_label: '',
};

function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [theme, setTheme] = useState('light');

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const selectedLocation = useMemo(
    () => locations.find((location) => String(location.id) === String(selectedLocationId)) || null,
    [locations, selectedLocationId],
  );

  const handleThemeToggle = () => {
    setTheme((currentTheme) => (currentTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="app-layout" data-theme={theme}>
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
          setLocations={setLocations}
          setLocationsLoading={setLocationsLoading}
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
          <div className="topbar-actions">
            <div className="topbar-pills">
              <span className={`topbar-pill ${locationsLoading ? 'pulsing' : ''}`}>
                {locationsLoading ? 'Updating…' : `${locations.length} Stations`}
              </span>
            </div>
            <button type="button" className="theme-toggle" onClick={handleThemeToggle}>
              {theme === 'light' ? 'Dark' : 'Light'} Mode
            </button>
          </div>
        </div>

        <div className="map-container">
          <WaterQualityMap
            locations={locations}
            selectedLocationId={selectedLocationId}
            onLocationSelect={setSelectedLocationId}
          />
        </div>

        <div className="forecast-container">
          <Forecast selectedLocationId={selectedLocationId} />
        </div>
      </main>
    </div>
  );
}

export default App;