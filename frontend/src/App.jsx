import { useState } from "react";

import "./App.css";
import CesiumViewer from "./cesium/CesiumViewer";

function App() {
  const [selectedProperty, setSelectedProperty] = useState({
    type: "Property Unit",
    parentUlpIn: "ABC12345678901",
    propertyId: "ABC12345678901-B01-L04-U403",
    building: "B01",
    floor: "04",
    unit: "403",
    verticalRange: "21m – 28m",
    validation: "Valid",
  });

  return (
    <div className="app">
      {/* =========================
          TOP NAVBAR
      ========================== */}

      <header className="navbar">
        <div>
          <h1>Bhumi3D</h1>

          <p>
            3D ULPIN & Vertical Property Mapping System
          </p>
        </div>

        <div className="status">
          SIH26011
        </div>
      </header>

      {/* =========================
          MAIN APPLICATION
      ========================== */}

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
            <input type="checkbox" />
            LiDAR
          </label>

          <label>
            <input type="checkbox" />
            Underground Utilities
          </label>

          <hr />

          <h2>Search Property</h2>

          <input
            className="search-input"
            type="text"
            placeholder="Enter ULPIN or Property ID"
          />

          <button className="search-button">
            Search
          </button>
        </aside>

        {/* CESIUM 3D VIEWER */}

        <section className="map-area">
          <CesiumViewer
            onSelect={setSelectedProperty}
          />
        </section>

        {/* RIGHT PROPERTY PANEL */}

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
            <span>Floor</span>

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
              {selectedProperty.verticalRange}
            </strong>
          </div>

          <div className="property-item">
            <span>Validation</span>

            <strong className="valid">
              ✓ {selectedProperty.validation}
            </strong>
          </div>
        </aside>

      </main>
    </div>
  );
}

export default App;