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

  searchText,
  searchTrigger,
  onSearchResult,

  validationTrigger,
  resetTrigger,
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


  // ======================================================
  // SCENE REFERENCES
  // ======================================================

  const spatialObjectsRef =
    useRef([]);

  const layerEntitiesRef =
    useRef({
      parcels: [],
      buildings: [],
      roads: [],
      amenities: [],
      lights: [],
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

  function highlightBuildingVisuals(
    building
  ) {

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
            Color.MAGENTA
              .withAlpha(
                0.72
              );


        footprint
          .polygon
          .outlineColor =
            Color.YELLOW;
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
            Color.GOLD
              .withAlpha(
                0.36
              );


        slab
          .polygon
          .outlineColor =
            Color.YELLOW;
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
            Color.YELLOW;
      }
    }
  }


  // ======================================================
  // HIGHLIGHT CADASTRAL RELATIONSHIP
  // ======================================================

  function highlightRelationship(
    data,
    exactEntity = null
  ) {

    restoreVisuals();


    if (!data) {
      return;
    }


    // ----------------------------------------------------
    // PARENT LAND PLOT
    // ----------------------------------------------------

    const parcel =
      parcelsByUlpInRef
        .current
        .get(
          data.parentUlpIn
        );


    if (
      parcel?.polygon
    ) {

      parcel
        .polygon
        .material =
          Color.GOLD
            .withAlpha(
              0.48
            );


      parcel
        .polygon
        .outlineColor =
          Color.YELLOW;
    }


    // ----------------------------------------------------
    // LAND PLOT SELECTED
    // ----------------------------------------------------

    if (
      data.type ===
      "Land Parcel"
    ) {

      for (
        const [
          key,
          building,
        ]
        of buildingsByKeyRef
          .current
          .entries()
      ) {

        if (
          key.startsWith(
            `${data.parentUlpIn}::`
          )
        ) {

          highlightBuildingVisuals(
            building
          );
        }
      }


      // Boundary violations must remain red

      reapplyCadastralViolations();

      return;
    }


    // ----------------------------------------------------
    // BUILDING
    // ----------------------------------------------------

    if (
      data.building &&
      data.building !== "—"
    ) {

      const buildingKey =
        getBuildingKey(
          data.parentUlpIn,
          data.building
        );


      const building =
        buildingsByKeyRef
          .current
          .get(
            buildingKey
          );


      if (
        building
      ) {

        highlightBuildingVisuals(
          building
        );
      }


      // Highlight outlines of properties in building

      for (
        const object
        of spatialObjectsRef.current
      ) {

        if (
          object.parentUlpIn ===
            data.parentUlpIn
          &&
          object.building ===
            data.building
        ) {

          object.entity
            .polygon
            .outlineColor =
              Color.YELLOW;
        }
      }
    }


    // ----------------------------------------------------
    // EXACT APARTMENT / PROPERTY
    // ----------------------------------------------------

    if (
      exactEntity?.polygon &&
      data.type !==
        "Building Footprint"
    ) {

      exactEntity
        .polygon
        .material =
          Color.YELLOW
            .withAlpha(
              0.95
            );


      exactEntity
        .polygon
        .outlineColor =
          Color.BLACK;
    }


    // Ensure known cadastral violations stay red.

    reapplyCadastralViolations();
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
          globe: false,

          baseLayerPicker: false,

          geocoder: false,

          animation: false,

          timeline: false,

          navigationHelpButton: false,

          sceneModePicker: false,

          homeButton: false,

          skyBox: false,

          skyAtmosphere: false,

          infoBox: false,

          selectionIndicator: false,
        }
      );


    viewerRef.current =
      viewer;


    viewer.scene.backgroundColor =
      Color.fromCssColorString(
        "#87CEEB"
      );


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


        buildingsByKeyRef.current =
          new Map();


        layerEntitiesRef.current =
          {
            parcels: [],
            buildings: [],
            roads: [],
            amenities: [],
            lights: [],
            apartments: [],
            parking: [],
            utilities: [],
          };


        // =================================================
        // LAND PLOTS
        // =================================================

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


          const normalMaterial =
            Color.LIMEGREEN
              .withAlpha(
                0.48
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

            const roadMaterial =
              Color.fromCssColorString("#474c52")
                .withAlpha(0.96);

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

            const [longitude, latitude] =
              asset.geometry.coordinates;

            const height =
              Number(asset.properties?.height_m || 8);

            const poleEntity =
              viewer.entities.add({
                id: `colony-light-${asset.id}`,
                name: asset.name,
                position:
                  Cartesian3.fromDegrees(
                    longitude,
                    latitude,
                    height / 2
                  ),
                show: layers.lights,

                cylinder: {
                  length: height,
                  topRadius: 0.08,
                  bottomRadius: 0.12,
                  material:
                    Color.fromCssColorString("#353a3d"),
                },

                properties: {
                  type: "Street Light",
                  parentUlpIn: "Public Infrastructure",
                  propertyId: `ASSET-${asset.id}`,
                  building: "—",
                  floor: "—",
                  unit: "—",
                  verticalRange: `0m – ${height}m`,
                  validation: "Planned infrastructure",
                },
              });

            const lampEntity =
              viewer.entities.add({
                position:
                  Cartesian3.fromDegrees(
                    longitude,
                    latitude,
                    height + 0.12
                  ),
                show: layers.lights,
                point: {
                  pixelSize: 5,
                  color:
                    Color.fromCssColorString("#ffe58a"),
                  outlineColor: Color.WHITE,
                  outlineWidth: 1,
                  disableDepthTestDistance:
                    Number.POSITIVE_INFINITY,
                },
              });

            layerEntitiesRef.current.lights.push(
              poleEntity,
              lampEntity
            );
          }
        }


        // =================================================
        // APARTMENT FLOOR COLORS
        // =================================================

        const floorColors = [
          Color.ROYALBLUE,
          Color.DODGERBLUE,
          Color.CORNFLOWERBLUE,
          Color.STEELBLUE,
        ];


        // =================================================
        // 3D PROPERTY VOLUMES
        // =================================================

        for (
          const property
          of scene.properties
        ) {

          if (
            !property.geometry
          ) {

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


          let buildingColor =
            Color.fromCssColorString("#7657a8");


          if (
            String(buildingType)
              .toLowerCase()
              .includes("school")
          ) {
            buildingColor =
              Color.fromCssColorString("#d88b3d");
          }


          if (
            String(buildingType)
              .toLowerCase()
              .includes("office")
          ) {
            buildingColor =
              Color.fromCssColorString("#2f7f87");
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
                  0.20
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
                    Color.WHITE,
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
              footprintEntity,
              footprintMaterial,
              Color.WHITE
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
            // FLOOR SLABS
            // =============================================

            for (
              let floorIndex = 0;
              floorIndex < floors;
              floorIndex++
            ) {

              const slabHeight =
                floorIndex *
                floorHeight;


              const slabMaterial =
                buildingColor
                  .withAlpha(
                    0.52
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
                      true,

                    outlineColor:
                      Color.WHITE,
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
            // BUILDING LABEL
            // =============================================

            const bounds =
              getGeometryBounds(
                geometry
              );


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
                  text:
                    `${buildingCode} • ${floors}F`,

                  font:
                    "bold 18px sans-serif",

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

            900
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


        highlightRelationship(
          data,
          picked.id
        );


        onSelectRef.current(
          data
        );
      },

      ScreenSpaceEventType.LEFT_CLICK
    );


    handler.setInputAction(
      (movement) => {

        if (
          !footprintPickingRef.current ||
          footprintModeRef.current
            !== "polygon" ||
          footprintCornersRef
            .current
            .length === 0
        ) {

          footprintHoverRef.current =
            null;

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
  // LAYERS
  // ======================================================

  useEffect(() => {

    const groups =
      layerEntitiesRef.current;


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
      of groups.lights
    ) {

      entity.show =
        layers.lights;
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


  // ======================================================
  // SEARCH
  // ======================================================

  useEffect(() => {

    if (
      searchTrigger === 0 ||
      !viewerRef.current
    ) {

      return;
    }


    const query =
      searchText
        .trim()
        .toLowerCase();


    if (
      !query
    ) {

      return;
    }


    let result =
      spatialObjectsRef
        .current
        .find(
          (object) =>
            object.propertyId
              ?.toLowerCase() ===
            query
        );


    if (
      !result
    ) {

      result =
        spatialObjectsRef
          .current
          .find(
            (object) =>
              object.searchTerms
                .some(
                  (term) =>
                    String(
                      term
                    )
                      .toLowerCase()
                      .includes(
                        query
                      )
                )
          );
    }


    if (
      !result
    ) {

      onSearchResultRef
        .current({
          found: false,
        });

      return;
    }


    const data =
      getEntityData(
        result.entity
      );


    highlightRelationship(
      data,
      result.entity
    );


    result.entity.show =
      true;


    viewerRef.current.flyTo(
      result.entity,
      {
        duration:
          1.4,

        offset:
          new HeadingPitchRange(
            CesiumMath.toRadians(
              35
            ),

            CesiumMath.toRadians(
              -30
            ),

            40
          ),
      }
    );


    if (
      data
    ) {

      onSelectRef.current(
        data
      );
    }


    onSearchResultRef
      .current({
        found:
          true,

        name:
          result.entity.name,
      });

  }, [
    searchTrigger,
    searchText,
  ]);


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