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

function TrendChart({ data, loading, theme }) {
  const axisColor = theme === 'dark' ? '#7f8ea3' : '#64748b';
  const gridColor = theme === 'dark' ? '#223046' : '#e2e8f0';
  const tooltipStyle = {
    background: theme === 'dark' ? '#111827' : '#ffffff',
    border: `1px solid ${theme === 'dark' ? '#243041' : '#e2e8f0'}`,
    borderRadius: '12px',
    color: theme === 'dark' ? '#f8fafc' : '#0f172a',
  };

  return (
    <section className="dashboard-panel trend-panel">
      <div className="dashboard-panel-header">
        <div>
          <p className="dashboard-eyebrow">Forecast Lens</p>
          <h3 className="dashboard-panel-title">Global Pollution Trend</h3>
        </div>
      </div>

      {loading ? (
        <div className="chart-skeleton">
          <div className="dashboard-skeleton dashboard-skeleton-chart" />
        </div>
      ) : (
        <div className="trend-chart-shell">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fill: axisColor, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: axisColor, fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: 'Avg Pollution',
                  angle: -90,
                  position: 'insideLeft',
                  fill: axisColor,
                  dx: -4,
                }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: theme === 'dark' ? '#f8fafc' : '#0f172a' }}
                formatter={(value) => [`${value}`, 'Avg Score']}
              />
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke="#38bdf8"
                strokeWidth={3}
                dot={{ r: 4, fill: '#38bdf8', strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

TrendChart.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      year: PropTypes.string.isRequired,
      avgScore: PropTypes.number.isRequired,
    }),
  ),
  loading: PropTypes.bool,
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
};

TrendChart.defaultProps = {
  data: [],
  loading: false,
};

export default TrendChart;
