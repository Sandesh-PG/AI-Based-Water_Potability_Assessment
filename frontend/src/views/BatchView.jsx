import { useEffect, useMemo, useRef, useState } from 'react';
import { sendBatchPredict } from '../services/api.js';
import './BatchView.css';

const YEAR_MIN = 2016;
const YEAR_MAX = 2030;
const FILE_PATTERNS = [
  /^WQuality_River-Data-(\d{4})\.pdf$/i,
  /^Water_Quality_data_of_Med_Min_River_(\d{4})\.pdf$/i,
  /^Water_creek_marine_seawater_beach_(\d{4})\.pdf$/i,
  /^Water_Quality_Canals_(\d{4})\.pdf$/i,
  /^Water_Quality_Drains_STPs_WTPs_(\d{4})\.pdf$/i,
  /^Water_pond_tanks_(\d{4})\.pdf$/i,
  /^NWMP_DATA_(\d{4})\.pdf$/i,
];

const GUIDE_ITEMS = [
  'WQuality_River-Data-{year}.pdf',
  'Water_Quality_data_of_Med_Min_River_{year}.pdf',
  'Water_creek_marine_seawater_beach_{year}.pdf',
  'Water_Quality_Canals_{year}.pdf',
  'Water_Quality_Drains_STPs_WTPs_{year}.pdf',
  'Water_pond_tanks_{year}.pdf',
  'NWMP_DATA_{year}.pdf',
];

const RESULT_COLUMNS = [
  { key: 'stn_code', label: 'Station' },
  { key: 'monitoring_location', label: 'Station Name' },
  { key: 'water_body_type', label: 'Water Body' },
  { key: 'safety_label', label: 'Safety' },
  { key: 'pollution_score', label: 'Score' },
  { key: 'violated_params', label: 'Violations' },
  { key: 'bod_avg', label: 'BOD' },
  { key: 'do_avg', label: 'DO' },
  { key: 'fecal_coliform_avg', label: 'Fecal Coliform' },
];

function isValidFilename(filename, year) {
  return FILE_PATTERNS.some((pattern) => {
    const match = pattern.exec(filename);
    return Boolean(match && String(match[1]) === String(year));
  });
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function buildCsv(rows) {
  if (!rows.length) {
    return '';
  }

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set()),
  );

  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(',')),
  ].join('\n');
}

function BatchView() {
  const fileInputRef = useRef(null);
  const [year, setYear] = useState('2022');
  const [files, setFiles] = useState([]);
  const [warning, setWarning] = useState('');
  const [loading, setLoading] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState({ totalRows: 0, safeCount: 0, unsafeCount: 0, geocodedCount: 0 });
  const [guideOpen, setGuideOpen] = useState(false);

  const stageMessages = useMemo(
    () => ['Extracting data from PDFs...', 'Computing pollution scores...', 'Geocoding locations...'],
    [],
  );

  const validFiles = useMemo(() => files.filter((entry) => entry.valid).map((entry) => entry.file), [files]);
  const canRun = Boolean(year) && validFiles.length > 0 && !loading;

  useEffect(() => {
    if (!loading) {
      setStageIndex(0);
      return undefined;
    }

    const timer = globalThis.setInterval(() => {
      setStageIndex((current) => (current + 1) % stageMessages.length);
    }, 1800);

    return () => globalThis.clearInterval(timer);
  }, [loading, stageMessages.length]);

  const addFiles = (incomingFiles) => {
    const nextEntries = incomingFiles.map((file) => {
      const valid = isValidFilename(file.name, year);
      return {
        file,
        valid,
        warning: valid
          ? ''
          : `Invalid filename: ${file.name}. Must match the NWMP naming convention for year ${year}.`,
      };
    });

    setFiles((current) => {
      const existingNames = new Set(current.map((entry) => entry.file.name));
      const uniqueNewEntries = nextEntries.filter((entry) => !existingNames.has(entry.file.name));
      return [...current, ...uniqueNewEntries];
    });

    const invalid = nextEntries.filter((entry) => !entry.valid);
    setWarning(invalid.length > 0 ? 'One or more uploaded files do not match the required naming convention.' : '');
    setError('');
  };

  const handleFileChange = (event) => {
    const selected = Array.from(event.target.files || []);
    if (selected.length > 0) {
      addFiles(selected);
    }
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const selected = Array.from(event.dataTransfer?.files || []).filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    if (selected.length > 0) {
      addFiles(selected);
    }
  };

  const handleRemoveFile = (fileName) => {
    setFiles((current) => current.filter((entry) => entry.file.name !== fileName));
    setWarning('');
    setError('');
  };

  const handleRunPipeline = async () => {
    if (!canRun) {
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);
    setSummary({ totalRows: 0, safeCount: 0, unsafeCount: 0, geocodedCount: 0 });

    try {
      const payload = await sendBatchPredict(validFiles, Number(year));
      const normalizedResults = Array.isArray(payload?.results) ? payload.results : [];
      setResults(normalizedResults);
      setSummary({
        totalRows: payload?.total_rows ?? normalizedResults.length,
        safeCount: payload?.safe_count ?? normalizedResults.filter((row) => row.safety_label === 'Safe').length,
        unsafeCount: payload?.unsafe_count ?? normalizedResults.filter((row) => row.safety_label === 'Unsafe').length,
        geocodedCount: payload?.geocoded_count ?? normalizedResults.filter((row) => row.latitude !== null && row.longitude !== null).length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch pipeline failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCsv = () => {
    const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const csv = buildCsv(results);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `batch-results-${year}-${timestamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="batch-view">
      <header className="batch-header">
        <p className="batch-kicker">Batch Processing</p>
        <h1 className="batch-title">Batch Analysis</h1>
        <p className="batch-subtitle">Upload NWMP PDFs to run full extraction, cleaning and prediction pipeline</p>
      </header>

      <div className="batch-panel">
        <div className="batch-field-row">
          <label className="batch-field">
            <span>Year</span>
            <input
              type="number"
              min={YEAR_MIN}
              max={YEAR_MAX}
              required
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
          </label>
        </div>

        <button
          type="button"
          className={`batch-dropzone ${files.length > 0 ? 'has-files' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          aria-label="Upload PDF files"
        >
          <span className="batch-dropzone-icon" aria-hidden="true">📄</span>
          <span className="batch-dropzone-title">Drop PDFs here or click to browse</span>
          <span className="batch-dropzone-note">PDF only. Filenames are validated against the NWMP naming convention.</span>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="batch-hidden-input"
          onChange={handleFileChange}
        />

        <details className="batch-guide" open={guideOpen} onToggle={(event) => setGuideOpen(event.currentTarget.open)}>
          <summary className="batch-guide-summary">Naming convention guide</summary>
          <div className="batch-guide-body">
            <p>Expected filenames:</p>
            <ul>
              {GUIDE_ITEMS.map((item) => (
                <li key={item}><code>{item}</code></li>
              ))}
            </ul>
          </div>
        </details>

        <div className="batch-file-list">
          {files.length === 0 ? (
            <p className="batch-empty-state">No files uploaded yet.</p>
          ) : (
            files.map((entry) => (
              <div key={entry.file.name} className={`batch-file-item ${entry.valid ? 'valid' : 'invalid'}`}>
                <div className="batch-file-meta">
                  <span className="batch-file-name">{entry.file.name}</span>
                  <span className={`batch-file-state ${entry.valid ? 'valid' : 'invalid'}`}>
                    {entry.valid ? 'Valid' : 'Invalid'}
                  </span>
                </div>
                {!entry.valid && <p className="batch-file-warning">{entry.warning}</p>}
                <button type="button" className="batch-remove-btn" onClick={() => handleRemoveFile(entry.file.name)}>
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        {warning && <div className="batch-warning">{warning}</div>}
        {error && <div className="batch-error">{error}</div>}

        <div className="batch-actions">
          <button type="button" className="batch-primary-btn" disabled={!canRun} onClick={handleRunPipeline}>
            Run Pipeline
          </button>
        </div>

        {loading && <div className="batch-stage">{stageMessages[stageIndex]}</div>}
      </div>

      {results.length > 0 && (
        <section className="batch-results-section">
          <div className="batch-results-header">
            <h2 className="batch-results-title">Results</h2>
            <button type="button" className="batch-secondary-btn" onClick={handleExportCsv}>
              Export CSV
            </button>
          </div>

          <div className="batch-summary-grid">
            <div className="batch-summary-card">
              <span>Total Rows</span>
              <strong>{summary.totalRows}</strong>
            </div>
            <div className="batch-summary-card safe">
              <span>Safe</span>
              <strong>{summary.safeCount}</strong>
            </div>
            <div className="batch-summary-card unsafe">
              <span>Unsafe</span>
              <strong>{summary.unsafeCount}</strong>
            </div>
            <div className="batch-summary-card">
              <span>Geocoded</span>
              <strong>{summary.geocodedCount}</strong>
            </div>
          </div>

          <div className="batch-table-wrap">
            <table className="batch-table">
              <thead>
                <tr>
                  {RESULT_COLUMNS.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row, index) => {
                  const score = Number(row.pollution_score);
                  let scoreClass = 'low';
                  if (Number.isFinite(score)) {
                    if (score > 50) {
                      scoreClass = 'high';
                    } else if (score >= 20) {
                      scoreClass = 'medium';
                    }
                  }
                  const violations = String(row.violated_params || '');
                  const violationsDisplay = violations.length > 35 ? `${violations.slice(0, 35)}...` : violations || '-';

                  return (
                    <tr key={`${row.stn_code || row.monitoring_location || 'row'}-${index}`}>
                      {RESULT_COLUMNS.map((column) => {
                        if (column.key === 'safety_label') {
                          return (
                            <td key={column.key}>
                              <span className={`batch-pill ${String(row.safety_label) === 'Safe' ? 'safe' : 'unsafe'}`}>
                                {row.safety_label || '-'}
                              </span>
                            </td>
                          );
                        }

                        if (column.key === 'pollution_score') {
                          return (
                            <td key={column.key} className={`mono batch-score ${scoreClass}`}>
                              {Number.isFinite(score) ? score.toFixed(2) : '-'}
                            </td>
                          );
                        }

                        if (column.key === 'violated_params') {
                          return (
                            <td key={column.key} title={violations || 'No violations'}>
                              <span className="batch-violations">{violationsDisplay}</span>
                            </td>
                          );
                        }

                        return (
                          <td key={column.key} className={column.key === 'stn_code' || column.key.endsWith('_avg') ? 'mono' : ''}>
                            {row[column.key] ?? '-'}
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
