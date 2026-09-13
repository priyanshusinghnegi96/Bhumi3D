import {
  useState,
} from "react";

import "./App.css";

import CesiumViewer
  from "./cesium/CesiumViewer";

import {
  searchProperties,
  createProperty,
  importGeoJSON,
  getGISFeatures,
  generateVerticalParcels,
} from "./services/api";


function App() {

  // ==========================================
  // SELECTED PROPERTY
  // ==========================================

  const [
    selectedProperty,
    setSelectedProperty,
  ] = useState(null);


  // ==========================================
  // LAYERS
  // ==========================================

  const [
    layers,
    setLayers,
  ] = useState({
    parcels: true,
    buildings: true,
    apartments: true,
    parking: true,
    utilities: true,
  });


  // ==========================================
  // SEARCH
  // ==========================================

  const [
    searchText,
    setSearchText,
  ] = useState("");

  const [
    searchResults,
    setSearchResults,
  ] = useState([]);

  const [
    mapSearchText,
    setMapSearchText,
  ] = useState("");

  const [
    searchTrigger,
    setSearchTrigger,
  ] = useState(0);

  const [
    searchMessage,
    setSearchMessage,
  ] = useState("");

  const [
    isSearching,
    setIsSearching,
  ] = useState(false);

  const [
    backendConnected,
    setBackendConnected,
  ] = useState(null);


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
  // SCENE
  // ==========================================

  const [
    sceneVersion,
    setSceneVersion,
  ] = useState(0);


  // ==========================================
  // ADD PROPERTY
  // ==========================================

  const [
    showAddProperty,
    setShowAddProperty,
  ] = useState(false);

  const [
    createMessage,
    setCreateMessage,
  ] = useState("");

  const [
    isCreating,
    setIsCreating,
  ] = useState(false);


  // ==========================================
  // GEOJSON IMPORT
  // ==========================================

  const [
    importMessage,
    setImportMessage,
  ] = useState("");

  const [
    isImporting,
    setIsImporting,
  ] = useState(false);


  // ==========================================
  // FOOTPRINT PICKING
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
  // VERTICAL GENERATOR
  // ==========================================

  const [
    showVerticalGenerator,
    setShowVerticalGenerator,
  ] = useState(false);

  const [
    gisFeatures,
    setGISFeatures,
  ] = useState([]);

  const [
    loadingGISFeatures,
    setLoadingGISFeatures,
  ] = useState(false);

  const [
    isGenerating,
    setIsGenerating,
  ] = useState(false);

  const [
    generationMessage,
    setGenerationMessage,
  ] = useState("");

  const [
    generationResult,
    setGenerationResult,
  ] = useState(null);


  // ==========================================
  // PROPERTY FORM
  // ==========================================

  const [
    form,
    setForm,
  ] = useState({
    property_type:
      "Apartment",

    parent_ulpin:
      "RJ-JPR-DEMO-0001",

    building:
      "B01",

    floor:
      "01",

    unit:
      "105",

    z_min:
      "0",

    z_max:
      "3.2",

    min_lon:
      "77.20842",

    min_lat:
      "28.61410",

    max_lon:
      "77.20855",

    max_lat:
      "28.61422",
  });


  // ==========================================
  // GENERATION FORM
  // ==========================================

  const [
    generationForm,
    setGenerationForm,
  ] = useState({
    feature_id:
      "",

    parent_ulpin:
      "RJ-JPR-DEMO-0001",

    building_code:
      "B05",

    floors:
      "4",

    units_per_floor:
      "4",

    floor_height:
      "3.2",
  });


  // ==========================================
  // LAYER CHANGE
  // ==========================================

  function handleLayerChange(
    layerName
  ) {
    setLayers(
      (previous) => ({
        ...previous,

        [layerName]:
          !previous[layerName],
      })
    );
  }


  // ==========================================
  // SEARCH DATABASE
  // ==========================================

  async function handleSearch(
    event
  ) {
    event.preventDefault();

    const query =
      searchText.trim();

    if (!query) {
      return;
    }


    setIsSearching(
      true
    );

    setSearchResults(
      []
    );

    setSearchMessage(
      "Searching..."
    );


    try {

      const data =
        await searchProperties(
          query
        );


      setBackendConnected(
        true
      );


      const results =
        data.results || [];


      // --------------------------------------
      // NOTHING FOUND
      // --------------------------------------

      if (
        results.length === 0
      ) {

        setSearchMessage(
          "No matching property found."
        );

        return;
      }


      // --------------------------------------
      // ONLY ONE PROPERTY
      // --------------------------------------

      if (
        results.length === 1
      ) {

        focusSearchResult(
          results[0]
        );

        return;
      }


      // --------------------------------------
      // MULTIPLE MATCHES
      // --------------------------------------

      setSearchResults(
        results
      );


      setSearchMessage(
        `${results.length} matching properties found. Select the correct building.`
      );
    }

    catch (
      error
    ) {

      setBackendConnected(
        false
      );

      setSearchMessage(
        error.message
        ||
        "Search failed."
      );
    }

    finally {

      setIsSearching(
        false
      );
    }
  }


  // ==========================================
  // FOCUS EXACT SEARCH RESULT
  // ==========================================

  function focusSearchResult(
    property
  ) {

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


    // Use unique Spatial ID for Cesium,
    // not just "403".

    setMapSearchText(
      property.property_id
    );


    setSearchTrigger(
      (value) =>
        value + 1
    );


    setSearchResults(
      []
    );


    setSearchMessage(
      `Selected ${property.building} / Unit ${property.unit}`
    );
  }


  // ==========================================
  // CESIUM SEARCH RESULT
  // ==========================================

  function handleSearchResult(
    result
  ) {

    if (
      result?.found
    ) {

      setSearchMessage(
        `Focused on ${result.name}`
      );
    }
  }


  // ==========================================
  // VALIDATION
  // ==========================================

  function handleValidationResult(
    result
  ) {

    setValidationResult(
      result
    );
  }


  // ==========================================
  // PROPERTY FORM
  // ==========================================

  function handleFormChange(
    event
  ) {

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


  function handleFloorChange(
    event
  ) {

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
      Number.isFinite(
        floorNumber
      )
      &&
      floorNumber > 0
    ) {

      const zMin =
        (
          floorNumber - 1
        )
        *
        3.2;


      const zMax =
        floorNumber
        *
        3.2;


      setForm(
        (previous) => ({
          ...previous,

          floor:
            value,

          z_min:
            String(
              zMin
            ),

          z_max:
            String(
              zMax
            ),
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
  // FOOTPRINT PICKING
  // ==========================================

  function startFootprintPicking() {

    setCreateMessage("");

    setShowAddProperty(
      false
    );

    setFootprintPicking(
      true
    );

    setFootprintPickTrigger(
      (value) =>
        value + 1
    );
  }


  function handleFootprintPicked(
    bounds
  ) {

    setForm(
      (previous) => ({
        ...previous,

        min_lon:
          bounds.minLon
            .toFixed(7),

        min_lat:
          bounds.minLat
            .toFixed(7),

        max_lon:
          bounds.maxLon
            .toFixed(7),

        max_lat:
          bounds.maxLat
            .toFixed(7),
      })
    );


    setFootprintPicking(
      false
    );


    setCreateMessage(
      "✓ Footprint selected from the 3D map."
    );


    setShowAddProperty(
      true
    );
  }


  function cancelFootprintPicking() {

    setFootprintPicking(
      false
    );

    setFootprintCancelTrigger(
      (value) =>
        value + 1
    );

    setShowAddProperty(
      true
    );
  }


  // ==========================================
  // CREATE PROPERTY
  // ==========================================

  async function handleCreateProperty(
    event
  ) {

    event.preventDefault();


    setIsCreating(
      true
    );


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
            Number(
              form.z_min
            ),

          z_max:
            Number(
              form.z_max
            ),

          min_lon:
            Number(
              form.min_lon
            ),

          min_lat:
            Number(
              form.min_lat
            ),

          max_lon:
            Number(
              form.max_lon
            ),

          max_lat:
            Number(
              form.max_lat
            ),
        });


      setBackendConnected(
        true
      );


      setCreateMessage(
        `Created: ${result.property_id}`
      );


      setSceneVersion(
        (value) =>
          value + 1
      );


      setTimeout(
        () => {

          setShowAddProperty(
            false
          );

        },
        1600
      );
    }

    catch (
      error
    ) {

      setCreateMessage(
        error.message
      );
    }

    finally {

      setIsCreating(
        false
      );
    }
  }


  // ==========================================
  // GEOJSON IMPORT
  // ==========================================

  async function handleGeoJSONImport(
    event
  ) {

    const file =
      event.target.files?.[0];


    if (!file) {
      return;
    }


    setIsImporting(
      true
    );


    setImportMessage(
      "Importing GIS data..."
    );


    try {

      const result =
        await importGeoJSON(
          file
        );


      setBackendConnected(
        true
      );


      setImportMessage(
        `Imported ${result.imported_count} GIS feature(s)`
      );


      setSceneVersion(
        (value) =>
          value + 1
      );
    }

    catch (
      error
    ) {

      setImportMessage(
        error.message
      );
    }

    finally {

      setIsImporting(
        false
      );

      event.target.value =
        "";
    }
  }


  // ==========================================
  // OPEN VERTICAL GENERATOR
  // ==========================================

  async function openVerticalGenerator() {

    setShowVerticalGenerator(
      true
    );

    setGenerationMessage(
      ""
    );

    setGenerationResult(
      null
    );

    setLoadingGISFeatures(
      true
    );


    try {

      const data =
        await getGISFeatures();


      setGISFeatures(
        data.features || []
      );


      if (
        data.features?.length > 0
      ) {

        const first =
          data.features[0];


        setGenerationForm(
          (previous) => ({
            ...previous,

            feature_id:
              String(
                first.id
              ),

            parent_ulpin:
              first.properties
                ?.parent_ulpin
              ||
              previous.parent_ulpin,

            building_code:
              first.properties
                ?.building_code
              ||
              previous.building_code,
          })
        );
      }


      setBackendConnected(
        true
      );
    }

    catch (
      error
    ) {

      setGenerationMessage(
        error.message
      );

      setBackendConnected(
        false
      );
    }

    finally {

      setLoadingGISFeatures(
        false
      );
    }
  }


  // ==========================================
  // GENERATOR FORM
  // ==========================================

  function handleGenerationFormChange(
    event
  ) {

    const {
      name,
      value,
    } = event.target;


    setGenerationForm(
      (previous) => ({
        ...previous,

        [name]:
          value,
      })
    );


    // Automatically update parent ULPIN
    // and building code when a GIS
    // building is selected.

    if (
      name ===
      "feature_id"
    ) {

      const selectedFeature =
        gisFeatures.find(
          (feature) =>
            String(
              feature.id
            )
            ===
            String(
              value
            )
        );


      if (
        selectedFeature
      ) {

        setGenerationForm(
          (previous) => ({
            ...previous,

            feature_id:
              value,

            parent_ulpin:
              selectedFeature
                .properties
                ?.parent_ulpin
              ||
              previous.parent_ulpin,

            building_code:
              selectedFeature
                .properties
                ?.building_code
              ||
              previous.building_code,
          })
        );
      }
    }
  }


  // ==========================================
  // GENERATE VERTICAL PARCELS
  // ==========================================

  async function handleGenerateVerticalParcels(
    event
  ) {

    event.preventDefault();


    setIsGenerating(
      true
    );


    setGenerationMessage(
      "Generating vertical parcels..."
    );


    setGenerationResult(
      null
    );


    try {

      const result =
        await generateVerticalParcels({
          feature_id:
            Number(
              generationForm.feature_id
            ),

          parent_ulpin:
            generationForm.parent_ulpin,

          building_code:
            generationForm.building_code,

          floors:
            Number(
              generationForm.floors
            ),

          units_per_floor:
            Number(
              generationForm.units_per_floor
            ),

          floor_height:
            Number(
              generationForm.floor_height
            ),
        });


      setBackendConnected(
        true
      );


      setGenerationResult(
        result
      );


      setGenerationMessage(
        `✓ Generated ${result.generated_property_count} vertical parcels.`
      );


      setSceneVersion(
        (value) =>
          value + 1
      );
    }

    catch (
      error
    ) {

      setGenerationMessage(
        error.message
      );
    }

    finally {

      setIsGenerating(
        false
      );
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

          <label className="header-button">

            {
              isImporting
                ? "Importing..."
                : "Import GeoJSON"
            }

            <input
              type="file"

              accept=".geojson,.json,application/geo+json,application/json"

              onChange={
                handleGeoJSONImport
              }

              hidden
            />

          </label>


          <button
            className="header-button generator-button"

            onClick={
              openVerticalGenerator
            }
          >
            Generate Vertical Parcels
          </button>


          <button
            className="header-button"

            onClick={() => {
              setCreateMessage("");

              setShowAddProperty(
                true
              );
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


      {
        importMessage && (
          <div className="global-message">
            {importMessage}
          </div>
        )
      }


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

              onSubmit={
                handleSearch
              }
            >

              <input
                type="text"

                value={
                  searchText
                }

                onChange={
                  (event) => {

                    setSearchText(
                      event.target.value
                    );

                    setSearchResults(
                      []
                    );
                  }
                }

                placeholder="403, B02 403, Spatial ID..."
              />


              <button
                type="submit"

                disabled={
                  isSearching
                }
              >
                {
                  isSearching
                    ? "Searching..."
                    : "Search"
                }
              </button>

            </form>


            {
              searchMessage && (
                <div className="search-message">
                  {searchMessage}
                </div>
              )
            }


            {/* ===============================
                MULTIPLE SEARCH RESULTS
            =============================== */}

            {
              searchResults.length > 0 && (
                <div className="search-results">

                  {
                    searchResults.map(
                      (property) => (

                        <button
                          type="button"

                          className="search-result-card"

                          key={
                            property.property_id
                          }

                          onClick={
                            () =>
                              focusSearchResult(
                                property
                              )
                          }
                        >

                          <div className="search-result-top">

                            <strong>
                              {property.building}
                            </strong>

                            <span>
                              Unit {property.unit}
                            </span>

                          </div>


                          <div className="search-result-meta">

                            <span>
                              Floor {property.floor}
                            </span>

                            <span>
                              {property.parent_ulpin}
                            </span>

                          </div>


                          <div className="search-result-id">
                            {property.property_id}
                          </div>

                        </button>

                      )
                    )
                  }

                </div>
              )
            }

          </section>


          {/* =================================
              LAYERS
          ================================= */}

          <section className="sidebar-section">

            <h3>
              Layers
            </h3>

            {
              [
                [
                  "parcels",
                  "Land Plots",
                ],

                [
                  "buildings",
                  "Buildings / GIS",
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
                (
                  [
                    key,
                    label,
                  ]
                ) => (

                  <label
                    className="layer-row"

                    key={
                      key
                    }
                  >

                    <input
                      type="checkbox"

                      checked={
                        layers[key]
                      }

                      onChange={
                        () =>
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


          {/* =================================
              VALIDATION
          ================================= */}

          <section className="sidebar-section">

            <h3>
              Topology Validation
            </h3>


            <button
              className="validation-button"

              onClick={
                () =>
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

                setValidationResult(
                  null
                );
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

                                    key={
                                      index
                                    }
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


          {/* =================================
              LEGEND
          ================================= */}

          <section className="sidebar-section">

            <h3>
              Legend
            </h3>

            <div className="legend-item">
              <span className="legend blue" />
              Apartment
            </div>

            <div className="legend-item">
              <span className="legend purple" />
              Building footprint
            </div>

            <div className="legend-item">
              <span className="legend red" />
              Spatial conflict
            </div>

          </section>

        </aside>


        {/* =================================
            CESIUM
        ================================= */}

        <section className="map-area">

          <CesiumViewer
            key={
              sceneVersion
            }

            onSelect={
              setSelectedProperty
            }

            layers={
              layers
            }

            searchText={
              mapSearchText
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


          {
            footprintPicking && (

              <div className="map-instruction">

                <strong>
                  Select Property Footprint
                </strong>

                <span>
                  Click the first corner,
                  then the opposite corner.
                </span>

                <button
                  type="button"

                  onClick={
                    cancelFootprintPicking
                  }
                >
                  Cancel
                </button>

              </div>

            )
          }

        </section>


        {/* =================================
            PROPERTY PANEL
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
                    Add a spatial property to a specific plot and building.
                  </p>

                </div>


                <button
                  className="close-button"

                  type="button"

                  onClick={
                    () =>
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

                      required
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

                  className="map-pick-button"

                  onClick={
                    startFootprintPicking
                  }
                >
                  Pick Footprint on 3D Map
                </button>


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

                    <div className="form-message">
                      {createMessage}
                    </div>

                  )
                }


                <button
                  className="primary-form-button"

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


      {/* ===================================
          VERTICAL GENERATOR
      =================================== */}

      {
        showVerticalGenerator && (

          <div className="modal-backdrop">

            <div className="property-modal vertical-modal">

              <div className="modal-header">

                <div>

                  <h2>
                    Generate Vertical Parcels
                  </h2>

                  <p>
                    Automatically subdivide an imported building into floors and apartment units.
                  </p>

                </div>


                <button
                  className="close-button"

                  type="button"

                  onClick={
                    () =>
                      setShowVerticalGenerator(
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
                  handleGenerateVerticalParcels
                }
              >

                <div className="prototype-notice">

                  <strong>
                    SIH Prototype Method
                  </strong>

                  <span>
                    Regular subdivision is currently used.
                    Later this can be replaced by floor-plan,
                    LiDAR or AI-derived boundaries.
                  </span>

                </div>


                <label>
                  Imported Building

                  <select
                    name="feature_id"

                    value={
                      generationForm.feature_id
                    }

                    onChange={
                      handleGenerationFormChange
                    }

                    required
                  >

                    {
                      loadingGISFeatures

                        ? (
                          <option value="">
                            Loading...
                          </option>
                        )

                        : gisFeatures.map(
                            (feature) => (

                              <option
                                key={
                                  feature.id
                                }

                                value={
                                  feature.id
                                }
                              >
                                {
                                  feature
                                    .properties
                                    ?.building_code
                                  ||
                                  feature.name
                                }

                                {" — "}

                                {
                                  feature
                                    .properties
                                    ?.parent_ulpin
                                  ||
                                  "No plot"
                                }

                              </option>

                            )
                          )
                    }

                  </select>

                </label>


                <label>
                  Parent ULPIN

                  <input
                    name="parent_ulpin"

                    value={
                      generationForm.parent_ulpin
                    }

                    onChange={
                      handleGenerationFormChange
                    }

                    required
                  />
                </label>


                <div className="form-grid">

                  <label>
                    Building Code

                    <input
                      name="building_code"

                      value={
                        generationForm.building_code
                      }

                      onChange={
                        handleGenerationFormChange
                      }

                      required
                    />
                  </label>


                  <label>
                    Number of Floors

                    <input
                      name="floors"

                      type="number"

                      min="1"

                      value={
                        generationForm.floors
                      }

                      onChange={
                        handleGenerationFormChange
                      }

                      required
                    />
                  </label>


                  <label>
                    Units per Floor

                    <input
                      name="units_per_floor"

                      type="number"

                      min="1"

                      value={
                        generationForm.units_per_floor
                      }

                      onChange={
                        handleGenerationFormChange
                      }

                      required
                    />
                  </label>


                  <label>
                    Floor Height

                    <input
                      name="floor_height"

                      type="number"

                      step="0.1"

                      value={
                        generationForm.floor_height
                      }

                      onChange={
                        handleGenerationFormChange
                      }

                      required
                    />
                  </label>

                </div>


                {
                  generationMessage && (

                    <div className="form-message">
                      {generationMessage}
                    </div>

                  )
                }


                {
                  generationResult && (

                    <div className="generation-result">

                      <strong>
                        Generation Complete
                      </strong>

                      <div>
                        Building:
                        {" "}
                        {generationResult.building}
                      </div>

                      <div>
                        Generated:
                        {" "}
                        {
                          generationResult
                            .generated_property_count
                        }
                        {" "}
                        properties
                      </div>

                    </div>

                  )
                }


                <button
                  className="primary-form-button"

                  type="submit"

                  disabled={
                    isGenerating
                  }
                >
                  {
                    isGenerating
                      ? "Generating..."
                      : "Generate 3D Vertical Parcels"
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