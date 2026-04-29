import { useMemo, useRef, useState } from 'react';
import { sendBatchPredict } from '../services/api.js';
import './BatchView.css';

const SAMPLE_HEADERS = [
  'monitoring_location',
  'do_avg',
  'ph_avg',
  'bod_avg',
  'nitrate_avg',
  'fecal_coliform_avg',
  'conductivity_avg',
  'water_body_type',
];

const SAMPLE_ROW = [
  'Hebbal Lake Inlet',
  '6.4',
  '7.2',
  '2.8',
  '7.1',
  '180',
  '540',
  'Lake',
];

const DISPLAY_COLUMNS = [
  'monitoring_location',
  'safety_label',
  'pollution_score',
  'violated_params',
  'do_avg',
  'ph_avg',
  'bod_avg',
  'nitrate_avg',
  'fecal_coliform_avg',
  'conductivity_avg',
  'water_body_type',
];

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatCell(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }
  return String(value);
}

function toCsv(rows) {
  if (!rows.length) {
    return '';
  }

  const keys = Array.from(
    rows.reduce((acc, row) => {
      Object.keys(row || {}).forEach((key) => acc.add(key));
      return acc;
    }, new Set()),
  );

  const escape = (value) => {
    if (value === null || value === undefined) {
      return '';
    }
    const raw = String(value);
    if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
      return `"${raw.replaceAll('"', '""')}"`;
    }
    return raw;
  };

  const lines = [
    keys.join(','),
    ...rows.map((row) => keys.map((key) => escape(row[key])).join(',')),
  ];

  return `${lines.join('\n')}\n`;
}

function BatchView() {
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);

  const summary = useMemo(() => {
    const total = results.length;
    const safe = results.filter((row) => String(row.safety_label || '').toLowerCase() === 'safe').length;
    const unsafe = results.filter((row) => String(row.safety_label || '').toLowerCase() === 'unsafe').length;
    return { total, safe, unsafe };
  }, [results]);

  const visibleColumns = useMemo(() => {
    if (!results.length) {
      return DISPLAY_COLUMNS;
    }

    const available = new Set();
    results.forEach((row) => {
      Object.keys(row || {}).forEach((key) => available.add(key));
    });

    const preferred = DISPLAY_COLUMNS.filter((column) => available.has(column));
    const remaining = Array.from(available).filter((column) => !preferred.includes(column));
    return [...preferred, ...remaining];
  }, [results]);

  const handleFilePick = (file) => {
    if (!file) {
      return;
    }

    setSelectedFile(file);
    setError('');
    setResults([]);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const file = event.dataTransfer?.files?.[0] || null;
    handleFilePick(file);
  };

  const handleRunPrediction = async () => {
    if (!selectedFile) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = await sendBatchPredict(selectedFile);
      setResults(Array.isArray(payload) ? payload : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch prediction failed.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSampleDownload = () => {
    const sampleCsv = `${SAMPLE_HEADERS.join(',')}\n${SAMPLE_ROW.join(',')}\n`;
    downloadTextFile('batch_sample_template.csv', sampleCsv, 'text/csv;charset=utf-8;');
  };

  const handleExportResults = () => {
    const csv = toCsv(results);
    downloadTextFile('batch_prediction_results.csv', csv, 'text/csv;charset=utf-8;');
  };

  return (
    <section className="batch-view">
      <header className="batch-header">
        <p className="batch-kicker">Batch Processing</p>
        <h1 className="batch-title">Batch Analysis</h1>
        <p className="batch-desc">
          Upload a CSV of water quality readings to predict pollution score, safety label, and violated parameters for each row.
        </p>
      </header>

      <div className="batch-actions-row">
        <button type="button" className="batch-btn secondary" onClick={handleSampleDownload}>
          Download Sample CSV
        </button>
      </div>

      <button
        type="button"
        className={`batch-upload-zone ${isDragOver ? 'drag-over' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={handleDrop}
        aria-label="Upload batch CSV"
      >
        <span className="batch-upload-icon" aria-hidden="true">📄</span>
        <span className="batch-upload-title">Drag and drop a CSV file here</span>
        <span className="batch-upload-subtitle">or click to select a file</span>
        <span className="batch-upload-filename">
          {selectedFile ? `Selected: ${selectedFile.name}` : 'No file selected'}
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="batch-hidden-input"
        onChange={(event) => handleFilePick(event.target.files?.[0] || null)}
      />

      <div className="batch-run-row">
        <button
          type="button"
          className="batch-btn primary"
          onClick={handleRunPrediction}
          disabled={!selectedFile || loading}
        >
          {loading ? 'Processing...' : 'Run Prediction'}
        </button>
      </div>

      {error && <div className="batch-error">{error}</div>}

      {results.length > 0 && (
        <section className="batch-results">
          <div className="batch-results-header">
            <h2 className="batch-results-title">Prediction Results</h2>
            <button type="button" className="batch-btn secondary" onClick={handleExportResults}>
              Export Results as CSV
            </button>
          </div>

          <div className="batch-summary">
            <div className="batch-summary-card">
              <span className="batch-summary-label">Total Rows</span>
              <span className="batch-summary-value">{summary.total}</span>
            </div>
            <div className="batch-summary-card safe">
              <span className="batch-summary-label">Safe</span>
              <span className="batch-summary-value">{summary.safe}</span>
            </div>
            <div className="batch-summary-card unsafe">
              <span className="batch-summary-label">Unsafe</span>
              <span className="batch-summary-value">{summary.unsafe}</span>
            </div>
          </div>

          <div className="batch-table-wrap">
            <table className="batch-table">
              <thead>
                <tr>
                  {visibleColumns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row, index) => {
                  const label = String(row.safety_label || '').toLowerCase();
                  const violations = String(row.violated_params || '')
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean);

                  return (
                    <tr key={`${row.monitoring_location || 'row'}-${index}`}>
                      {visibleColumns.map((column) => {
                        if (column === 'safety_label') {
                          return (
                            <td key={column}>
                              <span className={`batch-badge ${label === 'safe' ? 'safe' : 'unsafe'}`}>
                                {formatCell(row[column])}
                              </span>
                            </td>
                          );
                        }

                        if (column === 'violated_params') {
                          return (
                            <td key={column}>
                              <div className="batch-chip-list">
                                {violations.length ? (
                                  violations.map((item) => (
                                    <span key={`${index}-${item}`} className="batch-chip">{item}</span>
                                  ))
                                ) : (
                                  <span className="batch-chip muted">None</span>
                                )}
                              </div>
                            </td>
                          );
                        }

                        const isMetricColumn =
                          column.endsWith('_avg') ||
                          column === 'pollution_score' ||
                          column === 'do_avg' ||
                          column === 'ph_avg' ||
                          column === 'bod_avg' ||
                          column === 'nitrate_avg' ||
                          column === 'fecal_coliform_avg' ||
                          column === 'conductivity_avg';

                        return (
                          <td key={column} className={isMetricColumn ? 'mono' : ''}>
                            {formatCell(row[column])}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

export default BatchView;
