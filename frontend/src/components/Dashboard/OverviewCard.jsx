import PropTypes from 'prop-types';

function OverviewCard({ title, value, icon, tone, loading }) {
  if (loading) {
    return (
      <div className="dashboard-card overview-card overview-card-loading" aria-hidden="true">
        <div className="dashboard-skeleton dashboard-skeleton-icon" />
        <div className="dashboard-skeleton dashboard-skeleton-value" />
        <div className="dashboard-skeleton dashboard-skeleton-label" />
      </div>
    );
  }

  return (
    <div className={`dashboard-card overview-card tone-${tone}`}>
      <div className="overview-card-top">
        <span className="overview-card-icon" aria-hidden="true">{icon}</span>
        <span className="overview-card-title">{title}</span>
      </div>
      <div className="overview-card-value">{value}</div>
    </div>
  );
}

OverviewCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.string,
  tone: PropTypes.oneOf(['neutral', 'safe', 'unsafe', 'accent']),
  loading: PropTypes.bool,
};

OverviewCard.defaultProps = {
  icon: '◦',
  tone: 'neutral',
  loading: false,
};

export default OverviewCard;
