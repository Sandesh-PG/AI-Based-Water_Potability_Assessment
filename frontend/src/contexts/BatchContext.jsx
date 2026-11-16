/**
 * BatchContext — persists batch results and file list across route navigation.
 */

import { createContext, useContext, useState } from 'react';
import PropTypes from 'prop-types';

const BatchContext = createContext(null);

const INITIAL_SUMMARY = { totalRows: 0, safeCount: 0, unsafeCount: 0, geocodedCount: 0 };

export function BatchProvider({ children }) {
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(INITIAL_SUMMARY);
  // File metadata (name, valid, warning) — NOT File objects (can't survive navigation)
  const [fileMeta, setFileMeta] = useState([]);
  const [year, setYear] = useState('2022');
  const [error, setError] = useState('');
  // True once the user clicks "Add to Map & Dashboard" for the current run
  const [addedToDataset, setAddedToDataset] = useState(false);

  const clearResults = () => {
    setResults([]);
    setSummary(INITIAL_SUMMARY);
    setError('');
    setAddedToDataset(false);
  };

  const clearAll = () => {
    clearResults();
    setFileMeta([]);
  };

  return (
    <BatchContext.Provider value={{
      results, setResults,
      summary, setSummary,
      fileMeta, setFileMeta,
      year, setYear,
      error, setError,
      addedToDataset, setAddedToDataset,
      clearResults,
      clearAll,
    }}>
      {children}
    </BatchContext.Provider>
  );
}

BatchProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useBatch() {
  const ctx = useContext(BatchContext);
  if (!ctx) throw new Error('useBatch must be used inside BatchProvider');
  return ctx;
}
