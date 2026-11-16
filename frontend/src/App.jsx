import { useCallback, useMemo, useState } from 'react';
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
import { BatchProvider } from './contexts/BatchContext.jsx';
import { fetchLocations } from './services/api.js';
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
        <BatchProvider>
          <AppShell />
        </BatchProvider>
      </PinnedStationsProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [theme, setTheme] = useState('dark');

  // Incremented when the user explicitly adds batch data to the in-memory dataset.
  // Components that need to refetch (Filters → Map, HomeView stats) watch this value.
  const [dataVersion, setDataVersion] = useState(0);

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

  // Called by BatchView after the user clicks "Add to Map & Dashboard".
  // Re-fetches locations from the now-updated in-memory cache and bumps
  // dataVersion so HomeView/StatsView also refetch their stats.
  const handleDatasetUpdated = useCallback(async () => {
    try {
      setLocationsLoading(true);
      const data = await fetchLocations({});
      if (Array.isArray(data)) setLocations(data);
    } catch (err) {
      console.warn('[App] handleDatasetUpdated: failed to refresh locations:', err);
    } finally {
      setLocationsLoading(false);
      setDataVersion((v) => v + 1);
    }
  }, []);

  return (
    <div className="app-layout" data-theme={theme} data-active-module={activeModule}>
      <NavRail />

      <Routes>
        <Route
          path="/"
          element={(
            <HomeView
              totalStations={0}
              safeCount={0}
              unsafeCount={0}
              onLocationSelect={setSelectedLocationId}
              theme={theme}
              onThemeToggle={handleThemeToggle}
              dataVersion={dataVersion}
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
              dataVersion={dataVersion}
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
        <Route path="/stats" element={<StatsView dataVersion={dataVersion} />} />
        <Route
          path="/batch"
          element={<BatchView onDatasetUpdated={handleDatasetUpdated} />}
        />
        <Route path="/ai" element={<AquaAIView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

AppShell.displayName = 'AppShell';

export default App;
