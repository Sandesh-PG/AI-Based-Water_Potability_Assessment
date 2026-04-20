import PropTypes from 'prop-types';

const YEAR_OPTIONS = [3, 5, 7];

function ForecastControls({
  stations,
  selectedStationId,
  onStationChange,
  years,
  onYearsChange,
}) {
  return (
    <div className="forecast-page-controls">
      <label className="forecast-control">
        <span className="forecast-control-label">Station</span>
        <select
          className="forecast-control-select"
          value={selectedStationId}
          onChange={(event) => onStationChange(event.target.value)}
        >
          <option value="">Select a station</option>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.label}
            </option>
          ))}
        </select>
      </label>

      <label className="forecast-control small">
        <span className="forecast-control-label">Forecast Range</span>
        <select
          className="forecast-control-select"
          value={years}
          onChange={(event) => onYearsChange(Number(event.target.value))}
        >
          {YEAR_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} years
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

ForecastControls.propTypes = {
  stations: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.string.isRequired,
    }),
  ),
  selectedStationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onStationChange: PropTypes.func.isRequired,
  years: PropTypes.number.isRequired,
  onYearsChange: PropTypes.func.isRequired,
};

ForecastControls.defaultProps = {
  stations: [],
  selectedStationId: '',
};

export default ForecastControls;
