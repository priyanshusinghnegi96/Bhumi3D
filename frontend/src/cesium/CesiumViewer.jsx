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


  const onSelectRef =
    useRef(onSelect);

  const onSearchResultRef =
    useRef(onSearchResult);

  const onValidationResultRef =
    useRef(onValidationResult);


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


  // =========================================
  // GEOJSON → CESIUM POSITIONS
  // =========================================

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


  // =========================================
  // GEOMETRY BOUNDS
  // =========================================

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


  // =========================================
  // ENTITY INFORMATION
  // =========================================

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


  // =========================================
  // CHANGE VALIDATION PROPERTY
  // =========================================

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


  // =========================================
  // RESTORE ALL PROPERTY COLORS
  // =========================================

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


  // =========================================
  // FIND PROPERTY USING UNIT
  // =========================================

  function findObjectByUnit(
    unit
  ) {

    if (
      unit === null ||
      unit === undefined
    ) {

      return null;
    }


    const searchUnit =
      String(unit)
        .trim()
        .toLowerCase();


    return (
      spatialObjectsRef
        .current
        .find(

          (object) =>
            String(
              object.id
            )
              .toLowerCase() ===
            searchUnit
        )
      ?? null
    );
  }


  // =========================================
  // CREATE CESIUM VIEWER
  // =========================================

  useEffect(() => {

    let cancelled =
      false;


    const viewer =
      new Viewer(
        cesiumContainer.current,
        {
          globe: false,

          baseLayerPicker:
            false,

          geocoder:
            false,

          animation:
            false,

          timeline:
            false,

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


    // =====================================
    // LOAD SCENE FROM POSTGIS
    // =====================================

    async function loadScene() {

      try {

        const scene =
          await getScene();


        if (
          cancelled
        ) {

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


        // ---------------------------------
        // LOCAL ORIGIN
        // ---------------------------------

        const firstParcel =
          scene.parcels[0];


        if (
          !firstParcel
        ) {

          console.error(
            "No parcel found in scene"
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


        // =================================
        // PARCELS
        // =================================

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
            .push(
              entity
            );
        }


        // =================================
        // PROPERTY COLORS
        // =================================

        const floorColors = [

          Color.ROYALBLUE,

          Color.DODGERBLUE,

          Color.CORNFLOWERBLUE,

          Color.STEELBLUE,

          Color.LIGHTSTEELBLUE,
        ];


        // =================================
        // PROPERTIES
        // =================================

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
              .withAlpha(
                0.9
              );


          // ---------------------------------
          // APARTMENT
          // ---------------------------------

          if (
            property.type ===
            "Apartment"
          ) {

            group =
              "apartments";

            category =
              "apartment";


            const floorIndex =
              Math.max(
                0,
                Math.min(
                  4,
                  parseInt(
                    property.floor
                  ) - 1
                )
              );


            normalColor =
              floorColors[
                floorIndex
              ]
                .withAlpha(
                  0.9
                );
          }


          // ---------------------------------
          // PARKING
          // ---------------------------------

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
                  0.9
                );
          }


          // ---------------------------------
          // UTILITY
          // ---------------------------------

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
                  0.9
                );
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
            .current[
              group
            ]
            .push(
              entity
            );


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


        // =================================
        // FLOOR SLABS
        // =================================

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


          const positions =
            [

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
            .push(
              slab
            );
        }


        // =================================
        // INITIAL CAMERA
        // =================================

        viewer.zoomTo(

          viewer.entities,

          new HeadingPitchRange(

            CesiumMath.toRadians(
              35
            ),

            CesiumMath.toRadians(
              -20
            ),

            220
          )
        );
      }

      catch (
        error
      ) {

        console.error(
          "Could not load PostGIS scene:",
          error
        );
      }
    }


    loadScene();


    // =====================================
    // CLICK HANDLER
    // =====================================

    const handler =
      new ScreenSpaceEventHandler(
        viewer.scene.canvas
      );


    clickHandlerRef.current =
      handler;


    handler.setInputAction(

      (movement) => {

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
          data
        ) {

          onSelectRef.current(
            data
          );
        }

      },

      ScreenSpaceEventType.LEFT_CLICK
    );


    // =====================================
    // CLEANUP
    // =====================================

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


  // =========================================
  // LAYERS
  // =========================================

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


  // =========================================
  // SEARCH + CAMERA FOCUS
  // =========================================

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
            String(
              object.id
            )
              .toLowerCase() ===
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

      onSearchResultRef.current({
        found: false,
      });

      return;
    }


    // Restore old yellow search result

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


    if (
      data
    ) {

      onSelectRef.current(
        data
      );
    }


    onSearchResultRef.current({

      found:
        true,

      name:
        result.entity.name,
    });

  }, [
    searchTrigger,
    searchText,
  ]);


  // =========================================
  // POSTGIS TOPOLOGY VALIDATION
  // =========================================

  useEffect(() => {

    if (
      validationTrigger === 0
    ) {

      return;
    }


    async function runValidation() {

      try {

        // ---------------------------------
        // REMOVE SEARCH HIGHLIGHT
        // ---------------------------------

        restorePropertyColors();


        // ---------------------------------
        // RESET STATUS TO VALID
        // ---------------------------------

        for (
          const object
          of spatialObjectsRef.current
        ) {

          setValidation(
            object.entity,
            "Valid"
          );
        }


        // =================================
        // ASK FASTAPI → POSTGIS
        // =================================

        const result =
          await validateTopology();


        // =================================
        // DATABASE SAYS NO CONFLICT
        // =================================

        if (
          result.valid
        ) {

          onValidationResultRef.current({

            valid:
              true,

            conflicts:
              [],
          });


          return;
        }


        // =================================
        // DATABASE FOUND CONFLICTS
        // =================================

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


          // -------------------------------
          // HIGHLIGHT OBJECT A
          // -------------------------------

          if (
            objectA
          ) {

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
                Color.WHITE;


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


          // -------------------------------
          // HIGHLIGHT OBJECT B
          // -------------------------------

          if (
            objectB
          ) {

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
                Color.WHITE;


            setValidation(
              objectB.entity,
              "Invalid – PostGIS conflict"
            );
          }


          // -------------------------------
          // FORMAT FOR EXISTING UI
          // -------------------------------

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
              ).toFixed(
                1
              ),
          });
        }


        // =================================
        // UPDATE VALIDATION PANEL
        // =================================

        onValidationResultRef.current({

          valid:
            false,

          conflicts:
            uiConflicts,
        });


        // =================================
        // SHOW FIRST CONFLICT DETAILS
        // =================================

        if (
          firstConflictObject
        ) {

          const data =
            getEntityData(
              firstConflictObject
                .entity
            );


          if (
            data
          ) {

            onSelectRef.current(
              data
            );
          }


          // Fly toward first conflict

          viewerRef.current.flyTo(

            firstConflictObject
              .entity,

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

      catch (
        error
      ) {

        console.error(
          "PostGIS validation error:",
          error
        );


        onValidationResultRef.current({

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


  // =========================================
  // RESET VALIDATION
  // =========================================

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


  // =========================================
  // RENDER
  // =========================================

  return (

    <div
      ref={
        cesiumContainer
      }

      className=
        "cesium-container"
    />

  );
}


export default CesiumViewer;