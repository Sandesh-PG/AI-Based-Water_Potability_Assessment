import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { getForecast } from '../../services/api.js';
import './Forecast.css';

const TREND_CONFIG = {
  Improving: { icon: '↘', color: '#16a34a', bg: '#dcfce7' },
  Worsening: { icon: '↗', color: '#dc2626', bg: '#fee2e2' },
  Stable:    { icon: '→', color: '#0ea5e9', bg: '#e0f2fe' },
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-year">{label}</div>
      <div className="tooltip-row">
        <span className="tooltip-dot" style={{ background: '#0ea5e9' }} />
        <span className="tooltip-label">Predicted</span>
        <span className="tooltip-val">{payload[0]?.value?.toFixed(2)}</span>
      </div>
    </div>
  );
}

function Forecast({ selectedLocationId }) {
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadForecast() {
      if (!selectedLocationId) {
        setForecastData(null);
        setError(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(false);

      try {
        const data = await getForecast(selectedLocationId, 5);
        if (isMounted) {
          setForecastData(data);
        }
      } catch (fetchError) {
        console.error('Failed to load forecast:', fetchError);
        if (isMounted) {
          setError(true);
          setForecastData(null);
        }
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
  }, [selectedLocationId]);

  if (loading) {
    return (
      <div className="forecast-wrapper forecast-empty forecast-fade" aria-live="polite">
        <div className="forecast-spinner" />
        <p className="empty-text">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="forecast-wrapper forecast-empty forecast-fade" aria-live="polite">
        <span className="empty-icon">⚠</span>
        <p className="empty-text">Failed to load forecast</p>
      </div>
    );
  }

  if (!selectedLocationId) {
    return (
      <div className="forecast-wrapper forecast-empty forecast-fade" aria-live="polite">
        <span className="empty-icon">◎</span>
        <p className="empty-text">Click a marker to see forecast</p>
      </div>
    );
  }

  if (!forecastData || !Array.isArray(forecastData.forecast) || forecastData.forecast.length === 0) {
    return (
      <div className="forecast-wrapper forecast-empty forecast-fade" aria-live="polite">
        <span className="empty-icon">◎</span>
        <p className="empty-text">No forecast data available</p>
      </div>
    );
  }

  const trend = TREND_CONFIG[forecastData.trend] || TREND_CONFIG.Stable;
  const chartData = forecastData.forecast.map(f => ({
    ds: f.ds?.slice(0, 10) ?? f.ds,
    yhat: +f.yhat.toFixed(3),
  }));

  return (
    <div className="forecast-wrapper">
      <div className="forecast-header">
        <span className="forecast-icon">◈</span>
        <h2 className="forecast-title">Forecast</h2>
      </div>

      <div className="forecast-location">{forecastData.location}</div>

      <div className="forecast-trend" style={{ color: trend.color }}>
        Trend: {forecastData.trend}
      </div>

      <div className="chart-label">Pollution Score Over Time</div>

      <div className="chart-area">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="ds"
              tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'DM Mono' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8', fontFamily: 'DM Mono' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="yhat"
              stroke="#0ea5e9"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#0ea5e9', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              name="yhat"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="forecast-stats">
        <div className="stat-card">
          <span className="stat-label">Min</span>
          <span className="stat-val">{Math.min(...chartData.map(d => d.yhat)).toFixed(2)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Max</span>
          <span className="stat-val">{Math.max(...chartData.map(d => d.yhat)).toFixed(2)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Points</span>
          <span className="stat-val">{chartData.length}</span>
        </div>
      </div>
    </div>
  );
}

CustomTooltip.propTypes = {
  active: PropTypes.bool,
  label: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  payload: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.number,
    }),
  ),
};

CustomTooltip.defaultProps = {
  active: false,
  label: '',
  payload: [],
};

Forecast.propTypes = {
  selectedLocationId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};

Forecast.defaultProps = {
  selectedLocationId: null,
};

export default Forecast;