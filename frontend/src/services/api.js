const BASE_URL = 'http://127.0.0.1:8000';

export async function fetchLocations(filters = {}) {
  const params = new URLSearchParams();
  if (filters.year) params.append('year', filters.year);
  if (filters.water_body_type) params.append('water_body_type', filters.water_body_type);
  if (filters.safety_label) params.append('safety_label', filters.safety_label);

  const url = `${BASE_URL}/locations${params.toString() ? '?' + params.toString() : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch locations');
  return res.json();
}

export async function fetchForecast(id, years = 5) {
  const res = await fetch(`${BASE_URL}/forecast/${id}?years=${years}`);
  if (!res.ok) throw new Error('Failed to fetch forecast');
  return res.json();
}