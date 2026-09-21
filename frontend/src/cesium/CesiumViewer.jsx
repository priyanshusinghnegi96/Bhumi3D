import {
  useEffect,
  useRef,
} from "react";

import {
  Viewer,
  Cartesian3,
  Color,
  PolygonHierarchy,
  HeadingPitchRange,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Ellipsoid,
  Cartographic,
  LabelStyle,
  VerticalOrigin,
  CallbackProperty,
  PolylineDashMaterialProperty,
  DistanceDisplayCondition,
  Matrix4,
  Rectangle,
  HeadingPitchRoll,
  Transforms,
  ImageMaterialProperty,
} from "cesium";

import {
  getScene,
  getGISFeatures,
  getColonyAssets,
  validateTopology,
  validateCadastral,
} from "../services/api";

import "cesium/Build/Cesium/Widgets/widgets.css";


function CesiumViewer({
  onSelect,

  layers,
  viewMode = "city",
  cameraCommand,

  searchText,
  searchTarget,
  searchTrigger,
  onSearchResult,

  validationTrigger,
  resetTrigger,
  selectionClearTrigger = 0,
  onValidationResult,

  footprintPickTrigger,
  footprintCancelTrigger,
  footprintUndoTrigger,
  footprintFinishTrigger,
  footprintMode = "rectangle",
  onFootprintPicked,
  onFootprintProgress,
}) {

  const cesiumContainer =
    useRef(null);

  const viewerRef =
    useRef(null);


  const townshipBoundsRef =
    useRef(null);

  const blockParcelsRef =
    useRef(new Map());

  const blockBoundsRef =
    useRef(new Map());

  const blockVisualsRef =
    useRef(new Map());

  const searchSelectionEntitiesRef =
    useRef([]);

  // Interactive building inspection is generated only for the
  // currently selected building.  This restores mouse-selectable
  // floors and apartments without permanently rendering thousands
  // of unit volumes across the entire township.
  const inspectionFloorEntitiesRef =
    useRef([]);

  const inspectionUnitEntitiesRef =
    useRef([]);

  const inspectionBuildingKeyRef =
    useRef(null);

  const inspectionFloorNumberRef =
    useRef(null);


  // ======================================================
  // SCENE REFERENCES
  // ======================================================

  const spatialObjectsRef =
    useRef([]);

  const layerEntitiesRef =
    useRef({
      blocks: [],
      parcels: [],
      buildings: [],
      roads: [],
      amenities: [],
      landscape: [],
      lights: [],
      markings: [],
      signals: [],
      mobility: [],
      apartments: [],
      parking: [],
      utilities: [],
    });


  const parcelsByUlpInRef =
    useRef(
      new Map()
    );


  const buildingsByKeyRef =
    useRef(
      new Map()
    );


  const visualDefaultsRef =
    useRef([]);


  // ======================================================
  // VALIDATION REFERENCES
  // ======================================================

  const conflictIdsRef =
    useRef(
      new Set()
    );


  const cadastralViolationsRef =
    useRef([]);


  // ======================================================
  // CLICK HANDLER
  // ======================================================

  const clickHandlerRef =
    useRef(null);


  // ======================================================
  // FOOTPRINT PICKING
  // ======================================================

  const footprintPickingRef =
    useRef(false);

  const footprintCornersRef =
    useRef([]);

  const footprintTemporaryEntitiesRef =
    useRef([]);


  const footprintPointEntitiesRef =
    useRef([]);


  const footprintModeRef =
    useRef("rectangle");


  const footprintHoverRef =
    useRef(null);


  // ======================================================
  // CALLBACK REFERENCES
  // ======================================================

  const onSelectRef =
    useRef(onSelect);

  const onSearchResultRef =
    useRef(onSearchResult);

  const onValidationResultRef =
    useRef(onValidationResult);

  const onFootprintPickedRef =
    useRef(onFootprintPicked);


  const onFootprintProgressRef =
    useRef(onFootprintProgress);


  useEffect(() => {

    onSelectRef.current =
      onSelect;

  }, [
    onSelect,
  ]);


  useEffect(() => {

    onSearchResultRef.current =
      onSearchResult;

  }, [
    onSearchResult,
  ]);


  useEffect(() => {

    onValidationResultRef.current =
      onValidationResult;

  }, [
    onValidationResult,
  ]);


  useEffect(() => {

    onFootprintPickedRef.current =
      onFootprintPicked;

  }, [
    onFootprintPicked,
  ]);


  useEffect(() => {

    onFootprintProgressRef.current =
      onFootprintProgress;

  }, [
    onFootprintProgress,
  ]);


  // ======================================================
  // BUILDING KEY
  // ======================================================

  function getBuildingKey(
    parentUlpIn,
    building
  ) {

    return (
      `${parentUlpIn}::${building}`
    );
  }


  // ======================================================
  // BUILDING-FOCUSED MOUSE ORBIT
  // ======================================================

  function focusBuilding(data) {
    const viewer = viewerRef.current;

    if (
      !viewer ||
      !data?.parentUlpIn ||
      !data?.building ||
      data.building === "—"
    ) {
      return false;
    }

    const building = buildingsByKeyRef.current.get(
      getBuildingKey(data.parentUlpIn, data.building)
    );

    if (
      !building ||
      !Number.isFinite(building.centerLon) ||
      !Number.isFinite(building.centerLat)
    ) {
      return false;
    }

    const totalHeight = Math.max(6, Number(building.totalHeight || 12));

    showBuildingFloorInspector(building);

    const target = Cartesian3.fromDegrees(
      building.centerLon,
      building.centerLat,
      totalHeight * 0.35
    );

    // lookAt keeps the selected building as the camera pivot.
    // Cesium's normal mouse controls can then orbit 360° around it.
    viewer.camera.lookAt(
      target,
      new HeadingPitchRange(
        CesiumMath.toRadians(35),
        CesiumMath.toRadians(-18),
        Math.max(45, totalHeight * 3.2)
      )
    );

    return true;
  }


  // ======================================================
  // ROAD-SURFACE MARKING TEXTURES
  // ======================================================

  function createRoadTextCanvas(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 320;

    const context = canvas.getContext("2d");
    if (!context) return canvas;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "white";
    context.textAlign = "center";
    context.textBaseline = "middle";

    const lines = String(text || "")
      .toUpperCase()
      .split("\n")
      .filter(Boolean);

    const fontSize = lines.length > 1 ? 92 : 110;
    context.font = `900 ${fontSize}px Arial, sans-serif`;

    const lineHeight = fontSize * 1.02;
    const totalHeight = lineHeight * Math.max(1, lines.length);
    const startY = canvas.height / 2 - totalHeight / 2 + lineHeight / 2;

    lines.forEach((line, index) => {
      context.fillText(line, canvas.width / 2, startY + index * lineHeight);
    });

    return canvas;
  }


  function createRoadArrowCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;

    const context = canvas.getContext("2d");
    if (!context) return canvas;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "white";
    context.beginPath();
    context.moveTo(128, 18);
    context.lineTo(235, 165);
    context.lineTo(168, 165);
    context.lineTo(168, 470);
    context.lineTo(88, 470);
    context.lineTo(88, 165);
    context.lineTo(21, 165);
    context.closePath();
    context.fill();

    return canvas;
  }


  function roadRectangle(longitude, latitude, widthM, heightM) {
    const latitudeRadians = CesiumMath.toRadians(latitude);
    const latDegrees = heightM / 111320;
    const lonDegrees = widthM / (
      111320 * Math.max(0.25, Math.cos(latitudeRadians))
    );

    return Rectangle.fromDegrees(
      longitude - lonDegrees / 2,
      latitude - latDegrees / 2,
      longitude + lonDegrees / 2,
      latitude + latDegrees / 2
    );
  }


  // ======================================================
  // STEP 3.6 LOCAL MOBILITY GEOMETRY HELPERS
  // ======================================================

  function offsetLonLat(longitude, latitude, forwardM, lateralM, headingDeg) {
    const angle = CesiumMath.toRadians(headingDeg);
    const eastM = forwardM * Math.cos(angle) - lateralM * Math.sin(angle);
    const northM = forwardM * Math.sin(angle) + lateralM * Math.cos(angle);
    const latitudeRadians = CesiumMath.toRadians(latitude);
    const metresPerLonDegree = 111320 * Math.max(0.25, Math.cos(latitudeRadians));

    return [
      longitude + eastM / metresPerLonDegree,
      latitude + northM / 111320,
    ];
  }


  function localHeadingOrientation(longitude, latitude, altitude, headingDeg) {
    const position = Cartesian3.fromDegrees(longitude, latitude, altitude);

    // Backend headings use 0° = east/west road axis, 90° = north/south.
    // A box's local X axis already points east in Cesium's ENU frame, so
    // the old 90° subtraction rotated every vehicle across its road.
    const heading = CesiumMath.toRadians(headingDeg);

    return Transforms.headingPitchRollQuaternion(
      position,
      new HeadingPitchRoll(heading, 0, 0)
    );
  }


  // ======================================================
  // GEOMETRY → CESIUM POSITIONS
  // ======================================================

  function geometryToPositions(
    geometry
  ) {

    if (
      !geometry ||
      geometry.type !== "Polygon"
    ) {

      return [];
    }


    let ring =
      geometry.coordinates[0];


    if (
      ring.length > 1 &&
      ring[0][0] ===
        ring[ring.length - 1][0] &&
      ring[0][1] ===
        ring[ring.length - 1][1]
    ) {

      ring =
        ring.slice(
          0,
          -1
        );
    }


    return ring.map(
      (
        [
          longitude,
          latitude,
        ]
      ) =>

        Cartesian3.fromDegrees(
          longitude,
          latitude
        )
    );
  }


  // ======================================================
  // LINESTRING → CESIUM POSITIONS
  // ======================================================

  function lineStringToPositions(geometry, height = 0.58) {
    if (!geometry || geometry.type !== "LineString") {
      return [];
    }

    return geometry.coordinates.map(([longitude, latitude]) =>
      Cartesian3.fromDegrees(longitude, latitude, height)
    );
  }


  // ======================================================
  // GEOMETRY BOUNDS
  // ======================================================

  function getGeometryBounds(
    geometry
  ) {

    const coordinates =
      geometry.coordinates[0];


    const longitudes =
      coordinates.map(
        (coordinate) =>
          coordinate[0]
      );


    const latitudes =
      coordinates.map(
        (coordinate) =>
          coordinate[1]
      );


    return {
      minLon:
        Math.min(
          ...longitudes
        ),

      maxLon:
        Math.max(
          ...longitudes
        ),

      minLat:
        Math.min(
          ...latitudes
        ),

      maxLat:
        Math.max(
          ...latitudes
        ),
    };
  }


  // ======================================================
  // ENTITY INFORMATION
  // ======================================================

  function getEntityData(
    entity
  ) {

    const viewer =
      viewerRef.current;


    if (
      !viewer ||
      !entity ||
      !entity.properties
    ) {

      return null;
    }


    const time =
      viewer.clock.currentTime;


    return {
      type:
        entity.properties.type
          ?.getValue(time)
          ?? "—",

      parentUlpIn:
        entity.properties.parentUlpIn
          ?.getValue(time)
          ?? "—",

      propertyId:
        entity.properties.propertyId
          ?.getValue(time)
          ?? "—",

      building:
        entity.properties.building
          ?.getValue(time)
          ?? "—",

      floor:
        entity.properties.floor
          ?.getValue(time)
          ?? "—",

      unit:
        entity.properties.unit
          ?.getValue(time)
          ?? "—",

      verticalRange:
        entity.properties.verticalRange
          ?.getValue(time)
          ?? "—",

      validation:
        entity.properties.validation
          ?.getValue(time)
          ?? "Not checked",

      blockCode:
        entity.properties.blockCode
          ?.getValue(time)
          ?? "—",

      addressCode:
        entity.properties.addressCode
          ?.getValue(time)
          ?? "—",

      addressNumber:
        entity.properties.addressNumber
          ?.getValue(time)
          ?? null,

      buildingName:
        entity.properties.buildingName
          ?.getValue(time)
          ?? "—",

      buildingType:
        entity.properties.buildingType
          ?.getValue(time)
          ?? "—",

      floorCount:
        entity.properties.floorCount
          ?.getValue(time)
          ?? 0,

      unitsPerFloor:
        entity.properties.unitsPerFloor
          ?.getValue(time)
          ?? 0,

      floorHeight:
        entity.properties.floorHeight
          ?.getValue(time)
          ?? 0,

      heightMeters:
        entity.properties.heightMeters
          ?.getValue(time)
          ?? 0,
    };
  }


  // ======================================================
  // SET VALIDATION TEXT
  // ======================================================

  function setValidation(
    entity,
    value
  ) {

    const property =
      entity
        ?.properties
        ?.validation;


    if (
      property &&
      property.setValue
    ) {

      property.setValue(
        value
      );
    }
  }


  // ======================================================
  // STORE ORIGINAL VISUAL STYLE
  // ======================================================

  function registerVisualDefault(
    entity,
    material,
    outlineColor
  ) {

    visualDefaultsRef
      .current
      .push({
        entity,
        material,
        outlineColor,
      });
  }


  // ======================================================
  // HIGHLIGHT CADASTRAL VIOLATION
  // ======================================================

  function applyCadastralViolationStyle(
    violation
  ) {

    // ----------------------------------------------------
    // PARENT PLOT
    // ----------------------------------------------------

    const parcel =
      parcelsByUlpInRef
        .current
        .get(
          violation.parent_ulpin
        );


    if (
      parcel?.polygon
    ) {

      parcel
        .polygon
        .material =
          Color.RED
            .withAlpha(
              0.55
            );


      parcel
        .polygon
        .outlineColor =
          Color.DARKRED;
    }


    // ----------------------------------------------------
    // BUILDING
    // ----------------------------------------------------

    const buildingKey =
      getBuildingKey(
        violation.parent_ulpin,
        violation.building_code
      );


    const building =
      buildingsByKeyRef
        .current
        .get(
          buildingKey
        );


    if (!building) {
      return;
    }


    for (
      const footprint
      of building.footprints
    ) {

      if (
        footprint.polygon
      ) {

        footprint
          .polygon
          .material =
            Color.RED
              .withAlpha(
                0.85
              );


        footprint
          .polygon
          .outlineColor =
            Color.YELLOW;


        setValidation(
          footprint,
          "BOUNDARY VIOLATION"
        );
      }
    }


    for (
      const slab
      of building.slabs
    ) {

      if (
        slab.polygon
      ) {

        slab
          .polygon
          .material =
            Color.RED
              .withAlpha(
                0.30
              );


        slab
          .polygon
          .outlineColor =
            Color.RED;


        setValidation(
          slab,
          "BOUNDARY VIOLATION"
        );
      }
    }


    for (
      const labelEntity
      of building.labels
    ) {

      if (
        labelEntity.label
      ) {

        labelEntity
          .label
          .fillColor =
            Color.RED;
      }


      setValidation(
        labelEntity,
        "BOUNDARY VIOLATION"
      );
    }
  }


  // ======================================================
  // REAPPLY ALL CADASTRAL VIOLATIONS
  // ======================================================

  function reapplyCadastralViolations() {

    for (
      const violation
      of cadastralViolationsRef.current
    ) {

      applyCadastralViolationStyle(
        violation
      );
    }
  }


  // ======================================================
  // RESTORE NORMAL COLORS
  // ======================================================

  function restoreVisuals() {

    for (
      const visual
      of visualDefaultsRef.current
    ) {

      if (
        visual.entity?.polygon
      ) {

        visual.entity
          .polygon
          .material =
            visual.material;


        visual.entity
          .polygon
          .outlineColor =
            visual.outlineColor;
      }
    }


    // Reset building labels and validation status

    for (
      const building
      of buildingsByKeyRef
        .current
        .values()
    ) {

      for (
        const footprint
        of building.footprints
      ) {

        setValidation(
          footprint,
          "GIS source"
        );
      }


      for (
        const slab
        of building.slabs
      ) {

        setValidation(
          slab,
          "GIS source"
        );
      }


      for (
        const labelEntity
        of building.labels
      ) {

        if (
          labelEntity.label
        ) {

          labelEntity
            .label
            .fillColor =
              Color.WHITE;
        }


        setValidation(
          labelEntity,
          "GIS source"
        );
      }
    }


    // ----------------------------------------------------
    // REAPPLY 3D PROPERTY CONFLICTS
    // ----------------------------------------------------

    for (
      const object
      of spatialObjectsRef.current
    ) {

      if (
        conflictIdsRef
          .current
          .has(
            object.propertyId
          )
      ) {

        object.entity
          .polygon
          .material =
            Color.RED
              .withAlpha(
                0.95
              );


        object.entity
          .polygon
          .outlineColor =
            Color.DARKRED;
      }
    }


    // ----------------------------------------------------
    // REAPPLY BUILDING/PLOT VIOLATIONS
    // ----------------------------------------------------

    reapplyCadastralViolations();
  }


  // ======================================================
  // HIGHLIGHT BUILDING
  // ======================================================

  function dimUnselectedBuildings(selectedBuildingKey = null) {
    for (const [key, building] of buildingsByKeyRef.current.entries()) {
      const isSelected = selectedBuildingKey && key === selectedBuildingKey;
      if (isSelected) continue;

      for (const footprint of building.footprints || []) {
        if (!footprint?.polygon) continue;
        footprint.polygon.material = Color.fromCssColorString("#aab2b0").withAlpha(0.26);
        footprint.polygon.outlineColor = Color.fromCssColorString("#87918d").withAlpha(0.25);
      }
      for (const labelEntity of building.labels || []) {
        if (labelEntity?.label) {
          labelEntity.label.fillColor = Color.WHITE.withAlpha(0.22);
        }
      }
    }
  }

  function highlightBuildingVisuals(building) {
    if (!building) return;

    for (const footprint of building.footprints || []) {
      if (!footprint?.polygon) continue;
      footprint.polygon.material = Color.fromCssColorString("#2563eb").withAlpha(0.86);
      footprint.polygon.outlineColor = Color.fromCssColorString("#bfdbfe");
    }

    for (const slab of building.slabs || []) {
      if (slab?.polygon) {
        slab.polygon.material = Color.fromCssColorString("#60a5fa").withAlpha(0.22);
        slab.polygon.outlineColor = Color.fromCssColorString("#dbeafe").withAlpha(0.72);
      }
    }

    for (const labelEntity of building.labels || []) {
      if (labelEntity?.label) {
        labelEntity.label.fillColor = Color.fromCssColorString("#dbeafe");
      }
    }
  }

  function highlightRelationship(data, exactEntity = null) {
    restoreVisuals();
    if (!data) return;

    const parcel = parcelsByUlpInRef.current.get(data.parentUlpIn);

    // Block = cyan/teal.  Never use the generic exact-entity highlight
    // for regional/ground assets because a single accidental ground click
    // can otherwise repaint the entire scene.
    if (data.type === "Township Block") {
      const blockCode = data.blockCode;
      const parcels = blockParcelsRef.current.get(blockCode) || [];
      for (const blockParcel of parcels) {
        if (!blockParcel?.polygon) continue;
        blockParcel.polygon.material = Color.fromCssColorString("#06b6d4").withAlpha(0.16);
        blockParcel.polygon.outlineColor = Color.fromCssColorString("#22d3ee");
      }
      reapplyCadastralViolations();
      return;
    }

    // Plot = green.
    if (data.type === "Land Parcel") {
      if (parcel?.polygon) {
        parcel.polygon.material = Color.fromCssColorString("#22c55e").withAlpha(0.30);
        parcel.polygon.outlineColor = Color.fromCssColorString("#86efac");
      }
      reapplyCadastralViolations();
      return;
    }

    const hasBuilding = data.building && data.building !== "—";
    const buildingKey = hasBuilding
      ? getBuildingKey(data.parentUlpIn, data.building)
      : null;
    const building = buildingKey
      ? buildingsByKeyRef.current.get(buildingKey)
      : null;

    if (building) {
      dimUnselectedBuildings(buildingKey);
      if (parcel?.polygon) {
        parcel.polygon.material = Color.fromCssColorString("#22c55e").withAlpha(0.10);
        parcel.polygon.outlineColor = Color.fromCssColorString("#4ade80").withAlpha(0.85);
      }
      highlightBuildingVisuals(building);
    }

    // Floor = orange.
    if (data.type === "Virtual Floor" && exactEntity?.polygon) {
      exactEntity.polygon.material = Color.fromCssColorString("#f59e0b").withAlpha(0.48);
      exactEntity.polygon.outlineColor = Color.fromCssColorString("#fdba74");
    }

    // Apartment = magenta/purple.
    if (data.type === "Virtual Apartment" && exactEntity?.polygon) {
      exactEntity.polygon.material = Color.fromCssColorString("#d946ef").withAlpha(0.86);
      exactEntity.polygon.outlineColor = Color.fromCssColorString("#f5d0fe");
    }

    // Legacy cadastral property volumes remain purple, but infrastructure,
    // roads, landscape and the regional ground are never force-highlighted.
    if (
      exactEntity?.polygon &&
      ["3D Property", "Apartment", "Basement Parking", "Underground Utility"].includes(data.type)
    ) {
      exactEntity.polygon.material = Color.fromCssColorString("#8b5cf6").withAlpha(0.78);
      exactEntity.polygon.outlineColor = Color.fromCssColorString("#ddd6fe");
    }

    reapplyCadastralViolations();
  }

  // ======================================================
  // SEARCH SELECTION OVERLAYS
  // ======================================================

  function clearSearchSelection() {
    const viewer = viewerRef.current;
    if (!viewer) return;

    for (const entity of searchSelectionEntitiesRef.current) {
      viewer.entities.remove(entity);
    }

    searchSelectionEntitiesRef.current = [];
  }


  // ======================================================
  // INTERACTIVE FLOOR / APARTMENT INSPECTION
  // ======================================================

  function clearInspectionUnits() {
    const viewer = viewerRef.current;
    if (!viewer) return;

    for (const entity of inspectionUnitEntitiesRef.current) {
      viewer.entities.remove(entity);
    }

    inspectionUnitEntitiesRef.current = [];
    inspectionFloorNumberRef.current = null;
  }

  function clearBuildingInspection({ restore = true } = {}) {
    const viewer = viewerRef.current;
    if (!viewer) return;

    clearInspectionUnits();

    for (const entity of inspectionFloorEntitiesRef.current) {
      viewer.entities.remove(entity);
    }

    inspectionFloorEntitiesRef.current = [];
    inspectionBuildingKeyRef.current = null;

    if (restore) {
      restoreVisuals();
    }
  }

  function virtualFloorId(building, floorNumber) {
    const compactAddress = String(building.addressCode || building.buildingCode || "BLDG")
      .replace(/-/g, "");
    return `${building.parentUlpIn}-${compactAddress}-F${String(floorNumber).padStart(2, "0")}`;
  }

  function virtualSpatialId(building, floorNumber, unitLetter) {
    return `${virtualFloorId(building, floorNumber)}-U${unitLetter}`;
  }

  function inspectionBoundsPositions(building, expandMeters = 0.30) {
    const bounds = building?.bounds;
    if (!bounds) return null;

    const latitude = (bounds.minLat + bounds.maxLat) / 2;
    const latExpand = expandMeters / 111320;
    const lonExpand = expandMeters / (
      111320 * Math.max(0.25, Math.cos(CesiumMath.toRadians(latitude)))
    );

    return {
      minLon: bounds.minLon - lonExpand,
      maxLon: bounds.maxLon + lonExpand,
      minLat: bounds.minLat - latExpand,
      maxLat: bounds.maxLat + latExpand,
      positions: [
        Cartesian3.fromDegrees(bounds.minLon - lonExpand, bounds.minLat - latExpand),
        Cartesian3.fromDegrees(bounds.maxLon + lonExpand, bounds.minLat - latExpand),
        Cartesian3.fromDegrees(bounds.maxLon + lonExpand, bounds.maxLat + latExpand),
        Cartesian3.fromDegrees(bounds.minLon - lonExpand, bounds.maxLat + latExpand),
      ],
    };
  }

  function inspectionProperties(building, {
    type,
    floor = "—",
    unit = "—",
    propertyId,
    verticalRange,
  }) {
    return {
      type,
      parentUlpIn: building.parentUlpIn,
      propertyId,
      building: building.buildingCode,
      floor: String(floor),
      unit,
      verticalRange,
      validation: type === "Virtual Apartment"
        ? "Registered PostGIS 3D cadastral unit"
        : type === "Virtual Floor"
          ? "Derived vertical floor layer"
          : "Interactive cadastral volume",
      blockCode: building.blockCode,
      addressCode: building.addressCode,
      addressNumber: building.addressNumber,
      buildingName: building.buildingName,
      buildingType: building.buildingType,
      floorCount: building.floors,
      unitsPerFloor: building.unitsPerFloor,
      floorHeight: building.floorHeight,
      heightMeters: building.totalHeight,
    };
  }

  function applyInspectionBuildingStyle(building) {
    if (!building) return;

    // X-ray the selected building only while its logical cadastral
    // floors/units are being inspected.  This makes inner volumes
    // visible and pickable without changing normal City View styling.
    for (const footprint of building.footprints || []) {
      if (!footprint?.polygon) continue;
      footprint.polygon.material = Color.fromCssColorString("#2563eb").withAlpha(0.16);
      footprint.polygon.outlineColor = Color.fromCssColorString("#93c5fd").withAlpha(0.95);
    }
  }

  function showBuildingFloorInspector(building) {
    const viewer = viewerRef.current;
    if (!viewer || !building?.bounds) return false;

    const buildingKey = getBuildingKey(building.parentUlpIn, building.buildingCode);
    const floorCount = Math.max(0, Number(building.floors || 0));
    const floorHeight = Math.max(0.1, Number(building.floorHeight || 3.2));

    if (floorCount < 1) return false;

    const alreadyBuilt =
      inspectionBuildingKeyRef.current === buildingKey &&
      inspectionFloorEntitiesRef.current.length === floorCount;

    if (!alreadyBuilt) {
      clearBuildingInspection({ restore: false });
      inspectionBuildingKeyRef.current = buildingKey;

      const expanded = inspectionBoundsPositions(building, 0.34);
      if (!expanded) return false;

      const shellColor = Color.fromCssColorString("#dcecf3");
      const outlineColor = Color.fromCssColorString("#b9d3de");
      const maxDistance = Math.max(260, Number(building.totalHeight || 20) * 7.5);

      for (let floorNumber = 1; floorNumber <= floorCount; floorNumber += 1) {
        const zMin = (floorNumber - 1) * floorHeight;
        const zMax = floorNumber * floorHeight;

        const entity = viewer.entities.add({
          id: `inspect-floor-${building.addressCode}-${floorNumber}`,
          name: `${building.addressCode} Floor ${floorNumber}`,
          show: true,
          polygon: {
            hierarchy: new PolygonHierarchy(expanded.positions),
            height: zMin + 0.035,
            extrudedHeight: Math.max(zMin + 0.16, zMax - 0.045),
            material: shellColor.withAlpha(0.055),
            outline: true,
            outlineColor: outlineColor.withAlpha(0.50),
            distanceDisplayCondition: new DistanceDisplayCondition(0, maxDistance),
          },
          properties: inspectionProperties(building, {
            type: "Virtual Floor",
            floor: floorNumber,
            propertyId: virtualFloorId(building, floorNumber),
            verticalRange: `${zMin.toFixed(2)}m – ${zMax.toFixed(2)}m`,
          }),
        });

        inspectionFloorEntitiesRef.current.push(entity);
      }
    }

    applyInspectionBuildingStyle(building);
    return true;
  }

  function resetInspectionFloorStyles() {
    for (const floorEntity of inspectionFloorEntitiesRef.current) {
      if (!floorEntity?.polygon) continue;
      floorEntity.polygon.material = Color.fromCssColorString("#dbeafe").withAlpha(0.045);
      floorEntity.polygon.outlineColor = Color.fromCssColorString("#93c5fd").withAlpha(0.38);
    }
  }

  function showFloorUnitInspector(building, floorNumber, selectedUnitLetter = null) {
    const viewer = viewerRef.current;
    if (!viewer || !building?.bounds) return false;

    const floorCount = Math.max(0, Number(building.floors || 0));
    const floorHeight = Math.max(0.1, Number(building.floorHeight || 3.2));
    const unitsPerFloor = Math.max(0, Number(building.unitsPerFloor || 0));
    const safeFloor = Number(floorNumber);

    if (
      !Number.isFinite(safeFloor) ||
      safeFloor < 1 ||
      safeFloor > floorCount ||
      unitsPerFloor < 1
    ) {
      return false;
    }

    showBuildingFloorInspector(building);
    clearInspectionUnits();
    inspectionFloorNumberRef.current = safeFloor;
    resetInspectionFloorStyles();

    const selectedFloorEntity = inspectionFloorEntitiesRef.current[safeFloor - 1];
    if (selectedFloorEntity?.polygon) {
      selectedFloorEntity.polygon.material = Color.fromCssColorString("#f59e0b").withAlpha(0.42);
      selectedFloorEntity.polygon.outlineColor = Color.fromCssColorString("#fed7aa");
    }

    const bounds = building.bounds;
    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const widthM = (bounds.maxLon - bounds.minLon) *
      111320 * Math.max(0.25, Math.cos(CesiumMath.toRadians(centerLat)));
    const depthM = (bounds.maxLat - bounds.minLat) * 111320;

    // Six apartments are laid out as 3×2 in a wide tower and 2×3
    // in a deep tower.  Other unit counts use a compact near-square grid.
    let columns;
    if (unitsPerFloor === 6) {
      columns = widthM >= depthM ? 3 : 2;
    } else {
      columns = Math.max(1, Math.min(unitsPerFloor, Math.ceil(Math.sqrt(unitsPerFloor))));
    }
    const rows = Math.ceil(unitsPerFloor / columns);
    const lonStep = (bounds.maxLon - bounds.minLon) / columns;
    const latStep = (bounds.maxLat - bounds.minLat) / rows;
    const insetRatio = 0.035;
    const zMin = (safeFloor - 1) * floorHeight;
    const zMax = safeFloor * floorHeight;
    const unitPalette = [
      "#a5b4fc",
      "#c4b5fd",
      "#bae6fd",
      "#bfdbfe",
      "#ddd6fe",
      "#c7d2fe",
      "#bae6fd",
      "#ddd6fe",
    ];

    for (let unitIndex = 0; unitIndex < unitsPerFloor; unitIndex += 1) {
      const columnIndex = unitIndex % columns;
      const rowIndex = Math.floor(unitIndex / columns);
      const unitLetter = String.fromCharCode(65 + unitIndex);
      const displayUnit = `${safeFloor}-${unitLetter}`;
      const minLon = bounds.minLon + columnIndex * lonStep + lonStep * insetRatio;
      const maxLon = bounds.minLon + (columnIndex + 1) * lonStep - lonStep * insetRatio;
      const minLat = bounds.minLat + rowIndex * latStep + latStep * insetRatio;
      const maxLat = bounds.minLat + (rowIndex + 1) * latStep - latStep * insetRatio;
      const isSelected =
        selectedUnitLetter &&
        String(selectedUnitLetter).toUpperCase() === unitLetter;

      const unitPositions = [
        Cartesian3.fromDegrees(minLon, minLat),
        Cartesian3.fromDegrees(maxLon, minLat),
        Cartesian3.fromDegrees(maxLon, maxLat),
        Cartesian3.fromDegrees(minLon, maxLat),
      ];

      const spatialId = virtualSpatialId(building, safeFloor, unitLetter);
      const unitEntity = viewer.entities.add({
        id: `inspect-unit-${building.addressCode}-${safeFloor}-${unitLetter}`,
        name: `${building.addressCode} Apartment ${displayUnit}`,
        show: true,
        polygon: {
          hierarchy: new PolygonHierarchy(unitPositions),
          height: zMin + 0.14,
          extrudedHeight: Math.max(zMin + 0.34, zMax - 0.10),
          material: isSelected
            ? Color.fromCssColorString("#d946ef").withAlpha(0.88)
            : Color.fromCssColorString(unitPalette[unitIndex % unitPalette.length]).withAlpha(0.46),
          outline: true,
          outlineColor: isSelected
            ? Color.fromCssColorString("#f5d0fe")
            : Color.fromCssColorString("#e0e7ff").withAlpha(0.88),
          distanceDisplayCondition: new DistanceDisplayCondition(0, Math.max(220, Number(building.totalHeight || 20) * 6.5)),
        },
        properties: inspectionProperties(building, {
          type: "Virtual Apartment",
          floor: safeFloor,
          unit: displayUnit,
          propertyId: spatialId,
          verticalRange: `${zMin.toFixed(2)}m – ${zMax.toFixed(2)}m`,
        }),
      });

      inspectionUnitEntitiesRef.current.push(unitEntity);
    }

    applyInspectionBuildingStyle(building);
    return true;
  }

  function buildingForSelectionData(data) {
    if (!data?.parentUlpIn || !data?.building || data.building === "—") {
      return null;
    }

    return buildingsByKeyRef.current.get(
      getBuildingKey(data.parentUlpIn, data.building)
    ) || null;
  }

  function unitLetterFromDisplay(value) {
    const match = String(value || "").toUpperCase().match(/(?:^|-)\s*([A-Z])$/);
    return match ? match[1] : null;
  }

  function isAllowedInspectionClick(data) {
    if (!data) return false;
    if (!inspectionBuildingKeyRef.current) {
      return [
        "Township Block",
        "Land Parcel",
        "Building Footprint",
        "3D Property",
        "Apartment",
        "Basement Parking",
        "Underground Utility",
      ].includes(data.type);
    }

    // Once a building is opened, enforce a strict drill-down workflow:
    // building -> floor -> apartment.  This prevents click-through to
    // hidden units or unrelated map assets behind the x-rayed tower.
    if (inspectionFloorNumberRef.current == null) {
      return data.type === "Virtual Floor";
    }

    return data.type === "Virtual Floor" || data.type === "Virtual Apartment";
  }

  function createParcelSelection(parentUlpIn) {
    const viewer = viewerRef.current;
    const parcel = parcelsByUlpInRef.current.get(parentUlpIn);

    if (!viewer || !parcel?.polygon?.hierarchy) return;

    const hierarchy = parcel.polygon.hierarchy.getValue(viewer.clock.currentTime);
    if (!hierarchy) return;

    const overlay = viewer.entities.add({
      id: `search-plot-${parentUlpIn}-${Date.now()}`,
      polygon: {
        hierarchy,
        height: 0.44,
        extrudedHeight: 0.52,
        material: Color.fromCssColorString("#22c55e").withAlpha(0.18),
        outline: true,
        outlineColor: Color.fromCssColorString("#86efac"),
      },
    });

    searchSelectionEntitiesRef.current.push(overlay);
  }


  function createFloorOrUnitSelection(building, target) {
    const viewer = viewerRef.current;
    const bounds = building?.bounds;

    if (!viewer || !bounds) return;

    const floorNumber = Number(target?.floor || 0);
    const floorHeight = Number(
      target?.floor_height || building.floorHeight || 3.2
    );

    if (!Number.isFinite(floorNumber) || floorNumber < 1) return;

    const zMin = Number.isFinite(Number(target?.z_min))
      ? Number(target.z_min)
      : (floorNumber - 1) * floorHeight;
    const zMax = Number.isFinite(Number(target?.z_max))
      ? Number(target.z_max)
      : floorNumber * floorHeight;

    let minLon = bounds.minLon;
    let maxLon = bounds.maxLon;
    let minLat = bounds.minLat;
    let maxLat = bounds.maxLat;

    if (target?.target_type === "unit" && target?.unit) {
      const unitsPerFloor = Math.max(
        1,
        Number(target?.units_per_floor || building.unitsPerFloor || 6)
      );
      const unitIndex = Math.max(
        0,
        String(target.unit).toUpperCase().charCodeAt(0) - 65
      );
      const centerLat = (bounds.minLat + bounds.maxLat) / 2;
      const widthM = (bounds.maxLon - bounds.minLon) *
        111320 * Math.max(0.25, Math.cos(CesiumMath.toRadians(centerLat)));
      const depthM = (bounds.maxLat - bounds.minLat) * 111320;
      const columns = unitsPerFloor === 6
        ? (widthM >= depthM ? 3 : 2)
        : Math.max(1, Math.min(unitsPerFloor, Math.ceil(Math.sqrt(unitsPerFloor))));
      const rows = Math.ceil(unitsPerFloor / columns);
      const columnIndex = unitIndex % columns;
      const rowIndex = Math.floor(unitIndex / columns);
      const lonStep = (bounds.maxLon - bounds.minLon) / columns;
      const latStep = (bounds.maxLat - bounds.minLat) / rows;
      const insetLon = lonStep * 0.06;
      const insetLat = latStep * 0.06;

      minLon = bounds.minLon + columnIndex * lonStep + insetLon;
      maxLon = bounds.minLon + (columnIndex + 1) * lonStep - insetLon;
      minLat = bounds.minLat + rowIndex * latStep + insetLat;
      maxLat = bounds.minLat + (rowIndex + 1) * latStep - insetLat;
    }

    const positions = [
      Cartesian3.fromDegrees(minLon, minLat),
      Cartesian3.fromDegrees(maxLon, minLat),
      Cartesian3.fromDegrees(maxLon, maxLat),
      Cartesian3.fromDegrees(minLon, maxLat),
    ];

    const volume = viewer.entities.add({
      id: `search-selection-${Date.now()}-${Math.random()}`,
      polygon: {
        hierarchy: new PolygonHierarchy(positions),
        height: zMin + 0.12,
        extrudedHeight: Math.max(zMin + 0.28, zMax - 0.08),
        material: target?.target_type === "unit"
          ? Color.fromCssColorString("#d946ef").withAlpha(0.82)
          : Color.fromCssColorString("#f59e0b").withAlpha(0.50),
        outline: true,
        outlineColor: target?.target_type === "unit"
          ? Color.fromCssColorString("#f5d0fe")
          : Color.fromCssColorString("#fed7aa"),
      },
    });

    const labelText = target?.target_type === "unit"
      ? `${target.address_code || building.addressCode} · ${target.display_unit || `${floorNumber}-${target.unit}`}`
      : `${target.address_code || building.addressCode} · Floor ${floorNumber}`;

    const label = viewer.entities.add({
      position: Cartesian3.fromDegrees(
        (minLon + maxLon) / 2,
        (minLat + maxLat) / 2,
        zMax + 2.2
      ),
      label: {
        text: labelText,
        font: "bold 15px sans-serif",
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 4,
        style: LabelStyle.FILL_AND_OUTLINE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        verticalOrigin: VerticalOrigin.BOTTOM,
      },
    });

    searchSelectionEntitiesRef.current.push(volume, label);
  }

  function focusBlock(blockCode) {
    const viewer = viewerRef.current;
    const bounds = blockBoundsRef.current.get(blockCode);
    const parcels = blockParcelsRef.current.get(blockCode) || [];

    if (!viewer || !bounds) return false;

    restoreVisuals();

    for (const parcel of parcels) {
      if (parcel?.polygon) {
        parcel.polygon.material = Color.fromCssColorString("#06b6d4").withAlpha(0.14);
        parcel.polygon.outlineColor = Color.fromCssColorString("#22d3ee");
      }
    }

    const overlayPositions = [
      Cartesian3.fromDegrees(bounds.minLon, bounds.minLat),
      Cartesian3.fromDegrees(bounds.maxLon, bounds.minLat),
      Cartesian3.fromDegrees(bounds.maxLon, bounds.maxLat),
      Cartesian3.fromDegrees(bounds.minLon, bounds.maxLat),
    ];

    const overlay = viewer.entities.add({
      polygon: {
        hierarchy: new PolygonHierarchy(overlayPositions),
        height: 0.48,
        extrudedHeight: 0.54,
        material: Color.fromCssColorString("#06b6d4").withAlpha(0.055),
        outline: true,
        outlineColor: Color.fromCssColorString("#22d3ee"),
      },
    });
    searchSelectionEntitiesRef.current.push(overlay);

    viewer.camera.flyTo({
      destination: Rectangle.fromDegrees(
        bounds.minLon,
        bounds.minLat,
        bounds.maxLon,
        bounds.maxLat
      ),
      duration: 1.25,
    });

    return true;
  }

  // ======================================================
  // FIND PROPERTY USED IN TOPOLOGY CONFLICT
  // ======================================================

  function findConflictObject(
    conflictObject
  ) {

    if (
      !conflictObject
    ) {

      return null;
    }


    const byPropertyId =
      spatialObjectsRef
        .current
        .find(
          (object) =>
            object.propertyId ===
            conflictObject.property_id
        );


    if (
      byPropertyId
    ) {

      return byPropertyId;
    }


    return (
      spatialObjectsRef
        .current
        .find(
          (object) =>
            String(
              object.id
            )
              .toLowerCase() ===
            String(
              conflictObject.unit
            )
              .toLowerCase()
        )
      ??
      null
    );
  }


  // ======================================================
  // CLEAR TEMPORARY FOOTPRINT DRAWING
  // ======================================================

  function clearFootprintDrawing() {

    const viewer =
      viewerRef.current;


    if (!viewer) {
      return;
    }


    for (
      const entity
      of footprintTemporaryEntitiesRef.current
    ) {

      viewer.entities.remove(
        entity
      );
    }


    footprintTemporaryEntitiesRef.current =
      [];


    footprintPointEntitiesRef.current =
      [];


    footprintCornersRef.current =
      [];


    footprintHoverRef.current =
      null;
  }


  function addFootprintPointEntity(
    viewer,
    longitude,
    latitude
  ) {

    const pointEntity =
      viewer.entities.add({
        position:
          Cartesian3.fromDegrees(
            longitude,
            latitude,
            1
          ),

        point: {
          pixelSize:
            12,

          color:
            Color.YELLOW,

          outlineColor:
            Color.BLACK,

          outlineWidth:
            2,

          disableDepthTestDistance:
            Number.POSITIVE_INFINITY,
        },
      });


    footprintTemporaryEntitiesRef
      .current
      .push(
        pointEntity
      );


    footprintPointEntitiesRef
      .current
      .push(
        pointEntity
      );


    return pointEntity;
  }


  function notifyFootprintProgress() {

    onFootprintProgressRef
      .current?.({
        pointCount:
          footprintCornersRef
            .current
            .length,

        points:
          footprintCornersRef
            .current
            .map(
              (point) => ({
                longitude:
                  point.longitude,

                latitude:
                  point.latitude,
              })
            ),
      });
  }


  function createPolygonDrawingPreview(
    viewer
  ) {

    const lineEntity =
      viewer.entities.add({
        polyline: {
          positions:
            new CallbackProperty(
              () => {

                const points = [
                  ...footprintCornersRef
                    .current,
                ];


                if (
                  footprintHoverRef.current
                ) {

                  points.push(
                    footprintHoverRef
                      .current
                  );
                }


                if (
                  points.length >= 3
                ) {

                  points.push(
                    points[0]
                  );
                }


                return points.map(
                  (point) =>
                    Cartesian3
                      .fromDegrees(
                        point.longitude,
                        point.latitude,
                        1.1
                      )
                );
              },
              false
            ),

          width:
            3,

          material:
            Color.YELLOW,
        },
      });


    const polygonEntity =
      viewer.entities.add({
        polygon: {
          hierarchy:
            new CallbackProperty(
              () => {

                const points = [
                  ...footprintCornersRef
                    .current,
                ];


                if (
                  footprintHoverRef.current
                ) {

                  points.push(
                    footprintHoverRef
                      .current
                  );
                }


                if (
                  points.length < 3
                ) {

                  return undefined;
                }


                return (
                  new PolygonHierarchy(
                    points.map(
                      (point) =>
                        Cartesian3
                          .fromDegrees(
                            point.longitude,
                            point.latitude
                          )
                    )
                  )
                );
              },
              false
            ),

          height:
            0.5,

          material:
            Color.YELLOW
              .withAlpha(
                0.28
              ),

          outline:
            true,

          outlineColor:
            Color.YELLOW,
        },
      });


    footprintTemporaryEntitiesRef
      .current
      .push(
        lineEntity,
        polygonEntity
      );
  }


  // ======================================================
  // CREATE CESIUM VIEWER
  // ======================================================

  useEffect(() => {

    let cancelled =
      false;


    const viewer =
      new Viewer(
        cesiumContainer.current,
        {
          baseLayer: false,

          baseLayerPicker: false,

          geocoder: false,

          animation: false,

          timeline: false,

          navigationHelpButton: false,

          sceneModePicker: false,

          homeButton: false,

          // Keep the map self-contained (no external imagery token) but
          // render the WebGL canvas with alpha so the CSS sky gradient can
          // show through beyond the generated regional ground plane.
          contextOptions: {
            webgl: {
              alpha: true,
              antialias: true,
            },
          },

          skyBox: false,

          infoBox: false,

          selectionIndicator: false,
        }
      );


    viewerRef.current =
      viewer;


    const cameraController = viewer.scene.screenSpaceCameraController;
    cameraController.enableRotate = true;
    cameraController.enableTilt = true;
    cameraController.enableLook = true;
    cameraController.enableTranslate = true;
    cameraController.enableZoom = true;
    cameraController.minimumZoomDistance = 3;
    cameraController.maximumZoomDistance = 6000;


    viewer.scene.backgroundColor =
      Color.fromCssColorString("#b7cbd2");

    if (viewer.scene.globe) {
      viewer.scene.globe.baseColor = Color.fromCssColorString("#6d8064");
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.globe.depthTestAgainstTerrain = false;
    }

    if (viewer.scene.fog) {
      viewer.scene.fog.enabled = true;
      viewer.scene.fog.density = 0.00018;
      viewer.scene.fog.minimumBrightness = 0.55;
    }

    viewer.scene.highDynamicRange = false;
    if (viewer.scene.postProcessStages?.fxaa) {
      viewer.scene.postProcessStages.fxaa.enabled = true;
    }


    // ====================================================
    // LOAD SCENE
    // ====================================================

    async function loadScene() {

      try {

        const [
          scene,
          gisData,
          colonyData,
        ] =
          await Promise.all([
            getScene(),
            getGISFeatures(),
            getColonyAssets(),
          ]);


        if (
          cancelled
        ) {

          return;
        }


        spatialObjectsRef.current =
          [];


        visualDefaultsRef.current =
          [];


        parcelsByUlpInRef.current =
          new Map();

        blockParcelsRef.current =
          new Map();

        blockBoundsRef.current =
          new Map();

        clearSearchSelection();


        buildingsByKeyRef.current =
          new Map();


        layerEntitiesRef.current =
          {
            blocks: [],
            parcels: [],
            buildings: [],
            roads: [],
            amenities: [],
            lights: [],
            markings: [],
            signals: [],
            landscape: [],
            mobility: [],
            apartments: [],
            parking: [],
            utilities: [],
          };


        // =================================================
        // LAND PLOTS
        // =================================================

        let townshipMinLon = Number.POSITIVE_INFINITY;
        let townshipMinLat = Number.POSITIVE_INFINITY;
        let townshipMaxLon = Number.NEGATIVE_INFINITY;
        let townshipMaxLat = Number.NEGATIVE_INFINITY;

        for (
          const parcel
          of scene.parcels
        ) {

          if (
            !parcel.geometry
          ) {

            continue;
          }


          const positions =
            geometryToPositions(
              parcel.geometry
            );


          if (
            positions.length < 3
          ) {

            continue;
          }


          const parcelBounds =
            getGeometryBounds(parcel.geometry);

          if (parcelBounds) {
            townshipMinLon = Math.min(townshipMinLon, parcelBounds.minLon);
            townshipMinLat = Math.min(townshipMinLat, parcelBounds.minLat);
            townshipMaxLon = Math.max(townshipMaxLon, parcelBounds.maxLon);
            townshipMaxLat = Math.max(townshipMaxLat, parcelBounds.maxLat);
          }


          const normalMaterial =
            Color.LIMEGREEN
              .withAlpha(
                0.26
              );


          const normalOutline =
            Color.DARKGREEN;


          const entity =
            viewer.entities.add({
              id:
                `parcel-${parcel.ulpin}`,

              name:
                parcel.name,

              show:
                layers.parcels,

              polygon: {
                hierarchy:
                  new PolygonHierarchy(
                    positions
                  ),

                height:
                  0,

                extrudedHeight:
                  0.35,

                material:
                  normalMaterial,

                outline:
                  true,

                outlineColor:
                  normalOutline,
              },

              properties: {
                type:
                  "Land Parcel",

                parentUlpIn:
                  parcel.ulpin,

                propertyId:
                  parcel.ulpin,

                building:
                  "—",

                floor:
                  "Surface",

                unit:
                  "—",

                verticalRange:
                  "Surface",

                validation:
                  "Valid",

                blockCode:
                  parcel.block_code || "—",

                addressCode:
                  parcel.address_code || "—",

                addressNumber:
                  parcel.address_number || 0,

                buildingName:
                  parcel.name,

                buildingType:
                  parcel.land_use || "Land Parcel",

                floorCount:
                  0,

                unitsPerFloor:
                  0,

                floorHeight:
                  0,

                heightMeters:
                  0,
              },
            });


          registerVisualDefault(
            entity,
            normalMaterial,
            normalOutline
          );


          parcelsByUlpInRef
            .current
            .set(
              parcel.ulpin,
              entity
            );


          layerEntitiesRef
            .current
            .parcels
            .push(
              entity
            );

          const blockCode = parcel.block_code;
          if (blockCode) {
            if (!blockParcelsRef.current.has(blockCode)) {
              blockParcelsRef.current.set(blockCode, []);
            }
            blockParcelsRef.current.get(blockCode).push(entity);

            if (parcelBounds) {
              const current = blockBoundsRef.current.get(blockCode);
              if (!current) {
                blockBoundsRef.current.set(blockCode, { ...parcelBounds });
              } else {
                current.minLon = Math.min(current.minLon, parcelBounds.minLon);
                current.minLat = Math.min(current.minLat, parcelBounds.minLat);
                current.maxLon = Math.max(current.maxLon, parcelBounds.maxLon);
                current.maxLat = Math.max(current.maxLat, parcelBounds.maxLat);
              }
            }
          }

          spatialObjectsRef.current.push({
            id: parcel.ulpin,
            category: "plot",
            entity,
            propertyId: parcel.ulpin,
            parentUlpIn: parcel.ulpin,
            building: "—",
            searchTerms: [
              parcel.ulpin,
              parcel.name,
              parcel.address_code,
              parcel.block_code ? `Block ${parcel.block_code}` : "",
            ].filter(Boolean),
          });
        }


        if (
          Number.isFinite(townshipMinLon) &&
          Number.isFinite(townshipMinLat) &&
          Number.isFinite(townshipMaxLon) &&
          Number.isFinite(townshipMaxLat)
        ) {
          townshipBoundsRef.current = {
            minLon: townshipMinLon,
            minLat: townshipMinLat,
            maxLon: townshipMaxLon,
            maxLat: townshipMaxLat,
            centerLon: (townshipMinLon + townshipMaxLon) / 2,
            centerLat: (townshipMinLat + townshipMaxLat) / 2,
          };
        }

        // =================================================
        // FOUR TOWNSHIP BLOCKS
        // =================================================

        const blockColors = {
          A: "#4f87d8",
          B: "#4b9b70",
          C: "#c58b45",
          D: "#8a67b2",
        };

        for (const [blockCode, bounds] of blockBoundsRef.current.entries()) {
          const color = Color.fromCssColorString(blockColors[blockCode] || "#ffffff");
          const positions = [
            Cartesian3.fromDegrees(bounds.minLon, bounds.minLat),
            Cartesian3.fromDegrees(bounds.maxLon, bounds.minLat),
            Cartesian3.fromDegrees(bounds.maxLon, bounds.maxLat),
            Cartesian3.fromDegrees(bounds.minLon, bounds.maxLat),
          ];

          const boundary = viewer.entities.add({
            id: `township-block-${blockCode}`,
            name: `Block ${blockCode}`,
            show: layers.blocks,
            polygon: {
              hierarchy: new PolygonHierarchy(positions),
              height: 0.40,
              extrudedHeight: 0.43,
              material: color.withAlpha(0.035),
              outline: true,
              outlineColor: color.withAlpha(0.92),
            },
            properties: {
              type: "Township Block",
              parentUlpIn: "—",
              propertyId: `BLOCK-${blockCode}`,
              building: "—",
              floor: "—",
              unit: "—",
              verticalRange: "Surface",
              validation: "Township address block",
              blockCode,
              addressCode: `Block ${blockCode}`,
              addressNumber: 0,
              buildingName: `Block ${blockCode}`,
              buildingType: "Township Block",
              floorCount: 0,
              unitsPerFloor: 0,
              floorHeight: 0,
              heightMeters: 0,
            },
          });

          const label = viewer.entities.add({
            id: `township-block-label-${blockCode}`,
            position: Cartesian3.fromDegrees(
              (bounds.minLon + bounds.maxLon) / 2,
              (bounds.minLat + bounds.maxLat) / 2,
              6
            ),
            show: layers.blocks,
            label: {
              text: `BLOCK ${blockCode}`,
              font: "700 14px sans-serif",
              fillColor: Color.WHITE,
              outlineColor: color,
              outlineWidth: 4,
              style: LabelStyle.FILL_AND_OUTLINE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              distanceDisplayCondition: new DistanceDisplayCondition(220, 900),
            },
          });

          layerEntitiesRef.current.blocks.push(boundary, label);
          blockVisualsRef.current.set(blockCode, { boundary, label, color });
        }


        // =================================================
        // COLONY INFRASTRUCTURE + AMENITIES
        // =================================================

        for (
          const asset
          of colonyData.assets || []
        ) {

          if (!asset.geometry) {
            continue;
          }

          const assetType =
            String(asset.asset_type || "")
              .toLowerCase();


          if (
            assetType === "road" &&
            asset.geometry.type === "Polygon"
          ) {

            const positions =
              geometryToPositions(asset.geometry);

            if (positions.length < 3) {
              continue;
            }

            const roadClass = String(asset.properties?.road_class || "").toLowerCase();
            const roadColor = roadClass.includes("main")
              ? "#34383d"
              : roadClass.includes("collector")
                ? "#3d4247"
                : "#484d52";
            const roadMaterial = Color.fromCssColorString(roadColor).withAlpha(0.985);

            const roadEntity =
              viewer.entities.add({
                id: `colony-road-${asset.id}`,
                name: asset.name,
                show: layers.roads,

                polygon: {
                  hierarchy:
                    new PolygonHierarchy(positions),
                  height: 0.36,
                  extrudedHeight: 0.43,
                  material: roadMaterial,
                  outline: true,
                  outlineColor:
                    Color.fromCssColorString("#c7c9c8"),
                },

                properties: {
                  type: "Road",
                  parentUlpIn: "Public Infrastructure",
                  propertyId: `ASSET-${asset.id}`,
                  building: "—",
                  floor: "Surface",
                  unit: "—",
                  verticalRange: "Surface",
                  validation:
                    asset.properties?.road_class || "Planned road",
                },
              });

            layerEntitiesRef.current.roads.push(roadEntity);
            continue;
          }


          if (
            assetType === "road_median" &&
            asset.geometry.type === "Polygon"
          ) {
            const positions = geometryToPositions(asset.geometry);
            if (positions.length < 3) continue;

            const medianEntity = viewer.entities.add({
              id: `colony-median-${asset.id}`,
              name: asset.name,
              show: layers.roads,
              polygon: {
                hierarchy: new PolygonHierarchy(positions),
                height: 0.46,
                extrudedHeight: 0.58,
                material: Color.fromCssColorString("#477a49").withAlpha(0.98),
                outline: true,
                outlineColor: Color.fromCssColorString("#d7dccf"),
              },
              properties: {
                type: "Landscaped Road Median",
                parentUlpIn: "Public Infrastructure",
                propertyId: `ASSET-${asset.id}`,
                building: "—",
                floor: "Surface",
                unit: "—",
                verticalRange: "Surface",
                validation: "Planned road infrastructure",
              },
            });
            layerEntitiesRef.current.roads.push(medianEntity);
            continue;
          }


          if (
            ["sidewalk", "landscape_strip"].includes(assetType) &&
            asset.geometry.type === "Polygon"
          ) {
            const positions = geometryToPositions(asset.geometry);
            if (positions.length < 3) continue;
            const isGreenStrip = assetType === "landscape_strip";
            const edgeEntity = viewer.entities.add({
              id: `township-edge-${asset.id}`,
              name: asset.name,
              show: isGreenStrip ? layers.landscape : layers.roads,
              polygon: {
                hierarchy: new PolygonHierarchy(positions),
                height: isGreenStrip ? 0.46 : 0.47,
                extrudedHeight: isGreenStrip ? 0.57 : 0.54,
                material: Color.fromCssColorString(isGreenStrip ? "#638b57" : "#c9c3b7").withAlpha(0.99),
                outline: true,
                outlineColor: Color.fromCssColorString(isGreenStrip ? "#405f39" : "#8f8a80"),
              },
              properties: {
                type: isGreenStrip ? "Landscaped Verge" : "Sidewalk",
                parentUlpIn: "Public Infrastructure",
                propertyId: `ASSET-${asset.id}`,
                building: "—", floor: "Surface", unit: "—", verticalRange: "Surface",
                validation: "Township pedestrian infrastructure",
              },
            });
            layerEntitiesRef.current[isGreenStrip ? "landscape" : "roads"].push(edgeEntity);
            continue;
          }

          if (
            ["regional_context_ground", "township_ground", "green_belt"].includes(assetType) &&
            asset.geometry.type === "Polygon"
          ) {
            const positions = geometryToPositions(asset.geometry);
            if (positions.length < 3) continue;
            const isRegionalContext = assetType === "regional_context_ground";
            const isGreenBelt = assetType === "green_belt";

            let materialColor = "#7f8f75";
            let materialAlpha = 0.97;
            let height = 0.025;
            let extrudedHeight = 0.055;

            if (isGreenBelt) {
              materialColor = "#496f43";
              materialAlpha = 0.98;
              height = 0.11;
              extrudedHeight = 0.17;
            } else if (isRegionalContext) {
              materialColor = "#708268";
              materialAlpha = 1.0;
              height = -0.20;
              extrudedHeight = -0.12;
            }

            const groundEntity = viewer.entities.add({
              id: `township-ground-${asset.id}`,
              name: asset.name,
              show: layers.landscape,
              polygon: {
                hierarchy: new PolygonHierarchy(positions),
                height,
                extrudedHeight,
                material: Color.fromCssColorString(materialColor).withAlpha(materialAlpha),
                outline: isGreenBelt,
                outlineColor: Color.fromCssColorString("#355332").withAlpha(0.8),
              },
              properties: {
                type: isRegionalContext
                  ? "Regional Landscape Context"
                  : isGreenBelt
                    ? "Township Green Belt"
                    : "Township Ground",
                parentUlpIn: "CadastraX3D Township",
                propertyId: `ASSET-${asset.id}`,
                building: "—", floor: "Surface", unit: "—", verticalRange: "Surface",
                validation: isRegionalContext
                  ? "Non-cadastral visual context — Step 3.7A"
                  : "Township urban ground / landscape foundation",
              },
            });
            layerEntitiesRef.current.landscape.push(groundEntity);
            continue;
          }

          if (
            ["lane_marking", "road_edge_marking", "stop_line"].includes(assetType) &&
            asset.geometry.type === "LineString"
          ) {
            const positions = lineStringToPositions(asset.geometry, 0.59);
            if (positions.length < 2) continue;

            const dashed = asset.properties?.style === "dashed";
            const markingEntity = viewer.entities.add({
              id: `colony-marking-${asset.id}`,
              name: asset.name,
              show: layers.markings,
              polyline: {
                positions,
                width:
                  assetType === "stop_line"
                    ? 4.0
                    : assetType === "lane_marking"
                      ? 1.7
                      : 1.2,
                material: dashed
                  ? new PolylineDashMaterialProperty({
                      color: Color.WHITE,
                      dashLength: 12,
                    })
                  : Color.WHITE.withAlpha(0.95),
                clampToGround: false,
              },
              properties: {
                type: "Road Marking",
                parentUlpIn: "Public Infrastructure",
                propertyId: `ASSET-${asset.id}`,
                building: "—",
                floor: "Surface",
                unit: "—",
                verticalRange: "Surface",
                validation: assetType,
              },
            });
            layerEntitiesRef.current.markings.push(markingEntity);
            continue;
          }


          if (
            assetType === "crosswalk" &&
            asset.geometry.type === "Polygon"
          ) {
            const positions = geometryToPositions(asset.geometry);
            if (positions.length < 3) continue;

            const crossingEntity = viewer.entities.add({
              id: `colony-crosswalk-${asset.id}`,
              name: asset.name,
              show: layers.markings,
              polygon: {
                hierarchy: new PolygonHierarchy(positions),
                height: 0.60,
                material: Color.WHITE.withAlpha(0.98),
                outline: false,
              },
              properties: {
                type: "Pedestrian Crossing",
                parentUlpIn: "Public Infrastructure",
                propertyId: `ASSET-${asset.id}`,
                building: "—",
                floor: "Surface",
                unit: "—",
                verticalRange: "Surface",
                validation: "Zebra crossing",
              },
            });
            layerEntitiesRef.current.markings.push(crossingEntity);
            continue;
          }


          if (
            ["road_text", "road_arrow"].includes(assetType) &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const widthM = Number(asset.properties?.width_m || 12);
            const heightM = Number(asset.properties?.height_m || 4);
            const orientation = String(
              asset.properties?.orientation || "east_west"
            );
            const extraRotation = Number(asset.properties?.rotation_deg || 0);

            const texture =
              assetType === "road_arrow"
                ? createRoadArrowCanvas()
                : createRoadTextCanvas(asset.properties?.text || "");

            const baseRotationDegrees =
              assetType === "road_arrow"
                ? orientation === "east_west"
                  ? 90
                  : 0
                : orientation === "north_south"
                  ? 90
                  : 0;

            const roadPaintEntity = viewer.entities.add({
              id: `colony-road-paint-${asset.id}`,
              name: asset.name,
              show: layers.markings,
              rectangle: {
                coordinates: roadRectangle(
                  longitude,
                  latitude,
                  widthM,
                  heightM
                ),
                height: 0.66,
                rotation: CesiumMath.toRadians(
                  baseRotationDegrees + extraRotation
                ),
                material: new ImageMaterialProperty({
                  image: texture,
                  transparent: true,
                }),
                distanceDisplayCondition: new DistanceDisplayCondition(0, 700),
              },
              properties: {
                type: assetType === "road_arrow" ? "Road Direction" : "Road Warning",
                parentUlpIn: "Public Infrastructure",
                propertyId: `ASSET-${asset.id}`,
                building: "—",
                floor: "Surface",
                unit: "—",
                verticalRange: "Surface",
                validation: "Painted road-surface marking",
              },
            });

            layerEntitiesRef.current.markings.push(roadPaintEntity);
            continue;
          }

          // ===============================================
          // STEP 3.4 STREETSCAPE + CIVIC ARCHITECTURE
          // ===============================================

          if (
            assetType === "park_bench" &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const detailDistance = new DistanceDisplayCondition(0, 520);
            const seat = viewer.entities.add({
              id: `park-bench-${asset.id}`,
              name: asset.name,
              position: Cartesian3.fromDegrees(longitude, latitude, 0.66),
              show: layers.landscape,
              box: {
                dimensions: new Cartesian3(1.8, 0.55, 0.16),
                material: Color.fromCssColorString("#73543b"),
                distanceDisplayCondition: detailDistance,
              },
            });
            const back = viewer.entities.add({
              position: Cartesian3.fromDegrees(longitude, latitude, 1.02),
              show: layers.landscape,
              box: {
                dimensions: new Cartesian3(1.8, 0.14, 0.62),
                material: Color.fromCssColorString("#73543b"),
                distanceDisplayCondition: detailDistance,
              },
            });
            layerEntitiesRef.current.landscape.push(seat, back);
            continue;
          }

          if (
            assetType === "boom_barrier" &&
            asset.geometry.type === "LineString"
          ) {
            const positions = lineStringToPositions(asset.geometry, 1.15);
            if (positions.length < 2) continue;
            const baseBarrier = viewer.entities.add({
              id: `boom-barrier-base-${asset.id}`,
              name: asset.name,
              show: layers.landscape,
              polyline: {
                positions,
                width: 7,
                material: Color.WHITE,
                distanceDisplayCondition: new DistanceDisplayCondition(0, 620),
              },
            });
            const redBarrier = viewer.entities.add({
              show: layers.landscape,
              polyline: {
                positions,
                width: 5,
                material: new PolylineDashMaterialProperty({
                  color: Color.fromCssColorString("#b52f2f"),
                  dashLength: 10,
                }),
                distanceDisplayCondition: new DistanceDisplayCondition(0, 620),
              },
            });
            layerEntitiesRef.current.landscape.push(baseBarrier, redBarrier);
            continue;
          }

          // ===============================================
          // STEP 3.1 LANDSCAPE + LANDMARK ASSETS
          // ===============================================

          if (
            assetType === "tree" &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const height = Number(asset.properties?.height_m || 5.2);
            const canopyRadius = Number(asset.properties?.canopy_radius_m || 2.1);
            const trunkHeight = Math.max(2.2, height * 0.58);
            const detailDistance = new DistanceDisplayCondition(0, 900);

            const trunk = viewer.entities.add({
              id: `tree-trunk-${asset.id}`,
              name: asset.name,
              position: Cartesian3.fromDegrees(longitude, latitude, trunkHeight / 2),
              show: layers.landscape,
              cylinder: {
                length: trunkHeight,
                topRadius: 0.12,
                bottomRadius: 0.18,
                material: Color.fromCssColorString("#6b5038"),
                distanceDisplayCondition: detailDistance,
              },
              properties: {
                type: "Landscape Tree",
                parentUlpIn: "Township Landscape",
                propertyId: `ASSET-${asset.id}`,
                building: "—",
                floor: "—",
                unit: "—",
                verticalRange: `0m – ${height}m`,
                validation: asset.properties?.context || "Township landscape",
              },
            });

            const canopy = viewer.entities.add({
              position: Cartesian3.fromDegrees(
                longitude,
                latitude,
                trunkHeight + canopyRadius * 0.65
              ),
              show: layers.landscape,
              ellipsoid: {
                radii: new Cartesian3(
                  canopyRadius,
                  canopyRadius * 0.92,
                  canopyRadius * 0.78
                ),
                material: Color.fromCssColorString("#477b43").withAlpha(0.96),
                outline: false,
                distanceDisplayCondition: detailDistance,
              },
            });

            layerEntitiesRef.current.landscape.push(trunk, canopy);
            continue;
          }

          if (
            assetType === "park_path" &&
            asset.geometry.type === "LineString"
          ) {
            const positions = lineStringToPositions(asset.geometry, 0.58);
            if (positions.length < 2) continue;

            const path = viewer.entities.add({
              id: `park-path-${asset.id}`,
              name: asset.name,
              show: layers.landscape,
              polyline: {
                positions,
                width: 5.2,
                material: Color.fromCssColorString("#d5c29a").withAlpha(0.98),
                clampToGround: false,
                distanceDisplayCondition: new DistanceDisplayCondition(0, 1000),
              },
              properties: {
                type: "Park Walkway",
                parentUlpIn: "Township Landscape",
                propertyId: `ASSET-${asset.id}`,
                building: "—",
                floor: "Surface",
                unit: "—",
                verticalRange: "Surface",
                validation: "Landscape path",
              },
            });
            layerEntitiesRef.current.landscape.push(path);
            continue;
          }

          if (
            assetType === "parking_bay_marking" &&
            asset.geometry.type === "LineString"
          ) {
            const positions = lineStringToPositions(asset.geometry, 0.61);
            if (positions.length < 2) continue;
            const bay = viewer.entities.add({
              id: `parking-bay-${asset.id}`,
              name: asset.name,
              show: layers.amenities,
              polyline: {
                positions,
                width: 1.25,
                material: Color.WHITE.withAlpha(0.92),
                distanceDisplayCondition: new DistanceDisplayCondition(0, 720),
              },
            });
            layerEntitiesRef.current.amenities.push(bay);
            continue;
          }

          if (
            assetType === "vehicle" &&
            asset.geometry.type === "Polygon"
          ) {
            const vehicleKind = asset.properties?.vehicle_kind || "car";
            const isBus = vehicleKind.includes("bus");
            const isAmbulance = vehicleKind === "ambulance";
            const isSchoolBus = vehicleKind === "school_bus";
            const isTownshipBus = vehicleKind === "township_bus";

            const fallbackBounds = getGeometryBounds(asset.geometry);
            const centerLon = Number(
              asset.properties?.center_lon ??
              ((fallbackBounds.minLon + fallbackBounds.maxLon) / 2)
            );
            const centerLat = Number(
              asset.properties?.center_lat ??
              ((fallbackBounds.minLat + fallbackBounds.maxLat) / 2)
            );
            const headingDeg = Number(asset.properties?.heading_deg || 0);
            const vehicleHeight = Number(
              asset.properties?.height_m || (isBus ? 3.15 : isAmbulance ? 2.45 : 1.45)
            );
            const lengthM = Number(
              asset.properties?.length_m || (isBus ? 9.5 : isAmbulance ? 5.4 : 4.4)
            );
            const widthM = Number(
              asset.properties?.width_m || (isBus ? 2.45 : isAmbulance ? 2.1 : 1.9)
            );
            const vehicleColor =
              Color.fromCssColorString(asset.properties?.color || "#d7dbe0") ||
              Color.LIGHTGRAY;
            const glassColor = Color.fromCssColorString("#263941").withAlpha(0.96);
            const tyreColor = Color.fromCssColorString("#171b1d").withAlpha(0.98);
            const trimColor = Color.fromCssColorString("#d7dde0").withAlpha(0.96);
            const detailDistance = new DistanceDisplayCondition(0, 720);
            const silhouetteDistance = new DistanceDisplayCondition(0, 1050);
            const parts = [];

            const addVehicleBox = ({
              forward = 0,
              lateral = 0,
              altitude,
              dimensions,
              material,
              distance = detailDistance,
              id,
              name,
              properties,
              outline = false,
            }) => {
              const [longitude, latitude] = offsetLonLat(
                centerLon,
                centerLat,
                forward,
                lateral,
                headingDeg
              );
              const position = Cartesian3.fromDegrees(longitude, latitude, altitude);
              const entity = viewer.entities.add({
                ...(id ? { id } : {}),
                ...(name ? { name } : {}),
                position,
                orientation: localHeadingOrientation(
                  longitude,
                  latitude,
                  altitude,
                  headingDeg
                ),
                show: layers.mobility,
                box: {
                  dimensions: new Cartesian3(...dimensions),
                  material,
                  outline,
                  outlineColor: Color.fromCssColorString("#20272a").withAlpha(0.70),
                  distanceDisplayCondition: distance,
                },
                ...(properties ? { properties } : {}),
              });
              parts.push(entity);
              return entity;
            };

            const bodyProperties = {
              type: isAmbulance
                ? "Emergency Vehicle"
                : isBus
                  ? "Transit Vehicle"
                  : "Township Vehicle",
              parentUlpIn: asset.properties?.context || "Township Mobility",
              propertyId: `ASSET-${asset.id}`,
              building: "—",
              floor: "Road / Parking",
              unit: "—",
              verticalRange: `0m – ${vehicleHeight}m`,
              validation: "Step 3.6 polished mobility asset",
            };

            if (isBus) {
              const lowerHeight = Math.max(0.82, vehicleHeight * 0.48);
              const upperBodyHeight = Math.max(0.78, vehicleHeight * 0.31);
              const windowHeight = Math.max(0.52, vehicleHeight * 0.22);

              addVehicleBox({
                id: `vehicle-${asset.id}`,
                name: asset.name,
                altitude: 0.13 + lowerHeight / 2,
                dimensions: [lengthM, widthM, lowerHeight],
                material: vehicleColor.withAlpha(0.99),
                distance: silhouetteDistance,
                properties: bodyProperties,
                outline: true,
              });

              addVehicleBox({
                altitude: lowerHeight + upperBodyHeight / 2 - 0.02,
                dimensions: [lengthM * 0.94, widthM * 0.96, upperBodyHeight],
                material: vehicleColor.withAlpha(0.99),
              });

              addVehicleBox({
                altitude: vehicleHeight * 0.67,
                dimensions: [lengthM * 0.88, widthM * 1.012, windowHeight],
                material: glassColor,
              });

              addVehicleBox({
                altitude: vehicleHeight - 0.055,
                dimensions: [lengthM * 0.93, widthM * 0.94, 0.11],
                material: isSchoolBus
                  ? Color.fromCssColorString("#e2bd45")
                  : Color.fromCssColorString("#ece3c9"),
              });

              // A coloured belt keeps township and school buses visually distinct.
              addVehicleBox({
                altitude: lowerHeight * 0.64,
                dimensions: [lengthM * 0.90, widthM * 1.018, 0.14],
                material: isSchoolBus
                  ? Color.fromCssColorString("#2b3032")
                  : Color.fromCssColorString("#164c3f"),
              });
            } else if (isAmbulance) {
              const lowerHeight = 0.78;

              addVehicleBox({
                id: `vehicle-${asset.id}`,
                name: asset.name,
                altitude: 0.13 + lowerHeight / 2,
                dimensions: [lengthM, widthM, lowerHeight],
                material: vehicleColor.withAlpha(0.99),
                distance: silhouetteDistance,
                properties: bodyProperties,
                outline: true,
              });

              addVehicleBox({
                forward: -lengthM * 0.10,
                altitude: 1.48,
                dimensions: [lengthM * 0.67, widthM * 0.94, 1.55],
                material: vehicleColor.withAlpha(0.99),
              });

              addVehicleBox({
                forward: lengthM * 0.31,
                altitude: 1.15,
                dimensions: [lengthM * 0.27, widthM * 0.90, 0.68],
                material: glassColor,
              });

              addVehicleBox({
                altitude: 1.08,
                dimensions: [lengthM * 0.84, widthM * 1.018, 0.17],
                material: Color.fromCssColorString("#c53932"),
              });

              addVehicleBox({
                forward: -0.34,
                lateral: -0.23,
                altitude: vehicleHeight + 0.07,
                dimensions: [0.46, 0.18, 0.11],
                material: Color.fromCssColorString("#316dcc"),
              });
              addVehicleBox({
                forward: -0.34,
                lateral: 0.23,
                altitude: vehicleHeight + 0.07,
                dimensions: [0.46, 0.18, 0.11],
                material: Color.fromCssColorString("#d34038"),
              });
            } else {
              const lowerHeight = Math.max(0.55, vehicleHeight * 0.46);
              const cabinHeight = Math.max(0.48, vehicleHeight * 0.40);

              addVehicleBox({
                id: `vehicle-${asset.id}`,
                name: asset.name,
                altitude: 0.12 + lowerHeight / 2,
                dimensions: [lengthM, widthM, lowerHeight],
                material: vehicleColor.withAlpha(0.99),
                distance: silhouetteDistance,
                properties: bodyProperties,
                outline: true,
              });

              addVehicleBox({
                forward: -lengthM * 0.02,
                altitude: lowerHeight + cabinHeight / 2 - 0.02,
                dimensions: [lengthM * 0.52, widthM * 0.81, cabinHeight],
                material: glassColor,
              });

              addVehicleBox({
                forward: -lengthM * 0.02,
                altitude: vehicleHeight - 0.045,
                dimensions: [lengthM * 0.43, widthM * 0.73, 0.09],
                material: vehicleColor.withAlpha(0.99),
              });

              // Front and rear brightwork give the small cars a readable direction.
              addVehicleBox({
                forward: lengthM * 0.49,
                altitude: 0.52,
                dimensions: [0.08, widthM * 0.70, 0.16],
                material: trimColor,
              });
              addVehicleBox({
                forward: -lengthM * 0.49,
                altitude: 0.50,
                dimensions: [0.08, widthM * 0.58, 0.12],
                material: Color.fromCssColorString("#94352f"),
              });
            }

            const wheelForward = isBus ? lengthM * 0.34 : lengthM * 0.31;
            const wheelLateral = widthM * 0.52;
            const wheelLength = isBus ? 0.82 : 0.68;
            const wheelHeight = isBus ? 0.56 : 0.44;

            for (const forward of [-wheelForward, wheelForward]) {
              for (const lateral of [-wheelLateral, wheelLateral]) {
                addVehicleBox({
                  forward,
                  lateral,
                  altitude: wheelHeight / 2,
                  dimensions: [wheelLength, 0.24, wheelHeight],
                  material: tyreColor,
                  distance: detailDistance,
                });
              }
            }

            layerEntitiesRef.current.mobility.push(...parts);
            continue;
          }

          if (
            assetType === "bus_shelter" &&
            asset.geometry.type === "Polygon"
          ) {
            const bounds = getGeometryBounds(asset.geometry);
            const centerLon = Number(
              asset.properties?.center_lon ?? ((bounds.minLon + bounds.maxLon) / 2)
            );
            const centerLat = Number(
              asset.properties?.center_lat ?? ((bounds.minLat + bounds.maxLat) / 2)
            );
            const headingDeg = Number(asset.properties?.heading_deg || 0);
            const lengthM = Number(asset.properties?.length_m || 8.0);
            const widthM = Number(asset.properties?.width_m || 3.0);
            const height = Number(asset.properties?.height_m || 2.8);
            const parts = [];
            const distance = new DistanceDisplayCondition(0, 620);

            const addShelterBox = ({
              forward = 0,
              lateral = 0,
              altitude,
              dimensions,
              material,
              id,
              name,
              properties,
            }) => {
              const [longitude, latitude] = offsetLonLat(
                centerLon,
                centerLat,
                forward,
                lateral,
                headingDeg
              );
              const entity = viewer.entities.add({
                ...(id ? { id } : {}),
                ...(name ? { name } : {}),
                position: Cartesian3.fromDegrees(longitude, latitude, altitude),
                orientation: localHeadingOrientation(
                  longitude,
                  latitude,
                  altitude,
                  headingDeg
                ),
                show: layers.mobility,
                box: {
                  dimensions: new Cartesian3(...dimensions),
                  material,
                  distanceDisplayCondition: distance,
                },
                ...(properties ? { properties } : {}),
              });
              parts.push(entity);
            };

            const shelterProperties = {
              type: "Bus Shelter",
              parentUlpIn: "Township Public Transit",
              propertyId: `ASSET-${asset.id}`,
              building: "—",
              floor: "Surface",
              unit: "—",
              verticalRange: `0m – ${height}m`,
              validation: "Step 3.6 refined glass transit shelter",
            };

            addShelterBox({
              id: `bus-shelter-${asset.id}`,
              name: asset.name,
              altitude: 0.07,
              dimensions: [lengthM * 1.02, widthM * 1.04, 0.14],
              material: Color.fromCssColorString("#6b6b64").withAlpha(0.98),
              properties: shelterProperties,
            });

            addShelterBox({
              altitude: height,
              dimensions: [lengthM * 1.04, widthM * 1.05, 0.18],
              material: Color.fromCssColorString("#26383c").withAlpha(0.98),
            });

            addShelterBox({
              lateral: widthM * 0.43,
              altitude: height * 0.51,
              dimensions: [lengthM * 0.88, 0.08, height * 0.70],
              material: Color.fromCssColorString("#9bc0c9").withAlpha(0.30),
            });

            addShelterBox({
              lateral: widthM * 0.20,
              altitude: 0.33,
              dimensions: [lengthM * 0.56, 0.48, 0.46],
              material: Color.fromCssColorString("#7d573b").withAlpha(0.98),
            });

            for (const forward of [-lengthM * 0.45, lengthM * 0.45]) {
              for (const lateral of [-widthM * 0.42, widthM * 0.42]) {
                addShelterBox({
                  forward,
                  lateral,
                  altitude: height * 0.49,
                  dimensions: [0.14, 0.14, height * 0.90],
                  material: Color.fromCssColorString("#334447").withAlpha(0.98),
                });
              }
            }

            layerEntitiesRef.current.mobility.push(...parts);
            continue;
          }

          if (
            ["bus_stop_sign", "wayfinding_sign", "ev_charger"].includes(assetType) &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const isEv = assetType === "ev_charger";
            const isBus = assetType === "bus_stop_sign";
            const headingDeg = Number(asset.properties?.heading_deg || 0);
            const height = Number(asset.properties?.height_m || (isEv ? 1.16 : 2.75));
            const text = String(
              asset.properties?.text ||
              (isEv ? "EV" : isBus ? "BUS" : asset.name)
            );
            const parts = [];

            if (isEv) {
              parts.push(viewer.entities.add({
                id: `ev-charger-${asset.id}`,
                name: asset.name,
                position: Cartesian3.fromDegrees(longitude, latitude, height / 2),
                show: layers.mobility,
                box: {
                  dimensions: new Cartesian3(0.40, 0.32, height),
                  material: Color.fromCssColorString("#2e7256").withAlpha(0.99),
                  outline: true,
                  outlineColor: Color.fromCssColorString("#d7e7de").withAlpha(0.88),
                  distanceDisplayCondition: new DistanceDisplayCondition(0, 440),
                },
                properties: {
                  type: "EV Charging Point",
                  parentUlpIn: "Township Common Parking",
                  propertyId: `ASSET-${asset.id}`,
                  building: "—",
                  floor: "Surface",
                  unit: "—",
                  verticalRange: `0m – ${height}m`,
                  validation: "Step 3.6 refined EV charging furniture",
                },
              }));

              parts.push(viewer.entities.add({
                position: Cartesian3.fromDegrees(longitude, latitude, height * 0.68),
                show: layers.mobility,
                box: {
                  dimensions: new Cartesian3(0.42, 0.34, 0.20),
                  material: Color.fromCssColorString("#15292b").withAlpha(0.98),
                  distanceDisplayCondition: new DistanceDisplayCondition(0, 360),
                },
              }));
            } else {
              const boardWidth = isBus ? 0.76 : 2.25;
              const boardHeight = isBus ? 0.72 : 0.66;
              const boardAltitude = height - boardHeight * 0.52;
              const orientation = localHeadingOrientation(
                longitude,
                latitude,
                boardAltitude,
                headingDeg
              );

              parts.push(viewer.entities.add({
                id: `${assetType}-${asset.id}`,
                name: asset.name,
                position: Cartesian3.fromDegrees(longitude, latitude, height * 0.43),
                show: layers.mobility,
                cylinder: {
                  length: height * 0.86,
                  topRadius: 0.055,
                  bottomRadius: 0.075,
                  material: Color.fromCssColorString("#3a4649"),
                  distanceDisplayCondition: new DistanceDisplayCondition(0, 470),
                },
                properties: {
                  type: isBus ? "Bus Stop Sign" : "Township Wayfinding",
                  parentUlpIn: "Township Public Realm",
                  propertyId: `ASSET-${asset.id}`,
                  building: "—",
                  floor: "Surface",
                  unit: "—",
                  verticalRange: `0m – ${height}m`,
                  validation: "Step 3.6 compact public-realm signage",
                },
              }));

              parts.push(viewer.entities.add({
                position: Cartesian3.fromDegrees(longitude, latitude, boardAltitude),
                orientation,
                show: layers.mobility,
                box: {
                  dimensions: new Cartesian3(boardWidth, 0.13, boardHeight),
                  material: isBus
                    ? Color.fromCssColorString("#d7aa2f").withAlpha(0.99)
                    : Color.fromCssColorString("#174d3f").withAlpha(0.99),
                  outline: true,
                  outlineColor: Color.fromCssColorString("#e9eee9").withAlpha(0.80),
                  distanceDisplayCondition: new DistanceDisplayCondition(0, isBus ? 390 : 440),
                },
              }));
            }

            parts.push(viewer.entities.add({
              position: Cartesian3.fromDegrees(
                longitude,
                latitude,
                isEv ? height * 0.78 : height - 0.34
              ),
              show: layers.mobility,
              label: {
                text,
                font: isEv
                  ? "bold 8px sans-serif"
                  : (isBus ? "bold 10px sans-serif" : "bold 11px sans-serif"),
                style: LabelStyle.FILL_AND_OUTLINE,
                fillColor: isEv
                  ? Color.fromCssColorString("#d9f4e5")
                  : Color.WHITE,
                outlineColor: Color.fromCssColorString("#182224"),
                outlineWidth: 3,
                showBackground: !isEv,
                backgroundColor: Color.fromCssColorString("#153a31").withAlpha(0.62),
                verticalOrigin: VerticalOrigin.CENTER,
                disableDepthTestDistance: 650,
                distanceDisplayCondition: new DistanceDisplayCondition(
                  0,
                  isEv ? 125 : isBus ? 330 : 360
                ),
              },
            }));

            layerEntitiesRef.current.mobility.push(...parts);
            continue;
          }

          if (
            assetType === "fountain" &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const radius = Number(asset.properties?.radius_m || 2.5);
            const base = viewer.entities.add({
              id: `fountain-base-${asset.id}`,
              name: asset.name,
              position: Cartesian3.fromDegrees(longitude, latitude, 0.38),
              show: layers.landscape,
              cylinder: {
                length: 0.55,
                topRadius: radius,
                bottomRadius: radius,
                material: Color.fromCssColorString("#b9b4a7"),
                distanceDisplayCondition: new DistanceDisplayCondition(0, 700),
              },
            });
            const water = viewer.entities.add({
              position: Cartesian3.fromDegrees(longitude, latitude, 0.72),
              show: layers.landscape,
              ellipsoid: {
                radii: new Cartesian3(radius * 0.82, radius * 0.82, 0.10),
                material: Color.fromCssColorString("#62a9c8").withAlpha(0.88),
                distanceDisplayCondition: new DistanceDisplayCondition(0, 700),
              },
            });
            layerEntitiesRef.current.landscape.push(base, water);
            continue;
          }

          if (
            [
              "hospital_forecourt",
              "commercial_plaza",
              "fitness_court",
              "gatehouse",
              "landscape_island",
            ].includes(assetType) &&
            asset.geometry.type === "Polygon"
          ) {
            const positions = geometryToPositions(asset.geometry);
            if (positions.length < 3) continue;

            let material = Color.fromCssColorString("#d8d0be").withAlpha(0.96);
            let height = 0.48;
            let extrudedHeight = 0.60;
            let targetLayer = "amenities";

            if (assetType === "hospital_forecourt") {
              material = Color.fromCssColorString("#c7c7c3").withAlpha(0.96);
            }
            if (assetType === "commercial_plaza") {
              material = Color.fromCssColorString("#c9b894").withAlpha(0.98);
            }
            if (assetType === "fitness_court") {
              material = Color.fromCssColorString("#497b73").withAlpha(0.95);
            }
            if (assetType === "landscape_island") {
              material = Color.fromCssColorString("#578a4f").withAlpha(0.98);
              targetLayer = "landscape";
            }
            if (assetType === "gatehouse") {
              material = Color.fromCssColorString("#d8d2c5").withAlpha(0.98);
              height = 0.42;
              extrudedHeight = Number(asset.properties?.height_m || 3.4);
              targetLayer = "landscape";
            }

            const surface = viewer.entities.add({
              id: `${assetType}-${asset.id}`,
              name: asset.name,
              show: layers[targetLayer],
              polygon: {
                hierarchy: new PolygonHierarchy(positions),
                height,
                extrudedHeight,
                material,
                outline: true,
                outlineColor: Color.fromCssColorString("#ece8df").withAlpha(0.8),
              },
              properties: {
                type: assetType.replaceAll("_", " "),
                parentUlpIn: asset.properties?.parent_ulpin || "Public Infrastructure",
                propertyId: `ASSET-${asset.id}`,
                building: "—",
                floor: "Surface",
                unit: "—",
                verticalRange: "Surface",
                validation: "Township visual asset",
              },
            });

            layerEntitiesRef.current[targetLayer].push(surface);
            continue;
          }

          // ===============================================
          // STEP 3.4 CLOSE-RANGE ARCHITECTURAL ASSETS
          // ===============================================

          if (
            ["tower_entrance", "house_porch", "hospital_canopy", "school_entrance", "gym_entrance"].includes(assetType) &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const isHouse = assetType === "house_porch";
            const isHospital = assetType === "hospital_canopy";
            const isSchool = assetType === "school_entrance";
            const isGym = assetType === "gym_entrance";
            const width = Number(asset.properties?.width_m || (isHouse ? 3.6 : 6.0));
            const depth = Number(asset.properties?.depth_m || (isHouse ? 1.8 : 2.8));
            const canopyHeight = Number(asset.properties?.height_m || (isHouse ? 2.6 : 3.1));
            const detailDistance = new DistanceDisplayCondition(0, isHouse ? 340 : 620);
            const material = isHospital
              ? Color.fromCssColorString("#e7e8e4")
              : isSchool
                ? Color.fromCssColorString("#8d623d")
                : isGym
                  ? Color.fromCssColorString("#334f5b")
                  : isHouse
                    ? Color.fromCssColorString("#6e5845")
                    : Color.fromCssColorString("#454b4d");

            const parts = [];
            parts.push(viewer.entities.add({
              id: `architectural-canopy-${asset.id}`,
              name: asset.name,
              position: Cartesian3.fromDegrees(longitude, latitude, canopyHeight),
              show: layers.buildings,
              box: {
                dimensions: new Cartesian3(width, depth, 0.30),
                material,
                outline: false,
                distanceDisplayCondition: detailDistance,
              },
              properties: {
                type: assetType.replaceAll("_", " "),
                parentUlpIn: asset.properties?.parent_ulpin || "—",
                propertyId: `ASSET-${asset.id}`,
                building: asset.properties?.building_code || "—",
                floor: "Ground",
                unit: "—",
                verticalRange: `0m – ${canopyHeight}m`,
                validation: "Step 3.4 architectural entrance",
              },
            }));

            const columnOffset = width * 0.34 / 97300;
            for (const offset of [-columnOffset, columnOffset]) {
              parts.push(viewer.entities.add({
                position: Cartesian3.fromDegrees(longitude + offset, latitude, canopyHeight / 2),
                show: layers.buildings,
                box: {
                  dimensions: new Cartesian3(0.30, 0.30, canopyHeight),
                  material,
                  distanceDisplayCondition: detailDistance,
                },
              }));
            }

            if (isGym || isSchool) {
              parts.push(viewer.entities.add({
                position: Cartesian3.fromDegrees(longitude, latitude - 0.000004, canopyHeight + 0.60),
                show: layers.buildings,
                label: {
                  text: isGym ? "FITNESS CLUB" : "SCHOOL",
                  font: "bold 13px sans-serif",
                  fillColor: Color.WHITE,
                  outlineColor: Color.fromCssColorString("#26312d"),
                  outlineWidth: 3,
                  style: LabelStyle.FILL_AND_OUTLINE,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  distanceDisplayCondition: detailDistance,
                },
              }));
            }

            layerEntitiesRef.current.buildings.push(...parts);
            continue;
          }

          if (
            assetType === "hospital_cross" &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const top = Number(asset.properties?.height_m || 5.8);
            const detailDistance = new DistanceDisplayCondition(0, 780);
            const red = Color.fromCssColorString("#c62828");
            const crossParts = [
              viewer.entities.add({
                id: `hospital-cross-${asset.id}`,
                name: asset.name,
                position: Cartesian3.fromDegrees(longitude, latitude, top),
                show: layers.amenities,
                box: {
                  dimensions: new Cartesian3(0.75, 0.34, 3.2),
                  material: red,
                  distanceDisplayCondition: detailDistance,
                },
                properties: {
                  type: "Hospital Identity",
                  parentUlpIn: asset.properties?.parent_ulpin || "—",
                  propertyId: `ASSET-${asset.id}`,
                  building: "Hospital",
                  floor: "Facade",
                  unit: "—",
                  verticalRange: "Hospital signage",
                  validation: "Civic identity",
                },
              }),
              viewer.entities.add({
                position: Cartesian3.fromDegrees(longitude, latitude, top),
                show: layers.amenities,
                box: {
                  dimensions: new Cartesian3(2.4, 0.34, 0.75),
                  material: red,
                  distanceDisplayCondition: detailDistance,
                },
              }),
            ];
            layerEntitiesRef.current.amenities.push(...crossParts);
            continue;
          }

          if (
            ["ambulance_bay", "school_court"].includes(assetType) &&
            asset.geometry.type === "Polygon"
          ) {
            const positions = geometryToPositions(asset.geometry);
            if (positions.length < 3) continue;
            const isAmbulance = assetType === "ambulance_bay";
            const surface = viewer.entities.add({
              id: `${assetType}-${asset.id}`,
              name: asset.name,
              show: layers.amenities,
              polygon: {
                hierarchy: new PolygonHierarchy(positions),
                height: 0.62,
                material: Color.fromCssColorString(isAmbulance ? "#b44a45" : "#466f72").withAlpha(0.96),
                outline: true,
                outlineColor: Color.WHITE.withAlpha(0.9),
                distanceDisplayCondition: new DistanceDisplayCondition(0, 780),
              },
              properties: {
                type: isAmbulance ? "Ambulance Bay" : "School Sports Court",
                parentUlpIn: asset.properties?.parent_ulpin || "—",
                propertyId: `ASSET-${asset.id}`,
                building: "—",
                floor: "Surface",
                unit: "—",
                verticalRange: "Surface",
                validation: "Step 3.4 civic campus detail",
              },
            });
            layerEntitiesRef.current.amenities.push(surface);
            continue;
          }

          if (
            assetType === "retail_frontage" &&
            asset.geometry.type === "LineString"
          ) {
            const positions = lineStringToPositions(asset.geometry, 0.80);
            if (positions.length < 2) continue;
            const storefront = viewer.entities.add({
              id: `retail-frontage-${asset.id}`,
              name: asset.name,
              show: layers.amenities,
              wall: {
                positions,
                minimumHeights: new Array(positions.length).fill(0.8),
                maximumHeights: new Array(positions.length).fill(4.0),
                material: Color.fromCssColorString("#355e68").withAlpha(0.88),
                outline: true,
                outlineColor: Color.fromCssColorString("#e1c58e").withAlpha(0.85),
                distanceDisplayCondition: new DistanceDisplayCondition(0, 680),
              },
            });
            layerEntitiesRef.current.amenities.push(storefront);
            continue;
          }

          if (
            assetType === "shopping_sign" &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const sign = viewer.entities.add({
              id: `shopping-sign-${asset.id}`,
              name: asset.name,
              position: Cartesian3.fromDegrees(longitude, latitude, 4.6),
              show: layers.amenities,
              label: {
                text: "MARKET SQUARE",
                font: "bold 15px sans-serif",
                fillColor: Color.fromCssColorString("#f4d79a"),
                outlineColor: Color.fromCssColorString("#342d25"),
                outlineWidth: 4,
                style: LabelStyle.FILL_AND_OUTLINE,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: new DistanceDisplayCondition(0, 650),
              },
            });
            layerEntitiesRef.current.amenities.push(sign);
            continue;
          }

          if (
            assetType === "hospital_helipad" &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const altitude = Number(asset.properties?.altitude_m || 20);
            const radius = Number(asset.properties?.radius_m || 5);
            const pad = viewer.entities.add({
              id: `helipad-${asset.id}`,
              name: asset.name,
              position: Cartesian3.fromDegrees(longitude, latitude, altitude),
              show: layers.amenities,
              ellipse: {
                semiMajorAxis: radius,
                semiMinorAxis: radius,
                material: Color.fromCssColorString("#4b5054").withAlpha(0.98),
                outline: true,
                outlineColor: Color.WHITE,
                height: altitude,
                distanceDisplayCondition: new DistanceDisplayCondition(0, 850),
              },
              label: {
                text: "H",
                font: "bold 20px sans-serif",
                fillColor: Color.WHITE,
                outlineColor: Color.fromCssColorString("#b32626"),
                outlineWidth: 3,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: new DistanceDisplayCondition(0, 700),
              },
            });
            layerEntitiesRef.current.amenities.push(pad);
            continue;
          }

          if (
            assetType === "entrance_gate" &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const leftLon = Number(asset.properties?.left_lon);
            const rightLon = Number(asset.properties?.right_lon);
            const gateLat = Number(asset.properties?.gate_lat ?? latitude);
            const height = Number(asset.properties?.height_m || 10.5);
            const towerHeight = Number(asset.properties?.tower_height_m || 12.5);
            const detailDistance = new DistanceDisplayCondition(0, 1600);
            const gateParts = [];
            const gateWidthMeters = Math.max(16, Math.abs(rightLon - leftLon) * 97300);
            const stone = Color.fromCssColorString("#b8aa8b");
            const charcoal = Color.fromCssColorString("#2f3537");
            const bronze = Color.fromCssColorString("#b79b5e");

            // Two monumental gateway towers with a recessed dark inner face.
            for (const pillarLon of [leftLon, rightLon]) {
              gateParts.push(viewer.entities.add({
                position: Cartesian3.fromDegrees(pillarLon, gateLat, towerHeight / 2),
                show: layers.landscape,
                box: {
                  dimensions: new Cartesian3(3.4, 3.6, towerHeight),
                  material: stone,
                  outline: true,
                  outlineColor: bronze,
                  distanceDisplayCondition: detailDistance,
                },
              }));
              gateParts.push(viewer.entities.add({
                position: Cartesian3.fromDegrees(pillarLon, gateLat - 0.000008, towerHeight * 0.55),
                show: layers.landscape,
                box: {
                  dimensions: new Cartesian3(1.65, 0.75, towerHeight * 0.62),
                  material: charcoal,
                  distanceDisplayCondition: detailDistance,
                },
              }));
              gateParts.push(viewer.entities.add({
                position: Cartesian3.fromDegrees(pillarLon, gateLat, towerHeight + 0.42),
                show: layers.landscape,
                box: {
                  dimensions: new Cartesian3(4.0, 4.0, 0.84),
                  material: bronze,
                  distanceDisplayCondition: detailDistance,
                },
              }));
            }

            // Main architectural beam is thick enough to read as structure, not a floating line.
            gateParts.push(viewer.entities.add({
              id: `entrance-gate-${asset.id}`,
              name: asset.name,
              position: Cartesian3.fromDegrees(longitude, gateLat, height),
              show: layers.landscape,
              box: {
                dimensions: new Cartesian3(gateWidthMeters, 2.8, 2.35),
                material: charcoal,
                outline: true,
                outlineColor: bronze,
                distanceDisplayCondition: detailDistance,
              },
              properties: {
                type: "Township Entrance",
                parentUlpIn: "Public Infrastructure",
                propertyId: `ASSET-${asset.id}`,
                building: "CadastraX3D Main Gate",
                floor: "Gateway",
                unit: "—",
                verticalRange: `0m – ${towerHeight}m`,
                validation: "CadastraX3D Township landmark entrance",
              },
            }));

            // Slim lower canopy makes entry/exit lanes feel controlled and architectural.
            gateParts.push(viewer.entities.add({
              position: Cartesian3.fromDegrees(longitude, gateLat + 0.000010, 5.4),
              show: layers.landscape,
              box: {
                dimensions: new Cartesian3(gateWidthMeters * 0.72, 2.0, 0.42),
                material: bronze,
                distanceDisplayCondition: new DistanceDisplayCondition(0, 900),
              },
            }));

            gateParts.push(viewer.entities.add({
              position: Cartesian3.fromDegrees(longitude, gateLat - 0.000004, height + 0.15),
              show: layers.landscape,
              label: {
                text: "CADASTRAX3D  TOWNSHIP",
                font: "bold 18px sans-serif",
                style: LabelStyle.FILL_AND_OUTLINE,
                fillColor: Color.fromCssColorString("#f0d893"),
                outlineColor: Color.fromCssColorString("#171c1e"),
                outlineWidth: 4,
                verticalOrigin: VerticalOrigin.CENTER,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
                distanceDisplayCondition: new DistanceDisplayCondition(0, 1050),
              },
            }));

            for (const [laneText, laneLon] of [
              ["ENTRY", longitude - gateWidthMeters / 4 / 97300],
              ["EXIT", longitude + gateWidthMeters / 4 / 97300],
            ]) {
              gateParts.push(viewer.entities.add({
                position: Cartesian3.fromDegrees(laneLon, gateLat - 0.000038, 0.92),
                show: layers.landscape,
                label: {
                  text: laneText,
                  font: "bold 14px sans-serif",
                  style: LabelStyle.FILL_AND_OUTLINE,
                  fillColor: Color.WHITE,
                  outlineColor: Color.fromCssColorString("#212629"),
                  outlineWidth: 3,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                  distanceDisplayCondition: new DistanceDisplayCondition(0, 520),
                },
              }));
            }

            layerEntitiesRef.current.landscape.push(...gateParts);
            continue;
          }

          if (
            assetType === "boundary_wall" &&
            asset.geometry.type === "LineString"
          ) {
            const positions = lineStringToPositions(asset.geometry, 1.05);
            if (positions.length < 2) continue;
            const wall = viewer.entities.add({
              id: `boundary-wall-${asset.id}`,
              name: asset.name,
              show: layers.landscape,
              polyline: {
                positions,
                width: 6,
                material: Color.fromCssColorString("#787a74").withAlpha(0.96),
                distanceDisplayCondition: new DistanceDisplayCondition(0, 1200),
              },
            });
            layerEntitiesRef.current.landscape.push(wall);
            continue;
          }

          if (
            assetType === "traffic_signal" &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const height = Number(asset.properties?.height_m || 5.2);
            const armLongitude = Number(asset.properties?.arm_lon ?? longitude);
            const armLatitude = Number(asset.properties?.arm_lat ?? latitude);
            const detailDistance = new DistanceDisplayCondition(0, 520);

            const pole = viewer.entities.add({
              id: `traffic-signal-pole-${asset.id}`,
              name: asset.name,
              position: Cartesian3.fromDegrees(longitude, latitude, height / 2),
              show: layers.signals,
              cylinder: {
                length: height,
                topRadius: 0.065,
                bottomRadius: 0.10,
                material: Color.fromCssColorString("#3c4144"),
                distanceDisplayCondition: detailDistance,
              },
              properties: {
                type: "Traffic Signal",
                parentUlpIn: "Public Infrastructure",
                propertyId: `ASSET-${asset.id}`,
                building: "—",
                floor: "—",
                unit: "—",
                verticalRange: `0m – ${height}m`,
                validation: "Major junction signal",
              },
            });

            const mastArm = viewer.entities.add({
              show: layers.signals,
              polyline: {
                positions: [
                  Cartesian3.fromDegrees(longitude, latitude, height - 0.15),
                  Cartesian3.fromDegrees(armLongitude, armLatitude, height - 0.15),
                ],
                width: 3.0,
                material: Color.fromCssColorString("#3c4144"),
                distanceDisplayCondition: detailDistance,
              },
            });

            const housing = viewer.entities.add({
              position: Cartesian3.fromDegrees(armLongitude, armLatitude, height - 0.15),
              show: layers.signals,
              box: {
                dimensions: new Cartesian3(0.34, 0.28, 1.12),
                material: Color.fromCssColorString("#181b1d"),
                outline: true,
                outlineColor: Color.fromCssColorString("#555b5e"),
                distanceDisplayCondition: detailDistance,
              },
            });

            const lensSpecs = [
              [height + 0.18, "#7d3030"],
              [height - 0.15, "#8a772f"],
              [height - 0.48, "#315f3d"],
            ];

            layerEntitiesRef.current.signals.push(pole, mastArm, housing);

            for (const [lensHeight, lensColor] of lensSpecs) {
              const lens = viewer.entities.add({
                position: Cartesian3.fromDegrees(armLongitude, armLatitude, lensHeight),
                show: layers.signals,
                ellipsoid: {
                  radii: new Cartesian3(0.085, 0.085, 0.055),
                  material: Color.fromCssColorString(lensColor),
                  outline: true,
                  outlineColor: Color.fromCssColorString("#080909"),
                  distanceDisplayCondition: detailDistance,
                },
              });
              layerEntitiesRef.current.signals.push(lens);
            }
            continue;
          }

          if (
            [
              "park",
              "surface_parking",
              "playground",
            ].includes(assetType) &&
            asset.geometry.type === "Polygon"
          ) {

            const positions =
              geometryToPositions(asset.geometry);

            if (positions.length < 3) {
              continue;
            }

            let amenityColor =
              Color.fromCssColorString("#5aa469");

            if (assetType === "surface_parking") {
              amenityColor =
                Color.fromCssColorString("#777d82");
            }

            if (assetType === "playground") {
              amenityColor =
                Color.fromCssColorString("#d4a84c");
            }

            const amenityEntity =
              viewer.entities.add({
                id: `colony-amenity-${asset.id}`,
                name: asset.name,
                show: layers.amenities,

                polygon: {
                  hierarchy:
                    new PolygonHierarchy(positions),
                  height: 0.37,
                  extrudedHeight: 0.52,
                  material:
                    amenityColor.withAlpha(0.88),
                  outline: true,
                  outlineColor: Color.WHITE,
                },

                properties: {
                  type:
                    assetType === "park"
                      ? "Public Park"
                      : assetType === "playground"
                        ? "School Playground"
                        : "Common Parking",
                  parentUlpIn:
                    asset.properties?.parent_ulpin || "—",
                  propertyId: `ASSET-${asset.id}`,
                  building: "—",
                  floor: "Surface",
                  unit: "—",
                  verticalRange: "Surface",
                  validation: "Planned colony amenity",
                },
              });

            layerEntitiesRef.current.amenities.push(amenityEntity);

            const bounds =
              getGeometryBounds(asset.geometry);

            if (bounds) {
              const labelEntity =
                viewer.entities.add({
                  position:
                    Cartesian3.fromDegrees(
                      (bounds.minLon + bounds.maxLon) / 2,
                      (bounds.minLat + bounds.maxLat) / 2,
                      2.0
                    ),
                  show: layers.amenities,
                  label: {
                    text: asset.name,
                    font: "bold 11px sans-serif",
                    style: LabelStyle.FILL_AND_OUTLINE,
                    fillColor: Color.WHITE,
                    outlineColor: Color.BLACK,
                    outlineWidth: 3,
                    verticalOrigin: VerticalOrigin.BOTTOM,
                    disableDepthTestDistance:
                      Number.POSITIVE_INFINITY,
                    distanceDisplayCondition:
                      new DistanceDisplayCondition(0, 700),
                  },
                });

              layerEntitiesRef.current.amenities.push(labelEntity);
            }

            continue;
          }


          if (
            assetType === "streetlight" &&
            asset.geometry.type === "Point"
          ) {
            const [longitude, latitude] = asset.geometry.coordinates;
            const height = Number(asset.properties?.height_m || 8);
            const lampLongitude = Number(asset.properties?.lamp_lon ?? longitude);
            const lampLatitude = Number(asset.properties?.lamp_lat ?? latitude);
            const detailDistance = new DistanceDisplayCondition(0, 560);

            const pole = viewer.entities.add({
              id: `colony-light-${asset.id}`,
              name: asset.name,
              position: Cartesian3.fromDegrees(longitude, latitude, height / 2),
              show: layers.lights,
              cylinder: {
                length: height,
                topRadius: 0.045,
                bottomRadius: 0.095,
                material: Color.fromCssColorString("#4a4f52"),
                distanceDisplayCondition: detailDistance,
              },
              properties: {
                type: "Modern LED Street Light",
                parentUlpIn: "Public Infrastructure",
                propertyId: `ASSET-${asset.id}`,
                building: "—",
                floor: "—",
                unit: "—",
                verticalRange: `0m – ${height}m`,
                validation: asset.properties?.road_name || "Road lighting",
              },
            });

            const arm = viewer.entities.add({
              show: layers.lights,
              polyline: {
                positions: [
                  Cartesian3.fromDegrees(longitude, latitude, height - 0.18),
                  Cartesian3.fromDegrees(lampLongitude, lampLatitude, height - 0.18),
                ],
                width: 2.4,
                material: Color.fromCssColorString("#4a4f52"),
                distanceDisplayCondition: detailDistance,
              },
            });

            const lampHead = viewer.entities.add({
              position: Cartesian3.fromDegrees(
                lampLongitude,
                lampLatitude,
                height - 0.22
              ),
              show: layers.lights,
              box: {
                dimensions: new Cartesian3(0.95, 0.26, 0.12),
                material: Color.fromCssColorString("#2b2f31"),
                outline: true,
                outlineColor: Color.fromCssColorString("#6f7679"),
                distanceDisplayCondition: detailDistance,
              },
            });

            const ledPanel = viewer.entities.add({
              position: Cartesian3.fromDegrees(
                lampLongitude,
                lampLatitude,
                height - 0.30
              ),
              show: layers.lights,
              box: {
                dimensions: new Cartesian3(0.72, 0.18, 0.035),
                material: Color.fromCssColorString("#d8d5c8"),
                distanceDisplayCondition: detailDistance,
              },
            });

            layerEntitiesRef.current.lights.push(pole, arm, lampHead, ledPanel);
            continue;
          }


          const positions =
            geometryToPositions(
              property.geometry
            );


          if (
            positions.length < 3
          ) {

            continue;
          }


          let group =
            "apartments";


          let category =
            "apartment";


          let normalColor =
            Color.ROYALBLUE
              .withAlpha(
                0.88
              );


          if (
            property.type ===
            "Apartment"
          ) {

            const parsedFloor =
              parseInt(
                property.floor,
                10
              );


            const floorIndex =
              Number.isFinite(
                parsedFloor
              )

                ? Math.max(
                    0,

                    Math.min(
                      floorColors.length - 1,
                      parsedFloor - 1
                    )
                  )

                : 0;


            normalColor =
              floorColors[
                floorIndex
              ]
                .withAlpha(
                  0.88
                );
          }


          if (
            property.type ===
            "Basement Parking"
          ) {

            group =
              "parking";

            category =
              "parking";

            normalColor =
              Color.ORANGE
                .withAlpha(
                  0.90
                );
          }


          if (
            property.type ===
            "Underground Utility"
          ) {

            group =
              "utilities";

            category =
              "utility";

            normalColor =
              Color.CYAN
                .withAlpha(
                  0.90
                );
          }


          const entity =
            viewer.entities.add({
              id:
                property.property_id,

              name:
                `${property.building ?? ""} ${property.type} ${property.unit}`,

              show:
                layers[group],

              polygon: {
                hierarchy:
                  new PolygonHierarchy(
                    positions
                  ),

                height:
                  property.z_min,

                extrudedHeight:
                  property.z_max,

                material:
                  normalColor,

                outline:
                  true,

                outlineColor:
                  Color.WHITE,
              },

              properties: {
                type:
                  property.type,

                parentUlpIn:
                  property.parent_ulpin,

                propertyId:
                  property.property_id,

                building:
                  property.building
                  ?? "—",

                floor:
                  property.floor,

                unit:
                  property.unit,

                verticalRange:
                  `${property.z_min}m – ${property.z_max}m`,

                validation:
                  property.validation,
              },
            });


          registerVisualDefault(
            entity,
            normalColor,
            Color.WHITE
          );


          layerEntitiesRef
            .current[
              group
            ]
            .push(
              entity
            );


          spatialObjectsRef
            .current
            .push({
              id:
                property.unit,

              category,

              entity,

              normalColor,

              propertyId:
                property.property_id,

              parentUlpIn:
                property.parent_ulpin,

              building:
                property.building,

              floor:
                property.floor,

              searchTerms: [
                property.unit,

                property.property_id,

                property.building,

                property.type,

                property.parent_ulpin,

                `${property.building} ${property.unit}`,
              ],
            });
        }


        // =================================================
        // BUILDING FOOTPRINTS
        // =================================================

        for (
          const feature
          of gisData.features
        ) {

          if (
            !feature.geometry
          ) {

            continue;
          }


          const geometries =
            [];


          if (
            feature.geometry.type ===
            "Polygon"
          ) {

            geometries.push(
              feature.geometry
            );
          }


          if (
            feature.geometry.type ===
            "MultiPolygon"
          ) {

            for (
              const polygonCoordinates
              of feature.geometry.coordinates
            ) {

              geometries.push({
                type:
                  "Polygon",

                coordinates:
                  polygonCoordinates,
              });
            }
          }


          const buildingCode =
            feature.properties
              ?.building_code
            ??
            feature.name
            ??
            `B${feature.id}`;


          const parentUlpIn =
            feature.properties
              ?.parent_ulpin
            ??
            "Imported GIS";


          const floors =
            Number(
              feature.properties
                ?.floors
              ??
              4
            );


          const totalHeight =
            Number(
              feature.properties
                ?.height_m
              ??
              floors * 3.2
            );


          const floorHeight =
            totalHeight /
            floors;


          const buildingType =
            feature.properties
              ?.building_type
            ??
            feature.feature_type
            ??
            "Building";

          const blockCode =
            feature.properties?.block_code ?? "—";

          const addressCode =
            feature.properties?.address_code ?? buildingCode;

          const addressNumber =
            Number(feature.properties?.address_number || 0);

          const unitsPerFloor =
            Number(feature.properties?.units_per_floor || 0);


          const buildingTypeLower =
            String(buildingType)
              .toLowerCase();


          const isResidentialHouse =
            buildingTypeLower
              .includes("residential house");


          const facadePalette = String(
            feature.properties?.facade_palette || ""
          ).toLowerCase();

          const facadeFamily = String(
            feature.properties?.facade_family || "standard"
          ).toLowerCase();

          const facadeColors = {
            warm_ivory: "#c8c0ae",
            cool_stone: "#aab2b8",
            sandstone_glass: "#b9a486",
            sage_stone: "#a8b2a2",
            terracotta_grey: "#aa8170",
            pearl_grey: "#c3c6c4",
            champagne_stone: "#c7b79b",
            villa_cream: "#d6c9aa",
            villa_sand: "#c9aa7d",
            villa_grey: "#b8b5ad",
            villa_warm: "#c7a18d",
            villa_white: "#dedbd2",
            villa_sage: "#aab7a4",
            school_cream: "#d5b879",
            hospital_white: "#d8dbd9",
            commercial_warm: "#b18c58",
            fitness_glass: "#718da0",
            office_glass: "#668b8e",
            clubhouse_green: "#73927f",
            security_grey: "#777c7d",
            utility_grey: "#85898a",
            water_blue: "#739ab3",
            community_sage: "#82967f",
            daycare_soft: "#bd9caf",
          };

          let buildingColor = Color.fromCssColorString(
            facadeColors[facadePalette] || "#aaa4b6"
          );

          if (isResidentialHouse && !facadeColors[facadePalette]) {
            buildingColor = Color.fromCssColorString("#c9a777");
          }

          if (buildingTypeLower.includes("school")) {
            buildingColor = Color.fromCssColorString("#d5b879");
          }
          if (buildingTypeLower.includes("hospital")) {
            buildingColor = Color.fromCssColorString("#d8dbd9");
          }
          if (buildingTypeLower.includes("shopping")) {
            buildingColor = Color.fromCssColorString("#b18c58");
          }
          if (buildingTypeLower.includes("gym")) {
            buildingColor = Color.fromCssColorString("#718da0");
          }


          const buildingKey =
            getBuildingKey(
              parentUlpIn,
              buildingCode
            );


          if (
            !buildingsByKeyRef
              .current
              .has(
                buildingKey
              )
          ) {

            buildingsByKeyRef
              .current
              .set(
                buildingKey,
                {
                  footprints: [],
                  slabs: [],
                  labels: [],
                  centerLon: null,
                  centerLat: null,
                  totalHeight: 0,
                  bounds: null,
                  footprintPositions: null,
                  floors,
                  unitsPerFloor,
                  floorHeight,
                  blockCode,
                  addressCode,
                  addressNumber,
                  buildingCode,
                  buildingName: feature.name,
                  buildingType,
                  parentUlpIn,
                }
              );
          }


          const buildingVisuals =
            buildingsByKeyRef
              .current
              .get(
                buildingKey
              );


          for (
            let geometryIndex = 0;
            geometryIndex <
            geometries.length;
            geometryIndex++
          ) {

            const geometry =
              geometries[
                geometryIndex
              ];


            const positions =
              geometryToPositions(
                geometry
              );


            if (
              positions.length < 3
            ) {

              continue;
            }


            // =============================================
            // BUILDING FOOTPRINT
            // =============================================

            const footprintMaterial =
              buildingColor
                .withAlpha(
                  1.0
                );


            const footprintEntity =
              viewer.entities.add({
                id:
                  `gis-${feature.id}-${geometryIndex}`,

                name:
                  `${buildingCode} Building Footprint`,

                show:
                  layers.buildings,

                polygon: {
                  hierarchy:
                    new PolygonHierarchy(
                      positions
                    ),

                  height:
                    0.38,

                  extrudedHeight:
                    Math.max(0.52, totalHeight),

                  material:
                    footprintMaterial,

                  outline:
                    true,

                  outlineColor:
                    Color.fromCssColorString("#ddd7ca").withAlpha(0.28),
                },

                properties: {
                  type:
                    "Building Footprint",

                  parentUlpIn:
                    parentUlpIn,

                  propertyId:
                    `GIS-${feature.id}`,

                  building:
                    buildingCode,

                  floor:
                    "—",

                  unit:
                    "—",

                  verticalRange:
                    `0m – ${totalHeight}m`,

                  validation:
                    "GIS source",

                  blockCode:
                    blockCode,

                  addressCode:
                    addressCode,

                  addressNumber:
                    addressNumber,

                  buildingName:
                    feature.name,

                  buildingType:
                    buildingType,

                  floorCount:
                    floors,

                  unitsPerFloor:
                    unitsPerFloor,

                  floorHeight:
                    floorHeight,

                  heightMeters:
                    totalHeight,
                },
              });


            registerVisualDefault(
              footprintEntity,
              footprintMaterial,
              Color.fromCssColorString("#6f7774").withAlpha(0.34)
            );


            buildingVisuals
              .footprints
              .push(
                footprintEntity
              );


            layerEntitiesRef
              .current
              .buildings
              .push(
                footprintEntity
              );


            // =============================================
            // FLOOR BANDS / FACADE RHYTHM
            // =============================================

            const slabStep =
              isResidentialHouse
                ? 1
                : floors >= 24
                  ? 3
                  : floors >= 12
                    ? 2
                    : 1;

            for (
              let floorIndex = 0;
              floorIndex < floors;
              floorIndex += slabStep
            ) {

              const slabHeight =
                floorIndex *
                floorHeight;


              const slabMaterial =
                Color.WHITE
                  .withAlpha(
                    isResidentialHouse ? 0.075 : 0.055
                  );


              const slab =
                viewer.entities.add({
                  id:
                    `slab-${feature.id}-${geometryIndex}-${floorIndex + 1}`,

                  name:
                    `${buildingCode} Floor ${floorIndex + 1}`,

                  show:
                    layers.buildings,

                  polygon: {
                    hierarchy:
                      new PolygonHierarchy(
                        positions
                      ),

                    height:
                      slabHeight + 0.03,

                    extrudedHeight:
                      slabHeight + 0.14,

                    material:
                      slabMaterial,

                    outline:
                      false,

                    distanceDisplayCondition:
                      new DistanceDisplayCondition(
                        0,
                        isResidentialHouse ? 420 : 760
                      ),
                  },

                  properties: {
                    type:
                      "Building Footprint",

                    parentUlpIn:
                      parentUlpIn,

                    propertyId:
                      `GIS-${feature.id}`,

                    building:
                      buildingCode,

                    floor:
                      "—",

                    unit:
                      "—",

                    verticalRange:
                      `0m – ${totalHeight}m`,

                    validation:
                      "GIS source",
                  },
                });


              registerVisualDefault(
                slab,
                slabMaterial,
                Color.WHITE
              );


              buildingVisuals
                .slabs
                .push(
                  slab
                );


              layerEntitiesRef
                .current
                .buildings
                .push(
                  slab
                );
            }


            // =============================================
            // STEP 3.1 ROOF / PODIUM / VERTICAL DETAILS
            // =============================================

            const bounds = getGeometryBounds(geometry);

            if (bounds && !buildingVisuals.bounds) {
              buildingVisuals.bounds = bounds;
              buildingVisuals.footprintPositions = positions;
            }

            if (geometryIndex === 0) {
              spatialObjectsRef.current.push({
                id: addressCode,
                category: "building",
                entity: footprintEntity,
                propertyId: `GIS-${feature.id}`,
                parentUlpIn,
                building: buildingCode,
                addressCode,
                blockCode,
                searchTerms: [
                  addressCode,
                  buildingCode,
                  feature.name,
                  buildingType,
                  parentUlpIn,
                  blockCode ? `Block ${blockCode}` : "",
                ].filter(Boolean),
              });
            }

            const podiumFloors = Number(feature.properties?.podium_floors || 0);
            const massingStyle = String(feature.properties?.massing_style || "");

            if (podiumFloors > 0 && bounds) {
              const expandLon = (bounds.maxLon - bounds.minLon) * 0.08;
              const expandLat = (bounds.maxLat - bounds.minLat) * 0.08;
              const podiumPositions = [
                Cartesian3.fromDegrees(bounds.minLon - expandLon, bounds.minLat - expandLat),
                Cartesian3.fromDegrees(bounds.maxLon + expandLon, bounds.minLat - expandLat),
                Cartesian3.fromDegrees(bounds.maxLon + expandLon, bounds.maxLat + expandLat),
                Cartesian3.fromDegrees(bounds.minLon - expandLon, bounds.maxLat + expandLat),
              ];
              const podiumMaterial = buildingColor.withAlpha(0.96);
              const podium = viewer.entities.add({
                show: layers.buildings,
                polygon: {
                  hierarchy: new PolygonHierarchy(podiumPositions),
                  height: 0.39,
                  extrudedHeight: podiumFloors * floorHeight,
                  material: podiumMaterial,
                  outline: true,
                  outlineColor: Color.fromCssColorString("#d9d4c8").withAlpha(0.58),
                },
              });
              buildingVisuals.slabs.push(podium);
              layerEntitiesRef.current.buildings.push(podium);
            }

            const roofStyle = String(feature.properties?.roof_style || "flat").toLowerCase();
            let roofMaterial = buildingColor.withAlpha(1.0);
            if (isResidentialHouse) {
              roofMaterial = Color.fromCssColorString(
                roofStyle.includes("terrace") ? "#66584c" : "#7d6654"
              ).withAlpha(1.0);
            } else if (buildingTypeLower.includes("hospital")) {
              roofMaterial = Color.fromCssColorString("#bfc7c8").withAlpha(1.0);
            } else if (buildingTypeLower.includes("school")) {
              roofMaterial = Color.fromCssColorString("#9c7042").withAlpha(1.0);
            } else if (buildingTypeLower.includes("shopping")) {
              roofMaterial = Color.fromCssColorString("#62584f").withAlpha(1.0);
            }
            const roofCap = viewer.entities.add({
              show: layers.buildings,
              polygon: {
                hierarchy: new PolygonHierarchy(positions),
                height: totalHeight + 0.02,
                extrudedHeight: totalHeight + (isResidentialHouse ? 0.55 : 0.32),
                material: roofMaterial,
                outline: false,
              },
            });
            buildingVisuals.slabs.push(roofCap);
            layerEntitiesRef.current.buildings.push(roofCap);

            if (bounds && floors >= 16) {
              const insetLon = (bounds.maxLon - bounds.minLon) * 0.34;
              const insetLat = (bounds.maxLat - bounds.minLat) * 0.34;
              const corePositions = [
                Cartesian3.fromDegrees(bounds.minLon + insetLon, bounds.minLat + insetLat),
                Cartesian3.fromDegrees(bounds.maxLon - insetLon, bounds.minLat + insetLat),
                Cartesian3.fromDegrees(bounds.maxLon - insetLon, bounds.maxLat - insetLat),
                Cartesian3.fromDegrees(bounds.minLon + insetLon, bounds.maxLat - insetLat),
              ];
              const crownHeight = massingStyle === "stepped" ? 3.3 : 2.2;
              const rooftopCore = viewer.entities.add({
                show: layers.buildings,
                polygon: {
                  hierarchy: new PolygonHierarchy(corePositions),
                  height: totalHeight + 0.30,
                  extrudedHeight: totalHeight + crownHeight,
                  material: Color.fromCssColorString("#666d70").withAlpha(0.92),
                  outline: false,
                },
              });
              buildingVisuals.slabs.push(rooftopCore);
              layerEntitiesRef.current.buildings.push(rooftopCore);
            }

            if (bounds && !isResidentialHouse && floors >= 12) {
              const accentColor = Color.fromCssColorString("#e4ddd0").withAlpha(0.36);
              for (const [lon, lat] of [
                [bounds.minLon, bounds.minLat],
                [bounds.maxLon, bounds.maxLat],
              ]) {
                const accent = viewer.entities.add({
                  show: layers.buildings,
                  polyline: {
                    positions: [
                      Cartesian3.fromDegrees(lon, lat, 0.8),
                      Cartesian3.fromDegrees(lon, lat, totalHeight + 0.2),
                    ],
                    width: 1.35,
                    material: accentColor,
                    distanceDisplayCondition: new DistanceDisplayCondition(0, 900),
                  },
                });
                buildingVisuals.slabs.push(accent);
                layerEntitiesRef.current.buildings.push(accent);
              }
            }

            // =============================================
            // STEP 3.4 PROCEDURAL FACADE DETAIL
            // =============================================

            const facadeRing = Array.isArray(geometry.coordinates?.[0])
              ? geometry.coordinates[0].map(([lon, lat]) =>
                  Cartesian3.fromDegrees(lon, lat)
                )
              : [];

            if (facadeRing.length >= 4) {
              let glassColor = Color.fromCssColorString("#526979").withAlpha(0.78);
              if (facadeFamily.includes("blue_glass")) {
                glassColor = Color.fromCssColorString("#476b83").withAlpha(0.86);
              } else if (facadeFamily.includes("charcoal_glass")) {
                glassColor = Color.fromCssColorString("#39484f").withAlpha(0.88);
              } else if (facadeFamily.includes("warm_glass")) {
                glassColor = Color.fromCssColorString("#75675b").withAlpha(0.82);
              } else if (facadeFamily.includes("sage_glass")) {
                glassColor = Color.fromCssColorString("#556f68").withAlpha(0.82);
              }
              if (buildingTypeLower.includes("hospital")) {
                glassColor = Color.fromCssColorString("#3f7f91").withAlpha(0.90);
              } else if (buildingTypeLower.includes("school")) {
                glassColor = Color.fromCssColorString("#557c8e").withAlpha(0.82);
              } else if (buildingTypeLower.includes("shopping")) {
                glassColor = Color.fromCssColorString("#315d68").withAlpha(0.92);
              } else if (buildingTypeLower.includes("gym")) {
                glassColor = Color.fromCssColorString("#285f72").withAlpha(0.92);
              } else if (isResidentialHouse) {
                glassColor = Color.fromCssColorString("#4d6268").withAlpha(0.76);
              }

              const facadeStep =
                isResidentialHouse
                  ? Math.max(1, floors)
                  : floors >= 24
                    ? 5
                    : floors >= 14
                      ? 4
                      : 3;

              const bandFloors = [];
              if (isResidentialHouse) {
                bandFloors.push(Math.max(1, Math.min(floors, 1)));
              } else {
                for (let f = 2; f <= floors; f += facadeStep) {
                  bandFloors.push(f);
                  if (bandFloors.length >= 8) break;
                }
              }

              for (let bandIndex = 0; bandIndex < bandFloors.length; bandIndex++) {
                const floorNumber = bandFloors[bandIndex];
                const bandBase = Math.max(1.05, (floorNumber - 1) * floorHeight + floorHeight * 0.34);
                const bandTop = Math.min(totalHeight - 0.35, bandBase + Math.min(1.15, floorHeight * 0.34));
                if (bandTop <= bandBase) continue;

                const facadeBand = viewer.entities.add({
                  id: `facade-band-${feature.id}-${geometryIndex}-${bandIndex}`,
                  name: `${buildingCode} facade glazing`,
                  show: layers.buildings,
                  wall: {
                    positions: facadeRing,
                    minimumHeights: new Array(facadeRing.length).fill(bandBase),
                    maximumHeights: new Array(facadeRing.length).fill(bandTop),
                    material: glassColor,
                    outline: false,
                    distanceDisplayCondition: new DistanceDisplayCondition(0, 680),
                  },
                });
                buildingVisuals.slabs.push(facadeBand);
                layerEntitiesRef.current.buildings.push(facadeBand);
              }

              // Apartment towers get a second rhythm of thin balcony/slab bands.
              if (!isResidentialHouse && buildingTypeLower.includes("apartment")) {
                const balconyColor = facadeFamily.includes("dark") || facadeFamily.includes("charcoal")
                  ? Color.fromCssColorString("#44494a").withAlpha(0.94)
                  : facadeFamily.includes("terracotta")
                    ? Color.fromCssColorString("#8f6254").withAlpha(0.94)
                    : Color.fromCssColorString("#d5d0c5").withAlpha(0.90);
                const balconyEvery = floors >= 24 ? 5 : 4;
                let balconyIndex = 0;
                for (let f = balconyEvery; f < floors; f += balconyEvery) {
                  if (balconyIndex >= 5) break;
                  const slabBase = Math.min(totalHeight - 0.5, f * floorHeight - 0.18);
                  const balconyBand = viewer.entities.add({
                    id: `balcony-band-${feature.id}-${geometryIndex}-${balconyIndex}`,
                    name: `${buildingCode} balcony band`,
                    show: layers.buildings,
                    wall: {
                      positions: facadeRing,
                      minimumHeights: new Array(facadeRing.length).fill(slabBase),
                      maximumHeights: new Array(facadeRing.length).fill(slabBase + 0.28),
                      material: balconyColor,
                      outline: false,
                      distanceDisplayCondition: new DistanceDisplayCondition(0, 520),
                    },
                  });
                  buildingVisuals.slabs.push(balconyBand);
                  layerEntitiesRef.current.buildings.push(balconyBand);
                  balconyIndex += 1;
                }
              }
            }

            // =============================================
            // BUILDING LABEL
            // =============================================

            const centerLongitude =
              (
                bounds.minLon +
                bounds.maxLon
              ) / 2;


            const centerLatitude =
              (
                bounds.minLat +
                bounds.maxLat
              ) / 2;


            if (!Number.isFinite(buildingVisuals.centerLon)) {
              buildingVisuals.centerLon = centerLongitude;
              buildingVisuals.centerLat = centerLatitude;
            }
            buildingVisuals.totalHeight = Math.max(
              Number(buildingVisuals.totalHeight || 0),
              Number(totalHeight || 0)
            );


            const labelEntity =
              viewer.entities.add({
                id:
                  `label-${feature.id}-${geometryIndex}`,

                position:
                  Cartesian3.fromDegrees(
                    centerLongitude,
                    centerLatitude,
                    totalHeight + 2
                  ),

                show:
                  layers.buildings,

                label: {
                  show:
                    !isResidentialHouse,

                  text:
                    isResidentialHouse
                      ? ""
                      : buildingTypeLower.includes("apartment")
                        ? `${addressCode} • ${floors}F`
                        : feature.name,


                  font:
                    buildingTypeLower.includes("apartment")
                      ? "bold 12px sans-serif"
                      : "bold 13px sans-serif",


                  style:
                    LabelStyle.FILL_AND_OUTLINE,

                  fillColor:
                    Color.WHITE,

                  outlineColor:
                    Color.BLACK,

                  outlineWidth:
                    3,

                  verticalOrigin:
                    VerticalOrigin.BOTTOM,

                  disableDepthTestDistance:
                    Number.POSITIVE_INFINITY,

                  distanceDisplayCondition:
                    new DistanceDisplayCondition(
                      0,
                      buildingTypeLower.includes("apartment") ? 230 : 380
                    ),

                },

                properties: {
                  type:
                    "Building Footprint",

                  parentUlpIn:
                    parentUlpIn,

                  propertyId:
                    `GIS-${feature.id}`,

                  building:
                    buildingCode,

                  floor:
                    "—",

                  unit:
                    "—",

                  verticalRange:
                    `0m – ${totalHeight}m`,

                  validation:
                    "GIS source",

                  blockCode:
                    blockCode,

                  addressCode:
                    addressCode,

                  addressNumber:
                    addressNumber,

                  buildingName:
                    feature.name,

                  buildingType:
                    buildingType,

                  floorCount:
                    floors,

                  unitsPerFloor:
                    unitsPerFloor,

                  floorHeight:
                    floorHeight,

                  heightMeters:
                    totalHeight,
                },
              });


            buildingVisuals
              .labels
              .push(
                labelEntity
              );


            layerEntitiesRef
              .current
              .buildings
              .push(
                labelEntity
              );
          }
        }


        // =================================================
        // CAMERA FIT
        // =================================================

        viewer.zoomTo(
          viewer.entities,

          new HeadingPitchRange(
            CesiumMath.toRadians(
              30
            ),

            CesiumMath.toRadians(
              -30
            ),

            1800
          )
        );
      }

      catch (
        error
      ) {

        console.error(
          "Could not load Bhumi3D scene:",
          error
        );
      }
    }


    loadScene();


    // ====================================================
    // CLICK HANDLER
    // ====================================================

    const handler =
      new ScreenSpaceEventHandler(
        viewer.scene.canvas
      );


    clickHandlerRef.current =
      handler;


    handler.setInputAction(
      (movement) => {

        // ==================================================
        // FOOTPRINT PICK MODE
        // ==================================================

        if (
          footprintPickingRef.current
        ) {

          const cartesian =
            viewer.camera
              .pickEllipsoid(
                movement.position,
                Ellipsoid.WGS84
              );


          if (
            !cartesian
          ) {

            return;
          }


          const cartographic =
            Cartographic.fromCartesian(
              cartesian
            );


          const longitude =
            CesiumMath.toDegrees(
              cartographic.longitude
            );


          const latitude =
            CesiumMath.toDegrees(
              cartographic.latitude
            );


          footprintCornersRef
            .current
            .push({
              longitude,
              latitude,
            });


          footprintHoverRef.current =
            null;


          addFootprintPointEntity(
            viewer,
            longitude,
            latitude
          );


          notifyFootprintProgress();


          if (
            footprintModeRef.current
            === "polygon"
          ) {

            return;
          }


          if (
            footprintCornersRef
              .current
              .length < 2
          ) {

            return;
          }


          const first =
            footprintCornersRef
              .current[0];


          const second =
            footprintCornersRef
              .current[1];


          const minLon =
            Math.min(
              first.longitude,
              second.longitude
            );


          const maxLon =
            Math.max(
              first.longitude,
              second.longitude
            );


          const minLat =
            Math.min(
              first.latitude,
              second.latitude
            );


          const maxLat =
            Math.max(
              first.latitude,
              second.latitude
            );


          const rectanglePositions = [
            Cartesian3.fromDegrees(
              minLon,
              minLat
            ),

            Cartesian3.fromDegrees(
              maxLon,
              minLat
            ),

            Cartesian3.fromDegrees(
              maxLon,
              maxLat
            ),

            Cartesian3.fromDegrees(
              minLon,
              maxLat
            ),
          ];


          const preview =
            viewer.entities.add({
              name:
                "New Property Footprint",

              polygon: {
                hierarchy:
                  new PolygonHierarchy(
                    rectanglePositions
                  ),

                height:
                  0.8,

                extrudedHeight:
                  1.2,

                material:
                  Color.YELLOW
                    .withAlpha(
                      0.45
                    ),

                outline:
                  true,

                outlineColor:
                  Color.BLACK,
              },
            });


          footprintTemporaryEntitiesRef
            .current
            .push(
              preview
            );


          footprintPickingRef.current =
            false;


          viewer.scene.canvas
            .style
            .cursor =
              "default";


          onFootprintPickedRef
            .current?.({
              minLon,
              minLat,
              maxLon,
              maxLat,
            });


          return;
        }


        // ==================================================
        // NORMAL CLICK
        // ==================================================

        const picked =
          viewer.scene.pick(
            movement.position
          );


        if (
          !picked ||
          !picked.id
        ) {
          clearSearchSelection();
          clearBuildingInspection();
          onSelectRef.current(null);
          return;
        }


        const data =
          getEntityData(
            picked.id
          );


        if (
          !data
        ) {

          return;
        }

        if (!isAllowedInspectionClick(data)) {
          return;
        }

        highlightRelationship(
          data,
          picked.id
        );

        const inspectedBuilding = buildingForSelectionData(data);

        if (data.type === "Building Footprint" && inspectedBuilding) {
          showBuildingFloorInspector(inspectedBuilding);
        } else if (data.type === "Virtual Floor" && inspectedBuilding) {
          showBuildingFloorInspector(inspectedBuilding);
          showFloorUnitInspector(inspectedBuilding, Number(data.floor));
        } else if (data.type === "Virtual Apartment" && inspectedBuilding) {
          showBuildingFloorInspector(inspectedBuilding);
          showFloorUnitInspector(
            inspectedBuilding,
            Number(data.floor),
            unitLetterFromDisplay(data.unit)
          );
        } else if (data.type !== "3D Property" && data.type !== "Apartment") {
          clearBuildingInspection({ restore: false });
        }

        onSelectRef.current(
          data
        );
      },

      ScreenSpaceEventType.LEFT_CLICK
    );


    handler.setInputAction(
      (movement) => {
        if (footprintPickingRef.current) return;

        const picked = viewer.scene.pick(movement.position);
        if (!picked?.id) return;

        const data = getEntityData(picked.id);
        if (!data?.building || data.building === "—") return;

        highlightRelationship(data, picked.id);

        const inspectedBuilding = buildingForSelectionData(data);
        if (inspectedBuilding) {
          showBuildingFloorInspector(inspectedBuilding);
          if (data.type === "Virtual Floor") {
            showFloorUnitInspector(inspectedBuilding, Number(data.floor));
          } else if (data.type === "Virtual Apartment") {
            showFloorUnitInspector(
              inspectedBuilding,
              Number(data.floor),
              unitLetterFromDisplay(data.unit)
            );
          }
        }

        onSelectRef.current(data);
        focusBuilding(data);
      },
      ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    );


    handler.setInputAction(
      (movement) => {

        if (!footprintPickingRef.current) {
          footprintHoverRef.current = null;

          const hovered = viewer.scene.pick(movement.endPosition);
          const hoveredData = hovered?.id ? getEntityData(hovered.id) : null;
          const selectable = isAllowedInspectionClick(hoveredData);

          viewer.scene.canvas.style.cursor = selectable ? "pointer" : "default";
          return;
        }

        if (
          footprintModeRef.current !== "polygon" ||
          footprintCornersRef.current.length === 0
        ) {
          footprintHoverRef.current = null;
          viewer.scene.canvas.style.cursor = "crosshair";
          return;
        }


        const cartesian =
          viewer.camera
            .pickEllipsoid(
              movement.endPosition,
              Ellipsoid.WGS84
            );


        if (!cartesian) {

          footprintHoverRef.current =
            null;

          return;
        }


        const cartographic =
          Cartographic
            .fromCartesian(
              cartesian
            );


        footprintHoverRef.current = {
          longitude:
            CesiumMath
              .toDegrees(
                cartographic.longitude
              ),

          latitude:
            CesiumMath
              .toDegrees(
                cartographic.latitude
              ),
        };
      },

      ScreenSpaceEventType.MOUSE_MOVE
    );


    return () => {

      cancelled =
        true;


      if (
        clickHandlerRef.current &&
        !clickHandlerRef.current
          .isDestroyed()
      ) {

        clickHandlerRef.current
          .destroy();
      }


      if (
        !viewer.isDestroyed()
      ) {

        viewer.destroy();
      }


      viewerRef.current =
        null;
    };

  }, []);


  // ======================================================
  // START FOOTPRINT PICKING
  // ======================================================

  useEffect(() => {

    if (
      footprintPickTrigger === 0 ||
      !viewerRef.current
    ) {

      return;
    }


    clearFootprintDrawing();


    footprintPickingRef.current =
      true;


    footprintModeRef.current =
      footprintMode;


    footprintCornersRef.current =
      [];


    footprintHoverRef.current =
      null;


    if (
      footprintMode === "polygon"
    ) {

      createPolygonDrawingPreview(
        viewerRef.current
      );
    }


    notifyFootprintProgress();


    viewerRef.current
      .scene
      .canvas
      .style
      .cursor =
        "crosshair";

  }, [
    footprintPickTrigger,
    footprintMode,
  ]);


  // ======================================================
  // UNDO POLYGON FOOTPRINT POINT
  // ======================================================

  useEffect(() => {

    if (
      footprintUndoTrigger === 0 ||
      !viewerRef.current ||
      !footprintPickingRef.current ||
      footprintModeRef.current
        !== "polygon"
    ) {

      return;
    }


    if (
      footprintCornersRef
        .current
        .length === 0
    ) {

      return;
    }


    footprintCornersRef
      .current
      .pop();


    footprintHoverRef.current =
      null;


    const pointEntity =
      footprintPointEntitiesRef
        .current
        .pop();


    if (pointEntity) {

      viewerRef.current
        .entities
        .remove(
          pointEntity
        );


      footprintTemporaryEntitiesRef
        .current =
          footprintTemporaryEntitiesRef
            .current
            .filter(
              (entity) =>
                entity !== pointEntity
            );
    }


    notifyFootprintProgress();

  }, [
    footprintUndoTrigger,
  ]);


  // ======================================================
  // FINISH POLYGON FOOTPRINT
  // ======================================================

  useEffect(() => {

    if (
      footprintFinishTrigger === 0 ||
      !viewerRef.current ||
      !footprintPickingRef.current ||
      footprintModeRef.current
        !== "polygon"
    ) {

      return;
    }


    if (
      footprintCornersRef
        .current
        .length < 3
    ) {

      return;
    }


    const coordinates =
      footprintCornersRef
        .current
        .map(
          (point) => ({
            longitude:
              point.longitude,

            latitude:
              point.latitude,
          })
        );


    footprintHoverRef.current =
      null;


    footprintPickingRef.current =
      false;


    viewerRef.current
      .scene
      .canvas
      .style
      .cursor =
        "default";


    onFootprintPickedRef
      .current?.({
        coordinates,
      });

  }, [
    footprintFinishTrigger,
  ]);


  // ======================================================
  // CANCEL FOOTPRINT PICKING
  // ======================================================

  useEffect(() => {

    if (
      footprintCancelTrigger === 0 ||
      !viewerRef.current
    ) {

      return;
    }


    footprintPickingRef.current =
      false;


    viewerRef.current
      .scene
      .canvas
      .style
      .cursor =
        "default";


    clearFootprintDrawing();

  }, [
    footprintCancelTrigger,
  ]);


  // ======================================================
  // CAMERA / MANUAL 360° BUILDING EXPLORATION
  // ======================================================

  useEffect(() => {
    const viewer = viewerRef.current;
    const bounds = townshipBoundsRef.current;

    if (!viewer || !cameraCommand?.action) {
      return;
    }

    const action = cameraCommand.action;

    if (action === "focusBuilding") {
      focusBuilding({
        parentUlpIn: cameraCommand.parentUlpIn,
        building: cameraCommand.building,
      });
      return;
    }

    // Leaving a focused building restores the global Earth-fixed camera frame.
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);

    if (["township", "top", "street", "reset"].includes(action)) {
      clearBuildingInspection();
    }

    if (!bounds) {
      return;
    }

    if (action === "top") {
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          bounds.centerLon,
          bounds.centerLat,
          1750
        ),
        orientation: {
          heading: 0,
          pitch: CesiumMath.toRadians(-89.7),
          roll: 0,
        },
        duration: 1.1,
      });
      return;
    }

    if (action === "street") {
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(
          bounds.centerLon,
          bounds.minLat - 0.00034,
          42
        ),
        orientation: {
          heading: 0,
          pitch: CesiumMath.toRadians(-8),
          roll: 0,
        },
        duration: 1.2,
      });
      return;
    }

    if (action === "township" || action === "reset") {
      clearSearchSelection();
      viewer.zoomTo(
        viewer.entities,
        new HeadingPitchRange(
          CesiumMath.toRadians(28),
          CesiumMath.toRadians(-34),
          1800
        )
      );
    }
  }, [cameraCommand]);


  // ======================================================
  // LAYERS
  // ======================================================

  useEffect(() => {

    const groups =
      layerEntitiesRef.current;


    for (
      const entity
      of groups.blocks || []
    ) {

      entity.show =
        layers.blocks;
    }


    for (
      const entity
      of groups.parcels
    ) {

      entity.show =
        layers.parcels;
    }


    for (
      const entity
      of groups.buildings
    ) {

      entity.show =
        layers.buildings;
    }

    for (const entity of inspectionFloorEntitiesRef.current) {
      entity.show = layers.buildings;
    }

    for (const entity of inspectionUnitEntitiesRef.current) {
      entity.show = layers.buildings;
    }


    for (
      const entity
      of groups.roads
    ) {

      entity.show =
        layers.roads;
    }


    for (
      const entity
      of groups.amenities
    ) {

      entity.show =
        layers.amenities;
    }


    for (
      const entity
      of groups.landscape || []
    ) {

      entity.show =
        layers.landscape;
    }


    for (
      const entity
      of groups.lights
    ) {

      entity.show =
        layers.lights;
    }


    for (
      const entity
      of groups.markings
    ) {

      entity.show =
        layers.markings;
    }


    for (
      const entity
      of groups.signals
    ) {

      entity.show =
        layers.signals;
    }


    for (
      const entity
      of groups.mobility || []
    ) {

      entity.show =
        layers.mobility;
    }


    for (
      const entity
      of groups.apartments
    ) {

      entity.show =
        layers.apartments;
    }


    for (
      const entity
      of groups.parking
    ) {

      entity.show =
        layers.parking;
    }


    for (
      const entity
      of groups.utilities
    ) {

      entity.show =
        layers.utilities;
    }

  }, [
    layers,
  ]);

  // City View is intentionally presentation-first; Cadastral View makes
  // legal/spatial boundaries more explicit.  The two modes should not
  // look like the same map with different checkboxes.
  useEffect(() => {
    const cadastral = viewMode === "cadastral";

    for (const { boundary, label, color } of blockVisualsRef.current.values()) {
      if (boundary?.polygon) {
        boundary.polygon.material = color.withAlpha(cadastral ? 0.060 : 0.014);
        boundary.polygon.outlineColor = color.withAlpha(cadastral ? 0.92 : 0.30);
      }
      if (label?.label) {
        label.label.fillColor = Color.WHITE.withAlpha(cadastral ? 0.96 : 0.66);
        label.label.outlineWidth = cadastral ? 4 : 2;
      }
    }

    for (const building of buildingsByKeyRef.current.values()) {
      const apartmentTower = String(building.buildingType || "")
        .toLowerCase()
        .includes("apartment");
      for (const labelEntity of building.labels || []) {
        if (!labelEntity?.label) continue;
        // Apartment address labels belong mainly to technical/cadastral
        // inspection; civic landmarks stay labelled in both views.
        labelEntity.label.show = layers.buildings && (cadastral || !apartmentTower);
      }
    }
  }, [viewMode, layers.blocks, layers.buildings]);


  // ======================================================
  // UNIFIED CADASTRAL SEARCH / MAP FOCUS
  // ======================================================

  useEffect(() => {
    if (searchTrigger === 0 || !viewerRef.current) return;

    const viewer = viewerRef.current;
    clearSearchSelection();
    clearBuildingInspection();

    const target = searchTarget || null;

    if (target?.target_type === "block") {
      const found = focusBlock(target.block_code);
      onSearchResultRef.current({
        found,
        name: found ? `Block ${target.block_code}` : "",
        message: found ? "" : "Block could not be located on the map.",
      });
      return;
    }

    if (target?.target_type === "plot") {
      const parcel = parcelsByUlpInRef.current.get(target.parent_ulpin);
      if (!parcel) {
        onSearchResultRef.current({ found: false, message: "Plot could not be located on the map." });
        return;
      }

      const data = getEntityData(parcel);
      highlightRelationship(data, parcel);
      createParcelSelection(target.parent_ulpin);
      viewer.flyTo(parcel, {
        duration: 1.2,
        offset: new HeadingPitchRange(
          CesiumMath.toRadians(32),
          CesiumMath.toRadians(-42),
          115
        ),
      });
      onSearchResultRef.current({ found: true, name: target.title || parcel.name });
      return;
    }

    if (["building", "floor", "unit"].includes(target?.target_type)) {
      const building = buildingsByKeyRef.current.get(
        getBuildingKey(target.parent_ulpin, target.building_code || target.building)
      );

      if (!building) {
        onSearchResultRef.current({ found: false, message: "Building could not be located on the map." });
        return;
      }

      const data = {
        type:
          target.target_type === "unit"
            ? "Virtual Apartment"
            : target.target_type === "floor"
              ? "Virtual Floor"
              : "Building Footprint",
        parentUlpIn: target.parent_ulpin,
        propertyId: target.spatial_id || target.target_id,
        building: target.building_code || target.building,
        floor: target.floor || "—",
        unit: target.display_unit || target.unit || "—",
        verticalRange:
          Number.isFinite(Number(target.z_min)) && Number.isFinite(Number(target.z_max))
            ? `${target.z_min}m – ${target.z_max}m`
            : `0m – ${target.height_m || building.totalHeight}m`,
        validation: target.validation || "Township address index",
        blockCode: target.block_code || building.blockCode,
        addressCode: target.address_code || building.addressCode,
        addressNumber: target.address_number || building.addressNumber,
        buildingName: target.building_name || building.buildingName,
        buildingType: target.building_type || building.buildingType,
        floorCount: Number(target.floors || building.floors || 0),
        unitsPerFloor: Number(target.units_per_floor || building.unitsPerFloor || 0),
        floorHeight: Number(target.floor_height || building.floorHeight || 0),
        heightMeters: Number(target.height_m || building.totalHeight || 0),
      };

      highlightRelationship(data, building.footprints?.[0] || null);
      createParcelSelection(target.parent_ulpin);

      // Search and mouse interaction share the same temporary inspector.
      // A building result exposes floors; a floor result exposes its units;
      // a unit result exposes the floor and highlights the requested unit.
      showBuildingFloorInspector(building);

      if (target.target_type === "floor") {
        showFloorUnitInspector(building, Number(target.floor));
      } else if (target.target_type === "unit") {
        showFloorUnitInspector(
          building,
          Number(target.floor),
          String(target.unit || "").toUpperCase()
        );
      }

      const totalHeight = Math.max(6, Number(building.totalHeight || target.height_m || 12));
      const targetHeight = target.target_type === "unit" || target.target_type === "floor"
        ? Math.max(2, Number(target.z_min || 0) + Number(target.floor_height || building.floorHeight || 3.2) * 0.5)
        : totalHeight * 0.35;

      viewer.camera.lookAt(
        Cartesian3.fromDegrees(building.centerLon, building.centerLat, targetHeight),
        new HeadingPitchRange(
          CesiumMath.toRadians(35),
          CesiumMath.toRadians(-20),
          target.target_type === "unit"
            ? Math.max(34, totalHeight * 1.15)
            : target.target_type === "floor"
              ? Math.max(42, totalHeight * 1.45)
              : Math.max(45, totalHeight * 3.2)
        )
      );

      onSelectRef.current(data);
      onSearchResultRef.current({
        found: true,
        name: target.title || target.address_code || building.buildingName,
      });
      return;
    }

    // Legacy property fallback for the original 3D property workflow.
    const query = searchText.trim().toLowerCase();
    if (!query) return;

    let result = spatialObjectsRef.current.find(
      (object) => object.propertyId?.toLowerCase() === query
    );

    if (!result) {
      result = spatialObjectsRef.current.find((object) =>
        object.searchTerms.some((term) =>
          String(term).toLowerCase().includes(query)
        )
      );
    }

    if (!result) {
      onSearchResultRef.current({ found: false, message: "Map target not found." });
      return;
    }

    const data = getEntityData(result.entity);
    highlightRelationship(data, result.entity);

    viewer.flyTo(result.entity, {
      duration: 1.3,
      offset: new HeadingPitchRange(
        CesiumMath.toRadians(35),
        CesiumMath.toRadians(-30),
        data?.type === "Land Parcel" ? 110 : 55
      ),
    });

    if (data) onSelectRef.current(data);
    onSearchResultRef.current({ found: true, name: result.entity.name });
  }, [searchTrigger, searchText, searchTarget]);


  // ======================================================
  // COMBINED POSTGIS VALIDATION
  // ======================================================

  useEffect(() => {

    if (
      validationTrigger === 0
    ) {

      return;
    }


    async function runValidation() {

      try {

        // -----------------------------------------------
        // CLEAR OLD VALIDATION
        // -----------------------------------------------

        conflictIdsRef
          .current
          .clear();


        cadastralViolationsRef
          .current =
            [];


        restoreVisuals();


        for (
          const object
          of spatialObjectsRef.current
        ) {

          setValidation(
            object.entity,
            "Valid"
          );
        }


        // -----------------------------------------------
        // RUN BOTH POSTGIS CHECKS
        // -----------------------------------------------

        const [
          topologyResult,
          cadastralResult,
        ] =
          await Promise.all([
            validateTopology(),
            validateCadastral(),
          ]);


        const uiConflicts =
          [];


        let firstFocusEntity =
          null;


        // ===============================================
        // 3D PROPERTY OVERLAPS
        // ===============================================

        for (
          const conflict
          of topologyResult.conflicts || []
        ) {

          const objectA =
            findConflictObject(
              conflict.object_a
            );


          const objectB =
            findConflictObject(
              conflict.object_b
            );


          if (
            objectA
          ) {

            conflictIdsRef
              .current
              .add(
                objectA.propertyId
              );


            objectA.entity
              .polygon
              .material =
                Color.RED
                  .withAlpha(
                    0.95
                  );


            objectA.entity
              .polygon
              .outlineColor =
                Color.DARKRED;


            setValidation(
              objectA.entity,
              "Invalid – 3D spatial conflict"
            );


            if (
              !firstFocusEntity
            ) {

              firstFocusEntity =
                objectA.entity;
            }
          }


          if (
            objectB
          ) {

            conflictIdsRef
              .current
              .add(
                objectB.propertyId
              );


            objectB.entity
              .polygon
              .material =
                Color.RED
                  .withAlpha(
                    0.95
                  );


            objectB.entity
              .polygon
              .outlineColor =
                Color.DARKRED;


            setValidation(
              objectB.entity,
              "Invalid – 3D spatial conflict"
            );
          }


          uiConflicts.push({
            type:
              conflict.type,

            objectA:
              `${conflict.object_a.type} ${conflict.object_a.property_id}`,

            objectB:
              `${conflict.object_b.type} ${conflict.object_b.property_id}`,

            metricLabel:
              "Overlap volume",

            metricValue:
              `${Number(
                conflict.overlap_volume_m3
              ).toFixed(2)} m³`,
          });
        }


        // ===============================================
        // BUILDING ↔ PLOT VIOLATIONS
        // ===============================================

        cadastralViolationsRef
          .current =
            cadastralResult
              .violations
              || [];


        for (
          const violation
          of cadastralViolationsRef.current
        ) {

          applyCadastralViolationStyle(
            violation
          );


          const buildingKey =
            getBuildingKey(
              violation.parent_ulpin,
              violation.building_code
            );


          const building =
            buildingsByKeyRef
              .current
              .get(
                buildingKey
              );


          if (
            !firstFocusEntity &&
            building?.footprints?.length > 0
          ) {

            firstFocusEntity =
              building.footprints[0];
          }


          uiConflicts.push({
            type:
              "Building Outside Parent Plot",

            objectA:
              `Building ${violation.building_code}`,

            objectB:
              `${violation.plot_name} (${violation.parent_ulpin})`,

            metricLabel:
              "Outside plot area",

            metricValue:
              violation.outside_area_m2 !== null

                ? `${Number(
                    violation.outside_area_m2
                  ).toFixed(2)} m²`

                : "Unknown",
          });
        }


        // ===============================================
        // SEND RESULTS TO REACT
        // ===============================================

        const valid =
          uiConflicts.length === 0;


        onValidationResultRef
          .current({
            valid,

            conflicts:
              uiConflicts,
          });


        // ===============================================
        // CAMERA → FIRST PROBLEM
        // ===============================================

        if (
          firstFocusEntity
        ) {

          const data =
            getEntityData(
              firstFocusEntity
            );


          if (
            data
          ) {

            onSelectRef.current(
              data
            );
          }


          viewerRef.current.flyTo(
            firstFocusEntity,
            {
              duration:
                1.3,

              offset:
                new HeadingPitchRange(
                  CesiumMath.toRadians(
                    35
                  ),

                  CesiumMath.toRadians(
                    -30
                  ),

                  75
                ),
            }
          );
        }
      }

      catch (
        error
      ) {

        console.error(
          "Combined validation error:",
          error
        );


        onValidationResultRef
          .current({
            valid:
              false,

            conflicts: [
              {
                type:
                  "Validation service error",

                objectA:
                  "FastAPI",

                objectB:
                  "PostGIS",

                metricLabel:
                  "Status",

                metricValue:
                  "Validation failed",
              },
            ],
          });
      }
    }


    runValidation();

  }, [
    validationTrigger,
  ]);




  // ======================================================
  // CLEAR CADASTRAL INSPECTION WITHOUT RESETTING CAMERA
  // ======================================================

  useEffect(() => {
    if (selectionClearTrigger === 0) return;

    clearSearchSelection();
    clearBuildingInspection();
    restoreVisuals();

    if (viewerRef.current) {
      viewerRef.current.scene.canvas.style.cursor = "default";
    }
  }, [selectionClearTrigger]);


  // ======================================================
  // RESET VALIDATION
  // ======================================================

  useEffect(() => {

    if (
      resetTrigger === 0
    ) {

      return;
    }


    conflictIdsRef
      .current
      .clear();


    cadastralViolationsRef
      .current =
        [];


    clearBuildingInspection();
    clearSearchSelection();
    restoreVisuals();


    for (
      const object
      of spatialObjectsRef.current
    ) {

      setValidation(
        object.entity,
        "Not checked"
      );
    }

  }, [
    resetTrigger,
  ]);


  // ======================================================
  // RENDER
  // ======================================================

  return (

    <div
      ref={
        cesiumContainer
      }

      className="cesium-container"
    />

  );
}


export default CesiumViewer;