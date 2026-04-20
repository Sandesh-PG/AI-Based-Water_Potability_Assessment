import PropTypes from 'prop-types';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const PinnedStationsContext = createContext();

export function PinnedStationsProvider({ children }) {
  const [pinnedStations, setPinnedStations] = useState([]);

  const pinStation = useCallback((station) => {
    setPinnedStations(prev => {
      // Avoid duplicates
      if (prev.some(s => s.id === station.id)) return prev;
      return [...prev, station];
    });
  }, []);

  const unpinStation = useCallback((stationId) => {
    setPinnedStations(prev => prev.filter(s => s.id !== stationId));
  }, []);

  const togglePin = useCallback((station) => {
    setPinnedStations(prev => {
      if (prev.some(s => s.id === station.id)) {
        return prev.filter(s => s.id !== station.id);
      }
      return [...prev, station];
    });
  }, []);

  const isPinned = useCallback((stationId) => {
    return pinnedStations.some(s => s.id === stationId);
  }, [pinnedStations]);

  const value = useMemo(
    () => ({
      pinnedStations,
      pinStation,
      unpinStation,
      togglePin,
      isPinned,
    }),
    [pinnedStations, pinStation, unpinStation, togglePin, isPinned],
  );

  return (
    <PinnedStationsContext.Provider value={value}>
      {children}
    </PinnedStationsContext.Provider>
  );
}

PinnedStationsProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

// eslint-disable-next-line react-refresh/only-export-components
export function usePinnedStations() {
  const context = useContext(PinnedStationsContext);
  if (!context) {
    throw new Error('usePinnedStations must be used within PinnedStationsProvider');
  }
  return context;
}
