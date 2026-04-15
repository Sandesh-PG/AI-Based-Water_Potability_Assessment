import PropTypes from 'prop-types';

function AlertsPanel({ alerts, loading }) {
  return (
    <section className="dashboard-panel alerts-panel">
      <div className="dashboard-panel-header">
        <div>
          <p className="dashboard-eyebrow">System Watch</p>
          <h3 className="dashboard-panel-title">Alerts</h3>
        </div>
      </div>

      {loading ? (
        <div className="dashboard-list">
          {[0, 1].map((item) => (
            <div key={item} className="dashboard-list-item loading">
              <div className="dashboard-skeleton dashboard-skeleton-badge" />
              <div className="dashboard-skeleton dashboard-skeleton-line" />
            </div>
          ))}
        </div>
      ) : (
        <div className="dashboard-list">
          {alerts.map((alert) => (
            <div key={alert.id} className="alert-row">
              <span className={`alert-indicator ${alert.tone}`} />
              <div className="alert-copy">
                <div className="alert-title">{alert.title}</div>
                <p>{alert.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

AlertsPanel.propTypes = {
  alerts: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      description: PropTypes.string.isRequired,
      tone: PropTypes.oneOf(['safe', 'unsafe', 'accent']).isRequired,
    }),
  ),
  loading: PropTypes.bool,
};

AlertsPanel.defaultProps = {
  alerts: [],
  loading: false,
};

export default AlertsPanel;
