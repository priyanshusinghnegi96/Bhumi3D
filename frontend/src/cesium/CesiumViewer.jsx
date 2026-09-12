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

function CesiumViewer({ onSelect }) {
  const cesiumContainer = useRef(null);

  useEffect(() => {
    const viewer = new Viewer(
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
        skyBox: false,
        skyAtmosphere: false,
        infoBox: false,
        selectionIndicator: false,
      }
    );

    // -------------------------
    // ENVIRONMENT
    // -------------------------

    viewer.scene.backgroundColor =
      Color.fromCssColorString("#87CEEB");

    viewer.scene.globe.baseColor =
      Color.fromCssColorString("#D8C9A7");

    const longitude = 77.209;
    const latitude = 28.6139;

    const parentULPIN =
      "ABC12345678901";

    // -------------------------
    // LAND PARCEL
    // -------------------------

    viewer.entities.add({
      id: "parcel-001",

      name: "Land Parcel",

      position: Cartesian3.fromDegrees(
        longitude,
        latitude,
        0.5
      ),

      box: {
        dimensions: new Cartesian3(
          80,
          65,
          1
        ),

        material:
          Color.LIMEGREEN.withAlpha(0.55),

        outline: true,

        outlineColor:
          Color.DARKGREEN,
      },

      properties: {
        type: "Land Parcel",

        parentUlpIn:
          parentULPIN,

        propertyId:
          parentULPIN,

        building:
          "—",

        floor:
          "—",

        unit:
          "—",

        verticalRange:
          "Surface Parcel",

        validation:
          "Valid",
      },
    });

    // -------------------------
    // APARTMENT SETTINGS
    // -------------------------

    const floorHeight = 7;

    const floorColors = [
      Color.ROYALBLUE,
      Color.DODGERBLUE,
      Color.CORNFLOWERBLUE,
      Color.STEELBLUE,
      Color.LIGHTSTEELBLUE,
    ];

    /*
      Four apartment positions.

      Small longitude / latitude offsets
      move each apartment around the floor.
    */

    const apartmentOffsets = [
      {
        x: -0.00010,
        y: 0.00007,
      },

      {
        x: 0.00010,
        y: 0.00007,
      },

      {
        x: -0.00010,
        y: -0.00007,
      },

      {
        x: 0.00010,
        y: -0.00007,
      },
    ];

    // -------------------------
    // CREATE 5 FLOORS
    // -------------------------

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
        1 +
        floorIndex * floorHeight +
        floorHeight / 2;

      // -------------------------
      // FLOOR SLAB
      // -------------------------

      viewer.entities.add({
        id:
          `floor-slab-${floorNumber}`,

        name:
          `Floor ${floorNumber}`,

        position:
          Cartesian3.fromDegrees(
            longitude,
            latitude,
            centerHeight - 3.1
          ),

        box: {
          dimensions:
            new Cartesian3(
              46,
              36,
              0.3
            ),

          material:
            Color.GRAY.withAlpha(0.75),

          outline: true,

          outlineColor:
            Color.WHITE,
        },
      });

      // -------------------------
      // FOUR APARTMENTS
      // -------------------------

      for (
        let unitIndex = 0;
        unitIndex < 4;
        unitIndex++
      ) {
        const unitNumber =
          `${floorNumber}${String(
            unitIndex + 1
          ).padStart(2, "0")}`;

        const offset =
          apartmentOffsets[
            unitIndex
          ];

        const propertyID =
          `${parentULPIN}-B01-L${floorString}-U${unitNumber}`;

        viewer.entities.add({
          id:
            `unit-${unitNumber}`,

          name:
            `Apartment ${unitNumber}`,

          position:
            Cartesian3.fromDegrees(
              longitude + offset.x,
              latitude + offset.y,
              centerHeight
            ),

          box: {
            dimensions:
              new Cartesian3(
                19,
                14,
                floorHeight - 0.8
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
              propertyID,

            building:
              "B01",

            floor:
              floorString,

            unit:
              unitNumber,

            verticalRange:
              `${zMin}m – ${zMax}m`,

            validation:
              "Valid",
          },
        });
      }
    }

    // -------------------------
    // CAMERA
    // -------------------------

    viewer.zoomTo(
      viewer.entities,

      new HeadingPitchRange(
        CesiumMath.toRadians(35),

        CesiumMath.toRadians(-25),

        170
      )
    );

    // -------------------------
    // CLICK HANDLER
    // -------------------------

    const handler =
      new ScreenSpaceEventHandler(
        viewer.scene.canvas
      );

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

        // Ignore floor slabs
        if (!entity.properties) {
          return;
        }

        const currentTime =
          viewer.clock.currentTime;

        const data = {
          type:
            entity.properties.type
              ?.getValue(currentTime),

          parentUlpIn:
            entity.properties.parentUlpIn
              ?.getValue(currentTime),

          propertyId:
            entity.properties.propertyId
              ?.getValue(currentTime),

          building:
            entity.properties.building
              ?.getValue(currentTime),

          floor:
            entity.properties.floor
              ?.getValue(currentTime),

          unit:
            entity.properties.unit
              ?.getValue(currentTime),

          verticalRange:
            entity.properties.verticalRange
              ?.getValue(currentTime),

          validation:
            entity.properties.validation
              ?.getValue(currentTime),
        };

        onSelect(data);
      },

      ScreenSpaceEventType.LEFT_CLICK
    );

    // -------------------------
    // CLEANUP
    // -------------------------

    return () => {
      handler.destroy();

      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  }, [onSelect]);

  return (
    <div
      ref={cesiumContainer}
      className="cesium-container"
    />
  );
}

export default CesiumViewer;