import { useState } from "react";

import "./App.css";
import CesiumViewer from "./cesium/CesiumViewer";

import {
  getPropertyByUnit,
} from "./services/api";


function App() {

  // =====================================
  // SELECTED PROPERTY
  // =====================================

  const [
    selectedProperty,
    setSelectedProperty
  ] = useState({
    type: "Apartment",
    parentUlpIn: "ABC12345678901",
    propertyId: "ABC12345678901-B01-L04-U403",
    building: "B01",
    floor: "04",
    unit: "403",
    verticalRange: "21m – 28m",
    validation: "Not checked",
  });


  // =====================================
  // LAYERS
  // =====================================

  const [
    layers,
    setLayers
  ] = useState({
    parcels: true,
    buildings: true,
    apartments: true,
    parking: true,
    utilities: true,
  });


  function toggleLayer(layerName) {

    setLayers((previous) => ({
      ...previous,

      [layerName]:
        !previous[layerName],
    }));
  }


  // =====================================
  // BACKEND SEARCH
  // =====================================

  const [
    searchText,
    setSearchText
  ] = useState("");


  const [
    cesiumSearchText,
    setCesiumSearchText
  ] = useState("");


  const [
    searchTrigger,
    setSearchTrigger
  ] = useState(0);


  const [
    searchMessage,
    setSearchMessage
  ] = useState("");


  const [
    backendStatus,
    setBackendStatus
  ] = useState("Ready");


  async function runSearch() {

    const query =
      searchText.trim();

    if (!query) {

      setSearchMessage(
        "Enter a unit such as 403, P03 or W-001."
      );

      return;
    }


    setSearchMessage(
      "Searching backend..."
    );

    setBackendStatus(
      "Connecting..."
    );


    try {

      const property =
        await getPropertyByUnit(query);


      if (!property) {

        setSearchMessage(
          "Property not found."
        );

        setBackendStatus(
          "Connected"
        );

        return;
      }


      // Update right-side property panel

      setSelectedProperty({
        type:
          property.type,

        parentUlpIn:
          property.parent_ulpin,

        propertyId:
          property.property_id,

        building:
          property.building ?? "—",

        floor:
          property.floor,

        unit:
          property.unit,

        verticalRange:
          `${property.z_min}m – ${property.z_max}m`,

        validation:
          property.validation,
      });


      // Tell Cesium to zoom to this unit

      setCesiumSearchText(
        property.unit
      );

      setSearchTrigger(
        (previous) =>
          previous + 1
      );


      setSearchMessage(
        `Loaded from API: ${property.unit}`
      );

      setBackendStatus(
        "Connected"
      );

    } catch (error) {

      console.error(error);

      setSearchMessage(
        "Could not connect to FastAPI."
      );

      setBackendStatus(
        "Offline"
      );
    }
  }


  function handleSearchResult(result) {

    if (!result.found) {

      setSearchMessage(
        "Property exists in backend but matching 3D object was not found."
      );
    }
  }


  // =====================================
  // VALIDATION
  // =====================================

  const [
    validationTrigger,
    setValidationTrigger
  ] = useState(0);


  const [
    resetTrigger,
    setResetTrigger
  ] = useState(0);


  const [
    validationResult,
    setValidationResult
  ] = useState(null);


  function runValidation() {

    setValidationTrigger(
      (previous) =>
        previous + 1
    );
  }


  function resetValidation() {

    setValidationResult(null);

    setSelectedProperty({
      type: "Apartment",
      parentUlpIn: "ABC12345678901",
      propertyId: "ABC12345678901-B01-L04-U403",
      building: "B01",
      floor: "04",
      unit: "403",
      verticalRange: "21m – 28m",
      validation: "Not checked",
    });

    setResetTrigger(
      (previous) =>
        previous + 1
    );
  }


  return (

    <div className="app">

      {/* NAVBAR */}

      <header className="navbar">

        <div>

          <h1>
            Bhumi3D
          </h1>

          <p>
            3D ULPIN & Vertical Property Mapping System
          </p>

        </div>

        <div className="status">
          SIH26011
        </div>

      </header>


      <main className="main-layout">

        {/* LEFT SIDEBAR */}

        <aside className="sidebar">

          <h2>
            Layers
          </h2>


          <label>

            <input
              type="checkbox"
              checked={layers.parcels}
              onChange={() =>
                toggleLayer("parcels")
              }
            />

            Land Parcels

          </label>


          <label>

            <input
              type="checkbox"
              checked={layers.buildings}
              onChange={() =>
                toggleLayer("buildings")
              }
            />

            Building Floors

          </label>


          <label>

            <input
              type="checkbox"
              checked={layers.apartments}
              onChange={() =>
                toggleLayer("apartments")
              }
            />

            Property Units

          </label>


          <label>

            <input
              type="checkbox"
              checked={layers.parking}
              onChange={() =>
                toggleLayer("parking")
              }
            />

            Basement Parking

          </label>


          <label>

            <input
              type="checkbox"
              checked={layers.utilities}
              onChange={() =>
                toggleLayer("utilities")
              }
            />

            Underground Utilities

          </label>


          <hr />


          {/* SEARCH */}

          <h2>
            Search Property
          </h2>


          <input
            className="search-input"

            type="text"

            value={searchText}

            placeholder="403, P03 or W-001"

            onChange={(event) =>
              setSearchText(
                event.target.value
              )
            }

            onKeyDown={(event) => {

              if (
                event.key === "Enter"
              ) {

                runSearch();
              }
            }}
          />


          <button
            className="search-button"
            onClick={runSearch}
          >
            Search
          </button>


          {searchMessage && (

            <p className="search-message">
              {searchMessage}
            </p>

          )}


          <div className="backend-status">

            Backend:{" "}

            <strong>
              {backendStatus}
            </strong>

          </div>


          <hr />


          {/* VALIDATION */}

          <h2>
            Topology Validation
          </h2>


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


        {/* CESIUM */}

        <section className="map-area">

          <CesiumViewer

            onSelect={
              setSelectedProperty
            }

            layers={
              layers
            }

            searchText={
              cesiumSearchText
            }

            searchTrigger={
              searchTrigger
            }

            onSearchResult={
              handleSearchResult
            }

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

          <h2>
            Property Information
          </h2>


          <div className="property-item">

            <span>Type</span>

            <strong>
              {selectedProperty.type}
            </strong>

          </div>


          <div className="property-item">

            <span>
              Parent ULPIN
            </span>

            <strong>
              {selectedProperty.parentUlpIn}
            </strong>

          </div>


          <div className="property-item">

            <span>
              3D Property ID
            </span>

            <strong>
              {selectedProperty.propertyId}
            </strong>

          </div>


          <div className="property-item">

            <span>
              Building
            </span>

            <strong>
              {selectedProperty.building}
            </strong>

          </div>


          <div className="property-item">

            <span>
              Floor / Level
            </span>

            <strong>
              {selectedProperty.floor}
            </strong>

          </div>


          <div className="property-item">

            <span>
              Unit
            </span>

            <strong>
              {selectedProperty.unit}
            </strong>

          </div>


          <div className="property-item">

            <span>
              Vertical Range
            </span>

            <strong>
              {selectedProperty.verticalRange}
            </strong>

          </div>


          <div className="property-item">

            <span>
              Validation
            </span>

            <strong
              className={
                (
                  selectedProperty.validation ||
                  ""
                )
                  .toLowerCase()
                  .includes("invalid")
                  ? "invalid"
                  : "valid"
              }
            >
              {selectedProperty.validation}
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

                {
                  validationResult.valid
                    ? "✓ Model Valid"
                    : `⚠ ${validationResult.conflicts.length} Conflicts Detected`
                }

              </h3>


              {
                validationResult.valid && (

                  <p>
                    No volumetric conflicts
                    were detected.
                  </p>

                )
              }


              {
                !validationResult.valid &&

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
                        <strong>Object A:</strong>{" "}
                        {conflict.objectA}
                      </p>

                      <p>
                        <strong>Object B:</strong>{" "}
                        {conflict.objectB}
                      </p>

                      <p>
                        <strong>Overlap:</strong>{" "}
                        {conflict.volume} m³
                      </p>

                      <p>
                        <strong>Severity:</strong>{" "}
                        HIGH
                      </p>

                    </div>

                  )
                )
              }

            </div>

          )}

        </aside>

      </main>

    </div>
  );
}


export default App;