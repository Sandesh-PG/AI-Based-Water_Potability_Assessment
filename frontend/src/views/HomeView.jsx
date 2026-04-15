import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AlertsPanel from '../components/Dashboard/AlertsPanel.jsx';
import InsightsPanel from '../components/Dashboard/InsightsPanel.jsx';
import OverviewCard from '../components/Dashboard/OverviewCard.jsx';
import TrackedStations from '../components/Dashboard/TrackedStations.jsx';
import TrendChart from '../components/Dashboard/TrendChart.jsx';
import { usePinnedStations } from '../contexts/PinnedStationsContext.jsx';
import { getLocations } from '../services/api.js';
import '../components/Dashboard/HomeDashboard.css';
import './HomeView.css';

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022];
const FALLBACK_TREND = [42, 45, 44, 41, 39, 37, 35];

function averageScore(rows) {
  const values = rows
    .map((row) => Number(row.pollution_score))
    .filter((value) => Number.isFinite(value));

  if (!values.length) {
    return 0;
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function buildFallbackSummary(totalStations, safeCount, unsafeCount) {
  return {
    totalStations,
    safeCount,
    unsafeCount,
    averagePollutionScore: 0,
  };
}

function buildAlerts(summary, trendData) {
  const currentUnsafe = summary.unsafeCount;
  const latestPoint = trendData[trendData.length - 1];
  const previousPoint = trendData[trendData.length - 2];
  const delta = latestPoint && previousPoint
    ? Number((latestPoint.avgScore - previousPoint.avgScore).toFixed(1))
    : 0;

  return [
    {
      id: 'unsafe-stations',
      title: `${currentUnsafe} unsafe stations detected`,
      description: currentUnsafe > 0
        ? 'Unsafe samples remain a priority for intervention and deeper analysis.'
        : 'No unsafe stations were detected in the latest snapshot.',
      tone: currentUnsafe > 0 ? 'unsafe' : 'safe',
    },
    {
      id: 'trend-shift',
      title: delta > 0 ? 'Sudden pollution spike detected' : 'Pollution trend holding steady',
      description: delta > 0
        ? `Average pollution rose by ${delta} points versus the previous year snapshot.`
        : 'Recent year-over-year movement is stable or improving.',
      tone: delta > 0 ? 'accent' : 'safe',
    },
  ];
}

function buildInsights(summary, trendData) {
  const latestPoint = trendData[trendData.length - 1];
  const firstPoint = trendData[0];
  const trendDelta = latestPoint && firstPoint
    ? Number((latestPoint.avgScore - firstPoint.avgScore).toFixed(1))
    : 0;

  return [
    {
      id: 'insight-bod',
      tag: 'Cause',
      tone: 'accent',
      message: 'High BOD is the most likely dominant contributor in the current mocked explainability snapshot.',
    },
    {
      id: 'insight-fecal',
      tag: 'Health',
      tone: summary.unsafeCount > 0 ? 'unsafe' : 'safe',
      message: summary.unsafeCount > 0
        ? 'Fecal coliform pressure appears concentrated in unsafe samples and should remain under active monitoring.'
        : 'Unsafe station pressure is currently low, suggesting microbiological risk is relatively contained.',
    },
    {
      id: 'insight-trend',
      tag: 'Trend',
      tone: trendDelta <= 0 ? 'safe' : 'accent',
      message: trendDelta <= 0
        ? 'Pollution trend appears to be improving over the observed years in this dashboard snapshot.'
        : 'Pollution trend is drifting upward, which suggests a need for closer monitoring in upcoming cycles.',
    },
  ];
}

function HomeView({
  totalStations,
  safeCount,
  unsafeCount,
  onLocationSelect,
  theme,
  onThemeToggle,
}) {
  const navigate = useNavigate();
  const { pinnedStations } = usePinnedStations();
  const [summary, setSummary] = useState(() => buildFallbackSummary(totalStations, safeCount, unsafeCount));
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);

  const handleViewForecast = (stationId) => {
    onLocationSelect(stationId);
    navigate('/forecast');
  };

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      setLoading(true);

      try {
        const yearlyRows = await Promise.all(
          YEARS.map(async (year) => {
            const rows = await getLocations({ year });
            return {
              year: String(year),
              rows: Array.isArray(rows) ? rows : [],
            };
          }),
        );

        if (!isMounted) {
          return;
        }

        const populatedYears = yearlyRows.filter((entry) => entry.rows.length > 0);
        const latestRows = populatedYears.at(-1)?.rows ?? [];

        setSummary({
          totalStations: latestRows.length || totalStations,
          safeCount: latestRows.filter((row) => row.safety_label === 'Safe').length || safeCount,
          unsafeCount: latestRows.filter((row) => row.safety_label === 'Unsafe').length || unsafeCount,
          averagePollutionScore: averageScore(latestRows),
        });

        setTrendData(
          yearlyRows
            .filter((entry) => entry.rows.length > 0)
            .map((entry) => ({
              year: entry.year,
              avgScore: averageScore(entry.rows),
            })),
        );
      } catch {
        if (!isMounted) {
          return;
        }

        setSummary(buildFallbackSummary(totalStations, safeCount, unsafeCount));
        setTrendData(
          YEARS.map((year, index) => ({
            year: String(year),
            avgScore: FALLBACK_TREND[index],
          })),
        );
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, [safeCount, totalStations, unsafeCount]);

  const resolvedSummary = useMemo(() => ({
    ...summary,
    averagePollutionScore: summary.averagePollutionScore || averageScore(pinnedStations),
  }), [pinnedStations, summary]);

  const alerts = useMemo(
    () => buildAlerts(resolvedSummary, trendData),
    [resolvedSummary, trendData],
  );

  const insights = useMemo(
    () => buildInsights(resolvedSummary, trendData),
    [resolvedSummary, trendData],
  );

  return (
    <div className="home-layout">
      <section className="home-section home-hero-section">
        <div className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <p className="dashboard-kicker">Water Intelligence Hub</p>
            <div className="dashboard-context-tag">Karnataka Stations</div>
            <h1 className="dashboard-title">Dashboard</h1>
            <p className="dashboard-subtitle">
              Safety coverage, explainability signals, pollution trends, and pinned stations.
            </p>
          </div>
          <button
            type="button"
            className="dashboard-theme-toggle"
            onClick={onThemeToggle}
          >
            {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
          </button>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-title">Overview Cards</div>
        <div className="overview-grid">
          <OverviewCard
            title="Total Stations"
            value={resolvedSummary.totalStations}
            icon="◌"
            loading={loading}
          />
          <OverviewCard
            title="Safe Count"
            value={resolvedSummary.safeCount}
            icon="✓"
            tone="safe"
            loading={loading}
          />
          <OverviewCard
            title="Unsafe Count"
            value={resolvedSummary.unsafeCount}
            icon="!"
            tone="unsafe"
            loading={loading}
          />
          <OverviewCard
            title="Avg Pollution Score"
            value={resolvedSummary.averagePollutionScore.toFixed(1)}
            icon="≈"
            tone="accent"
            loading={loading}
          />
        </div>
      </section>

      <section className="home-section">
        <div className="middle-grid">
          <InsightsPanel insights={insights} loading={loading} />
          <TrendChart data={trendData} loading={loading} theme={theme} />
        </div>
      </section>

      <section className="home-section">
        <div className="bottom-grid">
          <TrackedStations
            stations={pinnedStations}
            onViewForecast={handleViewForecast}
            loading={false}
          />
          <AlertsPanel alerts={alerts} loading={loading} />
        </div>
      </section>
    </div>
  );
}

HomeView.propTypes = {
  totalStations: PropTypes.number.isRequired,
  safeCount: PropTypes.number.isRequired,
  unsafeCount: PropTypes.number.isRequired,
  onLocationSelect: PropTypes.func.isRequired,
  theme: PropTypes.oneOf(['light', 'dark']).isRequired,
  onThemeToggle: PropTypes.func.isRequired,
};

export default HomeView;

