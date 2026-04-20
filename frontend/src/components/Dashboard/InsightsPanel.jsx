import PropTypes from 'prop-types';

function InsightsPanel({ insights, loading }) {
  return (
    <section className="dashboard-panel insights-panel">
      <div className="dashboard-panel-header">
        <div>
          <p className="dashboard-eyebrow">Explainable AI</p>
          <h3 className="dashboard-panel-title">Quick Insights</h3>
        </div>
      </div>

      {loading ? (
        <div className="dashboard-list">
          {[0, 1, 2].map((item) => (
            <div key={item} className="dashboard-list-item loading">
              <div className="dashboard-skeleton dashboard-skeleton-bullet" />
              <div className="dashboard-skeleton dashboard-skeleton-line" />
            </div>
          ))}
        </div>
      ) : (
        <div className="dashboard-list">
          {insights.map((insight) => (
            <div key={insight.id} className="dashboard-list-item">
              <span className={`insight-badge ${insight.tone}`}>{insight.tag}</span>
              <p>{insight.message}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

InsightsPanel.propTypes = {
  insights: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      tag: PropTypes.string.isRequired,
      message: PropTypes.string.isRequired,
      tone: PropTypes.oneOf(['safe', 'unsafe', 'accent']).isRequired,
    }),
  ),
  loading: PropTypes.bool,
};

InsightsPanel.defaultProps = {
  insights: [],
  loading: false,
};

export default InsightsPanel;
