const API_BASE_URL = "http://127.0.0.1:8000";


export async function getPropertyByUnit(unit) {
  const response = await fetch(
    `${API_BASE_URL}/properties/${encodeURIComponent(unit)}`
  );

  if (!response.ok) {
    throw new Error("Backend request failed");
  }

  const data = await response.json();

  if (data.error) {
    return null;
  }

  return data;
}