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


  // Keep latest callbacks available
  // without rebuilding Cesium.

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


    // GeoJSON polygons usually repeat
    // the first coordinate at the end.
    // Cesium does not need the duplicate.

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


  function setValidation(
    entity,
    value
  ) {

    const property =
      entity?.properties
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
  // AABB 3D COLLISION
  // =========================================

  function calculateOverlap(
    a,
    b
  ) {

    const aMinX =
      a.centerX -
      a.width / 2;

    const aMaxX =
      a.centerX +
      a.width / 2;


    const bMinX =
      b.centerX -
      b.width / 2;

    const bMaxX =
      b.centerX +
      b.width / 2;


    const aMinY =
      a.centerY -
      a.depth / 2;

    const aMaxY =
      a.centerY +
      a.depth / 2;


    const bMinY =
      b.centerY -
      b.depth / 2;

    const bMaxY =
      b.centerY +
      b.depth / 2;


    const aMinZ =
      a.zMin;

    const aMaxZ =
      a.zMax;


    const bMinZ =
      b.zMin;

    const bMaxZ =
      b.zMax;


    const overlapX =
      Math.min(
        aMaxX,
        bMaxX
      ) -
      Math.max(
        aMinX,
        bMinX
      );


    const overlapY =
      Math.min(
        aMaxY,
        bMaxY
      ) -
      Math.max(
        aMinY,
        bMinY
      );


    const overlapZ =
      Math.min(
        aMaxZ,
        bMaxZ
      ) -
      Math.max(
        aMinZ,
        bMinZ
      );


    if (
      overlapX > 0 &&
      overlapY > 0 &&
      overlapZ > 0
    ) {

      return (
        overlapX *
        overlapY *
        overlapZ
      );
    }


    return 0;
  }


  // =========================================
  // CREATE CESIUM + LOAD POSTGIS SCENE
  // =========================================

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
        // Determine local coordinate origin
        // ---------------------------------

        const parcel =
          scene.parcels[0];


        const parcelBounds =
          getGeometryBounds(
            parcel.geometry
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
          const parcelRecord
          of scene.parcels
        ) {

          const positions =
            geometryToPositions(
              parcelRecord.geometry
            );


          const entity =
            viewer.entities.add({

              id:
                `parcel-${parcelRecord.ulpin}`,

              name:
                parcelRecord.name,

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
                  parcelRecord.ulpin,

                propertyId:
                  parcelRecord.ulpin,

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
        // PROPERTIES
        // =================================

        const floorColors = [

          Color.ROYALBLUE,

          Color.DODGERBLUE,

          Color.CORNFLOWERBLUE,

          Color.STEELBLUE,

          Color.LIGHTSTEELBLUE,
        ];


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


          let category =
            "apartments";


          let normalColor =
            Color.ROYALBLUE
              .withAlpha(0.9);


          if (
            property.type ===
            "Apartment"
          ) {

            category =
              "apartments";


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


          if (
            property.type ===
            "Basement Parking"
          ) {

            category =
              "parking";


            normalColor =
              Color.ORANGE
                .withAlpha(
                  0.9
                );
          }


          if (
            property.type ===
            "Underground Utility"
          ) {

            category =
              "utilities";


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
              category
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

              category:
                category ===
                "apartments"

                  ? "apartment"

                  : category ===
                    "parking"

                    ? "parking"

                    : "utility",

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
        // GENERATE FLOOR SLABS
        // FROM DATABASE APARTMENTS
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
        // CAMERA
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
          "Could not load scene:",
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
  // LAYER CONTROLS
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
  // SEARCH
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
            object.id
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
                    term
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


    // Restore previous search highlight

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


    // Highlight searched property

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

      found: true,

      name:
        result.entity.name,
    });

  }, [
    searchTrigger,
    searchText,
  ]);


  // =========================================
  // TOPOLOGY VALIDATION
  // =========================================

  useEffect(() => {

    if (
      validationTrigger === 0
    ) {

      return;
    }


    const objects =
      spatialObjectsRef.current;


    for (
      const object
      of objects
    ) {

      object.entity
        .polygon
        .material =
          object.normalColor;


      object.entity
        .polygon
        .outlineColor =
          Color.WHITE;


      setValidation(
        object.entity,
        "Valid"
      );
    }


    selectedEntityRef.current =
      null;


    const conflicts =
      [];


    // Apartment ↔ Apartment

    const apartments =
      objects.filter(
        (object) =>
          object.category ===
          "apartment"
      );


    for (
      let i = 0;
      i < apartments.length;
      i++
    ) {

      for (
        let j = i + 1;
        j < apartments.length;
        j++
      ) {

        const a =
          apartments[i];


        const b =
          apartments[j];


        if (
          a.floor !==
          b.floor
        ) {

          continue;
        }


        const volume =
          calculateOverlap(
            a,
            b
          );


        if (
          volume > 0
        ) {

          conflicts.push({

            type:
              "3D Ownership Volume Overlap",

            objectA:
              `Apartment ${a.id}`,

            objectB:
              `Apartment ${b.id}`,

            volume:
              volume.toFixed(1),

            a,

            b,
          });
        }
      }
    }


    // Parking ↔ Utility

    const parking =
      objects.filter(
        (object) =>
          object.category ===
          "parking"
      );


    const utilities =
      objects.filter(
        (object) =>
          object.category ===
          "utility"
      );


    for (
      const parkingObject
      of parking
    ) {

      for (
        const utilityObject
        of utilities
      ) {

        const volume =
          calculateOverlap(

            parkingObject,

            utilityObject
          );


        if (
          volume > 0
        ) {

          conflicts.push({

            type:
              "Underground Infrastructure Collision",

            objectA:
              `Parking ${parkingObject.id}`,

            objectB:
              `Utility ${utilityObject.id}`,

            volume:
              volume.toFixed(1),

            a:
              parkingObject,

            b:
              utilityObject,
          });
        }
      }
    }


    // No conflicts

    if (
      conflicts.length ===
      0
    ) {

      onValidationResultRef.current({

        valid:
          true,

        conflicts:
          [],
      });

      return;
    }


    // Highlight conflicts

    for (
      const conflict
      of conflicts
    ) {

      conflict.a.entity
        .polygon
        .material =
          Color.RED
            .withAlpha(
              0.95
            );


      conflict.b.entity
        .polygon
        .material =
          Color.RED
            .withAlpha(
              0.95
            );


      setValidation(
        conflict.a.entity,
        "Invalid – Conflict"
      );


      setValidation(
        conflict.b.entity,
        "Invalid – Conflict"
      );
    }


    onValidationResultRef.current({

      valid:
        false,

      conflicts:
        conflicts.map(
          (conflict) => ({

            type:
              conflict.type,

            objectA:
              conflict.objectA,

            objectB:
              conflict.objectB,

            volume:
              conflict.volume,
          })
        ),
    });


    const first =
      conflicts[0].a;


    const firstData =
      getEntityData(
        first.entity
      );


    if (
      firstData
    ) {

      onSelectRef.current(
        firstData
      );
    }

  }, [
    validationTrigger,
  ]);


  // =========================================
  // RESET
  // =========================================

  useEffect(() => {

    if (
      resetTrigger === 0
    ) {

      return;
    }


    for (
      const object
      of spatialObjectsRef.current
    ) {

      object.entity
        .polygon
        .material =
          object.normalColor;


      object.entity
        .polygon
        .outlineColor =
          Color.WHITE;


      setValidation(
        object.entity,
        "Not checked"
      );
    }


    selectedEntityRef.current =
      null;

  }, [
    resetTrigger,
  ]);


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