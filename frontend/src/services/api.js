const API_BASE_URL = "http://127.0.0.1:8000";


export async function getPropertyByUnit(unit) {
  const response = await fetch(
    `${API_BASE_URL}/properties/${encodeURIComponent(unit)}`
  );

  if (!response.ok) {
    throw new Error("Property request failed");
  }

  return await response.json();
}


export async function getScene() {
  const response = await fetch(
    `${API_BASE_URL}/scene`
  );

  if (!response.ok) {
    throw new Error(
      "Could not load Bhumi3D scene"
    );
  }

  return await response.json();
}


export async function validateTopology() {
  const response = await fetch(
    `${API_BASE_URL}/validate/topology`
  );

  if (!response.ok) {
    throw new Error(
      "PostGIS topology validation failed"
    );
  }

  return await response.json();
}