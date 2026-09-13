import { useState } from "react";

import "./App.css";

import CesiumViewer from "./cesium/CesiumViewer";

import {
  getPropertyByUnit,
  createProperty,
} from "./services/api";


function App() {
  // ==========================================
  // SELECTED PROPERTY
  // ==========================================

  const [selectedProperty, setSelectedProperty] =
    useState(null);


  // ==========================================
  // LAYERS
  // ==========================================

  const [layers, setLayers] = useState({
    parcels: true,
    buildings: true,
    apartments: true,
    parking: true,
    utilities: true,
  });


  // ==========================================
  // SEARCH
  // ==========================================

  const [searchText, setSearchText] =
    useState("");

  const [searchTrigger, setSearchTrigger] =
    useState(0);

  const [searchMessage, setSearchMessage] =
    useState("");

  const [backendConnected, setBackendConnected] =
    useState(null);


  // ==========================================
  // VALIDATION
  // ==========================================

  const [
    validationTrigger,
    setValidationTrigger,
  ] = useState(0);

  const [
    resetTrigger,
    setResetTrigger,
  ] = useState(0);

  const [
    validationResult,
    setValidationResult,
  ] = useState(null);


  // ==========================================
  // ADD PROPERTY
  // ==========================================

  const [
    showAddProperty,
    setShowAddProperty,
  ] = useState(false);

  const [
    sceneVersion,
    setSceneVersion,
  ] = useState(0);

  const [
    createMessage,
    setCreateMessage,
  ] = useState("");

  const [
    isCreating,
    setIsCreating,
  ] = useState(false);


  // ==========================================
  // MAP FOOTPRINT PICKING
  // ==========================================

  const [
    footprintPicking,
    setFootprintPicking,
  ] = useState(false);

  const [
    footprintPickTrigger,
    setFootprintPickTrigger,
  ] = useState(0);

  const [
    footprintCancelTrigger,
    setFootprintCancelTrigger,
  ] = useState(0);


  // ==========================================
  // PROPERTY FORM
  // ==========================================

  const [form, setForm] = useState({
    property_type: "Apartment",

    parent_ulpin:
      "ABC12345678901",

    building:
      "B01",

    floor:
      "06",

    unit:
      "603",

    z_min:
      "35",

    z_max:
      "42",

    min_lon:
      "77.20879",

    min_lat:
      "28.61390",

    max_lon:
      "77.20899",

    max_lat:
      "28.61403",
  });


  // ==========================================
  // LAYER CHANGE
  // ==========================================

  function handleLayerChange(layerName) {
    setLayers(
      (previous) => ({
        ...previous,

        [layerName]:
          !previous[layerName],
      })
    );
  }


  // ==========================================
  // SEARCH
  // ==========================================

  async function handleSearch(event) {
    event.preventDefault();

    const query =
      searchText.trim();

    if (!query) {
      return;
    }

    try {
      const property =
        await getPropertyByUnit(query);

      setBackendConnected(true);

      setSelectedProperty({
        type:
          property.type,

        parentUlpIn:
          property.parent_ulpin,

        propertyId:
          property.property_id,

        building:
          property.building,

        floor:
          property.floor,

        unit:
          property.unit,

        verticalRange:
          `${property.z_min}m – ${property.z_max}m`,

        validation:
          property.validation,
      });

      setSearchMessage(
        `Loaded from API: ${property.unit}`
      );

      setSearchTrigger(
        (value) => value + 1
      );
    }

    catch {
      setBackendConnected(false);

      setSearchMessage(
        "Property not found or backend unavailable."
      );
    }
  }


  function handleSearchResult(result) {
    if (result?.found) {
      setSearchMessage(
        `Focused on ${result.name}`
      );
    }
  }


  // ==========================================
  // VALIDATION
  // ==========================================

  function handleValidationResult(result) {
    setValidationResult(result);
  }


  // ==========================================
  // NORMAL FORM CHANGE
  // ==========================================

  function handleFormChange(event) {
    const {
      name,
      value,
    } = event.target;

    setForm(
      (previous) => ({
        ...previous,

        [name]:
          value,
      })
    );
  }


  // ==========================================
  // FLOOR → AUTOMATIC HEIGHT
  // ==========================================

  function handleFloorChange(event) {
    const value =
      event.target.value;

    const floorNumber =
      Number(
        value.replace(
          /\D/g,
          ""
        )
      );

    if (
      Number.isFinite(floorNumber) &&
      floorNumber > 0
    ) {
      const zMin =
        (floorNumber - 1) * 7;

      const zMax =
        floorNumber * 7;

      setForm(
        (previous) => ({
          ...previous,

          floor:
            value,

          z_min:
            String(zMin),

          z_max:
            String(zMax),
        })
      );
    }

    else {
      setForm(
        (previous) => ({
          ...previous,

          floor:
            value,
        })
      );
    }
  }


  // ==========================================
  // START PICKING FOOTPRINT
  // ==========================================

  function startFootprintPicking() {
    setCreateMessage("");

    setShowAddProperty(false);

    setFootprintPicking(true);

    setFootprintPickTrigger(
      (value) => value + 1
    );
  }


  // ==========================================
  // FOOTPRINT RECEIVED FROM CESIUM
  // ==========================================

  function handleFootprintPicked(bounds) {
    setForm(
      (previous) => ({
        ...previous,

        min_lon:
          bounds.minLon.toFixed(7),

        min_lat:
          bounds.minLat.toFixed(7),

        max_lon:
          bounds.maxLon.toFixed(7),

        max_lat:
          bounds.maxLat.toFixed(7),
      })
    );

    setFootprintPicking(false);

    setCreateMessage(
      "✓ Footprint selected from the 3D map."
    );

    setShowAddProperty(true);
  }


  // ==========================================
  // CANCEL FOOTPRINT PICK
  // ==========================================

  function cancelFootprintPicking() {
    setFootprintPicking(false);

    setFootprintCancelTrigger(
      (value) => value + 1
    );

    setShowAddProperty(true);
  }


  // ==========================================
  // CREATE PROPERTY
  // ==========================================

  async function handleCreateProperty(event) {
    event.preventDefault();

    setIsCreating(true);

    setCreateMessage(
      "Creating property..."
    );

    try {
      const result =
        await createProperty({
          property_type:
            form.property_type,

          parent_ulpin:
            form.parent_ulpin,

          building:
            form.building,

          floor:
            form.floor,

          unit:
            form.unit,

          z_min:
            Number(form.z_min),

          z_max:
            Number(form.z_max),

          min_lon:
            Number(form.min_lon),

          min_lat:
            Number(form.min_lat),

          max_lon:
            Number(form.max_lon),

          max_lat:
            Number(form.max_lat),
        });


      setBackendConnected(true);

      setCreateMessage(
        `Created: ${result.property_id}`
      );


      // Reload PostGIS scene
      setSceneVersion(
        (value) => value + 1
      );


      // Prepare search for new unit
      setSearchText(
        result.unit
      );


      setTimeout(
        () => {
          setSearchTrigger(
            (value) =>
              value + 1
          );
        },
        1200
      );


      setTimeout(
        () => {
          setShowAddProperty(
            false
          );
        },
        1800
      );
    }

    catch (error) {
      setCreateMessage(
        error.message
      );
    }

    finally {
      setIsCreating(false);
    }
  }


  return (
    <div className="app">

      {/* ===================================
          HEADER
      =================================== */}

      <header className="topbar">

        <div className="brand">

          <div className="brand-title">
            Bhumi3D
          </div>

          <div className="brand-subtitle">
            3D ULPIN & Vertical Property Mapping
          </div>

        </div>


        <div className="header-actions">

          <button
            className="add-property-button"

            onClick={() => {
              setCreateMessage("");

              setShowAddProperty(true);
            }}
          >
            + Add Property
          </button>


          <div
            className={
              backendConnected === false
                ? "backend-status offline"
                : "backend-status online"
            }
          >

            <span className="status-dot" />

            Backend:
            {
              backendConnected === false
                ? " Offline"
                : " Connected"
            }

          </div>

        </div>

      </header>


      {/* ===================================
          WORKSPACE
      =================================== */}

      <main className="workspace">

        {/* =================================
            LEFT SIDEBAR
        ================================= */}

        <aside className="left-sidebar">

          <section className="sidebar-section">

            <h3>
              Property Search
            </h3>


            <form
              className="search-form"
              onSubmit={handleSearch}
            >

              <input
                type="text"

                value={searchText}

                onChange={(event) =>
                  setSearchText(
                    event.target.value
                  )
                }

                placeholder="403, P03, W-001..."
              />


              <button type="submit">
                Search
              </button>

            </form>


            {
              searchMessage && (
                <div className="search-message">
                  {searchMessage}
                </div>
              )
            }

          </section>


          <section className="sidebar-section">

            <h3>
              Layers
            </h3>


            {
              [
                [
                  "parcels",
                  "Land Parcel",
                ],

                [
                  "buildings",
                  "Floor Slabs",
                ],

                [
                  "apartments",
                  "Apartments",
                ],

                [
                  "parking",
                  "Basement Parking",
                ],

                [
                  "utilities",
                  "Underground Utility",
                ],
              ]
                .map(
                  ([key, label]) => (
                    <label
                      className="layer-row"
                      key={key}
                    >

                      <input
                        type="checkbox"

                        checked={
                          layers[key]
                        }

                        onChange={() =>
                          handleLayerChange(
                            key
                          )
                        }
                      />

                      <span>
                        {label}
                      </span>

                    </label>
                  )
                )
            }

          </section>


          <section className="sidebar-section">

            <h3>
              Topology Validation
            </h3>


            <button
              className="validation-button"

              onClick={() =>
                setValidationTrigger(
                  (value) =>
                    value + 1
                )
              }
            >
              Run Validation
            </button>


            <button
              className="reset-button"

              onClick={() => {
                setResetTrigger(
                  (value) =>
                    value + 1
                );

                setValidationResult(null);
              }}
            >
              Reset Validation
            </button>


            {
              validationResult && (
                <div className="validation-results">

                  {
                    validationResult.valid
                      ? (
                        <div className="validation-success">
                          ✓ No spatial conflicts found
                        </div>
                      )

                      : (
                        <>
                          <div className="validation-error">
                            {
                              validationResult
                                .conflicts
                                .length
                            }
                            {" "}
                            conflict(s) detected
                          </div>


                          {
                            validationResult
                              .conflicts
                              .map(
                                (
                                  conflict,
                                  index
                                ) => (
                                  <div
                                    className="conflict-card"
                                    key={index}
                                  >

                                    <strong>
                                      {conflict.type}
                                    </strong>

                                    <div>
                                      {conflict.objectA}
                                    </div>

                                    <div>
                                      ↕
                                    </div>

                                    <div>
                                      {conflict.objectB}
                                    </div>

                                    <small>
                                      Overlap:
                                      {" "}
                                      {conflict.volume}
                                      {" "}
                                      m³
                                    </small>

                                  </div>
                                )
                              )
                          }
                        </>
                      )
                  }

                </div>
              )
            }

          </section>


          <section className="sidebar-section">

            <h3>
              Legend
            </h3>


            <div className="legend-item">
              <span className="legend blue" />
              Apartment
            </div>


            <div className="legend-item">
              <span className="legend orange" />
              Parking
            </div>


            <div className="legend-item">
              <span className="legend cyan" />
              Utility
            </div>


            <div className="legend-item">
              <span className="legend red" />
              Spatial Conflict
            </div>

          </section>

        </aside>


        {/* =================================
            CESIUM MAP
        ================================= */}

        <section className="map-area">

          <CesiumViewer
            key={sceneVersion}

            onSelect={
              setSelectedProperty
            }

            layers={layers}

            searchText={
              searchText
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
              handleValidationResult
            }

            footprintPickTrigger={
              footprintPickTrigger
            }

            footprintCancelTrigger={
              footprintCancelTrigger
            }

            onFootprintPicked={
              handleFootprintPicked
            }
          />


          {/* =================================
              FOOTPRINT PICKING MESSAGE
          ================================= */}

          {
            footprintPicking && (
              <div
                style={{
                  position: "absolute",

                  top: "18px",
                  left: "50%",

                  transform:
                    "translateX(-50%)",

                  zIndex: 50,

                  width: "360px",
                  maxWidth: "90%",

                  padding:
                    "12px 14px",

                  borderRadius:
                    "7px",

                  background:
                    "rgba(13, 56, 40, 0.95)",

                  color:
                    "white",

                  boxShadow:
                    "0 5px 20px rgba(0,0,0,0.25)",

                  textAlign:
                    "center",
                }}
              >

                <strong>
                  Select Property Footprint
                </strong>


                <div
                  style={{
                    marginTop: "5px",

                    fontSize: "12px",

                    opacity: 0.85,
                  }}
                >
                  Click the first corner,
                  then click the opposite corner.
                </div>


                <button
                  type="button"

                  onClick={
                    cancelFootprintPicking
                  }

                  style={{
                    marginTop:
                      "9px",

                    padding:
                      "6px 14px",

                    border:
                      "1px solid rgba(255,255,255,0.5)",

                    borderRadius:
                      "4px",

                    background:
                      "transparent",

                    color:
                      "white",

                    cursor:
                      "pointer",
                  }}
                >
                  Cancel
                </button>

              </div>
            )
          }

        </section>


        {/* =================================
            PROPERTY INFORMATION
        ================================= */}

        <aside className="property-panel">

          <h2>
            Property Information
          </h2>


          {
            !selectedProperty
              ? (
                <div className="empty-property">
                  Click a 3D property or search for a unit.
                </div>
              )

              : (
                <div className="property-details">

                  <InfoRow
                    label="Type"
                    value={
                      selectedProperty.type
                    }
                  />

                  <InfoRow
                    label="Parent ULPIN"
                    value={
                      selectedProperty.parentUlpIn
                    }
                  />

                  <InfoRow
                    label="Spatial ID"
                    value={
                      selectedProperty.propertyId
                    }
                  />

                  <InfoRow
                    label="Building"
                    value={
                      selectedProperty.building
                    }
                  />

                  <InfoRow
                    label="Floor"
                    value={
                      selectedProperty.floor
                    }
                  />

                  <InfoRow
                    label="Unit"
                    value={
                      selectedProperty.unit
                    }
                  />

                  <InfoRow
                    label="Vertical Range"
                    value={
                      selectedProperty.verticalRange
                    }
                  />

                  <InfoRow
                    label="Validation"
                    value={
                      selectedProperty.validation
                    }
                  />

                </div>
              )
          }

        </aside>

      </main>


      {/* ===================================
          ADD PROPERTY MODAL
      =================================== */}

      {
        showAddProperty && (
          <div className="modal-backdrop">

            <div className="property-modal">

              <div className="modal-header">

                <div>

                  <h2>
                    Add 3D Property
                  </h2>

                  <p>
                    PostgreSQL will automatically generate the linked spatial ID.
                  </p>

                </div>


                <button
                  className="close-button"

                  type="button"

                  onClick={() =>
                    setShowAddProperty(
                      false
                    )
                  }
                >
                  ×
                </button>

              </div>


              <form
                className="property-form"

                onSubmit={
                  handleCreateProperty
                }
              >

                <label>
                  Property Type

                  <select
                    name="property_type"

                    value={
                      form.property_type
                    }

                    onChange={
                      handleFormChange
                    }
                  >

                    <option>
                      Apartment
                    </option>

                    <option>
                      Basement Parking
                    </option>

                    <option>
                      Underground Utility
                    </option>

                  </select>

                </label>


                <label>
                  Parent ULPIN

                  <input
                    name="parent_ulpin"

                    value={
                      form.parent_ulpin
                    }

                    onChange={
                      handleFormChange
                    }

                    required
                  />
                </label>


                <div className="form-grid">

                  <label>
                    Building

                    <input
                      name="building"

                      value={
                        form.building
                      }

                      onChange={
                        handleFormChange
                      }
                    />
                  </label>


                  <label>
                    Floor

                    <input
                      name="floor"

                      value={
                        form.floor
                      }

                      onChange={
                        handleFloorChange
                      }

                      required
                    />
                  </label>


                  <label>
                    Unit

                    <input
                      name="unit"

                      value={
                        form.unit
                      }

                      onChange={
                        handleFormChange
                      }

                      required
                    />
                  </label>


                  <label>
                    Z Min (m)

                    <input
                      name="z_min"

                      type="number"

                      step="0.1"

                      value={
                        form.z_min
                      }

                      onChange={
                        handleFormChange
                      }

                      required
                    />
                  </label>


                  <label>
                    Z Max (m)

                    <input
                      name="z_max"

                      type="number"

                      step="0.1"

                      value={
                        form.z_max
                      }

                      onChange={
                        handleFormChange
                      }

                      required
                    />
                  </label>

                </div>


                <h3>
                  Property Footprint
                </h3>


                <button
                  type="button"

                  className="reset-button"

                  onClick={
                    startFootprintPicking
                  }

                  style={{
                    marginBottom:
                      "16px",

                    borderColor:
                      "#176544",

                    color:
                      "#176544",

                    fontWeight:
                      "700",
                  }}
                >
                  📍 Pick Footprint on 3D Map
                </button>


                <div
                  style={{
                    marginBottom:
                      "14px",

                    fontSize:
                      "11px",

                    lineHeight:
                      "1.5",

                    color:
                      "#66716c",
                  }}
                >
                  You can pick two opposite corners on the map,
                  or enter the coordinates manually below.
                </div>


                <div className="form-grid">

                  <label>
                    Min Longitude

                    <input
                      name="min_lon"

                      type="number"

                      step="any"

                      value={
                        form.min_lon
                      }

                      onChange={
                        handleFormChange
                      }

                      required
                    />
                  </label>


                  <label>
                    Min Latitude

                    <input
                      name="min_lat"

                      type="number"

                      step="any"

                      value={
                        form.min_lat
                      }

                      onChange={
                        handleFormChange
                      }

                      required
                    />
                  </label>


                  <label>
                    Max Longitude

                    <input
                      name="max_lon"

                      type="number"

                      step="any"

                      value={
                        form.max_lon
                      }

                      onChange={
                        handleFormChange
                      }

                      required
                    />
                  </label>


                  <label>
                    Max Latitude

                    <input
                      name="max_lat"

                      type="number"

                      step="any"

                      value={
                        form.max_lat
                      }

                      onChange={
                        handleFormChange
                      }

                      required
                    />
                  </label>

                </div>


                {
                  createMessage && (
                    <div className="create-message">
                      {createMessage}
                    </div>
                  )
                }


                <button
                  className="create-property-button"

                  type="submit"

                  disabled={
                    isCreating
                  }
                >

                  {
                    isCreating
                      ? "Creating..."
                      : "Generate & Add Property"
                  }

                </button>

              </form>

            </div>

          </div>
        )
      }

    </div>
  );
}


function InfoRow({
  label,
  value,
}) {
  return (
    <div className="info-row">

      <span className="info-label">
        {label}
      </span>

      <span className="info-value">
        {value ?? "—"}
      </span>

    </div>
  );
}


export default App;