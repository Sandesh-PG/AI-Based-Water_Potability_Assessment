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

export async function fetchOverviewStats(year = null) {
  const query = year ? `?year=${year}` : '';
  return requestJson(`/stats/overview${query}`);
}

export async function fetchParameterStats(year = null, waterBodyType = null) {
  const params = new URLSearchParams();
  if (year) params.append('year', year);
  if (waterBodyType) params.append('water_body_type', waterBodyType);

  const query = params.toString() ? `?${params.toString()}` : '';
  return requestJson(`/stats/parameters${query}`);
}

export async function sendBatchPredict(files, year) {
  const formData = new FormData();
  (files || []).forEach((file) => formData.append('files', file));
  formData.append('year', year);

  const response = await fetch('http://127.0.0.1:8000/batch/predict', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const invalidList = errorPayload?.detail?.invalid_filenames;
    const invalidMessage = Array.isArray(invalidList) && invalidList.length
      ? ` Invalid filenames: ${invalidList.join(', ')}`
      : '';
    const message = errorPayload?.detail?.message || errorPayload?.detail || 'Batch prediction failed';
    throw new Error(`${message}${invalidMessage}`.trim());
  }

  return response.json();
}

export async function addBatchToDataset(results) {
  const response = await fetch('http://127.0.0.1:8000/batch/add-to-dataset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to add to dataset');
  }

  return response.json();
}


export async function fetchSuggestedQuestions(stationId = null, year = null, violatedParams = [], safetyStatus = null) {
  const body = {
    station_id: stationId,
    year: year,
    violated_params: violatedParams,
    safety_status: safetyStatus,
  };

  const res = await fetch('http://127.0.0.1:8000/chat/suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];
  const payload = await res.json();
  return payload.suggestions || [];
}

export async function fetchForecastInsights(stationId, stationName, trend, pollutionScore) {
  const prompt =
    `Analyze the water quality at station "${stationName || stationId}". ` +
    `The forecast shows a ${trend || 'Stable'} trend with a projected pollution score of ${pollutionScore != null ? pollutionScore.toFixed(2) : 'N/A'} out of 10. ` +
    `Provide: (1) the most likely pollution causes at this station, (2) specific health risks for residents if water is consumed untreated, ` +
    `and (3) a concise trend analysis with recommended actions. ` +
    `Be specific to this station's actual parameter data. Respond in JSON only.`;

  const res = await fetch('http://127.0.0.1:8000/chat/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: prompt,
      station_id: stationId,
      history: [],
      year: null,
    }),
  });

  if (!res.ok) return null;
  return res.json();
}