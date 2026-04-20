import PropTypes from 'prop-types';
import WaterQualityMap from '../Map/Map.jsx';
import Forecast from '../Forecast/Forecast.jsx';
import Topbar from '../Topbar/Topbar.jsx';
import './Dashboard.css';

function Dashboard({
  locations,
  selectedLocationId,
  onLocationSelect,
  locationsLoading,
  selectedLocation,
  theme,
  onThemeToggle,
}) {
  return (
    <main className="app-main" data-theme={theme}>
      <Topbar
        selectedLocation={selectedLocation}
        locationsLoading={locationsLoading}
        locations={locations}
        theme={theme}
        onThemeToggle={onThemeToggle}
      />

      <div className="map-container">
        <WaterQualityMap
          locations={locations}
          selectedLocationId={selectedLocationId}
          onLocationSelect={onLocationSelect}
        />
      </div>

      <div className="forecast-container">
        <Forecast selectedLocationId={selectedLocationId} />
      </div>
    </main>
  );
}

Dashboard.propTypes = {
  locations: PropTypes.arrayOf(PropTypes.object).isRequired,
  selectedLocationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onLocationSelect: PropTypes.func.isRequired,
  locationsLoading: PropTypes.bool.isRequired,
  selectedLocation: PropTypes.shape({
    location: PropTypes.string,
  }),
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  onThemeToggle: PropTypes.func.isRequired,
};

Dashboard.defaultProps = {
  selectedLocationId: null,
  selectedLocation: null,
};

export default Dashboard;
