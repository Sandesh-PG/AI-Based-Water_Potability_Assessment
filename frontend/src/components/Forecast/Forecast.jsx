import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
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
      {payload[1] && (
        <div className="tooltip-row muted">
          <span className="tooltip-dot" style={{ background: '#bae6fd' }} />
          <span className="tooltip-label">Upper</span>
          <span className="tooltip-val">{payload[1]?.value?.toFixed(2)}</span>
        </div>
      )}
      {payload[2] && (
        <div className="tooltip-row muted">
          <span className="tooltip-dot" style={{ background: '#bae6fd' }} />
          <span className="tooltip-label">Lower</span>
          <span className="tooltip-val">{payload[2]?.value?.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function Forecast({ data, loading, error }) {
  if (loading) {
    return (
      <div className="forecast-wrapper forecast-empty">
        <div className="forecast-spinner" />
        <p className="empty-text">Loading forecast…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="forecast-wrapper forecast-empty">
        <span className="empty-icon">⚠</span>
        <p className="empty-text">Failed to load forecast</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="forecast-wrapper forecast-empty">
        <span className="empty-icon">◎</span>
        <p className="empty-text">Click a marker to see forecast</p>
      </div>
    );
  }

  const trend = TREND_CONFIG[data.trend] || TREND_CONFIG.Stable;
  const chartData = data.forecast.map(f => ({
    year: f.ds?.slice(0, 4) ?? f.ds,
    yhat: +f.yhat.toFixed(3),
    yhat_upper: +f.yhat_upper.toFixed(3),
    yhat_lower: +f.yhat_lower.toFixed(3),
  }));

  return (
    <div className="forecast-wrapper">
      <div className="forecast-header">
        <span className="forecast-icon">◈</span>
        <h2 className="forecast-title">Forecast</h2>
      </div>

      <div className="forecast-location">{data.location}</div>

      <div className="trend-badge" style={{ background: trend.bg, color: trend.color }}>
        <span className="trend-icon">{trend.icon}</span>
        {data.trend}
      </div>

      <div className="chart-label">Pollution Score Over Time</div>

      <div className="chart-area">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="gradMain" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#bae6fd" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#bae6fd" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="year"
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
            <Area
              type="monotone"
              dataKey="yhat_upper"
              stroke="#bae6fd"
              strokeWidth={1}
              fill="url(#gradBand)"
              dot={false}
              name="yhat_upper"
            />
            <Area
              type="monotone"
              dataKey="yhat_lower"
              stroke="#bae6fd"
              strokeWidth={1}
              fill="url(#gradBand)"
              dot={false}
              name="yhat_lower"
            />
            <Area
              type="monotone"
              dataKey="yhat"
              stroke="#0ea5e9"
              strokeWidth={2.5}
              fill="url(#gradMain)"
              dot={{ r: 3, fill: '#0ea5e9', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              name="yhat"
            />
          </AreaChart>
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

export default Forecast;