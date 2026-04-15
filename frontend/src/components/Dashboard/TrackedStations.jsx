import PropTypes from 'prop-types';

function TrackedStations({ stations, onViewForecast, loading }) {
  return (
    <section className="dashboard-panel tracked-panel">
      <div className="dashboard-panel-header">
        <div>
          <p className="dashboard-eyebrow">Pinned Context</p>
          <h3 className="dashboard-panel-title">Tracked Stations</h3>
        </div>
      </div>

      {loading ? (
        <div className="tracked-list">
          {[0, 1, 2].map((item) => (
            <div key={item} className="tracked-station-card loading">
              <div className="dashboard-skeleton dashboard-skeleton-line short" />
              <div className="dashboard-skeleton dashboard-skeleton-line" />
            </div>
          ))}
        </div>
      ) : stations.length === 0 ? (
        <div className="tracked-empty-state">
          <div>
            <p>No stations tracked</p>
            <span>Pin stations from the map to keep forecast shortcuts here.</span>
          </div>
        </div>
      ) : (
        <div className="tracked-list">
          {stations.map((station) => (
            <div key={station.id} className="tracked-station-card">
              <div className="tracked-station-copy">
                <h4>{station.station_name || station.location || 'Unknown Station'}</h4>
                <p>{station.water_body_type || 'Water quality station'}</p>
              </div>
              <div className="tracked-station-meta">
                <span className="tracked-score">
                  {typeof station.pollution_score === 'number'
                    ? station.pollution_score.toFixed(1)
                    : '—'}
                </span>
                <button
                  type="button"
                  className="tracked-action"
                  onClick={() => onViewForecast(station.id)}
                >
                  View Forecast
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

TrackedStations.propTypes = {
  stations: PropTypes.arrayOf(PropTypes.object),
  onViewForecast: PropTypes.func.isRequired,
  loading: PropTypes.bool,
};

TrackedStations.defaultProps = {
  stations: [],
  loading: false,
};

export default TrackedStations;
