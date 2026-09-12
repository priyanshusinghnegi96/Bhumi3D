import { useState } from "react";

import "./App.css";
import CesiumViewer from "./cesium/CesiumViewer";

function App() {
  const [selectedProperty, setSelectedProperty] = useState({
    type: "Apartment",
    parentUlpIn: "ABC12345678901",
    propertyId: "ABC12345678901-B01-L04-U403",
    building: "B01",
    floor: "04",
    unit: "403",
    verticalRange: "21m – 28m",
    validation: "Not checked",
  });

  const [validationTrigger, setValidationTrigger] =
    useState(0);

  const [resetTrigger, setResetTrigger] =
    useState(0);

  const [validationResult, setValidationResult] =
    useState(null);

  function runValidation() {
    setValidationTrigger(
      (previous) => previous + 1
    );
  }

  function resetValidation() {
    setValidationResult(null);

    setSelectedProperty({
      type: "Apartment",
      parentUlpIn: "ABC12345678901",
      propertyId:
        "ABC12345678901-B01-L04-U403",
      building: "B01",
      floor: "04",
      unit: "403",
      verticalRange: "21m – 28m",
      validation: "Not checked",
    });

    setResetTrigger(
      (previous) => previous + 1
    );
  }

  return (
    <div className="app">

      {/* NAVBAR */}

      <header className="navbar">
        <div>
          <h1>Bhumi3D</h1>

          <p>
            3D ULPIN & Vertical Property Mapping
            System
          </p>
        </div>

        <div className="status">
          SIH26011
        </div>
      </header>

      <main className="main-layout">

        {/* LEFT SIDEBAR */}

        <aside className="sidebar">

          <h2>Layers</h2>

          <label>
            <input
              type="checkbox"
              defaultChecked
            />
            Land Parcels
          </label>

          <label>
            <input
              type="checkbox"
              defaultChecked
            />
            Buildings
          </label>

          <label>
            <input
              type="checkbox"
              defaultChecked
            />
            Property Units
          </label>

          <label>
            <input
              type="checkbox"
              defaultChecked
            />
            Basement Parking
          </label>

          <label>
            <input
              type="checkbox"
              defaultChecked
            />
            Underground Utilities
          </label>

          <label>
            <input type="checkbox" />
            LiDAR
          </label>

          <hr />

          <h2>Search Property</h2>

          <input
            className="search-input"
            type="text"
            placeholder="ULPIN or 3D Property ID"
          />

          <button className="search-button">
            Search
          </button>

          <hr />

          <h2>Topology Validation</h2>

          <p className="validation-help">
            Detect overlapping ownership
            volumes and underground
            infrastructure conflicts.
          </p>

          <button
            className="validate-button"
            onClick={runValidation}
          >
            Run Validation
          </button>

          <button
            className="reset-button"
            onClick={resetValidation}
          >
            Reset Validation
          </button>

        </aside>

        {/* CESIUM VIEWER */}

        <section className="map-area">

          <CesiumViewer
            onSelect={setSelectedProperty}
            validationTrigger={
              validationTrigger
            }
            resetTrigger={
              resetTrigger
            }
            onValidationResult={
              setValidationResult
            }
          />

          <div className="viewer-label">
            3D Volumetric Cadastre
          </div>

          <div className="viewer-legend">

            <div>
              <span className="legend-blue" />
              Apartments
            </div>

            <div>
              <span className="legend-orange" />
              Basement Parking
            </div>

            <div>
              <span className="legend-cyan" />
              Underground Utility
            </div>

            <div>
              <span className="legend-red" />
              Conflict
            </div>

          </div>

        </section>

        {/* RIGHT PANEL */}

        <aside className="property-panel">

          <h2>Property Information</h2>

          <div className="property-item">
            <span>Type</span>

            <strong>
              {selectedProperty.type}
            </strong>
          </div>

          <div className="property-item">
            <span>Parent ULPIN</span>

            <strong>
              {selectedProperty.parentUlpIn}
            </strong>
          </div>

          <div className="property-item">
            <span>3D Property ID</span>

            <strong>
              {selectedProperty.propertyId}
            </strong>
          </div>

          <div className="property-item">
            <span>Building</span>

            <strong>
              {selectedProperty.building}
            </strong>
          </div>

          <div className="property-item">
            <span>Floor / Level</span>

            <strong>
              {selectedProperty.floor}
            </strong>
          </div>

          <div className="property-item">
            <span>Unit</span>

            <strong>
              {selectedProperty.unit}
            </strong>
          </div>

          <div className="property-item">
            <span>Vertical Range</span>

            <strong>
              {
                selectedProperty.verticalRange
              }
            </strong>
          </div>

          <div className="property-item">
            <span>Validation</span>

            <strong
              className={
                selectedProperty.validation
                  .toLowerCase()
                  .includes("invalid")
                  ? "invalid"
                  : "valid"
              }
            >
              {
                selectedProperty.validation
              }
            </strong>
          </div>

          {/* VALIDATION RESULTS */}

          {validationResult && (

            <div
              className={
                validationResult.valid
                  ? "validation-card success"
                  : "validation-card error"
              }
            >

              <h3>
                {validationResult.valid
                  ? "✓ Model Valid"
                  : `⚠ ${validationResult.conflicts.length} Conflicts Detected`}
              </h3>

              {validationResult.valid && (
                <p>
                  No volumetric conflicts
                  were detected.
                </p>
              )}

              {!validationResult.valid &&
                validationResult.conflicts.map(
                  (conflict, index) => (

                    <div
                      className="conflict-item"
                      key={index}
                    >

                      <div className="conflict-number">
                        Conflict {index + 1}
                      </div>

                      <p>
                        <strong>Type:</strong>{" "}
                        {conflict.type}
                      </p>

                      <p>
                        <strong>
                          Object A:
                        </strong>{" "}
                        {conflict.objectA}
                      </p>

                      <p>
                        <strong>
                          Object B:
                        </strong>{" "}
                        {conflict.objectB}
                      </p>

                      <p>
                        <strong>
                          Overlap:
                        </strong>{" "}
                        {conflict.volume} m³
                      </p>

                      <p>
                        <strong>
                          Severity:
                        </strong>{" "}
                        HIGH
                      </p>

                    </div>
                  )
                )}

            </div>
          )}

        </aside>

      </main>
    </div>
  );
}

export default App;