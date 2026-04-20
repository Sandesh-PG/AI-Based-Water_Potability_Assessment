import PropTypes from 'prop-types';
import Sidebar from '../components/Sidebar/Sidebar.jsx';
import Dashboard from '../components/Dashboard/Dashboard.jsx';

function MapView({
  filters,
  onChange,
  setLocations,
  setLocationsLoading,
  loading,
  locations,
  selectedLocationId,
  onLocationSelect,
  locationsLoading,
  selectedLocation,
  theme,
  onThemeToggle,
}) {
  return (
    <>
      <Sidebar
        filters={filters}
        onChange={onChange}
        setLocations={setLocations}
        setLocationsLoading={setLocationsLoading}
        loading={loading}
        locations={locations}
        theme={theme}
        onThemeToggle={onThemeToggle}
      />

      <Dashboard
        locations={locations}
        selectedLocationId={selectedLocationId}
        onLocationSelect={onLocationSelect}
        locationsLoading={locationsLoading}
        selectedLocation={selectedLocation}
        theme={theme}
        onThemeToggle={onThemeToggle}
      />
    </>
  );
}

MapView.propTypes = {
  filters: PropTypes.shape({
    year: PropTypes.string.isRequired,
    water_body_type: PropTypes.string.isRequired,
    safety_label: PropTypes.string.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  setLocations: PropTypes.func.isRequired,
  setLocationsLoading: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
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

MapView.defaultProps = {
  selectedLocationId: null,
  selectedLocation: null,
};

export default MapView;
