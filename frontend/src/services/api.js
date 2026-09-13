const API_BASE_URL = "http://127.0.0.1:8000";


// ==========================================
// GET PROPERTY BY UNIT
// ==========================================

export async function getPropertyByUnit(unit) {
  const response = await fetch(
    `${API_BASE_URL}/properties/${encodeURIComponent(unit)}`
  );

  if (!response.ok) {
    throw new Error("Property request failed");
  }

  return await response.json();
}


// ==========================================
// SEARCH PROPERTIES
// ==========================================

export async function searchProperties(query) {
  const response = await fetch(
    `${API_BASE_URL}/search?q=${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    throw new Error(
      "Property search failed"
    );
  }

  return await response.json();
}


// ==========================================
// GET COMPLETE 3D SCENE
// ==========================================

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


// ==========================================
// POSTGIS TOPOLOGY VALIDATION
// ==========================================

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


// ==========================================
// CREATE PROPERTY
// ==========================================

export async function createProperty(
  propertyData
) {
  const response = await fetch(
    `${API_BASE_URL}/properties`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify(
        propertyData
      ),
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.detail ||
      "Could not create property"
    );
  }

  return data;
}


// ==========================================
// IMPORT GEOJSON
// ==========================================

export async function importGeoJSON(
  file
) {
  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  const response = await fetch(
    `${API_BASE_URL}/import/geojson`,
    {
      method: "POST",

      body: formData,
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.detail ||
      "GeoJSON import failed"
    );
  }

  return data;
}


// ==========================================
// GET GIS FEATURES
// ==========================================

export async function getGISFeatures() {
  const response = await fetch(
    `${API_BASE_URL}/gis/features`
  );

  if (!response.ok) {
    throw new Error(
      "Could not load imported GIS features"
    );
  }

  return await response.json();
}


// ==========================================
// GENERATE VERTICAL PARCELS
// ==========================================

export async function generateVerticalParcels(
  generationData
) {
  const response = await fetch(
    `${API_BASE_URL}/generate/vertical-parcels`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify(
        generationData
      ),
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.detail ||
      "Vertical parcel generation failed"
    );
  }

  return data;
}