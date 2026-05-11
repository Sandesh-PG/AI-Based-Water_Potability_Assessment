import { useMemo, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import NavRail from './components/NavRail/NavRail.jsx';
import HomeView from './views/HomeView.jsx';
import MapView from './views/MapView.jsx';
import ForecastView from './views/ForecastView.jsx';
import StatsView from './views/StatsView.jsx';
import BatchView from './views/BatchView.jsx';
import AquaAIView from './views/AquaAIView.jsx';
import { PinnedStationsProvider } from './contexts/PinnedStationsContext.jsx';
import './App.css';

const DEFAULT_FILTERS = {
  year: '',
  water_body_type: '',
  safety_label: '',
};

function App() {
  return (
    <BrowserRouter>
      <PinnedStationsProvider>
        <AppShell />
      </PinnedStationsProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [theme, setTheme] = useState('light');
  const { pathname } = useLocation();

  const activeModule =
    pathname === '/' ? 'home' : pathname.replace('/', '') || 'home';

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

  const safeCount = locations.filter(l => l.safety_label === 'Safe').length;
  const unsafeCount = locations.filter(l => l.safety_label === 'Unsafe').length;

  return (
    <div className="app-layout" data-theme={theme} data-active-module={activeModule}>
      <NavRail />

      <Routes>
        <Route
          path="/"
          element={(
            <HomeView
              totalStations={locations.length}
              safeCount={safeCount}
              unsafeCount={unsafeCount}
              onLocationSelect={setSelectedLocationId}
              theme={theme}
              onThemeToggle={handleThemeToggle}
            />
          )}
        />
        <Route
          path="/map"
          element={(
            <MapView
              filters={filters}
              onChange={handleFilterChange}
              setLocations={setLocations}
              setLocationsLoading={setLocationsLoading}
              loading={locationsLoading}
              locations={locations}
              selectedLocationId={selectedLocationId}
              onLocationSelect={setSelectedLocationId}
              locationsLoading={locationsLoading}
              selectedLocation={selectedLocation}
              theme={theme}
              onThemeToggle={handleThemeToggle}
            />
          )}
        />
        <Route
          path="/forecast"
          element={(
            <ForecastView
              selectedLocationId={selectedLocationId}
              selectedLocation={selectedLocation}
              theme={theme}
              onThemeToggle={handleThemeToggle}
            />
          )}
        />
        <Route path="/stats" element={<StatsView />} />
        <Route path="/batch" element={<BatchView />} />
        <Route path="/ai" element={<AquaAIView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

AppShell.displayName = 'AppShell';

export default App;
