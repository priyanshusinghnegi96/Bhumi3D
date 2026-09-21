import { useEffect, useRef, useState } from "react";
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
  getTownshipUnit,
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
          blockCode: feature.properties?.block_code || parcel.block_code || "—",
          addressNumber: Number(feature.properties?.address_number || parcel.address_number || 0),
          addressCode: feature.properties?.address_code || parcel.address_code || buildingCode,
          unitsPerFloor: Number(feature.properties?.units_per_floor || 0),
          floorHeight: Number(feature.properties?.floor_height || 0),
          heightMeters: Number(feature.properties?.height_m || 0),
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

      const storedFloors = Array.from(
        new Set(apartments.map((property) => property.floor).filter(Boolean))
      ).sort((a, b) => Number(a) - Number(b));

      const floorCount =
        storedFloors.length > 0 ? storedFloors.length : building.plannedFloors;

      const virtualUnits = Array.from(
        { length: Math.max(0, building.unitsPerFloor) },
        (_, index) => String.fromCharCode(65 + index)
      );

      const unitsByFloor = storedFloors.length > 0
        ? storedFloors.map((floor) => ({
            floor,
            units: apartments
              .filter((property) => property.floor === floor)
              .map((property) => property.unit)
              .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
          }))
        : Array.from({ length: floorCount }, (_, index) => ({
            floor: String(index + 1),
            units: virtualUnits.map((letter) => `${index + 1}-${letter}`),
          }));

      const registeredUnitCount =
        String(building.buildingType || "").toLowerCase().includes("apartment")
          ? floorCount * Math.max(0, building.unitsPerFloor)
          : 0;

      return {
        ...building,
        floorCount,
        propertyCount: properties.length,
        apartmentCount: apartments.length,
        registeredUnitCount,
        floors: storedFloors,
        unitsByFloor,
      };
    });

    return {
      ulpin: parcel.ulpin,
      name: parcel.name,
      blockCode: parcel.block_code || buildings[0]?.blockCode || "—",
      addressNumber: Number(parcel.address_number || buildings[0]?.addressNumber || 0),
      addressCode: parcel.address_code || buildings[0]?.addressCode || "—",
      landUse: parcel.land_use || "",
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

  const blocks = ["A", "B", "C", "D"].map((code) => {
    const blockPlots = plots
      .filter((plot) => plot.blockCode === code)
      .sort((a, b) => a.addressNumber - b.addressNumber);

    return {
      code,
      plots: blockPlots,
      plotCount: blockPlots.length,
      buildingCount: blockPlots.reduce((total, plot) => total + plot.buildingCount, 0),
      floorCount: blockPlots.reduce((total, plot) => total + plot.floorCount, 0),
    };
  });

  return {
    plots,
    blocks,
    totals: {
      plots: plots.length,
      buildings: plots.reduce((total, plot) => total + plot.buildingCount, 0),
      floors: plots.reduce((total, plot) => total + plot.floorCount, 0),
      properties: plots.reduce(
        (total, plot) => total + plot.propertyCount,
        0
      ),
      registeredUnits: Number.isFinite(Number(scene.registered_unit_count))
        ? Number(scene.registered_unit_count)
        : plots.reduce(
            (total, plot) =>
              total + plot.buildings.reduce(
                (buildingTotal, building) => buildingTotal + (building.registeredUnitCount || 0),
                0
              ),
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


function hierarchyPlotTarget(plot) {
  return {
    result_type: "plot",
    target_type: "plot",
    target_id: `plot:${plot.ulpin}`,
    title: plot.name || `Plot ${plot.addressCode}`,
    block_code: plot.blockCode,
    address_code: plot.addressCode,
    address_number: plot.addressNumber,
    parent_ulpin: plot.ulpin,
    plot_name: plot.name,
  };
}

function hierarchyBuildingTarget(plot, building) {
  return {
    result_type: "building",
    target_type: "building",
    target_id: `building:${building.addressCode}`,
    title: building.addressCode,
    subtitle: building.name,
    block_code: building.blockCode || plot.blockCode,
    address_code: building.addressCode,
    address_number: building.addressNumber,
    parent_ulpin: plot.ulpin,
    plot_name: plot.name,
    building_code: building.code,
    building_name: building.name,
    building_type: building.buildingType,
    floors: building.floorCount,
    units_per_floor: building.unitsPerFloor,
    floor_height: building.floorHeight,
    height_m: building.heightMeters,
  };
}

function hierarchyFloorTarget(plot, building, floorNumber) {
  const floorHeight = Number(building.floorHeight || 3.2);
  return {
    ...hierarchyBuildingTarget(plot, building),
    result_type: "floor",
    target_type: "floor",
    target_id: `floor:${building.addressCode}:${floorNumber}`,
    title: `${building.addressCode} · Floor ${floorNumber}`,
    subtitle: `${building.unitsPerFloor || 0} apartments · Block ${building.blockCode || plot.blockCode}`,
    floor: String(floorNumber),
    z_min: (floorNumber - 1) * floorHeight,
    z_max: floorNumber * floorHeight,
  };
}

function hierarchyUnitTarget(plot, building, floorNumber, unitLetter) {
  const compactAddress = String(building.addressCode || building.code).replace(/-/g, "");
  const spatialId = `${plot.ulpin}-${compactAddress}-F${String(floorNumber).padStart(2, "0")}-U${unitLetter}`;
  return {
    ...hierarchyFloorTarget(plot, building, floorNumber),
    result_type: "unit",
    target_type: "unit",
    target_id: `unit:${building.addressCode}:${floorNumber}:${unitLetter}`,
    title: `${building.addressCode} · ${floorNumber}-${unitLetter}`,
    subtitle: `Floor ${floorNumber} · Apartment ${unitLetter}`,
    unit: unitLetter,
    display_unit: `${floorNumber}-${unitLetter}`,
    spatial_id: spatialId,
    property_id: spatialId,
  };
}

function App() {
  const [selectedProperty, setSelectedProperty] = useState(null);

  const [hierarchy, setHierarchy] = useState({
    plots: [],
    blocks: [],
    totals: {
      plots: 0,
      buildings: 0,
      floors: 0,
      properties: 0,
      registeredUnits: 0,
    },
  });

  const [layers, setLayers] = useState({
    blocks: true,
    parcels: true,
    buildings: true,
    roads: true,
    amenities: true,
    landscape: true,
    lights: true,
    markings: true,
    signals: true,
    mobility: true,
    apartments: true,
    parking: true,
    utilities: true,
  });

  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [mapSearchText, setMapSearchText] = useState("");
  const [mapSearchTarget, setMapSearchTarget] = useState(null);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [searchMessage, setSearchMessage] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const searchRequestIdRef = useRef(0);
  const [backendConnected, setBackendConnected] = useState(null);

  const [validationTrigger, setValidationTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [selectionClearTrigger, setSelectionClearTrigger] = useState(0);
  const [validationResult, setValidationResult] = useState(null);

  const [sceneVersion, setSceneVersion] = useState(0);

  const [cameraCommand, setCameraCommand] = useState({
    action: "township",
    sequence: 0,
  });

  const [viewMode, setViewMode] = useState("city");

  function applyCityView() {
    setViewMode("city");
    setLayers((previous) => ({
      ...previous, blocks: true, parcels: false, buildings: true, roads: true, amenities: true,
      landscape: true, lights: true, markings: true, signals: true, mobility: true,
      apartments: false, parking: true, utilities: true,
    }));
  }

  function applyCadastralView() {
    setViewMode("cadastral");
    setLayers((previous) => ({
      ...previous, blocks: true, parcels: true, buildings: true, roads: true, amenities: false,
      landscape: false, lights: false, markings: false, signals: false, mobility: false,
      apartments: true, parking: true, utilities: true,
    }));
  }

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

  function sendCameraCommand(action, payload = {}) {
    setCameraCommand((previous) => ({
      action,
      sequence: previous.sequence + 1,
      ...payload,
    }));
  }

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

  async function runUnifiedSearch(query, { auto = false } = {}) {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      searchRequestIdRef.current += 1;
      setSearchResults([]);
      setSearchMessage("");
      return [];
    }

    const requestId = ++searchRequestIdRef.current;
    if (!auto) setIsSearching(true);

    try {
      const data = await searchProperties(cleanQuery, 24);

      // Autocomplete requests can finish out of order.  Only the newest
      // response is allowed to update the UI.
      if (requestId !== searchRequestIdRef.current) return [];

      setBackendConnected(true);
      const results = data.results || [];
      setSearchResults(results);
      setSearchMessage(
        data.message ||
          (results.length ? `${results.length} result(s)` : "No matching cadastral object found.")
      );
      return results;
    } catch (error) {
      if (requestId !== searchRequestIdRef.current) return [];
      setBackendConnected(false);
      setSearchMessage(error.message || "Search failed.");
      return [];
    } finally {
      if (!auto && requestId === searchRequestIdRef.current) setIsSearching(false);
    }
  }

  useEffect(() => {
    const query = searchText.trim();

    if (!query) {
      setSearchResults([]);
      setSearchMessage("");
      return undefined;
    }

    const timer = window.setTimeout(() => {
      runUnifiedSearch(query, { auto: true });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [searchText]);

  async function handleSearch(event) {
    event.preventDefault();
    const query = searchText.trim();
    if (!query) return;

    const results = await runUnifiedSearch(query);

    if (results.length === 1) {
      focusSearchResult(results[0]);
    }
  }

  async function focusSearchResult(result) {
    const targetType = result.target_type || result.result_type || "property";
    let resolved = { ...result };

    // Any apartment navigation path (search result or right-panel chip)
    // is verified against the persisted PostGIS unit registry before the
    // UI claims a 3D ULPIN.  This keeps the core cadastral identity honest.
    if (targetType === "unit") {
      const addressCode = result.address_code;
      const floorNumber = Number(result.floor);
      const unitLetter = String(result.unit || result.display_unit || "")
        .toUpperCase()
        .match(/([A-Z])$/)?.[1];

      if (addressCode && Number.isFinite(floorNumber) && unitLetter) {
        try {
          const registered = await getTownshipUnit(addressCode, floorNumber, unitLetter);
          setBackendConnected(true);
          resolved = {
            ...result,
            parent_ulpin: registered.parent_ulpin,
            plot_name: registered.plot_name,
            block_code: registered.block_code,
            address_number: registered.address_number,
            address_code: registered.address_code,
            building_code: registered.building_code,
            building_name: registered.building_name,
            building_type: registered.building_type,
            floors: registered.floors,
            units_per_floor: registered.units_per_floor,
            floor_height: registered.floor_height,
            height_m: registered.height_m,
            floor: registered.floor,
            unit: registered.unit,
            display_unit: registered.display_unit,
            property_id: registered.proposed_3d_ulpin,
            spatial_id: registered.proposed_3d_ulpin,
            z_min: registered.z_min,
            z_max: registered.z_max,
            validation: registered.validation,
            registry_status: registered.registry_status,
          };
        } catch (error) {
          console.error("Apartment registry lookup failed:", error);
          setSearchMessage(error.message || "Registered apartment could not be verified.");
          return;
        }
      }
    }

    const zMin = Number(resolved.z_min);
    const zMax = Number(resolved.z_max);

    let displayType = resolved.type || "3D Property";
    if (targetType === "block") displayType = "Township Block";
    if (targetType === "plot") displayType = "Land Parcel";
    if (targetType === "building") displayType = "Building Footprint";
    if (targetType === "floor") displayType = "Virtual Floor";
    if (targetType === "unit") displayType = "Virtual Apartment";

    setSelectedProperty({
      type: displayType,
      resultType: targetType,
      parentUlpIn: resolved.parent_ulpin || "—",
      propertyId: resolved.spatial_id || resolved.property_id || resolved.target_id || "—",
      building: resolved.building_code || resolved.building || "—",
      buildingName: resolved.building_name || resolved.title || "—",
      buildingType: resolved.building_type || "—",
      blockCode: resolved.block_code || "—",
      addressCode: resolved.address_code || (targetType === "block" ? `Block ${resolved.block_code}` : "—"),
      addressNumber: resolved.address_number,
      floor: resolved.floor || "—",
      unit: resolved.display_unit || resolved.unit || "—",
      unitsPerFloor: Number(resolved.units_per_floor || 0),
      floorCount: Number(resolved.floors || resolved.floor_count || 0),
      floorHeight: Number(resolved.floor_height || 0),
      heightMeters: Number(resolved.height_m || 0),
      verticalRange:
        Number.isFinite(zMin) && Number.isFinite(zMax)
          ? `${zMin}m – ${zMax}m`
          : resolved.height_m
            ? `0m – ${resolved.height_m}m`
            : "—",
      validation: resolved.validation || "Township address index",
      plotName: resolved.plot_name || "—",
      plotCount: resolved.plot_count,
      buildingCount: resolved.building_count,
      apartmentCapacity: resolved.apartment_capacity,
      registryStatus: resolved.registry_status || (targetType === "unit" ? "Persisted in PostGIS" : undefined),
    });

    setMapSearchText(resolved.target_id || resolved.property_id || resolved.address_code || "");
    setMapSearchTarget(resolved);
    setSearchTrigger((value) => value + 1);
    setSearchResults([]);
    setSearchMessage(`Focused on ${resolved.title || resolved.address_code || resolved.property_id}`);
  }

  function handleSearchResult(result) {
    if (result?.found) {
      setSearchMessage(`Focused on ${result.name}`);
    } else if (result?.message) {
      setSearchMessage(result.message);
    }
  }

  async function handleMapSelect(selection) {
    if (!selection) {
      setSelectedProperty(null);
      return;
    }

    if (selection.type !== "Virtual Apartment") {
      setSelectedProperty(selection);
      return;
    }

    const addressCode = selection.addressCode;
    const floorNumber = Number(selection.floor);
    const unitMatch = String(selection.unit || "").toUpperCase().match(/([A-Z])$/);
    const unitLetter = unitMatch?.[1];

    if (!addressCode || !Number.isFinite(floorNumber) || !unitLetter) {
      setSelectedProperty(selection);
      return;
    }

    try {
      const registered = await getTownshipUnit(addressCode, floorNumber, unitLetter);
      setBackendConnected(true);
      setSelectedProperty({
        ...selection,
        parentUlpIn: registered.parent_ulpin || selection.parentUlpIn,
        propertyId: registered.proposed_3d_ulpin || registered.spatial_id || selection.propertyId,
        blockCode: registered.block_code || selection.blockCode,
        addressCode: registered.address_code || selection.addressCode,
        addressNumber: registered.address_number ?? selection.addressNumber,
        building: registered.building_code || selection.building,
        buildingName: registered.building_name || selection.buildingName,
        buildingType: registered.building_type || selection.buildingType,
        floor: registered.floor || selection.floor,
        unit: registered.display_unit || `${registered.floor}-${registered.unit}` || selection.unit,
        unitsPerFloor: Number(registered.units_per_floor || selection.unitsPerFloor || 0),
        floorCount: Number(registered.floors || selection.floorCount || 0),
        floorHeight: Number(registered.floor_height || selection.floorHeight || 0),
        heightMeters: Number(registered.height_m || selection.heightMeters || 0),
        verticalRange: `${registered.z_min}m – ${registered.z_max}m`,
        validation: registered.validation || selection.validation,
        registryStatus: registered.registry_status || "Persisted in PostGIS",
        plotName: registered.plot_name || selection.plotName,
      });
    } catch (error) {
      console.error("Could not verify apartment registry record:", error);
      setSelectedProperty(selection);
    }
  }

  function closeCadastralInspection() {
    setSelectedProperty(null);
    setMapSearchTarget(null);
    setMapSearchText("");
    setSearchResults([]);
    setSearchMessage("");
    setSelectionClearTrigger((value) => value + 1);
  }

  useEffect(() => {
    const blockCode = selectedProperty?.blockCode;
    const addressCode = selectedProperty?.addressCode;

    if (blockCode && blockCode !== "—") {
      const blockDetails = document.querySelector(
        `[data-hierarchy-block="${blockCode}"]`
      );
      if (blockDetails) blockDetails.open = true;
    }

    if (addressCode && addressCode !== "—") {
      const timer = window.setTimeout(() => {
        const target = document.querySelector(
          `[data-hierarchy-address="${addressCode}"]`
        );
        target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 80);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [selectedProperty?.blockCode, selectedProperty?.addressCode, selectedProperty?.floor, selectedProperty?.unit]);

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
      "Generate Bhumi3D Township V3 Step 3.7A registered 3D apartment cadastre + final interaction/visual upgrades?\n\n" +
        "This replaces the current demo parcels, buildings and 3D properties. " +
        "Your code is not changed."
    );

    if (!confirmed) return;

    setIsGeneratingColony(true);
    setColonyMessage("Generating Township V3 Step 3.7A registered 3D apartment cadastre, linked 3D ULPINs and final scene polish...");

    try {
      const result = await generateDemoColony();

      setBackendConnected(true);
      setValidationResult(null);
      setSelectedProperty(null);
      setSearchResults([]);
      setSearchMessage("");
      setSearchText("");
      setMapSearchTarget(null);

      setColonyMessage(
        `✓ Township ready: ${result.plot_count} plots, ` +
          `${result.apartment_building_count} apartment towers, ` +
          `${result.residential_building_count} homes, ` +
          `${result.hospital_count} hospitals, ${result.road_count} roads, ` +
          `${result.tree_count} landscape trees, ${result.vehicle_count || 0} vehicles, ` +
          `${result.bus_shelter_count || 0} bus shelters, ${result.ev_charger_count || 0} EV chargers, ` +
          `${result.registered_3d_unit_count || 0} registered 3D apartment units, ` +
          `perimeter green belts and the ${result.entrance_name} entrance.`
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
            {isGeneratingColony ? "Generating Township..." : "Generate Township"}
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

      <main className={selectedProperty ? "workspace" : "workspace property-panel-closed"}>
        <aside className="left-sidebar">
          <section className="sidebar-section search-section">
            <div className="section-title-row">
              <h3>Unified Cadastral Search</h3>
              <span className="search-scope-badge">A · B · C · D</span>
            </div>

            <form className="search-form" onSubmit={handleSearch}>
              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="12, A-12, A-12 17-C, ULPIN, hospital..."
                autoComplete="off"
              />

              <button type="submit" disabled={isSearching}>
                {isSearching ? "Searching..." : "Search"}
              </button>
            </form>

            <div className="search-help">
              <span><b>12</b> → same building number across Blocks A–D</span>
              <span><b>A-12 17-C</b> → Building A-12, Floor 17, Apartment C</span>
            </div>

            {searchMessage && (
              <div className="search-message">{searchMessage}</div>
            )}

            {searchResults.length > 0 && (
              <div className="search-results unified-results">
                {searchResults.map((result, index) => (
                  <button
                    type="button"
                    className="search-result-card unified-search-card"
                    key={result.target_id || result.property_id || `${result.title}-${index}`}
                    onClick={() => focusSearchResult(result)}
                  >
                    <div className="search-result-top">
                      <strong>{result.title || result.address_code || result.property_id}</strong>
                      <span className={`result-type result-${result.result_type || "property"}`}>
                        {(result.result_type || "property").toUpperCase()}
                      </span>
                    </div>

                    <div className="search-result-description">
                      {result.subtitle || result.building_name || result.type}
                    </div>

                    <div className="search-result-meta">
                      {result.block_code && <span>Block {result.block_code}</span>}
                      {result.floors > 0 && <span>{result.floors} floors</span>}
                      {result.units_per_floor > 1 && (
                        <span>{result.units_per_floor} apartments / floor</span>
                      )}
                    </div>

                    {(result.spatial_id || result.parent_ulpin) && (
                      <div className="search-result-id">
                        {result.result_type === "unit" ? "3D ULPIN: " : "Parent ULPIN: "}
                        {result.result_type === "unit" ? result.spatial_id : result.parent_ulpin}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="sidebar-section">
            <h3>Cadastral Hierarchy</h3>

            <div className="hierarchy-tree block-hierarchy">
              {(hierarchy.blocks || []).map((block) => (
                <details
                  className={
                    selectedProperty?.blockCode === block.code
                      ? "hierarchy-block selected"
                      : "hierarchy-block"
                  }
                  key={block.code}
                  data-hierarchy-block={block.code}
                >
                  <summary>
                    <strong>BLOCK {block.code}</strong>
                    <span>{block.plotCount} plots · {block.buildingCount} buildings</span>
                  </summary>

                  <div className="hierarchy-block-content">
                    {block.plots.map((plot) => {
                      const plotSelected =
                        selectedProperty?.parentUlpIn === plot.ulpin &&
                        selectedProperty?.type === "Land Parcel";

                      return (
                        <div
                          className={plotSelected ? "hierarchy-plot selected" : "hierarchy-plot"}
                          key={plot.ulpin}
                        >
                          <button
                            type="button"
                            className="hierarchy-plot-title hierarchy-plot-button"
                            onClick={() => focusSearchResult(hierarchyPlotTarget(plot))}
                            title={`Focus ${plot.name}`}
                          >
                            <strong>
                              {plot.addressCode !== "—" ? `${plot.addressCode} · ` : ""}
                              {plot.name}
                            </strong>
                            <span>{plot.ulpin}</span>
                          </button>

                          {plot.buildings.map((building) => {
                            const buildingSelected =
                              selectedProperty?.building &&
                              selectedProperty.building !== "—" &&
                              selectedProperty?.addressCode === building.addressCode;
                            const selectedFloorNumber = buildingSelected
                              ? Number(selectedProperty?.floor)
                              : 0;
                            const selectedUnitLetter = buildingSelected
                              ? String(selectedProperty?.unit || "").toUpperCase().match(/([A-Z])$/)?.[1]
                              : null;

                            return (
                              <div
                                className={
                                  buildingSelected
                                    ? "hierarchy-building selected"
                                    : "hierarchy-building"
                                }
                                key={`${plot.ulpin}-${building.code}`}
                                data-hierarchy-address={building.addressCode}
                              >
                                <button
                                  type="button"
                                  className="hierarchy-building-button"
                                  onClick={() => focusSearchResult(hierarchyBuildingTarget(plot, building))}
                                  title={`Focus building ${building.addressCode}`}
                                >
                                  <strong>↳ {building.addressCode}</strong>
                                  <span>
                                    {building.code} · {building.floorCount} floors
                                    {building.unitsPerFloor > 1
                                      ? ` · ${building.unitsPerFloor} units/floor`
                                      : ""}
                                  </span>
                                </button>

                                {buildingSelected && building.floorCount > 0 && (
                                  <div className="hierarchy-building-drilldown">
                                    <div className="hierarchy-drilldown-label">Floors</div>
                                    <div className="hierarchy-floor-grid">
                                      {Array.from({ length: building.floorCount }, (_, index) => index + 1).map((floorNumber) => (
                                        <button
                                          type="button"
                                          key={floorNumber}
                                          className={
                                            selectedFloorNumber === floorNumber
                                              ? "hierarchy-floor-button selected"
                                              : "hierarchy-floor-button"
                                          }
                                          onClick={() =>
                                            focusSearchResult(
                                              hierarchyFloorTarget(plot, building, floorNumber)
                                            )
                                          }
                                        >
                                          {floorNumber}
                                        </button>
                                      ))}
                                    </div>

                                    {Number.isFinite(selectedFloorNumber) &&
                                      selectedFloorNumber > 0 &&
                                      building.unitsPerFloor > 0 && (
                                        <div className="hierarchy-unit-drilldown">
                                          <div className="hierarchy-drilldown-label">Floor {selectedFloorNumber} apartments</div>
                                          <div className="hierarchy-unit-grid">
                                            {Array.from(
                                              { length: building.unitsPerFloor },
                                              (_, index) => String.fromCharCode(65 + index)
                                            ).map((letter) => (
                                              <button
                                                type="button"
                                                key={letter}
                                                className={
                                                  selectedUnitLetter === letter
                                                    ? "hierarchy-unit-button selected"
                                                    : "hierarchy-unit-button"
                                                }
                                                onClick={() =>
                                                  focusSearchResult(
                                                    hierarchyUnitTarget(
                                                      plot,
                                                      building,
                                                      selectedFloorNumber,
                                                      letter
                                                    )
                                                  )
                                                }
                                              >
                                                {selectedFloorNumber}-{letter}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="sidebar-section">
            <h3>Layers</h3>

            {[
              ["blocks", "Block Boundaries / Labels"],
              ["parcels", "Land Plots"],
              ["buildings", "Buildings / GIS"],
              ["roads", "Road Network"],
              ["amenities", "Parks / Parking / Civic Spaces"],
              ["landscape", "Trees / Landscape / Entrance"],
              ["markings", "Road Markings / Crossings"],
              ["signals", "Traffic Signals"],
              ["mobility", "Vehicles / Transit / EV / Signs"],
              ["lights", "Modern Street Lights"],
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
              <span className="legend landscape" />
              Trees / Landscape / Entrance
            </div>

            <div className="legend-item">
              <span className="legend marking" />
              Road Markings
            </div>

            <div className="legend-item">
              <span className="legend signal" />
              Traffic Signals
            </div>

            <div className="legend-item">
              <span className="legend light" />
              Modern Street Lights
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
              value={hierarchy.totals.registeredUnits || 0}
              label="3D Units"
            />
          </div>

          <div className="camera-controls">
            <div className="view-mode-row">
              <button className={viewMode === "city" ? "view-mode-button active" : "view-mode-button"} onClick={applyCityView}>
                City View
              </button>
              <button className={viewMode === "cadastral" ? "view-mode-button active" : "view-mode-button"} onClick={applyCadastralView}>
                Cadastral View
              </button>
            </div>
            <div className="camera-controls-row">
              <button onClick={() => sendCameraCommand("township")}>Township</button>
              <button onClick={() => sendCameraCommand("top")}>Top</button>
              <button onClick={() => sendCameraCommand("street")}>Street</button>
              <button
                className="focus-building-button"
                disabled={!selectedProperty?.building || selectedProperty.building === "—"}
                onClick={() =>
                  sendCameraCommand("focusBuilding", {
                    parentUlpIn: selectedProperty?.parentUlpIn,
                    building: selectedProperty?.building,
                  })
                }
              >
                Focus Selected
              </button>
              <button onClick={() => sendCameraCommand("reset")}>Reset</button>
            </div>

            <div className="camera-help">
              City View emphasizes the built township. Click a building to reveal its floors, click a floor to reveal its apartments, and click an apartment to read its cadastral information. Double-click keeps the building as the camera orbit pivot.
            </div>
          </div>

          <CesiumViewer
            key={sceneVersion}
            onSelect={handleMapSelect}
            layers={layers}
            viewMode={viewMode}
            cameraCommand={cameraCommand}
            searchText={mapSearchText}
            searchTarget={mapSearchTarget}
            searchTrigger={searchTrigger}
            onSearchResult={handleSearchResult}
            validationTrigger={validationTrigger}
            resetTrigger={resetTrigger}
            selectionClearTrigger={selectionClearTrigger}
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

        {selectedProperty && (
          <PropertyInformation
            selectedProperty={selectedProperty}
            hierarchy={hierarchy}
            onNavigate={focusSearchResult}
            onClose={closeCadastralInspection}
          />
        )}
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

function PropertyInformation({ selectedProperty, hierarchy, onNavigate, onClose }) {
  if (!selectedProperty) {
    return (
      <aside className="property-panel">
        <h2>Cadastral Information</h2>
        <div className="empty-property">
          Search a block address, plot, building, floor or apartment — or click an object on the map.
        </div>
        <SelectionLegend />
      </aside>
    );
  }

  const plot = hierarchy.plots.find(
    (item) => item.ulpin === selectedProperty.parentUlpIn
  );
  const building = plot?.buildings.find(
    (item) => item.code === selectedProperty.building
  );
  const block = (hierarchy.blocks || []).find(
    (item) => item.code === selectedProperty.blockCode
  );

  const effectiveAddress =
    selectedProperty.addressCode && selectedProperty.addressCode !== "—"
      ? selectedProperty.addressCode
      : building?.addressCode || plot?.addressCode || "—";
  const effectiveFloors = Number(
    selectedProperty.floorCount || building?.floorCount || 0
  );
  const effectiveUnitsPerFloor = Number(
    selectedProperty.unitsPerFloor || building?.unitsPerFloor || 0
  );
  const effectiveFloorHeight = Number(
    selectedProperty.floorHeight || building?.floorHeight || 3.2
  );
  const blockCode = selectedProperty.blockCode || building?.blockCode || plot?.blockCode || "—";

  function blockTarget() {
    return {
      result_type: "block",
      target_type: "block",
      target_id: `block:${blockCode}`,
      title: `Block ${blockCode}`,
      block_code: blockCode,
      parent_ulpin: null,
    };
  }

  function plotTarget() {
    return {
      result_type: "plot",
      target_type: "plot",
      target_id: `plot:${selectedProperty.parentUlpIn}`,
      title: plot?.name || `Plot ${effectiveAddress}`,
      block_code: blockCode,
      address_code: effectiveAddress,
      parent_ulpin: selectedProperty.parentUlpIn,
      plot_name: plot?.name,
    };
  }

  function buildingTarget() {
    return {
      result_type: "building",
      target_type: "building",
      target_id: `building:${effectiveAddress}`,
      title: effectiveAddress,
      subtitle: selectedProperty.buildingName || building?.name,
      block_code: blockCode,
      address_code: effectiveAddress,
      address_number: selectedProperty.addressNumber || building?.addressNumber,
      parent_ulpin: selectedProperty.parentUlpIn,
      plot_name: plot?.name,
      building_code: selectedProperty.building,
      building_name: selectedProperty.buildingName || building?.name,
      building_type: selectedProperty.buildingType || building?.buildingType,
      floors: effectiveFloors,
      units_per_floor: effectiveUnitsPerFloor,
      floor_height: effectiveFloorHeight,
      height_m: selectedProperty.heightMeters || building?.heightMeters,
    };
  }

  function floorTarget(floorNumber) {
    return {
      ...buildingTarget(),
      result_type: "floor",
      target_type: "floor",
      target_id: `floor:${effectiveAddress}:${floorNumber}`,
      title: `${effectiveAddress} · Floor ${floorNumber}`,
      subtitle: `${effectiveUnitsPerFloor} apartments · Block ${blockCode}`,
      floor: String(floorNumber),
      z_min: (floorNumber - 1) * effectiveFloorHeight,
      z_max: floorNumber * effectiveFloorHeight,
    };
  }

  function unitTarget(floorNumber, unitLetter) {
    const displayUnit = `${floorNumber}-${unitLetter}`;
    const spatialId = `${selectedProperty.parentUlpIn}-${String(effectiveAddress).replace(/-/g, "")}-F${String(floorNumber).padStart(2, "0")}-U${unitLetter}`;
    return {
      ...floorTarget(floorNumber),
      result_type: "unit",
      target_type: "unit",
      target_id: `unit:${effectiveAddress}:${floorNumber}:${unitLetter}`,
      title: `${effectiveAddress} · ${displayUnit}`,
      subtitle: `Floor ${floorNumber} · Apartment ${unitLetter}`,
      unit: unitLetter,
      display_unit: displayUnit,
      spatial_id: spatialId,
      property_id: spatialId,
    };
  }

  const selectedFloor = Number(selectedProperty.floor);
  const selectedUnitLetter = String(selectedProperty.unit || "")
    .toUpperCase()
    .match(/([A-Z])$/)?.[1];

  const breadcrumbs = [];
  if (blockCode !== "—") breadcrumbs.push({ label: `Block ${blockCode}`, target: blockTarget() });
  if (selectedProperty.parentUlpIn && selectedProperty.parentUlpIn !== "—") {
    breadcrumbs.push({ label: "Plot", target: plotTarget() });
  }
  if (selectedProperty.building && selectedProperty.building !== "—") {
    breadcrumbs.push({ label: effectiveAddress, target: buildingTarget() });
  }
  if (Number.isFinite(selectedFloor) && selectedFloor > 0) {
    breadcrumbs.push({ label: `Floor ${selectedFloor}`, target: floorTarget(selectedFloor) });
  }
  if (selectedProperty.type === "Virtual Apartment" && selectedUnitLetter) {
    breadcrumbs.push({ label: `${selectedFloor}-${selectedUnitLetter}`, target: unitTarget(selectedFloor, selectedUnitLetter) });
  }

  const upTarget =
    selectedProperty.type === "Virtual Apartment"
      ? floorTarget(selectedFloor)
      : selectedProperty.type === "Virtual Floor"
        ? buildingTarget()
        : selectedProperty.type === "Building Footprint"
          ? plotTarget()
          : selectedProperty.type === "Land Parcel"
            ? blockTarget()
            : null;

  return (
    <aside className="property-panel">
      <div className="panel-navigation">
        <div className="panel-navigation-head">
          <div className="cadastral-breadcrumbs">
            {breadcrumbs.map((crumb, index) => (
              <button
                type="button"
                key={`${crumb.label}-${index}`}
                className={index === breadcrumbs.length - 1 ? "breadcrumb-chip current" : "breadcrumb-chip"}
                onClick={() => index < breadcrumbs.length - 1 && onNavigate?.(crumb.target)}
                disabled={index === breadcrumbs.length - 1}
              >
                {crumb.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="close-inspection-button"
            onClick={() => onClose?.()}
            aria-label="Close cadastral inspection"
            title="Close inspection"
          >
            ×
          </button>
        </div>
        {upTarget && (
          <button type="button" className="up-level-button" onClick={() => onNavigate?.(upTarget)}>
            ← Up one level
          </button>
        )}
      </div>

      {selectedProperty.type === "Township Block" && (
        <>
          <div className="panel-type-badge block-badge">TOWNSHIP BLOCK</div>
          <h2>Block {blockCode}</h2>
          <InfoRow label="Plots" value={selectedProperty.plotCount ?? block?.plotCount ?? 0} />
          <InfoRow label="Buildings" value={selectedProperty.buildingCount ?? block?.buildingCount ?? 0} />
          <InfoRow label="Floors" value={block?.floorCount ?? 0} />
          <InfoRow label="Address Format" value={`${blockCode}-01, ${blockCode}-02, ...`} />
        </>
      )}

      {selectedProperty.type === "Land Parcel" && (
        <>
          <div className="panel-type-badge plot-badge">LAND PLOT</div>
          <h2>{plot?.name || selectedProperty.plotName || "Land Plot"}</h2>
          <InfoRow label="Block" value={blockCode} />
          <InfoRow label="Plot Address" value={effectiveAddress} />
          <InfoRow label="2D ULPIN" value={selectedProperty.parentUlpIn} />
          <InfoRow label="Buildings" value={plot?.buildingCount ?? 0} />
          <InfoRow label="Total Floors" value={plot?.floorCount ?? 0} />
          {plot?.buildings?.length > 0 && (
            <div className="relationship-box">
              <div className="relationship-title">Plot → Building</div>
              {plot.buildings.map((item) => (
                <button
                  type="button"
                  className="relationship-link"
                  key={item.code}
                  onClick={() => onNavigate?.({
                    result_type: "building",
                    target_type: "building",
                    target_id: `building:${item.addressCode}`,
                    title: item.addressCode,
                    block_code: item.blockCode,
                    address_code: item.addressCode,
                    address_number: item.addressNumber,
                    parent_ulpin: plot.ulpin,
                    plot_name: plot.name,
                    building_code: item.code,
                    building_name: item.name,
                    building_type: item.buildingType,
                    floors: item.floorCount,
                    units_per_floor: item.unitsPerFloor,
                    floor_height: item.floorHeight,
                    height_m: item.heightMeters,
                  })}
                >
                  <strong>{item.addressCode}</strong>
                  <span>{item.code} · {item.floorCount} floors</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {selectedProperty.type === "Building Footprint" && (
        <>
          <div className="panel-type-badge building-badge">BUILDING</div>
          <h2>{effectiveAddress}</h2>
          <div className="panel-subtitle">{selectedProperty.buildingName || building?.name}</div>
          <InfoRow label="Block" value={blockCode} />
          <InfoRow label="Building Address" value={effectiveAddress} />
          <InfoRow label="Legacy Code" value={selectedProperty.building} />
          <InfoRow label="Building Type" value={selectedProperty.buildingType || building?.buildingType} />
          <InfoRow label="Parent Plot" value={plot?.name || selectedProperty.plotName || "—"} />
          <InfoRow label="Parent 2D ULPIN" value={selectedProperty.parentUlpIn} />
          <InfoRow label="Floors" value={effectiveFloors} />
          <InfoRow label="Apartments / Floor" value={effectiveUnitsPerFloor > 0 ? effectiveUnitsPerFloor : "—"} />
          <InfoRow label="Registered 3D Units" value={effectiveUnitsPerFloor > 0 ? effectiveFloors * effectiveUnitsPerFloor : "—"} />
          <InfoRow label="Height" value={selectedProperty.heightMeters ? `${selectedProperty.heightMeters} m` : building?.heightMeters ? `${building.heightMeters} m` : "—"} />
          <div className="inspection-tip building-tip">
            <strong>Step 1 of 2: choose a floor</strong>
            <span>Apartments remain hidden until a floor is selected.</span>
          </div>
          {effectiveFloors > 0 && (
            <div className="relationship-box floor-directory">
              <div className="relationship-title">Building → Floors</div>
              <div className="floor-button-grid">
                {Array.from({ length: effectiveFloors }, (_, index) => index + 1).map((floorNumber) => (
                  <button
                    type="button"
                    className="floor-focus-button"
                    key={floorNumber}
                    onClick={() => onNavigate?.(floorTarget(floorNumber))}
                  >
                    Floor {floorNumber}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {selectedProperty.type === "Virtual Floor" && (
        <>
          <div className="panel-type-badge floor-badge">BUILDING FLOOR</div>
          <h2>{effectiveAddress} · Floor {selectedFloor}</h2>
          <div className="panel-subtitle">{selectedProperty.buildingName || building?.name}</div>
          <InfoRow label="Block" value={blockCode} />
          <InfoRow label="Building" value={effectiveAddress} />
          <InfoRow label="Floor" value={selectedFloor} />
          <InfoRow label="Parent 2D ULPIN" value={selectedProperty.parentUlpIn} />
          <InfoRow label="Vertical Range" value={selectedProperty.verticalRange} />
          <InfoRow label="Apartments on Floor" value={effectiveUnitsPerFloor} />
          <div className="inspection-tip floor-tip">
            <strong>Step 2 of 2: choose an apartment</strong>
            <span>Only apartments on Floor {selectedFloor} are now selectable on the 3D model.</span>
          </div>
          <div className="relationship-box unit-directory">
            <div className="relationship-title">Floor {selectedFloor} → Apartments</div>
            <div className="unit-chip-row large">
              {Array.from({ length: effectiveUnitsPerFloor }, (_, index) => String.fromCharCode(65 + index)).map((letter) => (
                <button
                  type="button"
                  className="unit-chip"
                  key={letter}
                  onClick={() => onNavigate?.(unitTarget(selectedFloor, letter))}
                >
                  {selectedFloor}-{letter}
                </button>
              ))}
            </div>
            <div className="switch-floor-row">
              <span>Switch floor:</span>
              <select
                value={selectedFloor}
                onChange={(event) => onNavigate?.(floorTarget(Number(event.target.value)))}
              >
                {Array.from({ length: effectiveFloors }, (_, index) => index + 1).map((floorNumber) => (
                  <option key={floorNumber} value={floorNumber}>Floor {floorNumber}</option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      {selectedProperty.type === "Virtual Apartment" && (
        <>
          <div className="panel-type-badge apartment-badge">APARTMENT / 3D UNIT</div>
          <h2>{effectiveAddress} · {selectedFloor}-{selectedUnitLetter}</h2>
          <InfoRow label="Block" value={blockCode} />
          <InfoRow label="Building" value={effectiveAddress} />
          <InfoRow label="Floor" value={selectedFloor} />
          <InfoRow label="Apartment" value={`${selectedFloor}-${selectedUnitLetter}`} />
          <InfoRow label="Parent 2D ULPIN" value={selectedProperty.parentUlpIn} />
          <InfoRow label="Vertical Range" value={selectedProperty.verticalRange} />
          <InfoRow label="Proposed 3D ULPIN" value={selectedProperty.propertyId} />
          <InfoRow label="Registry Status" value={selectedProperty.registryStatus || "Persisted in PostGIS"} />
          <div className="ulpin-notice">
            <strong>Unique linked 3D cadastral identity</strong>
            <span>Each apartment has its own persisted child identifier, 2D footprint and vertical Z-range linked to the parent land-parcel ULPIN.</span>
          </div>
          <div className="relationship-box">
            <div className="relationship-title">Cadastral Chain</div>
            <div className="relationship-path horizontal-path">
              <span>Block {blockCode}</span><b>›</b><span>{effectiveAddress}</span><b>›</b><span>F{selectedFloor}</span><b>›</b><span>{selectedFloor}-{selectedUnitLetter}</span>
            </div>
          </div>
        </>
      )}

      {!["Township Block", "Land Parcel", "Building Footprint", "Virtual Floor", "Virtual Apartment"].includes(selectedProperty.type) && (
        <>
          <div className="panel-type-badge property-badge">3D PROPERTY</div>
          <h2>Property Information</h2>
          <InfoRow label="Type" value={selectedProperty.type} />
          <InfoRow label="Block" value={selectedProperty.blockCode} />
          <InfoRow label="Address" value={effectiveAddress} />
          <InfoRow label="Parent Plot" value={plot?.name || "—"} />
          <InfoRow label="Parent ULPIN" value={selectedProperty.parentUlpIn} />
          <InfoRow label="Building" value={selectedProperty.building} />
          <InfoRow label="Floor" value={selectedProperty.floor} />
          <InfoRow label="Unit" value={selectedProperty.unit} />
          <InfoRow label="Vertical Range" value={selectedProperty.verticalRange} />
          <InfoRow label="Spatial ID" value={selectedProperty.propertyId} />
          <InfoRow label="Validation" value={selectedProperty.validation} />
        </>
      )}

      <SelectionLegend />
    </aside>
  );
}

function SelectionLegend() {
  return (
    <div className="selection-legend">
      <div className="selection-legend-title">Selection language</div>
      <span><i className="selection-swatch block" /> Block</span>
      <span><i className="selection-swatch plot" /> Plot</span>
      <span><i className="selection-swatch building" /> Building</span>
      <span><i className="selection-swatch floor" /> Floor</span>
      <span><i className="selection-swatch apartment" /> Apartment</span>
    </div>
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
