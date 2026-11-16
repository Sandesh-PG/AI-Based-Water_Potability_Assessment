import { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePinnedStations } from '../contexts/PinnedStationsContext.jsx';
import { fetchForecast, fetchLocations, fetchForecastInsights } from '../services/api.js';
import '../components/Forecast/ForecastPage.css';

function getStationLabel(station) {
  return station?.location || station?.label || station?.name || `Station ${station?.id ?? ''}`.trim();
}

function trendTone(trend) {
  if (trend === 'Improving') return 'safe';
  if (trend === 'Worsening') return 'unsafe';
  return 'accent';
}

function formatYear(value) {
  return value ? String(value).slice(0, 4) : '';
}

function formatSignedNumber(value) {
  if (!Number.isFinite(value)) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

function buildChartData(forecast, historical) {
  const histMap = {};
  (historical || []).forEach((row) => {
    if (row.year) histMap[String(row.year)] = Number(row.pollution_score);
  });

  const forecastMap = {};
  (forecast || []).forEach((row) => {
    const year = String(row.ds).slice(0, 4);
    forecastMap[year] = {
      predicted: Number(row.yhat),
      lower: Number(row.yhat_lower),
      upper: Number(row.yhat_upper),
    };
  });

  const years = Array.from(new Set([
    ...Object.keys(histMap),
    ...Object.keys(forecastMap),
  ])).sort((a, b) => Number(a) - Number(b));

  return years.map((year) => ({
    year,
    historical: Object.hasOwn(histMap, year) ? histMap[year] : null,
    predicted: forecastMap[year] ? forecastMap[year].predicted : null,
    lower: forecastMap[year] ? forecastMap[year].lower : null,
    upper: forecastMap[year] ? forecastMap[year].upper : null,
  }));
}

// ── Tone helpers ────────────────────────────────────────────────────
function safetyToTone(safetyStatus) {
  if (!safetyStatus) return 'accent';
  const s = safetyStatus.toLowerCase();
  if (s === 'safe') return 'safe';
  if (s === 'unsafe' || s === 'polluted' || s === 'severely polluted') return 'unsafe';
  return 'accent';
}

function trendToTone(trend) {
  if (trend === 'Improving') return 'safe';
  if (trend === 'Worsening') return 'unsafe';
  return 'accent';
}

// ── Empty/placeholder cards when no station selected ─────────────────
const EMPTY_CARDS = {
  cause: { tone: 'accent', lines: ['Select a pinned station to see AI-powered pollution cause analysis for this location.'] },
  health: { tone: 'accent', lines: ['Health impact analysis will appear after a station forecast is loaded.'] },
  trends: { tone: 'accent', lines: ['Trend direction and score trajectory will be displayed here after loading.'] },
};

const CARD_META = [
  { key: 'cause',  icon: '⚗️',  label: 'Cause' },
  { key: 'health', icon: '🫀', label: 'Health Impact' },
  { key: 'trends', icon: '📈',  label: 'Trends' },
];

function ForecastMetaCards({ aiInsights, aiLoading, aiError, forecastTrend }) {
  // Build cards from real AI data
  const cards = useMemo(() => {
    if (!aiInsights) return EMPTY_CARDS;

    const causeTone = safetyToTone(aiInsights.safety_status);
    const healthTone = causeTone;
    const trendsTone = trendToTone(forecastTrend);

    const causeLines = aiInsights.causes?.length
      ? aiInsights.causes
      : ['No specific cause data returned. This station may have limited violation history.'];

    const healthLines = aiInsights.health_risks?.length
      ? aiInsights.health_risks
      : ['No specific health risk data returned for this station.'];

    // Build trends text from recommended_actions + answer snippet
    const trendsLines = aiInsights.recommended_actions?.length
      ? aiInsights.recommended_actions
      : [aiInsights.answer || 'No trend analysis available.'];

    return {
      cause:  { tone: causeTone,  lines: causeLines },
      health: { tone: healthTone, lines: healthLines },
      trends: { tone: trendsTone, lines: trendsLines },
    };
  }, [aiInsights, forecastTrend]);

  return (
    <div className="forecast-meta-cards">
      {CARD_META.map(({ key, icon, label }) => (
        <article key={key} className={`forecast-meta-card ${cards[key].tone}`}>
          <div className="forecast-meta-card-header">
            <span className="forecast-meta-card-icon">{icon}</span>
            <span className={`forecast-meta-card-label ${cards[key].tone}`}>{label}</span>
            {aiLoading && <span className="forecast-meta-card-spinner" />}
          </div>

          {aiLoading ? (
            <div className="forecast-meta-card-skeleton" />
          ) : aiError ? (
            <p className="forecast-meta-card-text muted">
              Could not load AI insights. {aiError}
            </p>
          ) : (
            <ul className="forecast-meta-card-list">
              {cards[key].lines.slice(0, 3).map((line, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <li key={i} className="forecast-meta-card-item">{line}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

ForecastMetaCards.propTypes = {
  aiInsights: PropTypes.shape({
    causes: PropTypes.arrayOf(PropTypes.string),
    health_risks: PropTypes.arrayOf(PropTypes.string),
    recommended_actions: PropTypes.arrayOf(PropTypes.string),
    answer: PropTypes.string,
    safety_status: PropTypes.string,
  }),
  aiLoading: PropTypes.bool,
  aiError: PropTypes.string,
  forecastTrend: PropTypes.string,
};

ForecastMetaCards.defaultProps = {
  aiInsights: null,
  aiLoading: false,
  aiError: '',
  forecastTrend: 'Stable',
};



function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="forecast-tooltip">
      <div className="forecast-tooltip-label">{formatYear(label)}</div>
      {payload.map((item) => (
        <div key={item.dataKey} className="forecast-tooltip-row">
          <span className="forecast-tooltip-dot" style={{ background: item.color }} />
          <span className="forecast-tooltip-series">{item.name}</span>
          <span className="forecast-tooltip-value">{Number(item.value).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

CustomTooltip.propTypes = {
  active: PropTypes.bool,
  label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  payload: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.number,
    color: PropTypes.string,
    dataKey: PropTypes.string,
  })),
};

CustomTooltip.defaultProps = {
  active: false,
  label: '',
  payload: [],
};

function ForecastHeader({ theme, onThemeToggle, stations, selectedStationId, onStationChange }) {
  const showDropdown = stations.length > 1;

  return (
    <div className="forecast-page-header">
      <div className="forecast-page-copy">
        <p className="forecast-eyebrow">Forecast</p>
        <div className="forecast-pin-strip">
          {stations.length > 0 ? stations.map((station) => (
            <span key={station.id} className={`forecast-station-chip ${String(station.id) === String(selectedStationId) ? 'active' : ''}`}>
              {station.stationName}
            </span>
          )) : (
            <span className="forecast-station-chip muted">No pinned stations yet</span>
          )}
        </div>
      </div>

      <div className="forecast-page-actions">
        {showDropdown && (
          <label className="forecast-control small forecast-selector">
            <span className="forecast-control-label">Station</span>
            <select
              className="forecast-control-select"
              value={selectedStationId}
              onChange={(event) => onStationChange(event.target.value)}
            >
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.stationName}
                </option>
              ))}
            </select>
          </label>
        )}

        <button type="button" className="forecast-page-theme-toggle" onClick={onThemeToggle}>
          {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
        </button>
      </div>
    </div>
  );
}

function ForecastBody({ loading, error, chartData, theme, axisColor, gridColor }) {
  if (loading) {
    return (
      <div className="forecast-chart-empty forecast-empty-state">
        <div className="forecast-chart-skeleton hero" />
        <div className="forecast-chart-skeleton line" />
        <div className="forecast-chart-skeleton chart" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="forecast-chart-empty forecast-empty-state">
        <div className="forecast-empty-icon">!</div>
        <h3>Unable to load forecast</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="forecast-chart-empty forecast-empty-state">
        <div className="forecast-empty-icon">◎</div>
        <h3>Select a pinned station</h3>
        <p>Choose a station from the dropdown to visualize its forecast.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
        <XAxis
          dataKey="year"
          tick={{ fill: axisColor, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={formatYear}
          label={{ value: 'Year', position: 'insideBottom', offset: -4, fill: axisColor }}
        />
        <YAxis
          domain={[0, 10]}
          tick={{ fill: axisColor, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          label={{
            value: 'Pollution Score',
            angle: -90,
            position: 'insideLeft',
            fill: axisColor,
            dx: -8,
          }}
        />
        <Tooltip
          content={<CustomTooltip />}
          contentStyle={{
            background: theme === 'dark' ? '#111827' : '#ffffff',
            border: `1px solid ${theme === 'dark' ? '#243041' : '#dbe4ef'}`,
            borderRadius: '12px',
          }}
        />
        <Line
          type="monotone"
          dataKey="historical"
          stroke="#94a3b8"
          strokeWidth={3}
          dot={{ r: 4, fill: '#94a3b8', strokeWidth: 0 }}
          connectNulls={false}
          name="Historical"
        />
        <Line
          type="monotone"
          dataKey="predicted"
          stroke="#38bdf8"
          strokeWidth={3}
          dot={{ r: 4, fill: '#38bdf8', strokeWidth: 0 }}
          activeDot={{ r: 6 }}
          connectNulls={false}
          name="Predicted"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

ForecastBody.propTypes = {
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string.isRequired,
  chartData: PropTypes.arrayOf(PropTypes.object).isRequired,
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  axisColor: PropTypes.string.isRequired,
  gridColor: PropTypes.string.isRequired,
  forecastData: PropTypes.shape({
    stationName: PropTypes.string,
  }),
};

ForecastBody.defaultProps = {
  forecastData: null,
};

ForecastHeader.propTypes = {
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  onThemeToggle: PropTypes.func.isRequired,
  stations: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    stationName: PropTypes.string.isRequired,
  })).isRequired,
  selectedStationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onStationChange: PropTypes.func.isRequired,
};

ForecastHeader.defaultProps = {
  selectedStationId: '',
};

function ForecastView({ selectedLocationId, selectedLocation, theme, onThemeToggle }) {
  const { pinnedStations } = usePinnedStations();
  const [selectedStationId, setSelectedStationId] = useState('');
  const [forecastData, setForecastData] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // AI insights state for the three cards
  const [aiInsights, setAiInsights] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const stations = useMemo(() => {
    const pinned = pinnedStations.slice(0, 5).map((station) => ({
      ...station,
      stationName: getStationLabel(station),
    }));

    if (pinned.length > 0) {
      return pinned;
    }

    if (selectedLocation || selectedLocationId) {
      const fallbackStation = selectedLocation || { id: selectedLocationId, location: 'Selected station' };
      return [{ ...fallbackStation, stationName: getStationLabel(fallbackStation) }];
    }

    return [];
  }, [pinnedStations, selectedLocation, selectedLocationId]);

  useEffect(() => {
    if (!stations.length) {
      setSelectedStationId('');
      setForecastData(null);
      setError('');
      setLoading(false);
      return;
    }

    setSelectedStationId((current) => {
      if (current && stations.some((station) => String(station.id) === String(current))) {
        return current;
      }
      return String(stations[0].id);
    });
  }, [stations]);

  const selectedStation = useMemo(
    () => stations.find((station) => String(station.id) === String(selectedStationId)) || stations[0] || null,
    [stations, selectedStationId],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadForecast() {
      if (!selectedStation?.id) {
        setForecastData(null);
        setError('');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const payload = await fetchForecast(selectedStation.id, 5);
        if (!isMounted) return;
        setForecastData({
          stationName: selectedStation.stationName,
          payload,
        });

        const allData = await fetchLocations({});
        const stationRows = allData
          .filter((row) => String(row.id) === String(selectedStation.id))
          .sort((a, b) => a.year - b.year);

        if (isMounted) {
          setHistoricalData(stationRows);
        }
      } catch {
        if (!isMounted) return;
        setForecastData(null);
        setError('Unable to load forecast data for the selected station.');
        setHistoricalData([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadForecast();

    return () => {
      isMounted = false;
    };
  }, [selectedStation]);

  // Fetch AI insights separately after forecastData is available
  useEffect(() => {
    let isMounted = true;

    async function loadInsights() {
      if (!forecastData?.payload?.forecast?.length) {
        setAiInsights(null);
        setAiError('');
        return;
      }

      setAiLoading(true);
      setAiError('');

      const values = forecastData.payload.forecast
        .map((row) => Number(row.yhat))
        .filter(Number.isFinite);
      const lastScore = values.length ? values[values.length - 1] : null;
      const trend = forecastData.payload.trend || 'Stable';

      try {
        const result = await fetchForecastInsights(
          selectedStation?.id,
          forecastData.stationName,
          trend,
          lastScore,
        );
        if (!isMounted) return;
        setAiInsights(result);
      } catch {
        if (!isMounted) return;
        setAiError('AI service unavailable.');
      } finally {
        if (isMounted) setAiLoading(false);
      }
    }

    loadInsights();

    return () => {
      isMounted = false;
    };
  // forecastData identity changes when station changes; selectedStation for id
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastData]);

  const chartData = useMemo(
    () => buildChartData(forecastData?.payload?.forecast || [], historicalData),
    [forecastData, historicalData],
  );
  const axisColor = theme === 'dark' ? '#7f8ea3' : '#64748b';
  const gridColor = theme === 'dark' ? '#223046' : '#dbe4ef';

  return (
    <section className="forecast-page">
      <div className="forecast-page-top">
        <ForecastHeader
          theme={theme}
          onThemeToggle={onThemeToggle}
          stations={stations}
          selectedStationId={selectedStationId}
          onStationChange={setSelectedStationId}
        />

        <div className="forecast-chart-card">
          <div className="forecast-chart-header">
            <div>
              <p className="forecast-eyebrow">Forecast Visualization</p>
              <h2>{forecastData?.stationName || 'Waiting for a station'}</h2>
              <p className="forecast-chart-subtitle">
                Five-year projected pollution score for the selected pinned station.
              </p>
            </div>
            <span className={`forecast-trend-badge ${trendTone(forecastData?.payload?.trend)}`}>
              {forecastData?.payload?.trend || 'Stable'}
            </span>
          </div>

          <div className="forecast-legend forecast-legend-inline">
            <span><i className="legend-swatch historical" /> Historical</span>
            <span><i className="legend-swatch predicted" /> Predicted</span>
          </div>

          <div className="forecast-chart-shell">
            <ForecastBody
              loading={loading}
              error={error}
              chartData={chartData}
              theme={theme}
              axisColor={axisColor}
              gridColor={gridColor}
              forecastData={forecastData}
              historicalData={historicalData}
            />
          </div>
        </div>
      </div>

      <div className="forecast-page-bottom">
        <ForecastMetaCards
          aiInsights={aiInsights}
          aiLoading={aiLoading}
          aiError={aiError}
          forecastTrend={forecastData?.payload?.trend || 'Stable'}
        />
      </div>
    </section>
  );
}

ForecastView.propTypes = {
  selectedLocationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectedLocation: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    location: PropTypes.string,
    label: PropTypes.string,
    name: PropTypes.string,
  }),
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  onThemeToggle: PropTypes.func.isRequired,
};

ForecastView.defaultProps = {
  selectedLocationId: null,
  selectedLocation: null,
};

export default ForecastView;