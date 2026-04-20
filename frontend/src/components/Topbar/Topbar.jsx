import PropTypes from 'prop-types';
import './Topbar.css';

function Topbar({ selectedLocation, locationsLoading, locations, theme, onThemeToggle }) {
  return (
    <div className="dashboard-topbar" data-theme={theme}>
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

        <button type="button" className="theme-toggle" onClick={onThemeToggle}>
          {theme === 'light' ? 'Dark' : 'Light'} Mode
        </button>
      </div>
    </div>
  );
}

Topbar.propTypes = {
  selectedLocation: PropTypes.shape({
    location: PropTypes.string,
  }),
  locationsLoading: PropTypes.bool.isRequired,
  locations: PropTypes.arrayOf(PropTypes.object).isRequired,
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  onThemeToggle: PropTypes.func.isRequired,
};

Topbar.defaultProps = {
  selectedLocation: null,
};

export default Topbar;
