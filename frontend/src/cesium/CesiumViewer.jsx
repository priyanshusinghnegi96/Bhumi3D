import {
  useEffect,
  useRef,
} from "react";

import {
  Viewer,
  Cartesian3,
  Color,
  HeadingPitchRange,
  Math as CesiumMath,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";

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

  const cesiumContainer = useRef(null);

  const viewerRef = useRef(null);

  const spatialObjectsRef = useRef([]);

  const layerEntitiesRef = useRef({
    parcels: [],
    buildings: [],
    apartments: [],
    parking: [],
    utilities: [],
  });

  const clickHandlerRef = useRef(null);

  const selectedEntityRef = useRef(null);


  // ==========================================
  // GET INFORMATION FROM CESIUM ENTITY
  // ==========================================

  function getEntityData(entity) {

    if (
      !viewerRef.current ||
      !entity ||
      !entity.properties
    ) {
      return null;
    }

    const time =
      viewerRef.current.clock.currentTime;

    return {
      type:
        entity.properties.type
          ?.getValue(time) ?? "—",

      parentUlpIn:
        entity.properties.parentUlpIn
          ?.getValue(time) ?? "—",

      propertyId:
        entity.properties.propertyId
          ?.getValue(time) ?? "—",

      building:
        entity.properties.building
          ?.getValue(time) ?? "—",

      floor:
        entity.properties.floor
          ?.getValue(time) ?? "—",

      unit:
        entity.properties.unit
          ?.getValue(time) ?? "—",

      verticalRange:
        entity.properties.verticalRange
          ?.getValue(time) ?? "—",

      validation:
        entity.properties.validation
          ?.getValue(time) ?? "Not checked",
    };
  }


  // ==========================================
  // SIMPLE 3D COLLISION CALCULATION
  // ==========================================

  function calculateOverlap(a, b) {

    const aMinX =
      a.centerX - a.width / 2;

    const aMaxX =
      a.centerX + a.width / 2;

    const bMinX =
      b.centerX - b.width / 2;

    const bMaxX =
      b.centerX + b.width / 2;


    const aMinY =
      a.centerY - a.depth / 2;

    const aMaxY =
      a.centerY + a.depth / 2;

    const bMinY =
      b.centerY - b.depth / 2;

    const bMaxY =
      b.centerY + b.depth / 2;


    const aMinZ =
      a.centerZ - a.height / 2;

    const aMaxZ =
      a.centerZ + a.height / 2;

    const bMinZ =
      b.centerZ - b.height / 2;

    const bMaxZ =
      b.centerZ + b.height / 2;


    const overlapX =
      Math.min(aMaxX, bMaxX) -
      Math.max(aMinX, bMinX);

    const overlapY =
      Math.min(aMaxY, bMaxY) -
      Math.max(aMinY, bMinY);

    const overlapZ =
      Math.min(aMaxZ, bMaxZ) -
      Math.max(aMinZ, bMinZ);


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


  // ==========================================
  // CREATE THE COMPLETE CESIUM SCENE
  // ==========================================

  useEffect(() => {

    spatialObjectsRef.current = [];

    layerEntitiesRef.current = {
      parcels: [],
      buildings: [],
      apartments: [],
      parking: [],
      utilities: [],
    };


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


    viewerRef.current = viewer;


    viewer.scene.backgroundColor =
      Color.fromCssColorString(
        "#87CEEB"
      );


    const longitude = 77.209;
    const latitude = 28.6139;

    const parentULPIN =
      "ABC12345678901";


    // ========================================
    // CONVERT METRES INTO GPS OFFSET
    // ========================================

    function offsetPosition(
      xMeters,
      yMeters,
      height
    ) {

      const latitudeOffset =
        yMeters / 111320;


      const longitudeOffset =
        xMeters /
        (
          111320 *
          Math.cos(
            CesiumMath.toRadians(
              latitude
            )
          )
        );


      return Cartesian3.fromDegrees(
        longitude + longitudeOffset,
        latitude + latitudeOffset,
        height
      );
    }


    // ========================================
    // LAND PARCEL
    // ========================================

    const parcelEntity =
      viewer.entities.add({

        id: "parcel-001",

        name:
          "Land Parcel",

        position:
          offsetPosition(
            0,
            0,
            0
          ),

        box: {

          dimensions:
            new Cartesian3(
              80,
              65,
              1
            ),

          material:
            Color.LIMEGREEN
              .withAlpha(0.45),

          outline: true,

          outlineColor:
            Color.DARKGREEN,
        },

        properties: {

          type:
            "Land Parcel",

          parentUlpIn:
            parentULPIN,

          propertyId:
            parentULPIN,

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


    layerEntitiesRef.current.parcels.push(
      parcelEntity
    );


    spatialObjectsRef.current.push({

      id:
        parentULPIN,

      category:
        "parcel",

      entity:
        parcelEntity,

      searchTerms: [
        parentULPIN,
        "parcel",
        "land parcel",
      ],
    });


    // ========================================
    // APARTMENT SETTINGS
    // ========================================

    const floorHeight = 7;

    const apartmentWidth = 20;

    const apartmentDepth = 15;

    const apartmentHeight = 6.2;


    const floorColors = [

      Color.ROYALBLUE,

      Color.DODGERBLUE,

      Color.CORNFLOWERBLUE,

      Color.STEELBLUE,

      Color.LIGHTSTEELBLUE,
    ];


    const standardPositions = [

      {
        x: -10.5,
        y: 8,
      },

      {
        x: 10.5,
        y: 8,
      },

      {
        x: -10.5,
        y: -8,
      },

      {
        x: 10.5,
        y: -8,
      },
    ];


    // ========================================
    // CREATE 5 FLOORS
    // ========================================

    for (
      let floorIndex = 0;
      floorIndex < 5;
      floorIndex++
    ) {

      const floorNumber =
        floorIndex + 1;


      const floorString =
        String(floorNumber)
          .padStart(
            2,
            "0"
          );


      const zMin =
        floorIndex *
        floorHeight;


      const zMax =
        zMin +
        floorHeight;


      const centerHeight =
        zMin +
        floorHeight / 2 +
        1;


      // --------------------------------------
      // FLOOR SLAB
      // --------------------------------------

      const slab =
        viewer.entities.add({

          id:
            `slab-${floorNumber}`,

          name:
            `Floor ${floorNumber} Slab`,

          position:
            offsetPosition(
              0,
              0,
              zMin + 1
            ),

          box: {

            dimensions:
              new Cartesian3(
                45,
                36,
                0.3
              ),

            material:
              Color.GRAY
                .withAlpha(0.6),

            outline: true,

            outlineColor:
              Color.WHITE,
          },
        });


      layerEntitiesRef.current.buildings.push(
        slab
      );


      // --------------------------------------
      // FOUR APARTMENTS
      // --------------------------------------

      for (
        let unitIndex = 0;
        unitIndex < 4;
        unitIndex++
      ) {

        const unitNumber =
          `${floorNumber}${String(
            unitIndex + 1
          ).padStart(
            2,
            "0"
          )}`;


        let x =
          standardPositions[
            unitIndex
          ].x;


        const y =
          standardPositions[
            unitIndex
          ].y;


        // ====================================
        // INTENTIONAL CONFLICT FOR SIH DEMO
        // Apartment 404 overlaps 403
        // ====================================

        if (
          floorNumber === 4 &&
          unitIndex === 3
        ) {

          x = 7;
        }


        const propertyId =
          `${parentULPIN}-B01-L${floorString}-U${unitNumber}`;


        const normalColor =
          floorColors[
            floorIndex
          ].withAlpha(0.9);


        const entity =
          viewer.entities.add({

            id:
              `unit-${unitNumber}`,

            name:
              `Apartment ${unitNumber}`,

            position:
              offsetPosition(
                x,
                y,
                centerHeight
              ),

            box: {

              dimensions:
                new Cartesian3(
                  apartmentWidth,
                  apartmentDepth,
                  apartmentHeight
                ),

              material:
                normalColor,

              outline: true,

              outlineColor:
                Color.WHITE,
            },

            properties: {

              type:
                "Apartment",

              parentUlpIn:
                parentULPIN,

              propertyId:
                propertyId,

              building:
                "B01",

              floor:
                floorString,

              unit:
                unitNumber,

              verticalRange:
                `${zMin}m – ${zMax}m`,

              validation:
                "Not checked",
            },
          });


        layerEntitiesRef.current.apartments.push(
          entity
        );


        spatialObjectsRef.current.push({

          id:
            unitNumber,

          category:
            "apartment",

          entity,

          normalColor,

          propertyId,

          floor:
            floorString,

          centerX:
            x,

          centerY:
            y,

          centerZ:
            centerHeight,

          width:
            apartmentWidth,

          depth:
            apartmentDepth,

          height:
            apartmentHeight,

          zMin,

          zMax,

          searchTerms: [

            unitNumber,

            `Apartment ${unitNumber}`,

            propertyId,
          ],
        });
      }
    }


    // ========================================
    // BASEMENT PARKING
    // ========================================

    const parkingWidth = 20;

    const parkingDepth = 15;

    const parkingHeight = 5;


    const parkingPositions = [

      {
        x: -10.5,
        y: 8,
      },

      {
        x: 10.5,
        y: 8,
      },

      {
        x: -10.5,
        y: -8,
      },

      {
        x: 10.5,
        y: -8,
      },
    ];


    for (
      let i = 0;
      i < 4;
      i++
    ) {

      const parkingNumber =
        `P0${i + 1}`;


      const position =
        parkingPositions[i];


      const propertyId =
        `${parentULPIN}-B01-B01-${parkingNumber}`;


      const normalColor =
        Color.ORANGE
          .withAlpha(0.9);


      const entity =
        viewer.entities.add({

          id:
            `parking-${parkingNumber}`,

          name:
            `Parking ${parkingNumber}`,

          position:
            offsetPosition(
              position.x,
              position.y,
              -3.5
            ),

          box: {

            dimensions:
              new Cartesian3(
                parkingWidth,
                parkingDepth,
                parkingHeight
              ),

            material:
              normalColor,

            outline: true,

            outlineColor:
              Color.WHITE,
          },

          properties: {

            type:
              "Basement Parking",

            parentUlpIn:
              parentULPIN,

            propertyId:
              propertyId,

            building:
              "B01",

            floor:
              "Basement 1",

            unit:
              parkingNumber,

            verticalRange:
              "-6m – -1m",

            validation:
              "Not checked",
          },
        });


      layerEntitiesRef.current.parking.push(
        entity
      );


      spatialObjectsRef.current.push({

        id:
          parkingNumber,

        category:
          "parking",

        entity,

        normalColor,

        propertyId,

        floor:
          "Basement 1",

        centerX:
          position.x,

        centerY:
          position.y,

        centerZ:
          -3.5,

        width:
          parkingWidth,

        depth:
          parkingDepth,

        height:
          parkingHeight,

        zMin:
          -6,

        zMax:
          -1,

        searchTerms: [

          parkingNumber,

          `Parking ${parkingNumber}`,

          propertyId,
        ],
      });
    }


    // ========================================
    // UNDERGROUND WATER UTILITY
    // ========================================

    const utilityPropertyId =
      `${parentULPIN}-UG-WATER-001`;


    const utilityColor =
      Color.CYAN
        .withAlpha(0.9);


    const utilityEntity =
      viewer.entities.add({

        id:
          "utility-water-001",

        name:
          "Water Utility W-001",

        position:
          offsetPosition(
            -10.5,
            -8,
            -5
          ),

        box: {

          dimensions:
            new Cartesian3(
              18,
              4,
              2
            ),

          material:
            utilityColor,

          outline: true,

          outlineColor:
            Color.WHITE,
        },

        properties: {

          type:
            "Underground Utility",

          parentUlpIn:
            parentULPIN,

          propertyId:
            utilityPropertyId,

          building:
            "—",

          floor:
            "Underground",

          unit:
            "W-001",

          verticalRange:
            "-6m – -4m",

          validation:
            "Not checked",
        },
      });


    layerEntitiesRef.current.utilities.push(
      utilityEntity
    );


    spatialObjectsRef.current.push({

      id:
        "W-001",

      category:
        "utility",

      entity:
        utilityEntity,

      normalColor:
        utilityColor,

      propertyId:
        utilityPropertyId,

      floor:
        "Underground",

      centerX:
        -10.5,

      centerY:
        -8,

      centerZ:
        -5,

      width:
        18,

      depth:
        4,

      height:
        2,

      zMin:
        -6,

      zMax:
        -4,

      searchTerms: [

        "W-001",

        "water",

        "water utility",

        utilityPropertyId,
      ],
    });


    // ========================================
    // INITIAL CAMERA
    // ========================================

    viewer.zoomTo(

      viewer.entities,

      new HeadingPitchRange(

        CesiumMath.toRadians(
          35
        ),

        CesiumMath.toRadians(
          -18
        ),

        210
      )
    );


    // ========================================
    // CLICK HANDLER
    // ========================================

    const handler =
      new ScreenSpaceEventHandler(
        viewer.scene.canvas
      );


    clickHandlerRef.current =
      handler;


    handler.setInputAction(

      (movement) => {

        const pickedObject =
          viewer.scene.pick(
            movement.position
          );


        if (
          !pickedObject ||
          !pickedObject.id
        ) {

          return;
        }


        const entity =
          pickedObject.id;


        const data =
          getEntityData(
            entity
          );


        if (data) {

          onSelect(
            data
          );
        }

      },

      ScreenSpaceEventType.LEFT_CLICK
    );


    // ========================================
    // CLEANUP
    // ========================================

    return () => {

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


      viewerRef.current = null;
    };

  }, []);


  // ==========================================
  // LAYER CHECKBOXES
  // ==========================================

  useEffect(() => {

    const layerRefs =
      layerEntitiesRef.current;


    for (
      const entity
      of layerRefs.parcels
    ) {

      entity.show =
        layers.parcels;
    }


    for (
      const entity
      of layerRefs.buildings
    ) {

      entity.show =
        layers.buildings;
    }


    for (
      const entity
      of layerRefs.apartments
    ) {

      entity.show =
        layers.apartments;
    }


    for (
      const entity
      of layerRefs.parking
    ) {

      entity.show =
        layers.parking;
    }


    for (
      const entity
      of layerRefs.utilities
    ) {

      entity.show =
        layers.utilities;
    }

  }, [layers]);


  // ==========================================
  // SEARCH + STRONG CAMERA ZOOM
  // ==========================================

  useEffect(() => {

    if (
      searchTrigger === 0 ||
      !viewerRef.current
    ) {

      return;
    }


    const viewer =
      viewerRef.current;


    const query =
      searchText
        .trim()
        .toLowerCase();


    if (!query) {

      return;
    }


    // ----------------------------------------
    // FIND EXACT UNIT FIRST
    // ----------------------------------------

    let result =
      spatialObjectsRef.current.find(

        (object) =>
          object.id
            .toLowerCase() ===
          query
      );


    // ----------------------------------------
    // THEN SEARCH PROPERTY ID / NAME
    // ----------------------------------------

    if (!result) {

      result =
        spatialObjectsRef.current.find(

          (object) =>
            object.searchTerms
              ?.some(

                (term) =>
                  term
                    .toLowerCase()
                    .includes(
                      query
                    )
              )
        );
    }


    // ----------------------------------------
    // NOTHING FOUND
    // ----------------------------------------

    if (!result) {

      onSearchResult({
        found: false,
      });

      return;
    }


    // Make searched object visible

    result.entity.show =
      true;


    // ----------------------------------------
    // REMOVE OLD SEARCH HIGHLIGHT
    // ----------------------------------------

    if (
      selectedEntityRef.current &&
      selectedEntityRef.current
        .normalColor
    ) {

      selectedEntityRef.current
        .entity.box.material =
          selectedEntityRef.current
            .normalColor;
    }


    selectedEntityRef.current =
      result;


    // ----------------------------------------
    // HIGHLIGHT SEARCHED OBJECT
    // ----------------------------------------

    if (
      result.entity.box
    ) {

      result.entity.box.material =
        Color.YELLOW
          .withAlpha(0.95);


      result.entity.box.outlineColor =
        Color.BLACK;
    }


    // ----------------------------------------
    // CAMERA FLIES CLOSE TO RESULT
    // ----------------------------------------

    viewer.flyTo(

      result.entity,

      {
        duration: 1.5,

        offset:
          new HeadingPitchRange(

            CesiumMath.toRadians(
              35
            ),

            CesiumMath.toRadians(
              -25
            ),

            28
          ),
      }
    );


    // ----------------------------------------
    // UPDATE RIGHT PANEL
    // ----------------------------------------

    const data =
      getEntityData(
        result.entity
      );


    if (data) {

      onSelect(
        data
      );
    }


    onSearchResult({

      found: true,

      name:
        result.entity.name ||
        result.id,
    });

  }, [
    searchTrigger,
    searchText,
  ]);


  // ==========================================
  // TOPOLOGY VALIDATION
  // ==========================================

  useEffect(() => {

    if (
      validationTrigger === 0
    ) {

      return;
    }


    const objects =
      spatialObjectsRef.current;


    // Reset colors/status first

    for (
      const object of objects
    ) {

      if (
        object.normalColor &&
        object.entity.box
      ) {

        object.entity.box.material =
          object.normalColor;


        object.entity.box.outlineColor =
          Color.WHITE;


        if (
          object.entity.properties
        ) {

          object.entity
            .properties
            .validation =
              "Valid";
        }
      }
    }


    const conflicts = [];


    // ========================================
    // APARTMENT vs APARTMENT
    // ========================================

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
          a.floor !== b.floor
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


    // ========================================
    // PARKING vs UTILITY
    // ========================================

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


    // ========================================
    // NO CONFLICTS
    // ========================================

    if (
      conflicts.length === 0
    ) {

      onValidationResult({

        valid: true,

        conflicts: [],
      });

      return;
    }


    // ========================================
    // MAKE CONFLICTS RED
    // ========================================

    for (
      const conflict
      of conflicts
    ) {

      conflict.a
        .entity
        .box
        .material =
          Color.RED
            .withAlpha(0.95);


      conflict.b
        .entity
        .box
        .material =
          Color.RED
            .withAlpha(0.95);


      conflict.a
        .entity
        .properties
        .validation =
          "Invalid – Conflict";


      conflict.b
        .entity
        .properties
        .validation =
          "Invalid – Conflict";
    }


    onValidationResult({

      valid: false,

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


    // Show first conflict in side panel

    const first =
      conflicts[0].a;


    const data =
      getEntityData(
        first.entity
      );


    if (data) {

      onSelect(
        data
      );
    }

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


    for (
      const object
      of spatialObjectsRef.current
    ) {

      if (
        object.normalColor &&
        object.entity.box
      ) {

        object.entity.box.material =
          object.normalColor;


        object.entity.box.outlineColor =
          Color.WHITE;


        object.entity
          .properties
          .validation =
            "Not checked";
      }
    }


    selectedEntityRef.current =
      null;

  }, [resetTrigger]);


  // ==========================================
  // COMPONENT
  // ==========================================

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