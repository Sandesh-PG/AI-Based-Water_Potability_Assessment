import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';
import { usePinnedStations } from '../contexts/PinnedStationsContext.jsx';
import { getForecast, getLocations } from '../services/api.js';
import ForecastChart from '../components/Forecast/ForecastChart.jsx';
import ForecastControls from '../components/Forecast/ForecastControls.jsx';
import ForecastInsights from '../components/Forecast/ForecastInsights.jsx';
import '../components/Forecast/ForecastPage.css';

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022];

function averageScore(rows) {
  const values = rows
    .map((row) => Number(row.pollution_score))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return null;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function ForecastView({ selectedLocationId, selectedLocation, theme, onThemeToggle }) {
  const { pinnedStations } = usePinnedStations();
  const [activeStationId, setActiveStationId] = useState(selectedLocationId || '');
  const [forecastYears, setForecastYears] = useState(5);
  const [viewState, setViewState] = useState(selectedLocationId ? 'loading' : 'empty');
  const [errorMessage, setErrorMessage] = useState('');
  const [forecastBundle, setForecastBundle] = useState({
    chartData: [],
    locationName: 'Forecast',
    trend: 'Stable',
  });

  const stationOptions = useMemo(() => {
    const entries = [...pinnedStations];

    if (
      selectedLocation
      && selectedLocation.id
      && !entries.some((station) => String(station.id) === String(selectedLocation.id))
    ) {
      entries.unshift({
        id: selectedLocation.id,
        station_name: selectedLocation.location,
        water_body_type: selectedLocation.water_body_type,
      });
    }

    return entries.map((station) => ({
      id: station.id,
      label: station.station_name || station.location || `Station ${station.id}`,
    }));
  }, [pinnedStations, selectedLocation]);

  useEffect(() => {
    if (selectedLocationId) {
      setActiveStationId(String(selectedLocationId));
    }
  }, [selectedLocationId]);

  useEffect(() => {
    let isMounted = true;

    async function loadForecastView() {
      if (!activeStationId) {
        setViewState('empty');
        setErrorMessage('');
        setForecastBundle({
          chartData: [],
          locationName: 'Forecast',
          trend: 'Stable',
        });
        return;
      }

      setViewState('loading');
      setErrorMessage('');

      try {
        const [forecastResponse, yearlySnapshots] = await Promise.all([
          getForecast(activeStationId, forecastYears),
          Promise.all(YEARS.map((year) => getLocations({ year }))),
        ]);

        if (!isMounted) {
          return;
        }

        const historicalRows = yearlySnapshots
          .map((rows, index) => {
            const matches = (Array.isArray(rows) ? rows : []).filter(
              (row) => String(row.id) === String(activeStationId),
            );

            if (!matches.length) {
              return null;
            }

            return {
              year: String(YEARS[index]),
              historical: averageScore(matches),
              predicted: null,
              lower: null,
              upper: null,
            };
          })
          .filter(Boolean);

        const forecastRows = Array.isArray(forecastResponse.forecast)
          ? forecastResponse.forecast.map((row) => ({
              year: String(row.ds).slice(0, 4),
              historical: null,
              predicted: Number(row.yhat),
              lower: Number(row.yhat_lower),
              upper: Number(row.yhat_upper),
            }))
          : [];

        setForecastBundle({
          locationName: forecastResponse.location || `Station ${activeStationId}`,
          trend: forecastResponse.trend || 'Stable',
          chartData: [...historicalRows, ...forecastRows].sort(
            (left, right) => Number(left.year) - Number(right.year),
          ),
        });

        setViewState(forecastRows.length ? 'ready' : 'error');
        if (!forecastRows.length) {
          setErrorMessage('No forecast data available for the selected station.');
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setViewState('error');
        setErrorMessage(error.message || 'Failed to load forecast data.');
      }
    }

    loadForecastView();

    return () => {
      isMounted = false;
    };
  }, [activeStationId, forecastYears]);

  return (
    <div className="forecast-page">
      <div className="forecast-page-top">
        <div className="forecast-page-header">
          <div className="forecast-page-copy">
            <p className="forecast-eyebrow">Forecast Workspace</p>
            <h1>Forecast</h1>
            <p>
              Visualize historical pollution patterns, projected trends, and forecast confidence
              for pinned stations.
            </p>
          </div>

          <button
            type="button"
            className="forecast-page-theme-toggle"
            onClick={onThemeToggle}
          >
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
        </div>

        <ForecastControls
          stations={stationOptions}
          selectedStationId={activeStationId}
          onStationChange={setActiveStationId}
          years={forecastYears}
          onYearsChange={setForecastYears}
        />

        <ForecastChart
          state={viewState}
          data={forecastBundle.chartData}
          locationName={forecastBundle.locationName}
          trend={forecastBundle.trend}
          theme={theme}
          error={errorMessage}
        />
      </div>

      <div className="forecast-page-bottom">
        <ForecastInsights />
      </div>
    </div>
  );
}

ForecastView.propTypes = {
  selectedLocationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectedLocation: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    location: PropTypes.string,
    water_body_type: PropTypes.string,
  }),
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  onThemeToggle: PropTypes.func.isRequired,
};

ForecastView.defaultProps = {
  selectedLocationId: '',
  selectedLocation: null,
};

export default ForecastView;
