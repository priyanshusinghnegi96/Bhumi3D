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
} from "cesium";

import {
  getScene,
  validateTopology,
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
  onFootprintPicked,
}) {
  const cesiumContainer =
    useRef(null);

  const viewerRef =
    useRef(null);

  const spatialObjectsRef =
    useRef([]);

  const layerEntitiesRef =
    useRef({
      parcels: [],
      buildings: [],
      apartments: [],
      parking: [],
      utilities: [],
    });

  const selectedEntityRef =
    useRef(null);

  const clickHandlerRef =
    useRef(null);


  // ==========================================
  // FOOTPRINT PICKING REFS
  // ==========================================

  const footprintPickingRef =
    useRef(false);

  const footprintCornersRef =
    useRef([]);

  const footprintTemporaryEntitiesRef =
    useRef([]);


  // ==========================================
  // CALLBACK REFS
  // ==========================================

  const onSelectRef =
    useRef(onSelect);

  const onSearchResultRef =
    useRef(onSearchResult);

  const onValidationResultRef =
    useRef(onValidationResult);

  const onFootprintPickedRef =
    useRef(onFootprintPicked);


  useEffect(() => {
    onSelectRef.current =
      onSelect;
  }, [onSelect]);


  useEffect(() => {
    onSearchResultRef.current =
      onSearchResult;
  }, [onSearchResult]);


  useEffect(() => {
    onValidationResultRef.current =
      onValidationResult;
  }, [onValidationResult]);


  useEffect(() => {
    onFootprintPickedRef.current =
      onFootprintPicked;
  }, [onFootprintPicked]);


  // ==========================================
  // GEOJSON → CESIUM POSITIONS
  // ==========================================

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
      ([longitude, latitude]) =>
        Cartesian3.fromDegrees(
          longitude,
          latitude
        )
    );
  }


  // ==========================================
  // GEOMETRY BOUNDS
  // ==========================================

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
        Math.min(...longitudes),

      maxLon:
        Math.max(...longitudes),

      minLat:
        Math.min(...latitudes),

      maxLat:
        Math.max(...latitudes),
    };
  }


  // ==========================================
  // ENTITY DATA
  // ==========================================

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


  // ==========================================
  // VALIDATION VALUE
  // ==========================================

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
      property.setValue(value);
    }
  }


  // ==========================================
  // RESTORE COLORS
  // ==========================================

  function restorePropertyColors() {
    for (
      const object
      of spatialObjectsRef.current
    ) {
      if (
        object.entity?.polygon
      ) {
        object.entity
          .polygon
          .material =
            object.normalColor;


        object.entity
          .polygon
          .outlineColor =
            Color.WHITE;
      }
    }

    selectedEntityRef.current =
      null;
  }


  // ==========================================
  // FIND UNIT
  // ==========================================

  function findObjectByUnit(unit) {
    if (
      unit === null ||
      unit === undefined
    ) {
      return null;
    }


    const target =
      String(unit)
        .trim()
        .toLowerCase();


    return (
      spatialObjectsRef
        .current
        .find(
          (object) =>
            String(object.id)
              .toLowerCase() ===
            target
        )
      ?? null
    );
  }


  // ==========================================
  // REMOVE TEMPORARY FOOTPRINT DRAWING
  // ==========================================

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

    footprintCornersRef.current =
      [];
  }


  // ==========================================
  // CREATE CESIUM
  // ==========================================

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

          navigationHelpButton:
            false,

          sceneModePicker:
            false,

          homeButton:
            false,

          skyBox:
            false,

          skyAtmosphere:
            false,

          infoBox:
            false,

          selectionIndicator:
            false,
        }
      );


    viewerRef.current =
      viewer;


    viewer.scene.backgroundColor =
      Color.fromCssColorString(
        "#87CEEB"
      );


    // ======================================
    // LOAD POSTGIS SCENE
    // ======================================

    async function loadScene() {
      try {
        const scene =
          await getScene();


        if (cancelled) {
          return;
        }


        spatialObjectsRef.current =
          [];


        layerEntitiesRef.current =
          {
            parcels: [],
            buildings: [],
            apartments: [],
            parking: [],
            utilities: [],
          };


        const firstParcel =
          scene.parcels[0];


        if (!firstParcel) {
          console.error(
            "No parcel found"
          );

          return;
        }


        const parcelBounds =
          getGeometryBounds(
            firstParcel.geometry
          );


        const originLongitude =
          (
            parcelBounds.minLon +
            parcelBounds.maxLon
          ) / 2;


        const originLatitude =
          (
            parcelBounds.minLat +
            parcelBounds.maxLat
          ) / 2;


        const metresPerDegreeLatitude =
          111320;


        const metresPerDegreeLongitude =
          111320 *
          Math.cos(
            CesiumMath.toRadians(
              originLatitude
            )
          );


        function createMetrics(
          geometry,
          zMin,
          zMax
        ) {
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


          return {
            centerX:
              (
                centerLongitude -
                originLongitude
              ) *
              metresPerDegreeLongitude,

            centerY:
              (
                centerLatitude -
                originLatitude
              ) *
              metresPerDegreeLatitude,

            width:
              (
                bounds.maxLon -
                bounds.minLon
              ) *
              metresPerDegreeLongitude,

            depth:
              (
                bounds.maxLat -
                bounds.minLat
              ) *
              metresPerDegreeLatitude,

            zMin,
            zMax,
          };
        }


        // ====================================
        // PARCEL
        // ====================================

        for (
          const parcel
          of scene.parcels
        ) {
          const positions =
            geometryToPositions(
              parcel.geometry
            );


          const entity =
            viewer.entities.add({
              id:
                `parcel-${parcel.ulpin}`,

              name:
                parcel.name,

              polygon: {
                hierarchy:
                  new PolygonHierarchy(
                    positions
                  ),

                height:
                  0,

                extrudedHeight:
                  0.5,

                material:
                  Color.LIMEGREEN
                    .withAlpha(
                      0.45
                    ),

                outline:
                  true,

                outlineColor:
                  Color.DARKGREEN,
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


          layerEntitiesRef
            .current
            .parcels
            .push(entity);
        }


        // ====================================
        // COLORS
        // ====================================

        const floorColors = [
          Color.ROYALBLUE,
          Color.DODGERBLUE,
          Color.CORNFLOWERBLUE,
          Color.STEELBLUE,
          Color.LIGHTSTEELBLUE,
          Color.LIGHTBLUE,
        ];


        // ====================================
        // PROPERTIES
        // ====================================

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


          let group =
            "apartments";

          let category =
            "apartment";

          let normalColor =
            Color.ROYALBLUE
              .withAlpha(0.9);


          if (
            property.type ===
            "Apartment"
          ) {
            group =
              "apartments";

            category =
              "apartment";


            const parsedFloor =
              parseInt(
                property.floor
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
                  0.9
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
                .withAlpha(0.9);
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
                .withAlpha(0.9);
          }


          const entity =
            viewer.entities.add({
              id:
                property.property_id,

              name:
                `${property.type} ${property.unit}`,

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


          layerEntitiesRef
            .current[group]
            .push(entity);


          const metrics =
            createMetrics(
              property.geometry,
              property.z_min,
              property.z_max
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

              floor:
                property.floor,

              zMin:
                property.z_min,

              zMax:
                property.z_max,

              ...metrics,

              searchTerms: [
                property.unit,
                property.property_id,
                property.type,

                `${property.type} ${property.unit}`,
              ],
            });
        }


        // ====================================
        // FLOOR SLABS
        // ====================================

        const apartments =
          scene.properties.filter(
            (property) =>
              property.type ===
              "Apartment"
          );


        const floors =
          [
            ...new Set(
              apartments.map(
                (property) =>
                  property.floor
              )
            ),
          ];


        for (
          const floor
          of floors
        ) {
          const floorProperties =
            apartments.filter(
              (property) =>
                property.floor ===
                floor
            );


          if (
            floorProperties.length ===
            0
          ) {
            continue;
          }


          const bounds =
            floorProperties.map(
              (property) =>
                getGeometryBounds(
                  property.geometry
                )
            );


          const minLon =
            Math.min(
              ...bounds.map(
                (value) =>
                  value.minLon
              )
            );


          const maxLon =
            Math.max(
              ...bounds.map(
                (value) =>
                  value.maxLon
              )
            );


          const minLat =
            Math.min(
              ...bounds.map(
                (value) =>
                  value.minLat
              )
            );


          const maxLat =
            Math.max(
              ...bounds.map(
                (value) =>
                  value.maxLat
              )
            );


          const positions = [
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


          const zMin =
            floorProperties[0]
              .z_min;


          const slab =
            viewer.entities.add({
              id:
                `floor-slab-${floor}`,

              name:
                `Floor ${floor} Slab`,

              polygon: {
                hierarchy:
                  new PolygonHierarchy(
                    positions
                  ),

                height:
                  zMin + 0.05,

                extrudedHeight:
                  zMin + 0.25,

                material:
                  Color.GRAY
                    .withAlpha(
                      0.55
                    ),

                outline:
                  true,

                outlineColor:
                  Color.WHITE,
              },
            });


          layerEntitiesRef
            .current
            .buildings
            .push(slab);
        }


        // ====================================
        // INITIAL CAMERA
        // ====================================

        viewer.zoomTo(
          viewer.entities,

          new HeadingPitchRange(
            CesiumMath.toRadians(35),

            CesiumMath.toRadians(-20),

            220
          )
        );
      }

      catch (error) {
        console.error(
          "Could not load PostGIS scene:",
          error
        );
      }
    }


    loadScene();


    // ======================================
    // CLICK HANDLER
    // ======================================

    const handler =
      new ScreenSpaceEventHandler(
        viewer.scene.canvas
      );


    clickHandlerRef.current =
      handler;


    handler.setInputAction(
      (movement) => {

        // ==================================
        // FOOTPRINT PICKING MODE
        // ==================================

        if (
          footprintPickingRef.current
        ) {
          const cartesian =
            viewer.camera.pickEllipsoid(
              movement.position,

              Ellipsoid.WGS84
            );


          if (!cartesian) {
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


          // -------------------------------
          // DISPLAY CLICKED POINT
          // -------------------------------

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


          // Need two corners
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


          // -------------------------------
          // PREVIEW RECTANGLE
          // -------------------------------

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
            .push(preview);


          footprintPickingRef.current =
            false;


          viewer.canvas.style.cursor =
            "default";


          onFootprintPickedRef.current?.({
            minLon,
            minLat,
            maxLon,
            maxLat,
          });


          return;
        }


        // ==================================
        // NORMAL PROPERTY CLICK
        // ==================================

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


        if (data) {
          onSelectRef.current(
            data
          );
        }

      },

      ScreenSpaceEventType.LEFT_CLICK
    );


    // ======================================
    // CLEANUP
    // ======================================

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


  // ==========================================
  // START FOOTPRINT PICKING
  // ==========================================

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


    footprintCornersRef.current =
      [];


    viewerRef.current.canvas.style.cursor =
      "crosshair";

  }, [
    footprintPickTrigger,
  ]);


  // ==========================================
  // CANCEL FOOTPRINT PICKING
  // ==========================================

  useEffect(() => {
    if (
      footprintCancelTrigger === 0 ||
      !viewerRef.current
    ) {
      return;
    }


    footprintPickingRef.current =
      false;


    viewerRef.current.canvas.style.cursor =
      "default";


    clearFootprintDrawing();

  }, [
    footprintCancelTrigger,
  ]);


  // ==========================================
  // LAYERS
  // ==========================================

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

  }, [layers]);


  // ==========================================
  // SEARCH
  // ==========================================

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


    if (!query) {
      return;
    }


    let result =
      spatialObjectsRef
        .current
        .find(
          (object) =>
            String(object.id)
              .toLowerCase() ===
            query
        );


    if (!result) {
      result =
        spatialObjectsRef
          .current
          .find(
            (object) =>
              object.searchTerms
                .some(
                  (term) =>
                    String(term)
                      .toLowerCase()
                      .includes(
                        query
                      )
                )
          );
    }


    if (!result) {
      onSearchResultRef
        .current({
          found: false,
        });

      return;
    }


    if (
      selectedEntityRef.current
    ) {
      const previous =
        selectedEntityRef.current;


      previous.entity
        .polygon
        .material =
          previous.normalColor;


      previous.entity
        .polygon
        .outlineColor =
          Color.WHITE;
    }


    selectedEntityRef.current =
      result;


    result.entity
      .polygon
      .material =
        Color.YELLOW
          .withAlpha(
            0.95
          );


    result.entity
      .polygon
      .outlineColor =
        Color.BLACK;


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

            35
          ),
      }
    );


    const data =
      getEntityData(
        result.entity
      );


    if (data) {
      onSelectRef.current(
        data
      );
    }


    onSearchResultRef
      .current({
        found: true,

        name:
          result.entity.name,
      });

  }, [
    searchTrigger,
    searchText,
  ]);


  // ==========================================
  // POSTGIS VALIDATION
  // ==========================================

  useEffect(() => {
    if (
      validationTrigger === 0
    ) {
      return;
    }


    async function runValidation() {
      try {
        restorePropertyColors();


        for (
          const object
          of spatialObjectsRef.current
        ) {
          setValidation(
            object.entity,
            "Valid"
          );
        }


        const result =
          await validateTopology();


        if (result.valid) {
          onValidationResultRef
            .current({
              valid: true,
              conflicts: [],
            });

          return;
        }


        const uiConflicts =
          [];


        let firstConflictObject =
          null;


        for (
          const conflict
          of result.conflicts
        ) {
          const objectA =
            findObjectByUnit(
              conflict
                .object_a
                .unit
            );


          const objectB =
            findObjectByUnit(
              conflict
                .object_b
                .unit
            );


          if (objectA) {
            objectA.entity
              .polygon
              .material =
                Color.RED
                  .withAlpha(
                    0.95
                  );


            setValidation(
              objectA.entity,
              "Invalid – PostGIS conflict"
            );


            if (
              !firstConflictObject
            ) {
              firstConflictObject =
                objectA;
            }
          }


          if (objectB) {
            objectB.entity
              .polygon
              .material =
                Color.RED
                  .withAlpha(
                    0.95
                  );


            setValidation(
              objectB.entity,
              "Invalid – PostGIS conflict"
            );
          }


          uiConflicts.push({
            type:
              conflict.type,

            objectA:
              `${conflict.object_a.type} ${conflict.object_a.unit}`,

            objectB:
              `${conflict.object_b.type} ${conflict.object_b.unit}`,

            volume:
              Number(
                conflict.overlap_volume_m3
              ).toFixed(1),
          });
        }


        onValidationResultRef
          .current({
            valid:
              false,

            conflicts:
              uiConflicts,
          });


        if (
          firstConflictObject
        ) {
          const data =
            getEntityData(
              firstConflictObject
                .entity
            );


          if (data) {
            onSelectRef.current(
              data
            );
          }


          viewerRef.current.flyTo(
            firstConflictObject.entity,

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

                  55
                ),
            }
          );
        }
      }

      catch (error) {
        console.error(
          "PostGIS validation error:",
          error
        );


        onValidationResultRef
          .current({
            valid: false,

            conflicts: [
              {
                type:
                  "Validation service error",

                objectA:
                  "FastAPI",

                objectB:
                  "PostGIS",

                volume:
                  "—",
              },
            ],
          });
      }
    }


    runValidation();

  }, [
    validationTrigger,
  ]);


  // ==========================================
  // RESET VALIDATION
  // ==========================================

  useEffect(() => {
    if (
      resetTrigger === 0
    ) {
      return;
    }


    restorePropertyColors();


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


  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div
      ref={cesiumContainer}
      className="cesium-container"
    />
  );
}


export default CesiumViewer;