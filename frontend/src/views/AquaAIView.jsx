import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { pdf } from '@react-pdf/renderer';
import { fetchStationComparison, fetchStationTrends, fetchYearComparison, sendChatMessage, fetchSuggestedQuestions } from '../services/api.js';
import { usePinnedStations } from '../contexts/PinnedStationsContext.jsx';
import followUpQuestions from '../data/followup_questions.json';
import AquaAIPDF from '../components/AquaAIPDFExport.jsx';
import './AquaAIView.css';

const SUGGESTED_QUESTIONS = [
  'What is the safe limit for BOD in drinking water?',
  'How does high fecal coliform impact water safety?',
  'Explain this station risk using WHO and BIS standards.',
  'What actions can reduce nitrate pollution at this station?',
];

const AVAILABLE_YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022];

const STATION_CONTEXT_KEYWORDS = [
  'this station',
  'the station',
  'why unsafe',
  'why is it',
  'why is this',
  'is it safe',
  'station context',
];

function createMessageId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function TrendsPanel({ trends }) {
  if (!trends) return null;

  const PARAMS = [
    { key: 'bod_avg', label: 'BOD', unit: 'mg/L', limit: 3 },
    { key: 'fecal_coliform_avg', label: 'Fecal Coliform', unit: 'MPN/100ml', limit: 500 },
    { key: 'do_avg', label: 'DO', unit: 'mg/L', limit: null },
    { key: 'nitrate_avg', label: 'Nitrate', unit: 'mg/L', limit: 10 },
  ];

  const TREND_ICON = { Improving: '↘', Worsening: '↗', Stable: '→' };
  const TREND_COLOR = {
    Improving: '#22c55e',
    Worsening: '#ef4444',
    Stable: '#0ea5e9'
  };

  return (
    <div className="ai-trends-panel">
      <div className="ai-trends-header">
        <span className="ai-trends-title">📈 Parameter Trends</span>
        <span className="ai-trends-station">{trends.station_name}</span>
      </div>
      <div className="ai-trends-grid">
        {PARAMS.map(({ key, label, unit }) => {
          const summary = trends.summary[key];
          if (!summary) return null;
          const trend = summary.trend;
          return (
            <div key={key} className="ai-trend-card">
              <div className="ai-trend-card-top">
                <span className="ai-trend-label">{label}</span>
                <span
                  className="ai-trend-indicator"
                  style={{ color: TREND_COLOR[trend] }}
                >
                  {TREND_ICON[trend]} {trend}
                </span>
              </div>
              <div className="ai-trend-value">
                {summary.latest}
                <span className="ai-trend-unit">{unit}</span>
              </div>
              <div className="ai-trend-range">
                {summary.min} → {summary.max}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

TrendsPanel.propTypes = {
  trends: PropTypes.shape({
    station_name: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
    summary: PropTypes.object,
  }),
};

function ComparePanel({ comparison }) {
  if (!comparison) return null;

  return (
    <div className="ai-compare-panel">
      <div className="ai-compare-header">
        <span className="ai-compare-title">⚖ Station Comparison</span>
        <span className="ai-compare-winner">
          ✓ Cleaner: {
            comparison.winner === comparison.station_a.station_id
              ? comparison.station_a.station_name
              : comparison.station_b.station_name
          }
        </span>
      </div>

      <div className="ai-compare-table">
        <div className="ai-compare-row ai-compare-head">
          <span>Parameter</span>
          <span>{comparison.station_a.station_name}</span>
          <span>{comparison.station_b.station_name}</span>
          <span>Limit</span>
        </div>

        {comparison.parameter_comparison.map((row) => (
          <div key={row.param} className="ai-compare-row">
            <span className="ai-compare-param">{row.label}</span>
            <span className={`ai-compare-val ${row.a_status}`}>
              {row.a_value ?? 'N/A'} {row.unit}
            </span>
            <span className={`ai-compare-val ${row.b_status}`}>
              {row.b_value ?? 'N/A'} {row.unit}
            </span>
            <span className="ai-compare-limit">
              {row.limit ?? '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

ComparePanel.propTypes = {
  comparison: PropTypes.shape({
    winner: PropTypes.string.isRequired,
    station_a: PropTypes.shape({
      station_id: PropTypes.string.isRequired,
      station_name: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
    }).isRequired,
    station_b: PropTypes.shape({
      station_id: PropTypes.string.isRequired,
      station_name: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
    }).isRequired,
    parameter_comparison: PropTypes.arrayOf(PropTypes.shape({
      label: PropTypes.string.isRequired,
      unit: PropTypes.string,
      a_value: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
      b_value: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
      limit: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
      a_status: PropTypes.string.isRequired,
      b_status: PropTypes.string.isRequired,
    })).isRequired,
  }),
};

function YearComparePanel({ data }) {
  if (!data) return null;

  const CHANGE_COLOR = {
    Improved: '#22c55e',
    Worsened: '#ef4444',
    Stable: '#0ea5e9',
    'N/A': '#94a3b8',
  };

  const CHANGE_ICON = {
    Improved: '↘',
    Worsened: '↗',
    Stable: '→',
    'N/A': '—',
  };

  return (
    <div className="ai-compare-panel">
      <div className="ai-compare-header">
        <span className="ai-compare-title">
          📅 {data.year_a} vs {data.year_b} — {data.station_name}
        </span>
      </div>

      <div className="ai-compare-table">
        <div className="ai-compare-row ai-compare-head">
          <span>Parameter</span>
          <span>{data.year_a}</span>
          <span>{data.year_b}</span>
          <span>Change</span>
        </div>

        {data.parameter_comparison.map((row) => (
          <div key={row.param} className="ai-compare-row">
            <span className="ai-compare-param">{row.label}</span>
            <span className={`ai-compare-val ${row.a_status}`}>
              {row.a_value ?? 'N/A'} {row.unit}
            </span>
            <span className={`ai-compare-val ${row.b_status}`}>
              {row.b_value ?? 'N/A'} {row.unit}
            </span>
            <span style={{ color: CHANGE_COLOR[row.change], fontFamily: 'DM Mono', fontSize: 12 }}>
              {CHANGE_ICON[row.change]} {row.change}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

YearComparePanel.propTypes = {
  data: PropTypes.shape({
    station_name: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
    year_a: PropTypes.number.isRequired,
    year_b: PropTypes.number.isRequired,
    parameter_comparison: PropTypes.arrayOf(PropTypes.shape({
      param: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      unit: PropTypes.string,
      a_value: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
      b_value: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
      limit: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
      a_status: PropTypes.string.isRequired,
      b_status: PropTypes.string.isRequired,
      change: PropTypes.string.isRequired,
    })).isRequired,
  }),
};

ComparePanel.propTypes = {
  comparison: PropTypes.shape({
    winner: PropTypes.string.isRequired,
    station_a: PropTypes.shape({
      station_id: PropTypes.string.isRequired,
      station_name: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
    }).isRequired,
    station_b: PropTypes.shape({
      station_id: PropTypes.string.isRequired,
      station_name: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
    }).isRequired,
    parameter_comparison: PropTypes.arrayOf(PropTypes.shape({
      label: PropTypes.string.isRequired,
      unit: PropTypes.string,
      a_value: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
      b_value: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
      limit: PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])]),
      a_status: PropTypes.string.isRequired,
      b_status: PropTypes.string.isRequired,
    })).isRequired,
  }),
};

function pickUnsafeQuestions(params, unsafe) {
  const questions = [];

  for (const param of params) {
    const key = Object.keys(unsafe).find(k =>
      param.toLowerCase().includes(k.toLowerCase()),
    );
    if (key && unsafe[key]?.length) {
      const q = unsafe[key][0];
      if (!questions.includes(q)) questions.push(q);
    }
    if (questions.length >= 2) break;
  }

  for (const q of unsafe.default) {
    if (!questions.includes(q)) questions.push(q);
    if (questions.length >= 3) break;
  }

  return questions.slice(0, 3);
}


function getFollowUps(msg) {
  console.log('getFollowUps called:', msg?.safety_status, msg?.violated_params);
  if (msg?.role !== 'assistant') return [];

  const { unsafe, safe, general } = followUpQuestions;
  const isUnsafe = msg.safety_status === 'Unsafe';
  const isSafe = msg.safety_status === 'Safe';
  const params = msg.violated_params || [];

  if (isSafe) {
    return safe.slice(0, 3);
  }

  if (isUnsafe) {
    return pickUnsafeQuestions(params, unsafe);
  }

  // General fallback
  return general.slice(0, 3);
}

function AIChatMessage({ msg, isLast, onFollowUp, followups }) {
  if (msg.role === 'user') {
    return (
      <div className="ai-message ai-message-user">
        {msg.content}
      </div>
    );
  }

  return (
    <div className="ai-message ai-message-assistant">
      <div className="ai-message-meta">
        {msg.sources_used > 0 && (
          <span className="ai-badge ai-badge-sources">
            {msg.sources_used} sources
          </span>
        )}
        {msg.station_name && (
          <span className="ai-badge ai-badge-station">
            {msg.station_name}
          </span>
        )}
        {msg.safety_status && (
          <span
            className={`ai-badge ai-badge-safety ${
              msg.safety_status === 'Unsafe' ? 'unsafe' : 'safe'
            }`}
          >
            {msg.safety_status === 'Unsafe' ? '⚠' : '✓'} {msg.safety_status}
          </span>
        )}
      </div>

      {msg.content && (
        <div className="ai-message-content">{msg.content}</div>
      )}

      {msg.violations?.length > 0 && (
        <div className="ai-violations-table">
          <div className="ai-section-label">VIOLATIONS</div>
          {msg.violations.map((violation) => (
            <div
              key={`${violation.parameter}-${violation.value}-${violation.limit}`}
              className={`ai-violation-row ${violation.status}`}
            >
              <span className="ai-violation-dot" />
              <span className="ai-violation-param">{violation.parameter}</span>
              <span className="ai-violation-value">{violation.value}</span>
              <span className="ai-violation-limit">limit: {violation.limit}</span>
            </div>
          ))}
        </div>
      )}

      {msg.safety_status === 'Safe' && !msg.violations?.length && (
        <div className="ai-safe-message">
          <span className="ai-safe-icon">✓</span>
          <div>
            <div className="ai-safe-title">Station meets all safety thresholds</div>
            <div className="ai-safe-desc">
              All monitored parameters are within WHO, CPCB and BIS safe limits.
              Continue regular monitoring and testing.
            </div>
          </div>
        </div>
      )}

      {msg.causes?.length > 0 && (
        <div className="ai-section">
          <div className="ai-section-label">CAUSES</div>
          <ul className="ai-list">
            {msg.causes.map((cause) => <li key={cause}>{cause}</li>)}
          </ul>
        </div>
      )}

      {msg.health_risks?.length > 0 && (
        <div className="ai-section">
          <div className="ai-section-label">HEALTH RISKS</div>
          <ul className="ai-list ai-list-risk">
            {msg.health_risks.map((risk) => <li key={risk}>{risk}</li>)}
          </ul>
        </div>
      )}

      {msg.recommended_actions?.length > 0 && (
        <div className="ai-section">
          <div className="ai-section-label">RECOMMENDED ACTIONS</div>
          <ul className="ai-list ai-list-action">
            {msg.recommended_actions.map((action) => <li key={action}>{action}</li>)}
          </ul>
        </div>
      )}

      {isLast && (
        <div className="ai-followups">
          <div className="ai-followups-label">Suggested questions</div>
          <div className="ai-followups-chips">
            {(followups && followups.length > 0
              ? followups.map(f => (typeof f === 'string' ? { text: f, reason: null } : f))
              : getFollowUps(msg)).map((q) => (
              <button
                key={q.text || q}
                className="ai-followup-chip"
                onClick={() => onFollowUp(q.text || q)}
                title={q.reason || (typeof q === 'string' ? 'Suggested follow-up' : '')}
              >
                {q.text || q}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

AIChatMessage.propTypes = {
  isLast: PropTypes.bool,
  onFollowUp: PropTypes.func,
  followups: PropTypes.array,
  msg: PropTypes.shape({
    role: PropTypes.oneOf(['user', 'assistant']).isRequired,
    content: PropTypes.string,
    safety_status: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
    violations: PropTypes.arrayOf(
      PropTypes.shape({
        parameter: PropTypes.string,
        value: PropTypes.string,
        limit: PropTypes.string,
        status: PropTypes.string,
      }),
    ),
    causes: PropTypes.arrayOf(PropTypes.string),
    health_risks: PropTypes.arrayOf(PropTypes.string),
    recommended_actions: PropTypes.arrayOf(PropTypes.string),
    sources_used: PropTypes.number,
    station_name: PropTypes.oneOfType([PropTypes.string, PropTypes.oneOf([null])]),
    violated_params: PropTypes.arrayOf(PropTypes.string),
    has_station_context: PropTypes.bool,
  }).isRequired,
};

function AquaAIView() {
  const { pinnedStations } = usePinnedStations();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState('');
  const [compareStationId, setCompareStationId] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [trends, setTrends] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [showStationComparison, setShowStationComparison] = useState(true);
  const [yearCompare, setYearCompare] = useState({ a: '', b: '' });
  const [yearComparison, setYearComparison] = useState(null);
  const messagesEndRef = useRef(null);
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);
  const inputRef = useRef(null);

  const stationOptions = useMemo(
    () => pinnedStations.map(station => ({
      id: station.id,
      label: station.location || station.monitoring_location || `Station ${station.id}`,
    })),
    [pinnedStations],
  );

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
    }
  }, [messages, loading]);


  // Fetch dynamic suggested questions when assistant replies
  useEffect(() => {
    (async () => {
      if (!messages || messages.length === 0) {
        setSuggestedQuestions([]);
        return;
      }
      const last = messages[messages.length - 1];
      if (last.role !== 'assistant') {
        setSuggestedQuestions([]);
        return;
      }

      try {
        // Only send a station_id when the assistant reply actually has station context.
        const stationForSuggestions = last.has_station_context ? (selectedStationId || null) : null;
        const suggestions = await fetchSuggestedQuestions(
          stationForSuggestions,
          selectedYear ? Number.parseInt(selectedYear, 10) : null,
          last.violated_params || [],
          last.safety_status || null,
        );
        setSuggestedQuestions(suggestions || []);
      } catch (e) {
        setSuggestedQuestions([]);
      }
    })();
  }, [messages, selectedStationId, selectedYear]);

  useEffect(() => {
    if (!selectedStationId) { setTrends(null); return; }
    fetchStationTrends(selectedStationId, selectedYear || null).then(setTrends).catch(() => setTrends(null));
  }, [selectedStationId, selectedYear]);

  useEffect(() => {
    if (!selectedStationId || !compareStationId) {
      setComparison(null);
      return;
    }
    fetchStationComparison(
      selectedStationId,
      compareStationId,
      selectedYear || null,
    ).then(setComparison).catch(() => setComparison(null));
  }, [selectedStationId, compareStationId, selectedYear]);

  useEffect(() => {
    if (compareStationId) {
      setShowStationComparison(true);
    }
  }, [compareStationId]);

  useEffect(() => {
    if (!selectedStationId || !yearCompare.a || !yearCompare.b
      || yearCompare.a === yearCompare.b) {
      setYearComparison(null);
      return;
    }
    fetchYearComparison(selectedStationId, yearCompare.a, yearCompare.b)
      .then(setYearComparison)
      .catch(() => setYearComparison(null));
  }, [selectedStationId, yearCompare]);

  const handleExport = async () => {
    const exportDate = new Date().toLocaleDateString('en-IN', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const doc = (
      <AquaAIPDF
        messages={messages}
        trends={trends}
        comparison={comparison}
        yearComparison={yearComparison}
        stationName={stationOptions.find(s => String(s.id) === String(selectedStationId))?.label || null}
        exportDate={exportDate}
      />
    );
    const blob = await pdf(doc).toBlob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `aquaai-report-${Date.now()}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const submitMessage = async (questionText) => {
    const messageText = questionText.trim();
    if (!messageText || loading) return;

    const userMessage = {
      id: createMessageId(),
      role: 'user',
      content: messageText,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    const needsStationContext = !selectedStationId
      && STATION_CONTEXT_KEYWORDS.some(keyword =>
        messageText.toLowerCase().includes(keyword),
      );

    if (needsStationContext) {
      setMessages(prev => [
        ...prev,
        {
          id: createMessageId(),
          role: 'assistant',
          content: 'Please select a station from the dropdown first.',
          safety_status: null,
          violations: [],
          causes: [],
          health_risks: [],
          recommended_actions: [],
          sources_used: 0,
          station_name: null,
          violated_params: [],
          has_station_context: false,
        },
      ]);
      return;
    }

    setLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        content: m.role === 'assistant'
          ? (m.content || m.causes?.join('. ') || '')
          : m.content,
      })).filter(m => m.content);

      const data = await sendChatMessage(
        messageText,
        selectedStationId || null,
        history,
        selectedYear ? Number.parseInt(selectedYear, 10) : null,
      );

      setMessages(prev => [
        ...prev,
        {
          id: createMessageId(),
          role: 'assistant',
          content: data.answer,
          safety_status: data.safety_status,
          violations: data.violations || [],
          causes: data.causes || [],
          health_risks: data.health_risks || [],
          recommended_actions: data.recommended_actions || [],
          sources_used: data.sources_used || 0,
          station_name: data.station_name,
          violated_params: data.violated_params || [],
          has_station_context: data.has_station_context || false,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          id: createMessageId(),
          role: 'assistant',
          content: 'Sorry, I could not reach the chat backend right now. Please try again.',
          safety_status: null,
          violations: [],
          causes: [],
          health_risks: [],
          recommended_actions: [],
          sources_used: 0,
          station_name: null,
          violated_params: [],
          has_station_context: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await submitMessage(input);
  };

  return (
    <div className="ai-layout">
      <div className="ai-header">
        <div className="ai-header-left">
          <span className="ai-icon" aria-hidden="true">💬</span>
          <div>
            <h2 className="ai-title">AquaAI</h2>
            <p className="ai-subtitle">Ask questions about water quality data</p>
          </div>
        </div>

        <div className="ai-station-selector">
          <label htmlFor="ai-station-context">Station Context</label>
          <select
            id="ai-station-context"
            value={selectedStationId}
            onChange={(event) => setSelectedStationId(event.target.value)}
          >
            <option value="">No station selected</option>
            {stationOptions.map((station) => (
              <option key={station.id} value={station.id}>{station.label}</option>
            ))}
          </select>
        </div>

        {selectedStationId && (
          <div className="ai-station-selector">
            <label htmlFor="ai-compare-station-context">Compare With</label>
            <select
              id="ai-compare-station-context"
              value={compareStationId}
              onChange={(event) => setCompareStationId(event.target.value)}
            >
              <option value="">None</option>
              {stationOptions
                .filter((station) => String(station.id) !== String(selectedStationId))
                .map((station) => (
                  <option key={station.id} value={station.id}>{station.label}</option>
                ))}
            </select>
          </div>
        )}

        <div className="ai-year-selector">
          <label htmlFor="ai-year-context">Year</label>
          <select
            id="ai-year-context"
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
          >
            <option value="">Latest</option>
            {AVAILABLE_YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <button
          className="ai-export-btn"
          onClick={handleExport}
          disabled={messages.length === 0 && !trends}
        >
          ↓ Export PDF
        </button>
      </div>

      <TrendsPanel trends={trends} />
      {selectedStationId && !compareStationId && (
        <div className="ai-year-compare-controls">
          <span className="ai-year-compare-label">COMPARE YEARS</span>
          <select
            value={yearCompare.a}
            onChange={e => setYearCompare(prev => ({ ...prev, a: e.target.value }))}
          >
            <option value="">From</option>
            {AVAILABLE_YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span className="ai-year-compare-vs">vs</span>
          <select
            value={yearCompare.b}
            onChange={e => setYearCompare(prev => ({ ...prev, b: e.target.value }))}
          >
            <option value="">To</option>
            {AVAILABLE_YEARS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      )}
      <YearComparePanel data={yearComparison} />
      {selectedStationId && compareStationId && (
        <div className="ai-compare-toggle-row">
          <button
            type="button"
            className="ai-compare-toggle-btn"
            onClick={() => setShowStationComparison(prev => !prev)}
          >
            {showStationComparison ? 'Hide Station Comparison' : 'Show Station Comparison'}
          </button>
        </div>
      )}
      {showStationComparison && <ComparePanel comparison={comparison} />}

      <div className="ai-messages" ref={messagesEndRef}>
        {messages.map((msg, i) => (
          <AIChatMessage
            key={msg.id}
            msg={msg}
            isLast={i === messages.length - 1}
            followups={i === messages.length - 1 ? suggestedQuestions : []}
            onFollowUp={(q) => {
              // Prefill input and focus instead of immediate submit
              setInput(q);
              inputRef.current?.focus();
            }}
          />
        ))}

        {loading && (
          <div className="ai-message ai-message-assistant">
            <div className="ai-typing" aria-label="AquaAI is typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="ai-suggestions">
          <p className="ai-suggestions-title">Suggested questions</p>
          <div className="ai-suggestions-list">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                className="ai-suggestion-chip"
                onClick={() => submitMessage(question)}
                disabled={loading}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      <form className="ai-input-bar" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask AquaAI about standards, station risks, or mitigation steps..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

export default AquaAIView;
