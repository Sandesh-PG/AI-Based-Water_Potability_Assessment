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

const TREND_CONFIG = {
  Improving: { label: 'Improving', tone: 'safe' },
  Worsening: { label: 'Worsening', tone: 'unsafe' },
  Stable: { label: 'Stable', tone: 'accent' },
};

function ForecastChart({ state, data, locationName, trend, theme, error }) {
  const axisColor = theme === 'dark' ? '#7f8ea3' : '#64748b';
  const gridColor = theme === 'dark' ? '#223046' : '#dbe4ef';
  const trendMeta = TREND_CONFIG[trend] || TREND_CONFIG.Stable;

  if (state === 'loading') {
    return (
      <div className="forecast-chart-card loading">
        <div className="forecast-chart-skeleton hero" />
        <div className="forecast-chart-skeleton line" />
        <div className="forecast-chart-skeleton chart" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="forecast-chart-card forecast-chart-empty">
        <div className="forecast-empty-icon">!</div>
        <h3>Unable to load forecast</h3>
        <p>{error || 'Please try another station or retry later.'}</p>
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <div className="forecast-chart-card forecast-chart-empty">
        <div className="forecast-empty-icon">◎</div>
        <h3>Select a station</h3>
        <p>Choose a pinned station to visualize historical and predicted pollution levels.</p>
      </div>
    );
  }

  return (
    <div className="forecast-chart-card">
      <div className="forecast-chart-header">
        <div>
          <p className="forecast-eyebrow">Forecast Visualization</p>
          <h2>{locationName}</h2>
          <p className="forecast-chart-subtitle">
            Historical pollution score vs projected forecast range
          </p>
        </div>
        <span className={`forecast-trend-badge ${trendMeta.tone}`}>
          {trendMeta.label}
        </span>
      </div>

      <div className="forecast-legend">
        <span><i className="legend-swatch historical" /> Historical</span>
        <span><i className="legend-swatch predicted" /> Predicted</span>
        <span><i className="legend-swatch interval" /> Confidence Band</span>
      </div>

      <div className="forecast-chart-shell">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
            <XAxis
              dataKey="year"
              tick={{ fill: axisColor, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              label={{ value: 'Year', position: 'insideBottom', offset: -4, fill: axisColor }}
            />
            <YAxis
              tick={{ fill: axisColor, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              label={{
                value: 'Pollution Score',
                angle: -90,
                position: 'insideLeft',
                fill: axisColor,
                dx: -6,
              }}
            />
            <Tooltip
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
              connectNulls={false}
              name="Predicted"
            />
            <Line
              type="monotone"
              dataKey="upper"
              stroke="#38bdf8"
              strokeOpacity={0.35}
              strokeDasharray="6 4"
              dot={false}
              connectNulls={false}
              name="Upper"
            />
            <Line
              type="monotone"
              dataKey="lower"
              stroke="#38bdf8"
              strokeOpacity={0.35}
              strokeDasharray="6 4"
              dot={false}
              connectNulls={false}
              name="Lower"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

ForecastChart.propTypes = {
  state: PropTypes.oneOf(['loading', 'error', 'empty', 'ready']).isRequired,
  data: PropTypes.arrayOf(PropTypes.object),
  locationName: PropTypes.string,
  trend: PropTypes.string,
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  error: PropTypes.string,
};

ForecastChart.defaultProps = {
  data: [],
  locationName: 'Forecast',
  trend: 'Stable',
  error: '',
};

export default ForecastChart;
