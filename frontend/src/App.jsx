import { useMemo, useState } from 'react';
import Sidebar from './components/Sidebar/Sidebar.jsx';
import Dashboard from './components/Dashboard/Dashboard.jsx';
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
      <Sidebar
        filters={filters}
        onChange={handleFilterChange}
        setLocations={setLocations}
        setLocationsLoading={setLocationsLoading}
        loading={locationsLoading}
        locations={locations}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />

      <Dashboard
        locations={locations}
        selectedLocationId={selectedLocationId}
        onLocationSelect={setSelectedLocationId}
        locationsLoading={locationsLoading}
        selectedLocation={selectedLocation}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />
    </div>
  );
}

export default App;