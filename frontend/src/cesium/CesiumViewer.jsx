import { useEffect, useRef } from "react";

import {
  Viewer,
  Cartesian3,
  Color,
  HeadingPitchRange,
  Math as CesiumMath,
} from "cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";

function CesiumViewer() {
  const cesiumContainer = useRef(null);

  useEffect(() => {
    const viewer = new Viewer(cesiumContainer.current, {
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
    });

    viewer.scene.backgroundColor =
      Color.fromCssColorString("#87CEEB");

    viewer.scene.globe.baseColor =
      Color.fromCssColorString("#D8C9A7");

    const longitude = 77.209;
    const latitude = 28.6139;

    // Land parcel
    viewer.entities.add({
      id: "parcel",
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
          Color.LIMEGREEN.withAlpha(0.6),

        outline: true,
        outlineColor: Color.DARKGREEN,
      },
    });

    // Five floors
    const floorHeight = 7;

    for (let i = 0; i < 5; i++) {
      const height =
        1 + i * floorHeight + floorHeight / 2;

      viewer.entities.add({
        id: `floor-${i + 1}`,
        name: `Floor ${i + 1}`,

        position: Cartesian3.fromDegrees(
          longitude,
          latitude,
          height
        ),

        box: {
          dimensions: new Cartesian3(
            42,
            32,
            floorHeight - 0.7
          ),

          material:
            Color.STEELBLUE.withAlpha(0.9),

          outline: true,
          outlineColor: Color.WHITE,
        },
      });
    }

    viewer.zoomTo(
      viewer.entities,
      new HeadingPitchRange(
        CesiumMath.toRadians(35),
        CesiumMath.toRadians(-25),
        150
      )
    );

    return () => {
      if (!viewer.isDestroyed()) {
        viewer.destroy();
      }
    };
  }, []);

  return (
    <div
      ref={cesiumContainer}
      className="cesium-container"
    />
  );
}

export default CesiumViewer;