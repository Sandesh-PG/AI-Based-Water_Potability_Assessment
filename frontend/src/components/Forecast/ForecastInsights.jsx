import PropTypes from 'prop-types';

function ForecastInsights({ insights, loading }) {
  return (
    <section className="forecast-insights-card">
      <div className="forecast-insights-header">
        <p className="forecast-eyebrow">AI Layer</p>
        <h3>AI Insights</h3>
      </div>

      <div className="forecast-insights-body">
        {loading ? (
          <div className="forecast-insights-loading">Generating station summary...</div>
        ) : (
          <div className="forecast-insights-grid">
            {insights.map((insight) => (
              <article key={`${insight.title}-${insight.message}`} className={`forecast-insight-item ${insight.tone}`}>
                <span className="forecast-insight-tag">{insight.title}</span>
                <p className="forecast-insight-message">{insight.message}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

ForecastInsights.propTypes = {
  insights: PropTypes.arrayOf(
    PropTypes.shape({
      tone: PropTypes.oneOf(['safe', 'unsafe', 'accent']).isRequired,
      title: PropTypes.string.isRequired,
      message: PropTypes.string.isRequired,
    }),
  ),
  loading: PropTypes.bool,
};

ForecastInsights.defaultProps = {
  insights: [],
  loading: false,
};

export default ForecastInsights;