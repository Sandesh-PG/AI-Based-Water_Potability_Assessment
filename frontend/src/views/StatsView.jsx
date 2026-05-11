import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

import './StatsView.css';
import { fetchOverviewStats, fetchParameterStats } from '../services/api';

export default function StatsView() {
  const [year, setYear] = useState('');
  const [waterBodyType, setWaterBodyType] = useState('');
  const [overview, setOverview] = useState(null);
  const [parameters, setParameters] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const o = await fetchOverviewStats(year || null);
        const p = await fetchParameterStats(year || null, waterBodyType || null);
        if (!mounted) return;
        setOverview(o);
        setParameters(p || []);
      } catch (err) {
        console.error('Failed to load stats', err);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [year, waterBodyType]);

  const years = [2016, 2017, 2018, 2019, 2020, 2021, 2022];
  const types = ['River', 'Lake', 'Groundwater'];

  return (
    <div className="stats-layout">
      <div className="stats-header">
        <div className="stats-header-left">
          <span className="stats-tag">ANALYTICS</span>
          <h2 className="stats-title">Water Quality Statistics</h2>
          <p className="stats-subtitle">Aggregate analysis across Karnataka monitoring stations</p>
        </div>
        <div className="stats-filters">
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All Years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select value={waterBodyType} onChange={(e) => setWaterBodyType(e.target.value)}>
            <option value="">All Types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="stats-overview-row">
        <div className="stats-card">
          <span className="stats-card-label">Total Stations</span>
          <span className="stats-card-value">{overview?.total_stations ?? '—'}</span>
        </div>
        <div className="stats-card safe">
          <span className="stats-card-label">Safe</span>
          <span className="stats-card-value">{overview?.safe_count ?? '—'}</span>
          <span className="stats-card-pct">{overview?.safe_percentage ?? '—'}%</span>
        </div>
        <div className="stats-card unsafe">
          <span className="stats-card-label">Unsafe</span>
          <span className="stats-card-value">{overview?.unsafe_count ?? '—'}</span>
          <span className="stats-card-pct">{overview ? `${(100 - (overview.safe_percentage ?? 0)).toFixed(1)}%` : '—'}</span>
        </div>
        <div className="stats-card accent">
          <span className="stats-card-label">Avg Pollution Score</span>
          <span className="stats-card-value">
            {overview?.avg_pollution_score != null && Number.isFinite(Number(overview.avg_pollution_score))
              ? Number(overview.avg_pollution_score).toFixed(2)
              : (overview?.avg_pollution_score ?? '—')}
          </span>
          <span className="stats-card-subtitle">out of 10</span>
        </div>
        <div className="stats-card">
          <span className="stats-card-label">Top Violation</span>
          <span className="stats-card-value stats-card-text">{overview?.most_common_violation ?? '—'}</span>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stats-panel">
          <div className="stats-panel-title">Pollution Trend by Year</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={overview?.yearly_trend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="avg_score" stroke="#0ea5e9" strokeWidth={2.5} dot={{ r: 3 }} name="Avg Score" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="stats-panel">
          <div className="stats-panel-title">Safe vs Unsafe by Year</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={overview?.yearly_trend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="safe_count" fill="#22c55e" name="Safe" radius={[4, 4, 0, 0]} />
              <Bar dataKey="unsafe_count" fill="#ef4444" name="Unsafe" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="stats-panel stats-panel-full">
          <div className="stats-panel-title">Parameter Analysis</div>
          <div className="stats-param-table">
            <div className="stats-param-header">
              <span>Parameter</span>
              <span>Avg Value</span>
              <span>Min</span>
              <span>Max</span>
              <span>Safe Limit</span>
              <span>Violations</span>
              <span>Violation %</span>
            </div>
            {parameters.map((p, i) => (
              <div key={p.parameter || i} className={`stats-param-row ${p.violation_percentage > 50 ? 'high-risk' : ''}`}>
                <span className="stats-param-name">{p.label}</span>
                <span className="stats-param-val">{p.avg_value ?? 'N/A'} {p.unit}</span>
                <span className="stats-param-val">{p.min_value ?? 'N/A'}</span>
                <span className="stats-param-val">{p.max_value ?? 'N/A'}</span>
                <span className="stats-param-limit">{p.limit ? `${p.limit} (${p.limit_source})` : '—'}</span>
                <span className="stats-param-val">{p.violation_count}</span>
                <span className={`stats-param-pct ${p.violation_percentage > 50 ? 'danger' : 'ok'}`}>{(p.violation_percentage ?? 0).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="stats-panel">
          <div className="stats-panel-title">Most Polluted Station</div>
          <div className="stats-station-card danger">
            <div className="stats-station-name">{overview?.most_polluted_station?.name ?? '—'}</div>
            <div className="stats-station-score">Score: {overview?.most_polluted_station?.score ?? '—'}</div>
            <div className="stats-station-year">Year: {overview?.most_polluted_station?.year ?? '—'}</div>
          </div>
        </div>

        <div className="stats-panel">
          <div className="stats-panel-title">Cleanest Station</div>
          <div className="stats-station-card safe">
            <div className="stats-station-name">{overview?.cleanest_station?.name ?? '—'}</div>
            <div className="stats-station-score">Score: {overview?.cleanest_station?.score ?? '—'}</div>
            <div className="stats-station-year">Year: {overview?.cleanest_station?.year ?? '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// end of StatsView component
