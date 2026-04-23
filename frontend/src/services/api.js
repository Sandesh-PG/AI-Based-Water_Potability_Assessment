const ENV_BASE_URL = import.meta.env.VITE_API_URL;

const BASE_URL_CANDIDATES = [
  ENV_BASE_URL,
  'http://127.0.0.1:8000',
  'http://localhost:8000',
].filter(Boolean);

async function requestJson(path) {
  let lastError = null;

  for (const baseUrl of BASE_URL_CANDIDATES) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
          const payload = await response.json();
          message = payload?.detail || payload?.message || message;
        } catch {
          // Keep fallback message when response body is not JSON.
        }
        throw new Error(message);
      }

      return response.json();
    } catch (error) {
      lastError = error;
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
  }

  throw new Error(
    `Unable to reach backend API. Start FastAPI with: uvicorn backend.main:app --reload. Last error: ${lastError?.message || 'Unknown network error'}`,
  );
}

export async function fetchLocations(filters = {}) {
  const params = new URLSearchParams();
  if (filters.year) params.append('year', filters.year);
  if (filters.water_body_type) params.append('water_body_type', filters.water_body_type);
  if (filters.safety_label) params.append('safety_label', filters.safety_label);

  const query = params.toString() ? `?${params.toString()}` : '';
  return requestJson(`/locations/${query}`);
}

export const getLocations = fetchLocations;

export async function fetchForecast(id, years = 5) {
  return requestJson(`/forecast/${id}?years=${years}`);
}

export const getForecast = fetchForecast;

export async function fetchStationTrends(stationId, year = null) {
  const url = year
    ? `http://127.0.0.1:8000/stations/${stationId}/trends?year=${year}`
    : `http://127.0.0.1:8000/stations/${stationId}/trends`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchStationComparison(stationAId, stationBId, year = null) {
  const params = new URLSearchParams({ station_a: stationAId, station_b: stationBId });
  if (year) params.append('year', year);
  const res = await fetch(`http://127.0.0.1:8000/stations/compare?${params}`);
  if (!res.ok) return null;
  return res.json();
}
export async function fetchYearComparison(stationId, yearA, yearB) {
  const res = await fetch(
    `http://127.0.0.1:8000/stations/${stationId}/compare-years?year_a=${yearA}&year_b=${yearB}`,
  );
  if (!res.ok) return null;
  return res.json();
}

export async function sendChatMessage(message, stationId = null, history = [], year = null) {
  const res = await fetch('http://127.0.0.1:8000/chat/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      station_id: stationId,
      history,
      year,
    }),
  });
  if (!res.ok) throw new Error('Chat request failed');
  return res.json();
}