import PropTypes from 'prop-types';
import Filters from '../Filters/Filters.jsx';
import './Sidebar.css';

function Sidebar({
  filters,
  onChange,
  setLocations,
  setLocationsLoading,
  loading,
  locations,
  theme,
  onThemeToggle,
}) {
  const themeToggleHandler = onThemeToggle;
  const isValidCoordinate = (lat, lon) => {
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
    return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  };

  const plottedCount = locations.filter((item) => (
    item?.id !== null && item?.id !== undefined && isValidCoordinate(item?.lat, item?.lon)
  )).length;

  return (
    <aside className="app-sidebar" data-theme={theme} data-toggle-handler={Boolean(themeToggleHandler)}>
      <div className="sidebar-brand">
        <span className="brand-mark">≋</span>
        <div>
          <div className="brand-name">Station Map</div>
          <div className="brand-sub">Water Quality Layer</div>
        </div>
      </div>

      <Filters
        filters={filters}
        onChange={onChange}
        setLocations={setLocations}
        setLocationsLoading={setLocationsLoading}
        loading={loading}
      />

      <div className="sidebar-stats">
        <div className="stat-row">
          <span className="stat-row-label">Stations</span>
          <span className="stat-row-val">{plottedCount} <span className="stat-row-sub">({locations.length} total)</span></span>
        </div>
        <div className="stat-row">
          <span className="stat-row-label safe-label">Safe</span>
          <span className="stat-row-val">{locations.filter((item) => item.safety_label === 'Safe' && isValidCoordinate(item?.lat, item?.lon)).length}</span>
        </div>
        <div className="stat-row">
          <span className="stat-row-label unsafe-label">Unsafe</span>
          <span className="stat-row-val">{locations.filter((item) => item.safety_label === 'Unsafe' && isValidCoordinate(item?.lat, item?.lon)).length}</span>
        </div>
      </div>
    </aside>
  );
}

Sidebar.propTypes = {
  filters: PropTypes.shape({
    year: PropTypes.string.isRequired,
    water_body_type: PropTypes.string.isRequired,
    safety_label: PropTypes.string.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  setLocations: PropTypes.func.isRequired,
  setLocationsLoading: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
  locations: PropTypes.arrayOf(
    PropTypes.shape({
      safety_label: PropTypes.string,
    }),
  ).isRequired,
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  onThemeToggle: PropTypes.func.isRequired,
};

export default Sidebar;
