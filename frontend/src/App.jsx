import { useEffect, useState } from "react";
import "./App.css";
import CesiumViewer from "./cesium/CesiumViewer";

import {
  searchProperties,
  createProperty,
  importGeoJSON,
  getGISFeatures,
  getScene,
  generateVerticalParcels,
  generateBatchBuildings,
  createBuilding,
  generateDemoColony,
} from "./services/api";

function buildHierarchy(scene, gisData) {
  const sceneProperties = scene.properties || [];
  const gisFeatures = gisData.features || [];

  const plots = (scene.parcels || []).map((parcel) => {
    const buildingMap = new Map();

    for (const feature of gisFeatures) {
      const parentUlpIn = feature.properties?.parent_ulpin;
      const buildingCode = feature.properties?.building_code;

      if (parentUlpIn !== parcel.ulpin || !buildingCode) continue;

      if (!buildingMap.has(buildingCode)) {
        buildingMap.set(buildingCode, {
          code: buildingCode,
          name: feature.name || `Building ${buildingCode}`,
          featureId: feature.id,
          plannedFloors: Number(feature.properties?.floors || 0),
          buildingType: feature.properties?.building_type || "Building",
        });
      }
    }

    const buildings = Array.from(buildingMap.values()).map((building) => {
      const properties = sceneProperties.filter(
        (property) =>
          property.parent_ulpin === parcel.ulpin &&
          property.building === building.code
      );

      const apartments = properties.filter(
        (property) => property.type === "Apartment"
      );

      const floors = Array.from(
        new Set(apartments.map((property) => property.floor).filter(Boolean))
      ).sort((a, b) => Number(a) - Number(b));

      const unitsByFloor = floors.map((floor) => ({
        floor,
        units: apartments
          .filter((property) => property.floor === floor)
          .map((property) => property.unit)
          .sort((a, b) => Number(a) - Number(b)),
      }));

      return {
        ...building,
        floorCount:
          floors.length > 0 ? floors.length : building.plannedFloors,
        propertyCount: properties.length,
        apartmentCount: apartments.length,
        floors,
        unitsByFloor,
      };
    });

    return {
      ulpin: parcel.ulpin,
      name: parcel.name,
      buildings,
      buildingCount: buildings.length,
      floorCount: buildings.reduce(
        (total, building) => total + building.floorCount,
        0
      ),
      propertyCount: buildings.reduce(
        (total, building) => total + building.propertyCount,
        0
      ),
    };
  });

  return {
    plots,
    totals: {
      plots: plots.length,
      buildings: plots.reduce((total, plot) => total + plot.buildingCount, 0),
      floors: plots.reduce((total, plot) => total + plot.floorCount, 0),
      properties: plots.reduce(
        (total, plot) => total + plot.propertyCount,
        0
      ),
    },
  };
}

function getNextBuildingCode(hierarchy) {
  let highestNumber = 0;

  for (const plot of hierarchy.plots || []) {
    for (const building of plot.buildings || []) {
      const match = String(building.code || "").match(/^B(\d+)$/i);

      if (match) {
        highestNumber = Math.max(highestNumber, Number(match[1]));
      }
    }
  }

  return `B${String(highestNumber + 1).padStart(2, "0")}`;
}

function App() {
  const [selectedProperty, setSelectedProperty] = useState(null);

  const [hierarchy, setHierarchy] = useState({
    plots: [],
    totals: {
      plots: 0,
      buildings: 0,
      floors: 0,
      properties: 0,
    },
  });

  const [layers, setLayers] = useState({
    parcels: true,
    buildings: true,
    roads: true,
    amenities: true,
    lights: true,
    apartments: true,
    parking: true,
    utilities: true,
  });

  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [mapSearchText, setMapSearchText] = useState("");
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [searchMessage, setSearchMessage] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [backendConnected, setBackendConnected] = useState(null);

  const [validationTrigger, setValidationTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [validationResult, setValidationResult] = useState(null);

  const [sceneVersion, setSceneVersion] = useState(0);

  const [showAddProperty, setShowAddProperty] = useState(false);
  const [createMessage, setCreateMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [importMessage, setImportMessage] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const [colonyMessage, setColonyMessage] = useState("");
  const [isGeneratingColony, setIsGeneratingColony] = useState(false);

  const [footprintPicking, setFootprintPicking] = useState(false);
  const [footprintPickTrigger, setFootprintPickTrigger] = useState(0);
  const [footprintCancelTrigger, setFootprintCancelTrigger] = useState(0);
  const [footprintUndoTrigger, setFootprintUndoTrigger] = useState(0);
  const [footprintFinishTrigger, setFootprintFinishTrigger] = useState(0);
  const [footprintPointCount, setFootprintPointCount] = useState(0);
  const [footprintTarget, setFootprintTarget] = useState("property");

  const [showBuildingCreator, setShowBuildingCreator] = useState(false);
  const [isCreatingBuilding, setIsCreatingBuilding] = useState(false);
  const [buildingMessage, setBuildingMessage] = useState("");
  const [buildingResult, setBuildingResult] = useState(null);

  const [showVerticalGenerator, setShowVerticalGenerator] = useState(false);
  const [gisFeatures, setGISFeatures] = useState([]);
  const [loadingGISFeatures, setLoadingGISFeatures] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState("");
  const [generationResult, setGenerationResult] = useState(null);

  const [showBatchGenerator, setShowBatchGenerator] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchMessage, setBatchMessage] = useState("");
  const [batchResult, setBatchResult] = useState(null);

  const [form, setForm] = useState({
    property_type: "Apartment",
    parent_ulpin: "RJ-JPR-DEMO-0001",
    building: "B01",
    floor: "01",
    unit: "105",
    z_min: "0",
    z_max: "3.2",
    min_lon: "77.20842",
    min_lat: "28.61410",
    max_lon: "77.20855",
    max_lat: "28.61422",
  });

  const [generationForm, setGenerationForm] = useState({
    feature_id: "",
    parent_ulpin: "RJ-JPR-DEMO-0001",
    building_code: "B05",
    floors: "4",
    units_per_floor: "4",
    floor_height: "3.2",
  });

  const [batchForm, setBatchForm] = useState({
    default_floors: "4",
    default_units_per_floor: "4",
    default_floor_height: "3.2",
  });

  const [buildingForm, setBuildingForm] = useState({
    parent_ulpin: "RJ-JPR-DEMO-0001",
    building_code: "B05",
    floors: "4",
    units_per_floor: "4",
    floor_height: "3.2",
    footprint: [],
  });

  useEffect(() => {
    async function loadHierarchy() {
      try {
        const [scene, gisData] = await Promise.all([
          getScene(),
          getGISFeatures(),
        ]);

        setHierarchy(buildHierarchy(scene, gisData));
        setBackendConnected(true);
      } catch (error) {
        console.error("Could not load cadastral hierarchy:", error);
        setBackendConnected(false);
      }
    }

    loadHierarchy();
  }, [sceneVersion]);

  function handleLayerChange(layerName) {
    setLayers((previous) => ({
      ...previous,
      [layerName]: !previous[layerName],
    }));
  }

  async function handleSearch(event) {
    event.preventDefault();

    const query = searchText.trim();
    if (!query) return;

    setIsSearching(true);
    setSearchResults([]);
    setSearchMessage("Searching...");

    try {
      const data = await searchProperties(query);
      setBackendConnected(true);

      const results = data.results || [];

      if (results.length === 0) {
        setSearchMessage("No matching property found.");
        return;
      }

      if (results.length === 1) {
        focusSearchResult(results[0]);
        return;
      }

      setSearchResults(results);
      setSearchMessage(
        `${results.length} matching properties found. Select the correct building.`
      );
    } catch (error) {
      setBackendConnected(false);
      setSearchMessage(error.message || "Search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  function focusSearchResult(property) {
    setSelectedProperty({
      type: property.type,
      parentUlpIn: property.parent_ulpin,
      propertyId: property.property_id,
      building: property.building,
      floor: property.floor,
      unit: property.unit,
      verticalRange: `${property.z_min}m – ${property.z_max}m`,
      validation: property.validation,
    });

    setMapSearchText(property.property_id);
    setSearchTrigger((value) => value + 1);
    setSearchResults([]);
    setSearchMessage(`Selected ${property.building} / Unit ${property.unit}`);
  }

  function handleSearchResult(result) {
    if (result?.found) {
      setSearchMessage(`Focused on ${result.name}`);
    }
  }

  function handleValidationResult(result) {
    setValidationResult(result);
  }

  function handleFormChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  function handleFloorChange(event) {
    const value = event.target.value;
    const floorNumber = Number(value.replace(/\D/g, ""));

    if (Number.isFinite(floorNumber) && floorNumber > 0) {
      const zMin = (floorNumber - 1) * 3.2;
      const zMax = floorNumber * 3.2;

      setForm((previous) => ({
        ...previous,
        floor: value,
        z_min: String(zMin),
        z_max: String(zMax),
      }));
    } else {
      setForm((previous) => ({
        ...previous,
        floor: value,
      }));
    }
  }

  function startFootprintPicking() {
    setFootprintTarget("property");
    setCreateMessage("");
    setShowAddProperty(false);
    setFootprintPicking(true);
    setFootprintPickTrigger((value) => value + 1);
  }

  function startBuildingFootprintPicking() {
    setFootprintTarget("building");
    setFootprintPointCount(0);
    setBuildingMessage("");
    setBuildingForm((previous) => ({
      ...previous,
      footprint: [],
    }));
    setShowBuildingCreator(false);
    setFootprintPicking(true);
    setFootprintPickTrigger((value) => value + 1);
  }

  function handleFootprintPicked(result) {
    if (footprintTarget === "building") {
      const coordinates = result.coordinates || [];

      setBuildingForm((previous) => ({
        ...previous,
        footprint: coordinates,
      }));

      setFootprintPointCount(coordinates.length);
      setFootprintPicking(false);
      setBuildingMessage(
        `✓ Polygon footprint selected with ${coordinates.length} vertices.`
      );
      setShowBuildingCreator(true);
      return;
    }

    setForm((previous) => ({
      ...previous,
      min_lon: result.minLon.toFixed(7),
      min_lat: result.minLat.toFixed(7),
      max_lon: result.maxLon.toFixed(7),
      max_lat: result.maxLat.toFixed(7),
    }));

    setFootprintPicking(false);
    setCreateMessage("✓ Footprint selected from the 3D map.");
    setShowAddProperty(true);
  }

  function handleFootprintProgress(result) {
    if (footprintTarget === "building") {
      setFootprintPointCount(result.pointCount || 0);
    }
  }

  function undoBuildingFootprintPoint() {
    setFootprintUndoTrigger((value) => value + 1);
  }

  function finishBuildingFootprint() {
    if (footprintPointCount < 3) return;
    setFootprintFinishTrigger((value) => value + 1);
  }

  function cancelFootprintPicking() {
    setFootprintPicking(false);
    setFootprintPointCount(0);
    setFootprintCancelTrigger((value) => value + 1);

    if (footprintTarget === "building") {
      setShowBuildingCreator(true);
    } else {
      setShowAddProperty(true);
    }
  }

  async function handleCreateProperty(event) {
    event.preventDefault();

    setIsCreating(true);
    setCreateMessage("Creating property...");

    try {
      const result = await createProperty({
        property_type: form.property_type,
        parent_ulpin: form.parent_ulpin,
        building: form.building,
        floor: form.floor,
        unit: form.unit,
        z_min: Number(form.z_min),
        z_max: Number(form.z_max),
        min_lon: Number(form.min_lon),
        min_lat: Number(form.min_lat),
        max_lon: Number(form.max_lon),
        max_lat: Number(form.max_lat),
      });

      setBackendConnected(true);
      setCreateMessage(`Created: ${result.property_id}`);
      setSceneVersion((value) => value + 1);

      setTimeout(() => {
        setShowAddProperty(false);
      }, 1600);
    } catch (error) {
      setCreateMessage(error.message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleGeoJSONImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportMessage("Importing GIS data...");

    try {
      const result = await importGeoJSON(file);
      setBackendConnected(true);
      setImportMessage(`Imported ${result.imported_count} GIS feature(s)`);
      setSceneVersion((value) => value + 1);
    } catch (error) {
      setImportMessage(error.message);
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  }

  async function handleGenerateDemoColony() {
    const confirmed = window.confirm(
      "Generate the planned 50-plot Bhumi3D colony?\n\n" +
        "This replaces the current demo parcels, buildings and 3D properties. " +
        "Your code is not changed."
    );

    if (!confirmed) return;

    setIsGeneratingColony(true);
    setColonyMessage("Generating planned residential colony...");

    try {
      const result = await generateDemoColony();

      setBackendConnected(true);
      setValidationResult(null);
      setSelectedProperty(null);
      setSearchResults([]);
      setSearchMessage("");

      setColonyMessage(
        `✓ Colony ready: ${result.plot_count} plots, ` +
          `${result.apartment_building_count} apartment towers, ` +
          `${result.road_count} roads and ${result.streetlight_count} street lights.`
      );

      setSceneVersion((value) => value + 1);
    } catch (error) {
      setBackendConnected(false);
      setColonyMessage(error.message || "Could not generate colony.");
    } finally {
      setIsGeneratingColony(false);
    }
  }

  async function openVerticalGenerator() {
    setShowVerticalGenerator(true);
    setGenerationMessage("");
    setGenerationResult(null);
    setLoadingGISFeatures(true);

    try {
      const data = await getGISFeatures();
      setGISFeatures(data.features || []);

      if (data.features?.length > 0) {
        const first = data.features[0];

        setGenerationForm((previous) => ({
          ...previous,
          feature_id: String(first.id),
          parent_ulpin:
            first.properties?.parent_ulpin || previous.parent_ulpin,
          building_code:
            first.properties?.building_code || previous.building_code,
        }));
      }

      setBackendConnected(true);
    } catch (error) {
      setGenerationMessage(error.message);
      setBackendConnected(false);
    } finally {
      setLoadingGISFeatures(false);
    }
  }

  function handleGenerationFormChange(event) {
    const { name, value } = event.target;

    setGenerationForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (name === "feature_id") {
      const selectedFeature = gisFeatures.find(
        (feature) => String(feature.id) === String(value)
      );

      if (selectedFeature) {
        setGenerationForm((previous) => ({
          ...previous,
          feature_id: value,
          parent_ulpin:
            selectedFeature.properties?.parent_ulpin ||
            previous.parent_ulpin,
          building_code:
            selectedFeature.properties?.building_code ||
            previous.building_code,
        }));
      }
    }
  }

  async function handleGenerateVerticalParcels(event) {
    event.preventDefault();

    setIsGenerating(true);
    setGenerationMessage("Generating vertical parcels...");
    setGenerationResult(null);

    try {
      const result = await generateVerticalParcels({
        feature_id: Number(generationForm.feature_id),
        parent_ulpin: generationForm.parent_ulpin,
        building_code: generationForm.building_code,
        floors: Number(generationForm.floors),
        units_per_floor: Number(generationForm.units_per_floor),
        floor_height: Number(generationForm.floor_height),
      });

      setBackendConnected(true);
      setGenerationResult(result);
      setGenerationMessage(
        `✓ Generated ${result.generated_property_count} vertical parcels.`
      );
      setSceneVersion((value) => value + 1);
    } catch (error) {
      setGenerationMessage(error.message);
    } finally {
      setIsGenerating(false);
    }
  }

  function openBuildingCreator() {
    const firstPlot = hierarchy.plots[0];
    const suggestedCode = getNextBuildingCode(hierarchy);

    setBuildingMessage("");
    setBuildingResult(null);
    setFootprintPointCount(0);

    setBuildingForm((previous) => ({
      ...previous,
      parent_ulpin:
        firstPlot?.ulpin ||
        previous.parent_ulpin,
      building_code: suggestedCode,
      footprint: [],
    }));

    setShowBuildingCreator(true);
  }

  function handleBuildingFormChange(event) {
    const { name, value } = event.target;

    setBuildingForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleCreateBuilding(event) {
    event.preventDefault();

    if ((buildingForm.footprint || []).length < 3) {
      setBuildingMessage(
        "Draw at least 3 footprint points on the map before generating."
      );
      return;
    }

    setIsCreatingBuilding(true);
    setBuildingMessage(
      "Validating polygon and creating vertical properties..."
    );
    setBuildingResult(null);

    try {
      const result = await createBuilding({
        parent_ulpin: buildingForm.parent_ulpin,
        building_code: buildingForm.building_code,
        floors: Number(buildingForm.floors),
        units_per_floor: Number(buildingForm.units_per_floor),
        floor_height: Number(buildingForm.floor_height),
        footprint: buildingForm.footprint,
      });

      setBackendConnected(true);
      setBuildingResult(result);
      setBuildingMessage(
        `✓ ${result.building} created with ${result.generated_property_count} 3D properties.`
      );
      setSceneVersion((value) => value + 1);
    } catch (error) {
      setBuildingMessage(error.message || "Could not create building.");
    } finally {
      setIsCreatingBuilding(false);
    }
  }

  function openBatchGenerator() {
    setBatchMessage("");
    setBatchResult(null);
    setShowBatchGenerator(true);
  }

  function handleBatchFormChange(event) {
    const { name, value } = event.target;

    setBatchForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleBatchGenerate(event) {
    event.preventDefault();

    setIsBatchGenerating(true);
    setBatchMessage("Processing all imported building footprints...");
    setBatchResult(null);

    try {
      const result = await generateBatchBuildings({
        default_floors: Number(batchForm.default_floors),
        default_units_per_floor: Number(
          batchForm.default_units_per_floor
        ),
        default_floor_height: Number(batchForm.default_floor_height),
        skip_existing: true,
        require_inside_parent_plot: true,
      });

      setBackendConnected(true);
      setBatchResult(result);

      if (result.generated_property_count > 0) {
        setBatchMessage(
          `✓ ${result.generated_building_count} building(s) processed and ${result.generated_property_count} 3D properties generated.`
        );
      } else {
        setBatchMessage(
          `No new properties were generated. ${result.skipped_building_count} building(s) were safely skipped.`
        );
      }

      setSceneVersion((value) => value + 1);
    } catch (error) {
      setBatchMessage(error.message);
      setBackendConnected(false);
    } finally {
      setIsBatchGenerating(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-title">Bhumi3D</div>
          <div className="brand-subtitle">
            3D ULPIN & Vertical Property Mapping
          </div>
        </div>

        <div className="header-actions">
          <label className="header-button">
            {isImporting ? "Importing..." : "Import GeoJSON"}

            <input
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              onChange={handleGeoJSONImport}
              hidden
            />
          </label>

          <button
            className="header-button colony-button"
            onClick={handleGenerateDemoColony}
            disabled={isGeneratingColony}
          >
            {isGeneratingColony ? "Generating Colony..." : "Generate Colony"}
          </button>

          <button
            className="header-button"
            onClick={openBuildingCreator}
          >
            + Add Building
          </button>

          <button
            className="header-button"
            onClick={openBatchGenerator}
          >
            Batch Generate
          </button>

          <button
            className="header-button generator-button"
            onClick={openVerticalGenerator}
          >
            Generate Vertical Parcels
          </button>

          <button
            className="header-button"
            onClick={() => {
              setCreateMessage("");
              setShowAddProperty(true);
            }}
          >
            + Add Property
          </button>

          <div
            className={
              backendConnected === false
                ? "backend-status offline"
                : "backend-status online"
            }
          >
            <span className="status-dot" />
            Backend:
            {backendConnected === false ? " Offline" : " Connected"}
          </div>
        </div>
      </header>

      {(importMessage || colonyMessage) && (
        <div className="global-message">
          {colonyMessage || importMessage}
        </div>
      )}

      <main className="workspace">
        <aside className="left-sidebar">
          <section className="sidebar-section">
            <h3>Property Search</h3>

            <form className="search-form" onSubmit={handleSearch}>
              <input
                type="text"
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setSearchResults([]);
                }}
                placeholder="403, B02, Spatial ID..."
              />

              <button type="submit" disabled={isSearching}>
                {isSearching ? "Searching..." : "Search"}
              </button>
            </form>

            {searchMessage && (
              <div className="search-message">{searchMessage}</div>
            )}

            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((property) => (
                  <button
                    type="button"
                    className="search-result-card"
                    key={property.property_id}
                    onClick={() => focusSearchResult(property)}
                  >
                    <div className="search-result-top">
                      <strong>{property.building}</strong>
                      <span>Unit {property.unit}</span>
                    </div>

                    <div className="search-result-meta">
                      <span>Floor {property.floor}</span>
                      <span>{property.parent_ulpin}</span>
                    </div>

                    <div className="search-result-id">
                      {property.property_id}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="sidebar-section">
            <h3>Cadastral Hierarchy</h3>

            <div className="hierarchy-tree">
              {hierarchy.plots.map((plot) => (
                <div className="hierarchy-plot" key={plot.ulpin}>
                  <div className="hierarchy-plot-title">
                    <strong>{plot.name}</strong>
                    <span>{plot.ulpin}</span>
                  </div>

                  {plot.buildings.map((building) => (
                    <div
                      className="hierarchy-building"
                      key={`${plot.ulpin}-${building.code}`}
                    >
                      <strong>↳ {building.code}</strong>
                      <span>
                        {building.floorCount} floors •{" "}
                        {building.propertyCount} properties
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="sidebar-section">
            <h3>Layers</h3>

            {[
              ["parcels", "Land Plots"],
              ["buildings", "Buildings / GIS"],
              ["roads", "Road Network"],
              ["amenities", "Parks / Parking / Playgrounds"],
              ["lights", "Street Lights"],
              ["apartments", "Apartments"],
              ["parking", "Basement Parking"],
              ["utilities", "Underground Utility"],
            ].map(([key, label]) => (
              <label className="layer-row" key={key}>
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={() => handleLayerChange(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </section>

          <section className="sidebar-section">
            <h3>Spatial Validation</h3>

            <button
              className="validation-button"
              onClick={() =>
                setValidationTrigger((value) => value + 1)
              }
            >
              Run Validation
            </button>

            <button
              className="reset-button"
              onClick={() => {
                setResetTrigger((value) => value + 1);
                setValidationResult(null);
              }}
            >
              Reset Validation
            </button>

            {validationResult && (
              <div className="validation-results">
                {validationResult.valid ? (
                  <div className="validation-success">
                    ✓ All spatial rules passed
                  </div>
                ) : (
                  <>
                    <div className="validation-error">
                      {validationResult.conflicts.length} spatial issue(s)
                      detected
                    </div>

                    {validationResult.conflicts.map((conflict, index) => (
                      <div className="conflict-card" key={index}>
                        <strong>{conflict.type}</strong>
                        <div>{conflict.objectA}</div>
                        <div>↕</div>
                        <div>{conflict.objectB}</div>

                        <small>
                          {conflict.metricLabel || "Conflict"}:{" "}
                          {conflict.metricValue || "—"}
                        </small>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </section>

          <section className="sidebar-section">
            <h3>Legend</h3>

            <div className="legend-item">
              <span className="legend green" />
              Land Plot
            </div>

            <div className="legend-item">
              <span className="legend blue" />
              Apartment
            </div>

            <div className="legend-item">
              <span className="legend purple" />
              Building Footprint
            </div>
            <div className="legend-item">
              <span className="legend road" />
              Road Network
            </div>

            <div className="legend-item">
              <span className="legend park" />
              Parks / Amenities
            </div>

            <div className="legend-item">
              <span className="legend light" />
              Street Lights
            </div>


            <div className="legend-item">
              <span className="legend red" />
              Spatial Violation
            </div>
          </section>
        </aside>

        <section className="map-area">
          <div className="scene-summary">
            <SummaryItem value={hierarchy.totals.plots} label="Plots" />
            <SummaryItem
              value={hierarchy.totals.buildings}
              label="Buildings"
            />
            <SummaryItem value={hierarchy.totals.floors} label="Floors" />
            <SummaryItem
              value={hierarchy.totals.properties}
              label="3D Properties"
            />
          </div>

          <CesiumViewer
            key={sceneVersion}
            onSelect={setSelectedProperty}
            layers={layers}
            searchText={mapSearchText}
            searchTrigger={searchTrigger}
            onSearchResult={handleSearchResult}
            validationTrigger={validationTrigger}
            resetTrigger={resetTrigger}
            onValidationResult={handleValidationResult}
            footprintPickTrigger={footprintPickTrigger}
            footprintCancelTrigger={footprintCancelTrigger}
            footprintUndoTrigger={footprintUndoTrigger}
            footprintFinishTrigger={footprintFinishTrigger}
            footprintMode={
              footprintTarget === "building"
                ? "polygon"
                : "rectangle"
            }
            onFootprintPicked={handleFootprintPicked}
            onFootprintProgress={handleFootprintProgress}
          />

          {footprintPicking && (
            <div className="map-instruction">
              <strong>
                {footprintTarget === "building"
                  ? "Draw Building Polygon"
                  : "Select Property Footprint"}
              </strong>

              {footprintTarget === "building" ? (
                <>
                  <span>
                    Left-click each building corner. A live preview follows
                    your cursor.
                  </span>

                  <span className="map-point-count">
                    {footprintPointCount} point
                    {footprintPointCount === 1 ? "" : "s"} selected
                  </span>

                  <div className="map-instruction-actions">
                    <button
                      type="button"
                      onClick={undoBuildingFootprintPoint}
                      disabled={footprintPointCount === 0}
                    >
                      Undo
                    </button>

                    <button
                      type="button"
                      className="finish-button"
                      onClick={finishBuildingFootprint}
                      disabled={footprintPointCount < 3}
                    >
                      Finish Footprint
                    </button>

                    <button
                      type="button"
                      onClick={cancelFootprintPicking}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span>
                    Click one corner, then click the opposite corner.
                  </span>

                  <button
                    type="button"
                    onClick={cancelFootprintPicking}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        <PropertyInformation
          selectedProperty={selectedProperty}
          hierarchy={hierarchy}
        />
      </main>

      {showBuildingCreator && (
        <div className="modal-backdrop">
          <div className="property-modal vertical-modal">
            <div className="modal-header">
              <div>
                <h2>Create 3D Building</h2>
                <p>
                  Draw a building footprint, choose its parent plot, and
                  generate floors and apartment units automatically.
                </p>
              </div>

              <button
                className="close-button"
                type="button"
                onClick={() => setShowBuildingCreator(false)}
              >
                ×
              </button>
            </div>

            <form
              className="property-form"
              onSubmit={handleCreateBuilding}
            >
              <div className="prototype-notice">
                <strong>Bhumi3D Building Creator V2</strong>
                <span>
                  Draw a real polygon with 3 or more map points. PostGIS
                  validates polygon geometry, parent-plot containment, and
                  building overlap before generating any 3D properties.
                </span>
              </div>

              <label>
                Parent Land Plot
                <select
                  name="parent_ulpin"
                  value={buildingForm.parent_ulpin}
                  onChange={handleBuildingFormChange}
                  required
                >
                  {hierarchy.plots.map((plot) => (
                    <option key={plot.ulpin} value={plot.ulpin}>
                      {plot.name} — {plot.ulpin}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-grid">
                <label>
                  Building Code
                  <input
                    name="building_code"
                    value={buildingForm.building_code}
                    onChange={handleBuildingFormChange}
                    placeholder="B05"
                    required
                  />
                </label>

                <label>
                  Floors
                  <input
                    name="floors"
                    type="number"
                    min="1"
                    max="100"
                    value={buildingForm.floors}
                    onChange={handleBuildingFormChange}
                    required
                  />
                </label>

                <label>
                  Units / Floor
                  <input
                    name="units_per_floor"
                    type="number"
                    min="1"
                    max="20"
                    value={buildingForm.units_per_floor}
                    onChange={handleBuildingFormChange}
                    required
                  />
                </label>

                <label>
                  Floor Height (m)
                  <input
                    name="floor_height"
                    type="number"
                    min="0.1"
                    max="20"
                    step="0.1"
                    value={buildingForm.floor_height}
                    onChange={handleBuildingFormChange}
                    required
                  />
                </label>
              </div>

              <button
                type="button"
                className="map-pick-button"
                onClick={startBuildingFootprintPicking}
              >
                Pick Building Footprint on 3D Map
              </button>

              <div className="building-footprint-summary">
                {(buildingForm.footprint || []).length < 3 ? (
                  <span>No completed polygon footprint selected yet.</span>
                ) : (
                  <>
                    <strong>Polygon footprint selected</strong>
                    <span>
                      {buildingForm.footprint.length} vertices
                    </span>
                    <span>
                      PostGIS will validate containment and building overlap
                      when you generate.
                    </span>
                  </>
                )}
              </div>

              {buildingMessage && (
                <div className="form-message">{buildingMessage}</div>
              )}

              {buildingResult && (
                <div className="generation-result">
                  <strong>Building Created</strong>
                  <div>Building: {buildingResult.building}</div>
                  <div>Parent: {buildingResult.parent_ulpin}</div>
                  <div>Floors: {buildingResult.floors}</div>
                  <div>
                    Footprint: {buildingResult.footprint_vertices} vertices
                  </div>
                  <div>
                    Area: {buildingResult.footprint_area_m2} m²
                  </div>
                  <div>
                    3D properties: {buildingResult.generated_property_count}
                  </div>
                </div>
              )}

              <button
                className="primary-form-button"
                type="submit"
                disabled={isCreatingBuilding}
              >
                {isCreatingBuilding
                  ? "Creating Building..."
                  : "Generate Building & Properties"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showAddProperty && (
        <div className="modal-backdrop">
          <div className="property-modal">
            <div className="modal-header">
              <div>
                <h2>Add 3D Property</h2>
                <p>
                  Add a spatial property to a specific plot and building.
                </p>
              </div>

              <button
                className="close-button"
                type="button"
                onClick={() => setShowAddProperty(false)}
              >
                ×
              </button>
            </div>

            <form
              className="property-form"
              onSubmit={handleCreateProperty}
            >
              <label>
                Property Type

                <select
                  name="property_type"
                  value={form.property_type}
                  onChange={handleFormChange}
                >
                  <option>Apartment</option>
                  <option>Basement Parking</option>
                  <option>Underground Utility</option>
                </select>
              </label>

              <label>
                Parent ULPIN

                <input
                  name="parent_ulpin"
                  value={form.parent_ulpin}
                  onChange={handleFormChange}
                  required
                />
              </label>

              <div className="form-grid">
                <label>
                  Building
                  <input
                    name="building"
                    value={form.building}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label>
                  Floor
                  <input
                    name="floor"
                    value={form.floor}
                    onChange={handleFloorChange}
                    required
                  />
                </label>

                <label>
                  Unit
                  <input
                    name="unit"
                    value={form.unit}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label>
                  Z Min (m)
                  <input
                    name="z_min"
                    type="number"
                    step="0.1"
                    value={form.z_min}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label>
                  Z Max (m)
                  <input
                    name="z_max"
                    type="number"
                    step="0.1"
                    value={form.z_max}
                    onChange={handleFormChange}
                    required
                  />
                </label>
              </div>

              <h3>Property Footprint</h3>

              <button
                type="button"
                className="map-pick-button"
                onClick={startFootprintPicking}
              >
                Pick Footprint on 3D Map
              </button>

              <div className="form-grid">
                <label>
                  Min Longitude
                  <input
                    name="min_lon"
                    type="number"
                    step="any"
                    value={form.min_lon}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label>
                  Min Latitude
                  <input
                    name="min_lat"
                    type="number"
                    step="any"
                    value={form.min_lat}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label>
                  Max Longitude
                  <input
                    name="max_lon"
                    type="number"
                    step="any"
                    value={form.max_lon}
                    onChange={handleFormChange}
                    required
                  />
                </label>

                <label>
                  Max Latitude
                  <input
                    name="max_lat"
                    type="number"
                    step="any"
                    value={form.max_lat}
                    onChange={handleFormChange}
                    required
                  />
                </label>
              </div>

              {createMessage && (
                <div className="form-message">{createMessage}</div>
              )}

              <button
                className="primary-form-button"
                type="submit"
                disabled={isCreating}
              >
                {isCreating
                  ? "Creating..."
                  : "Generate & Add Property"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showVerticalGenerator && (
        <div className="modal-backdrop">
          <div className="property-modal vertical-modal">
            <div className="modal-header">
              <div>
                <h2>Generate Vertical Parcels</h2>
                <p>
                  Automatically subdivide one imported building into
                  floors and apartment units.
                </p>
              </div>

              <button
                className="close-button"
                type="button"
                onClick={() => setShowVerticalGenerator(false)}
              >
                ×
              </button>
            </div>

            <form
              className="property-form"
              onSubmit={handleGenerateVerticalParcels}
            >
              <div className="prototype-notice">
                <strong>SIH Prototype Method</strong>
                <span>
                  Regular subdivision is currently used. Later this can
                  be replaced by floor-plan, LiDAR or AI-derived
                  boundaries.
                </span>
              </div>

              <label>
                Imported Building

                <select
                  name="feature_id"
                  value={generationForm.feature_id}
                  onChange={handleGenerationFormChange}
                  required
                >
                  {loadingGISFeatures ? (
                    <option value="">Loading...</option>
                  ) : (
                    gisFeatures.map((feature) => (
                      <option key={feature.id} value={feature.id}>
                        {feature.properties?.building_code ||
                          feature.name}{" "}
                        —{" "}
                        {feature.properties?.parent_ulpin ||
                          "No plot assigned"}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label>
                Parent ULPIN

                <input
                  name="parent_ulpin"
                  value={generationForm.parent_ulpin}
                  onChange={handleGenerationFormChange}
                  required
                />
              </label>

              <div className="form-grid">
                <label>
                  Building Code
                  <input
                    name="building_code"
                    value={generationForm.building_code}
                    onChange={handleGenerationFormChange}
                    required
                  />
                </label>

                <label>
                  Number of Floors
                  <input
                    name="floors"
                    type="number"
                    min="1"
                    value={generationForm.floors}
                    onChange={handleGenerationFormChange}
                    required
                  />
                </label>

                <label>
                  Units per Floor
                  <input
                    name="units_per_floor"
                    type="number"
                    min="1"
                    value={generationForm.units_per_floor}
                    onChange={handleGenerationFormChange}
                    required
                  />
                </label>

                <label>
                  Floor Height
                  <input
                    name="floor_height"
                    type="number"
                    step="0.1"
                    value={generationForm.floor_height}
                    onChange={handleGenerationFormChange}
                    required
                  />
                </label>
              </div>

              {generationMessage && (
                <div className="form-message">{generationMessage}</div>
              )}

              {generationResult && (
                <div className="generation-result">
                  <strong>Generation Complete</strong>
                  <div>Building: {generationResult.building}</div>
                  <div>
                    Generated:{" "}
                    {generationResult.generated_property_count} properties
                  </div>
                </div>
              )}

              <button
                className="primary-form-button"
                type="submit"
                disabled={isGenerating}
              >
                {isGenerating
                  ? "Generating..."
                  : "Generate 3D Vertical Parcels"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showBatchGenerator && (
        <div className="modal-backdrop">
          <div className="property-modal vertical-modal">
            <div className="modal-header">
              <div>
                <h2>Batch Generate Buildings</h2>
                <p>
                  Process every imported building footprint in one
                  operation.
                </p>
              </div>

              <button
                className="close-button"
                type="button"
                onClick={() => setShowBatchGenerator(false)}
              >
                ×
              </button>
            </div>

            <form className="property-form" onSubmit={handleBatchGenerate}>
              <div className="prototype-notice">
                <strong>Automatic Multi-Building Workflow</strong>
                <span>
                  Bhumi3D spatially assigns buildings to containing land
                  plots, skips duplicates, rejects buildings outside
                  their parent plots, generates vertical parcels and
                  stores the results in PostGIS.
                </span>
              </div>

              <div className="form-grid">
                <label>
                  Default Floors
                  <input
                    name="default_floors"
                    type="number"
                    min="1"
                    max="100"
                    value={batchForm.default_floors}
                    onChange={handleBatchFormChange}
                    required
                  />
                </label>

                <label>
                  Default Units / Floor
                  <input
                    name="default_units_per_floor"
                    type="number"
                    min="1"
                    max="20"
                    value={batchForm.default_units_per_floor}
                    onChange={handleBatchFormChange}
                    required
                  />
                </label>

                <label>
                  Default Floor Height (m)
                  <input
                    name="default_floor_height"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={batchForm.default_floor_height}
                    onChange={handleBatchFormChange}
                    required
                  />
                </label>
              </div>

              <div className="prototype-notice">
                <strong>Safety Rules Enabled</strong>
                <span>
                  Existing buildings are skipped automatically. A new
                  building must be fully inside its parent land plot
                  before properties are generated.
                </span>
              </div>

              {batchMessage && (
                <div className="form-message">{batchMessage}</div>
              )}

              {batchResult && (
                <div className="generation-result">
                  <strong>Batch Result</strong>
                  <div>
                    Source GIS features:{" "}
                    {batchResult.source_feature_count}
                  </div>
                  <div>
                    Buildings generated:{" "}
                    {batchResult.generated_building_count}
                  </div>
                  <div>
                    3D properties generated:{" "}
                    {batchResult.generated_property_count}
                  </div>
                  <div>
                    Buildings skipped:{" "}
                    {batchResult.skipped_building_count}
                  </div>
                </div>
              )}

              <button
                className="primary-form-button"
                type="submit"
                disabled={isBatchGenerating}
              >
                {isBatchGenerating
                  ? "Processing Buildings..."
                  : "Generate All Imported Buildings"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryItem({ value, label }) {
  return (
    <div className="summary-item">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function PropertyInformation({ selectedProperty, hierarchy }) {
  if (!selectedProperty) {
    return (
      <aside className="property-panel">
        <h2>Cadastral Information</h2>

        <div className="empty-property">
          Click a land plot, building, apartment, or search for a
          property.
        </div>
      </aside>
    );
  }

  const plot = hierarchy.plots.find(
    (item) => item.ulpin === selectedProperty.parentUlpIn
  );

  const building = plot?.buildings.find(
    (item) => item.code === selectedProperty.building
  );

  if (selectedProperty.type === "Land Parcel") {
    return (
      <aside className="property-panel">
        <div className="panel-type-badge">LAND PLOT</div>

        <h2>{plot?.name || "Land Plot"}</h2>

        <InfoRow label="ULPIN" value={selectedProperty.parentUlpIn} />
        <InfoRow label="Buildings" value={plot?.buildingCount ?? 0} />
        <InfoRow label="Total Floors" value={plot?.floorCount ?? 0} />
        <InfoRow
          label="Vertical Properties"
          value={plot?.propertyCount ?? 0}
        />

        {plot?.buildings.length > 0 && (
          <div className="relationship-box">
            <div className="relationship-title">Plot → Buildings</div>

            {plot.buildings.map((item) => (
              <div className="relationship-line" key={item.code}>
                <strong>{item.code}</strong>
                <span>
                  {item.floorCount} floors • {item.propertyCount}{" "}
                  properties
                </span>
              </div>
            ))}
          </div>
        )}
      </aside>
    );
  }

  if (selectedProperty.type === "Building Footprint") {
    return (
      <aside className="property-panel">
        <div className="panel-type-badge building-badge">BUILDING</div>

        <h2>{selectedProperty.building}</h2>

        <InfoRow label="Parent Plot" value={plot?.name || "—"} />
        <InfoRow
          label="Parent ULPIN"
          value={selectedProperty.parentUlpIn}
        />
        <InfoRow label="Floors" value={building?.floorCount ?? 0} />
        <InfoRow
          label="Vertical Properties"
          value={building?.propertyCount ?? 0}
        />
        <InfoRow
          label="Validation"
          value={selectedProperty.validation}
        />

        {building?.unitsByFloor?.length > 0 && (
          <div className="relationship-box">
            <div className="relationship-title">
              Building → Floors → Units
            </div>

            {building.unitsByFloor.map((floorData) => (
              <div className="floor-row" key={floorData.floor}>
                <strong>Floor {floorData.floor}</strong>
                <span>{floorData.units.join(", ")}</span>
              </div>
            ))}
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="property-panel">
      <div className="panel-type-badge property-badge">3D PROPERTY</div>

      <h2>Property Information</h2>

      <InfoRow label="Type" value={selectedProperty.type} />
      <InfoRow label="Parent Plot" value={plot?.name || "—"} />
      <InfoRow
        label="Parent ULPIN"
        value={selectedProperty.parentUlpIn}
      />
      <InfoRow label="Building" value={selectedProperty.building} />
      <InfoRow label="Floor" value={selectedProperty.floor} />
      <InfoRow label="Unit" value={selectedProperty.unit} />
      <InfoRow
        label="Vertical Range"
        value={selectedProperty.verticalRange}
      />
      <InfoRow
        label="Spatial ID"
        value={selectedProperty.propertyId}
      />
      <InfoRow
        label="Validation"
        value={selectedProperty.validation}
      />

      <div className="relationship-box">
        <div className="relationship-title">
          Cadastral Relationship
        </div>

        <div className="relationship-path">
          <span>{plot?.name || "Plot"}</span>
          <b>↓</b>
          <span>{selectedProperty.building}</span>
          <b>↓</b>
          <span>Floor {selectedProperty.floor}</span>
          <b>↓</b>
          <span>Unit {selectedProperty.unit}</span>
        </div>
      </div>
    </aside>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value ?? "—"}</span>
    </div>
  );
}

export default App;
