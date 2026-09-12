import "./App.css";
import CesiumViewer from "./cesium/CesiumViewer";

function App() {
  return (
    <div className="app">
      <header className="navbar">
        <div>
          <h1>Bhumi3D</h1>
          <p>3D ULPIN & Vertical Property Mapping System</p>
        </div>

        <div className="status">SIH26011</div>
      </header>

      <main className="main-layout">
        {/* LEFT SIDEBAR */}
        <aside className="sidebar">
          <h2>Layers</h2>

          <label>
            <input type="checkbox" defaultChecked />
            Land Parcels
          </label>

          <label>
            <input type="checkbox" defaultChecked />
            Buildings
          </label>

          <label>
            <input type="checkbox" defaultChecked />
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

        {/* 3D VIEWER */}
        <section className="map-area">
          <CesiumViewer />
        </section>

        {/* RIGHT PANEL */}
        <aside className="property-panel">
          <h2>Property Information</h2>

          <div className="property-item">
            <span>Parent ULPIN</span>
            <strong>ABC12345678901</strong>
          </div>

          <div className="property-item">
            <span>3D Property ID</span>
            <strong>
              ABC12345678901-B01-L04-U403
            </strong>
          </div>

          <div className="property-item">
            <span>Building</span>
            <strong>B01</strong>
          </div>

          <div className="property-item">
            <span>Floor</span>
            <strong>04</strong>
          </div>

          <div className="property-item">
            <span>Unit</span>
            <strong>403</strong>
          </div>

          <div className="property-item">
            <span>Vertical Range</span>
            <strong>9m – 12m</strong>
          </div>

          <div className="property-item">
            <span>Validation</span>
            <strong className="valid">
              ✓ Valid
            </strong>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;