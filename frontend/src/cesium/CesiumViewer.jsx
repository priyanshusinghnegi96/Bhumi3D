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

  const clickHandlerRef =
    useRef(null);

  // ======================================
  // HELPER: AABB COLLISION
  // ======================================

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

  // ======================================
  // CREATE VIEWER
  // ======================================

  useEffect(() => {

    spatialObjectsRef.current = [];

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

    const longitude = 77.209;
    const latitude = 28.6139;

    const parentULPIN =
      "ABC12345678901";

    // ======================================
    // METRE OFFSET → GPS POSITION
    // ======================================

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
        longitude +
          longitudeOffset,

        latitude +
          latitudeOffset,

        height
      );
    }

    // ======================================
    // LAND PARCEL
    // ======================================

    viewer.entities.add({
      id: "parcel-001",

      name: "Land Parcel",

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

    // ======================================
    // APARTMENTS
    // ======================================

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

    for (
      let floorIndex = 0;
      floorIndex < 5;
      floorIndex++
    ) {
      const floorNumber =
        floorIndex + 1;

      const floorString =
        String(floorNumber)
          .padStart(2, "0");

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

      // Floor slab

      viewer.entities.add({
        id:
          `slab-${floorNumber}`,

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

      // Apartments

      for (
        let unitIndex = 0;
        unitIndex < 4;
        unitIndex++
      ) {

        const unitNumber =
          `${floorNumber}${String(
            unitIndex + 1
          ).padStart(2, "0")}`;

        let x =
          standardPositions[
            unitIndex
          ].x;

        const y =
          standardPositions[
            unitIndex
          ].y;

        /*
          INTENTIONAL ERROR:

          Shift Apartment 404
          towards Apartment 403.
        */

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
        });
      }
    }

    // ======================================
    // BASEMENT PARKING
    // ======================================

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
              `${parentULPIN}-B01-B01-${parkingNumber}`,

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

      spatialObjectsRef.current.push({
        id:
          parkingNumber,

        category:
          "parking",

        entity,

        normalColor,

        propertyId:
          `${parentULPIN}-B01-B01-${parkingNumber}`,

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
      });
    }

    // ======================================
    // UNDERGROUND WATER UTILITY
    // ======================================

    /*
      The utility is intentionally
      placed inside Parking P03.

      This creates a second
      demonstrable topology conflict.
    */

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
            `${parentULPIN}-UG-WATER-001`,

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
        `${parentULPIN}-UG-WATER-001`,

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
    });

    // ======================================
    // CAMERA
    // ======================================

    viewer.zoomTo(
      viewer.entities,

      new HeadingPitchRange(
        CesiumMath.toRadians(35),

        CesiumMath.toRadians(-18),

        210
      )
    );

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

        if (!entity.properties) {
          return;
        }

        const time =
          viewer.clock.currentTime;

        onSelect({
          type:
            entity.properties.type
              ?.getValue(time),

          parentUlpIn:
            entity.properties.parentUlpIn
              ?.getValue(time),

          propertyId:
            entity.properties.propertyId
              ?.getValue(time),

          building:
            entity.properties.building
              ?.getValue(time),

          floor:
            entity.properties.floor
              ?.getValue(time),

          unit:
            entity.properties.unit
              ?.getValue(time),

          verticalRange:
            entity.properties.verticalRange
              ?.getValue(time),

          validation:
            entity.properties.validation
              ?.getValue(time),
        });
      },

      ScreenSpaceEventType.LEFT_CLICK
    );

    return () => {

      if (
        clickHandlerRef.current
      ) {
        clickHandlerRef.current
          .destroy();
      }

      if (
        !viewer.isDestroyed()
      ) {
        viewer.destroy();
      }
    };

  }, [onSelect]);

  // ======================================
  // VALIDATION ENGINE
  // ======================================

  useEffect(() => {

    if (
      validationTrigger === 0
    ) {
      return;
    }

    const objects =
      spatialObjectsRef.current;

    // Reset colours/status

    for (
      const object of objects
    ) {
      object.entity.box.material =
        object.normalColor;

      object.entity.properties.validation =
        "Valid";
    }

    const conflicts = [];

    // --------------------------------------
    // APARTMENT vs APARTMENT
    // --------------------------------------

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

        // Only compare apartments
        // on the same floor.

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

        if (volume > 0) {

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

    // --------------------------------------
    // PARKING vs UTILITY
    // --------------------------------------

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

        if (volume > 0) {

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

    // ======================================
    // NO CONFLICTS
    // ======================================

    if (
      conflicts.length === 0
    ) {
      onValidationResult({
        valid: true,

        conflicts: [],
      });

      return;
    }

    // ======================================
    // HIGHLIGHT ALL CONFLICTS
    // ======================================

    for (
      const conflict of conflicts
    ) {

      conflict.a.entity.box.material =
        Color.RED
          .withAlpha(0.95);

      conflict.b.entity.box.material =
        Color.RED
          .withAlpha(0.95);

      conflict.a.entity.properties.validation =
        "Invalid – Conflict";

      conflict.b.entity.properties.validation =
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

    // Automatically select
    // the first conflict.

    const first =
      conflicts[0].a;

    onSelect({
      type:
        first.category ===
        "apartment"
          ? "Apartment"
          : first.category ===
            "parking"
            ? "Basement Parking"
            : "Underground Utility",

      parentUlpIn:
        "ABC12345678901",

      propertyId:
        first.propertyId,

      building:
        first.category ===
        "utility"
          ? "—"
          : "B01",

      floor:
        first.floor,

      unit:
        first.id,

      verticalRange:
        `${first.zMin}m – ${first.zMax}m`,

      validation:
        "Invalid – Conflict",
    });

  }, [
    validationTrigger,
    onSelect,
    onValidationResult,
  ]);

  // ======================================
  // RESET
  // ======================================

  useEffect(() => {

    if (
      resetTrigger === 0
    ) {
      return;
    }

    for (
      const object of
      spatialObjectsRef.current
    ) {

      object.entity.box.material =
        object.normalColor;

      object.entity.properties.validation =
        "Not checked";
    }

  }, [resetTrigger]);

  return (
    <div
      ref={cesiumContainer}
      className="cesium-container"
    />
  );
}

export default CesiumViewer;