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

    // =========================
    // BASIC ENVIRONMENT
    // =========================

    viewer.scene.backgroundColor =
      Color.fromCssColorString("#87CEEB");

    viewer.scene.globe.baseColor =
      Color.fromCssColorString("#D8C9A7");

    const longitude = 77.209;
    const latitude = 28.6139;

    const parentULPIN =
      "ABC12345678901";

    // =========================
    // LAND PARCEL
    // =========================

    viewer.entities.add({
      id: "parcel-001",

      name: "Land Parcel",

      position:
        Cartesian3.fromDegrees(
          longitude,
          latitude,
          0.5
        ),

      box: {
        dimensions:
          new Cartesian3(
            80,
            65,
            1
          ),

        material:
          Color.LIMEGREEN.withAlpha(0.6),

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

    // =========================
    // BUILDING FLOORS
    // =========================

    const floorHeight = 7;

    const floorColors = [
      Color.ROYALBLUE,
      Color.DODGERBLUE,
      Color.CORNFLOWERBLUE,
      Color.STEELBLUE,
      Color.LIGHTSTEELBLUE,
    ];

    for (let i = 0; i < 5; i++) {
      const floorNumber =
        i + 1;

      const floorString =
        String(floorNumber).padStart(
          2,
          "0"
        );

      const unitNumber =
        `${floorNumber}03`;

      const zMin =
        i * floorHeight;

      const zMax =
        zMin + floorHeight;

      const centerHeight =
        1 +
        i * floorHeight +
        floorHeight / 2;

      viewer.entities.add({
        id: `floor-${floorNumber}`,

        name:
          `Floor ${floorNumber}`,

        position:
          Cartesian3.fromDegrees(
            longitude,
            latitude,
            centerHeight
          ),

        box: {
          dimensions:
            new Cartesian3(
              42,
              32,
              floorHeight - 0.5
            ),

          material:
            floorColors[i]
              .withAlpha(0.9),

          outline: true,

          outlineColor:
            Color.WHITE,
        },

        properties: {
          type:
            "Property Unit",

          parentUlpIn:
            parentULPIN,

          propertyId:
            `${parentULPIN}-B01-L${floorString}-U${unitNumber}`,

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

    // =========================
    // CAMERA
    // =========================

    viewer.zoomTo(
      viewer.entities,

      new HeadingPitchRange(
        CesiumMath.toRadians(30),

        CesiumMath.toRadians(-25),

        140
      )
    );

    // =========================
    // CLICK HANDLER
    // =========================

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

    // =========================
    // CLEANUP
    // =========================

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