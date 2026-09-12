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
  const cesiumContainer = useRef(null);

  const viewerRef = useRef(null);

  const apartmentDataRef = useRef([]);

  const apartmentEntitiesRef = useRef([]);

  const clickHandlerRef = useRef(null);

  // =====================================
  // CREATE CESIUM VIEWER
  // =====================================

  useEffect(() => {
    const viewer = new Viewer(
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
      Color.fromCssColorString("#87CEEB");

    const longitude = 77.209;
    const latitude = 28.6139;

    const parentULPIN =
      "ABC12345678901";

    /*
      Converts metre offsets into
      small latitude/longitude changes.

      This is sufficient for our
      small SIH demonstration model.
    */

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
            CesiumMath.toRadians(latitude)
          )
        );

      return Cartesian3.fromDegrees(
        longitude + longitudeOffset,
        latitude + latitudeOffset,
        height
      );
    }

    // =====================================
    // LAND PARCEL
    // =====================================

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
          Color.LIMEGREEN.withAlpha(0.5),

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

    // =====================================
    // BUILDING DATA
    // =====================================

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

    /*
      Normal apartment centres.

             NORTH

         01        02

         03        04

             SOUTH
    */

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

    // =====================================
    // CREATE FLOORS
    // =====================================

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
        floorIndex * floorHeight;

      const zMax =
        zMin + floorHeight;

      const centerHeight =
        zMin +
        floorHeight / 2 +
        1;

      // Floor slab

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
            Color.GRAY.withAlpha(0.6),

          outline: true,

          outlineColor:
            Color.WHITE,
        },
      });

      // =================================
      // CREATE 4 APARTMENTS
      // =================================

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
          INTENTIONAL DEMO ERROR

          Apartment 404 is shifted
          towards Apartment 403.

          Normal x = +10.5 metres.

          We change it to +7 metres.

          This makes 403 and 404 overlap.
        */

        if (
          floorNumber === 4 &&
          unitIndex === 3
        ) {
          x = 7;
        }

        const propertyId =
          `${parentULPIN}-B01-L${floorString}-U${unitNumber}`;

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
                floorColors[
                  floorIndex
                ].withAlpha(0.9),

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

        // Save original colour
        entity.originalColor =
          floorColors[
            floorIndex
          ].withAlpha(0.9);

        apartmentEntitiesRef.current.push(
          entity
        );

        /*
          Save a simple 3D bounding box.

          This is what our validator
          actually checks.
        */

        apartmentDataRef.current.push({
          unit:
            unitNumber,

          entity:
            entity,

          floor:
            floorString,

          propertyId:
            propertyId,

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

          zMin:
            zMin,

          zMax:
            zMax,
        });
      }
    }

    // =====================================
    // CAMERA
    // =====================================

    viewer.zoomTo(
      viewer.entities,

      new HeadingPitchRange(
        CesiumMath.toRadians(35),

        CesiumMath.toRadians(-25),

        175
      )
    );

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

    // =====================================
    // CLEANUP
    // =====================================

    return () => {
      if (
        clickHandlerRef.current
      ) {
        clickHandlerRef.current.destroy();
      }

      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  }, [onSelect]);

  // =====================================
  // TOPOLOGY VALIDATION
  // =====================================

  useEffect(() => {
    if (validationTrigger === 0) {
      return;
    }

    const apartments =
      apartmentDataRef.current;

    /*
      Reset all apartments before
      performing the test.
    */

    for (
      const apartment of apartments
    ) {
      apartment.entity.box.material =
        apartment.entity.originalColor;

      apartment.entity.properties.validation =
        "Valid";
    }

    const conflicts = [];

    // ---------------------------------
    // Compare every apartment pair
    // ---------------------------------

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

        /*
          Different floors cannot
          conflict in this demonstration.
        */

        if (
          a.floor !== b.floor
        ) {
          continue;
        }

        // Calculate 3D boundaries

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
          a.centerZ -
          a.height / 2;

        const aMaxZ =
          a.centerZ +
          a.height / 2;

        const bMinZ =
          b.centerZ -
          b.height / 2;

        const bMaxZ =
          b.centerZ +
          b.height / 2;

        // Calculate overlap on X

        const overlapX =
          Math.min(
            aMaxX,
            bMaxX
          ) -
          Math.max(
            aMinX,
            bMinX
          );

        // Calculate overlap on Y

        const overlapY =
          Math.min(
            aMaxY,
            bMaxY
          ) -
          Math.max(
            aMinY,
            bMinY
          );

        // Calculate overlap on Z

        const overlapZ =
          Math.min(
            aMaxZ,
            bMaxZ
          ) -
          Math.max(
            aMinZ,
            bMinZ
          );

        /*
          All three dimensions must
          overlap for a real 3D conflict.
        */

        if (
          overlapX > 0 &&
          overlapY > 0 &&
          overlapZ > 0
        ) {
          const volume =
            overlapX *
            overlapY *
            overlapZ;

          conflicts.push({
            a,
            b,
            volume,
          });
        }
      }
    }

    // =================================
    // NO CONFLICT
    // =================================

    if (
      conflicts.length === 0
    ) {
      onValidationResult({
        valid: true,
      });

      return;
    }

    // =================================
    // CONFLICT FOUND
    // =================================

    const firstConflict =
      conflicts[0];

    const apartmentA =
      firstConflict.a;

    const apartmentB =
      firstConflict.b;

    // Turn both red

    apartmentA.entity.box.material =
      Color.RED.withAlpha(0.95);

    apartmentB.entity.box.material =
      Color.RED.withAlpha(0.95);

    apartmentA.entity.properties.validation =
      "Invalid – Overlap";

    apartmentB.entity.properties.validation =
      "Invalid – Overlap";

    const overlapVolume =
      firstConflict.volume.toFixed(1);

    // Send result to App.jsx

    onValidationResult({
      valid: false,

      unitA:
        apartmentA.unit,

      unitB:
        apartmentB.unit,

      volume:
        overlapVolume,
    });

    // Automatically show first conflict

    onSelect({
      type:
        "Apartment",

      parentUlpIn:
        "ABC12345678901",

      propertyId:
        apartmentA.propertyId,

      building:
        "B01",

      floor:
        apartmentA.floor,

      unit:
        apartmentA.unit,

      verticalRange:
        `${apartmentA.zMin}m – ${apartmentA.zMax}m`,

      validation:
        "Invalid – Overlap",
    });

  }, [
    validationTrigger,
    onSelect,
    onValidationResult,
  ]);

  // =====================================
  // RESET VALIDATION
  // =====================================

  useEffect(() => {
    if (resetTrigger === 0) {
      return;
    }

    for (
      const apartment of
      apartmentDataRef.current
    ) {
      apartment.entity.box.material =
        apartment.entity.originalColor;

      apartment.entity.properties.validation =
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