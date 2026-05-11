import { useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { getLocations } from '../../services/api.js';
import './Filters.css';

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022];
const WATER_BODY_TYPES = ['River', 'Canal', 'Groundwater', 'Pond/Tank'];
const SAFETY_LABELS = ['Safe', 'Unsafe'];

function Filters({ filters, onChange, setLocations, setLocationsLoading, loading }) {
  const loadLocations = useCallback(async (activeFilters) => {
    setLocationsLoading(true);
    try {
      const data = await getLocations(activeFilters);
      setLocations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load locations:', error);
      setLocations([]);
    } finally {
      setLocationsLoading(false);
    }
  }, [setLocations, setLocationsLoading]);

  useEffect(() => {
    // Load with no year filter by default (show all years)
    loadLocations({
      water_body_type: filters.water_body_type,
      safety_label: filters.safety_label,
    });
  }, [loadLocations]);

  const handleApply = () => {
    const activeFilters = {
      water_body_type: filters.water_body_type,
      safety_label: filters.safety_label,
    };
    // Only include year if it's not empty (i.e., not "All Years")
    if (filters.year) {
      activeFilters.year = parseInt(filters.year, 10);
    }
    loadLocations(activeFilters);
  };

  return (
    <div className="filters-wrapper">
      <div className="filters-header">
        <span className="filters-icon">⟁</span>
        <h2 className="filters-title" style={{"color": "white"}}>Filters</h2>
      </div>

      <div className="filters-body">
        <div className="filter-group">
          <label className="filter-label" htmlFor="filters-year">Year</label>
          <div className="select-wrapper">
            <select
              id="filters-year"
              className="filter-select"
              value={filters.year}
              onChange={(e) => onChange('year', e.target.value)}
            >
              <option value="">All Years</option>
              {YEARS.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label" htmlFor="filters-water-body">Water Body</label>
          <div className="select-wrapper">
            <select
              id="filters-water-body"
              className="filter-select"
              value={filters.water_body_type}
              onChange={e => onChange('water_body_type', e.target.value)}
            >
              <option value="">All Types</option>
              {WATER_BODY_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label" htmlFor="filters-safety">Safety</label>
          <input id="filters-safety" type="hidden" value={filters.safety_label} readOnly />
          <div className="safety-pills">
            <button
              className={`pill ${filters.safety_label === '' ? 'active' : ''}`}
              onClick={() => onChange('safety_label', '')}
            >All</button>
            {SAFETY_LABELS.map(s => (
              <button
                key={s}
                className={`pill ${s === 'Safe' ? 'pill-safe' : 'pill-unsafe'} ${filters.safety_label === s ? 'active' : ''}`}
                onClick={() => onChange('safety_label', s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <button
          className={`apply-btn ${loading ? 'loading' : ''}`}
          onClick={handleApply}
          disabled={loading}
        >
          {loading ? <span className="btn-spinner" /> : null}
          {loading ? 'Loading...' : 'Apply Filters'}
        </button>
      </div>

      <div className="filters-footer">
        <div className="legend-item">
          <span className="dot dot-safe" />
          <span>Safe</span>
        </div>
        <div className="legend-item">
          <span className="dot dot-unsafe" />
          <span>Unsafe</span>
        </div>
      </div>
    </div>
  );
}

Filters.propTypes = {
  filters: PropTypes.shape({
    year: PropTypes.string.isRequired,
    water_body_type: PropTypes.string.isRequired,
    safety_label: PropTypes.string.isRequired,
  }).isRequired,
  onChange: PropTypes.func.isRequired,
  setLocations: PropTypes.func.isRequired,
  setLocationsLoading: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
};

export default Filters;