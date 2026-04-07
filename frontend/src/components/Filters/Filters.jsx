import './Filters.css';

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022];
const WATER_BODY_TYPES = ['River', 'Lake', 'Groundwater'];
const SAFETY_LABELS = ['Safe', 'Unsafe'];

function Filters({ filters, onChange, onApply, loading }) {
  return (
    <div className="filters-wrapper">
      <div className="filters-header">
        <span className="filters-icon">⟁</span>
        <h2 className="filters-title">Filters</h2>
      </div>

      <div className="filters-body">
        <div className="filter-group">
          <label className="filter-label">Year</label>
          <div className="select-wrapper">
            <select
              className="filter-select"
              value={filters.year}
              onChange={e => onChange('year', e.target.value)}
            >
              <option value="">All Years</option>
              {YEARS.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">Water Body</label>
          <div className="select-wrapper">
            <select
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
          <label className="filter-label">Safety</label>
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
          onClick={onApply}
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

export default Filters;