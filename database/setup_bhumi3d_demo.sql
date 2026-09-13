-- ============================================================
-- BHUMI3D COMPLETE DEMO DATABASE SETUP
--
-- Creates:
--   - PostGIS
--   - parcels table
--   - properties table
--   - imported_features table
--   - automatic spatial ID trigger
--   - 4 plots
--   - 4 buildings
--   - 4 floors per building
--   - 4 apartments per floor
--
-- Total vertical apartments = 64
-- ============================================================


-- ============================================================
-- POSTGIS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;


-- ============================================================
-- DROP OLD DEMO TABLES
-- ============================================================

DROP TABLE IF EXISTS properties CASCADE;
DROP TABLE IF EXISTS imported_features CASCADE;
DROP TABLE IF EXISTS parcels CASCADE;


-- ============================================================
-- PARCELS
-- ============================================================

CREATE TABLE parcels (
    id SERIAL PRIMARY KEY,

    ulpin VARCHAR(100)
        UNIQUE
        NOT NULL,

    name VARCHAR(150),

    geometry GEOMETRY(
        Polygon,
        4326
    )
);


CREATE INDEX idx_parcels_geometry
ON parcels
USING GIST (geometry);


-- ============================================================
-- 3D PROPERTIES
-- ============================================================

CREATE TABLE properties (
    id SERIAL PRIMARY KEY,

    property_type VARCHAR(50)
        NOT NULL,

    parent_ulpin VARCHAR(100)
        NOT NULL,

    property_id VARCHAR(200)
        UNIQUE
        NOT NULL,

    building VARCHAR(50),

    floor VARCHAR(50),

    unit VARCHAR(50),

    z_min DOUBLE PRECISION,

    z_max DOUBLE PRECISION,

    validation VARCHAR(50)
        DEFAULT 'Not checked',

    footprint GEOMETRY(
        Polygon,
        4326
    )
);


CREATE INDEX idx_properties_footprint
ON properties
USING GIST (footprint);


CREATE INDEX idx_properties_parent
ON properties (parent_ulpin);


CREATE INDEX idx_properties_building_unit
ON properties (
    building,
    unit
);


-- ============================================================
-- IMPORTED GIS FEATURES
-- ============================================================

CREATE TABLE imported_features (
    id SERIAL PRIMARY KEY,

    feature_type VARCHAR(50)
        NOT NULL
        DEFAULT 'GIS Feature',

    name VARCHAR(150),

    source_filename VARCHAR(255),

    properties JSONB
        DEFAULT '{}'::jsonb,

    geometry GEOMETRY(
        Geometry,
        4326
    )
        NOT NULL,

    created_at TIMESTAMPTZ
        DEFAULT CURRENT_TIMESTAMP
);


CREATE INDEX idx_imported_features_geometry
ON imported_features
USING GIST (geometry);


-- ============================================================
-- AUTOMATIC BHUMI3D SPATIAL ID
--
-- These are prototype linked spatial IDs.
-- They are NOT claimed as an official government
-- 3D ULPIN standard.
-- ============================================================

CREATE OR REPLACE FUNCTION generate_bhumi3d_spatial_id(
    p_parent_ulpin TEXT,
    p_property_type TEXT,
    p_building TEXT,
    p_floor TEXT,
    p_unit TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS
$$

BEGIN

    -- Apartment
    IF p_property_type = 'Apartment' THEN

        RETURN
            p_parent_ulpin
            || '-'
            || COALESCE(
                p_building,
                'B00'
            )
            || '-L'
            || COALESCE(
                p_floor,
                '00'
            )
            || '-U'
            || COALESCE(
                p_unit,
                '000'
            );


    -- Basement parking
    ELSIF p_property_type = 'Basement Parking' THEN

        RETURN
            p_parent_ulpin
            || '-'
            || COALESCE(
                p_building,
                'B00'
            )
            || '-BASEMENT-P'
            || COALESCE(
                p_unit,
                '000'
            );


    -- Underground utility
    ELSIF p_property_type = 'Underground Utility' THEN

        RETURN
            p_parent_ulpin
            || '-UG-'
            || COALESCE(
                p_unit,
                'UTILITY'
            );


    -- Generic fallback
    ELSE

        RETURN
            p_parent_ulpin
            || '-'
            || COALESCE(
                p_building,
                'OBJECT'
            )
            || '-'
            || COALESCE(
                p_unit,
                '000'
            );

    END IF;

END;

$$;


-- ============================================================
-- AUTOMATIC PROPERTY ID TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION set_bhumi3d_property_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS
$$

BEGIN

    IF
        NEW.property_id IS NULL
        OR
        BTRIM(
            NEW.property_id
        ) = ''
    THEN

        NEW.property_id =
            generate_bhumi3d_spatial_id(
                NEW.parent_ulpin,
                NEW.property_type,
                NEW.building,
                NEW.floor,
                NEW.unit
            );

    END IF;


    RETURN NEW;

END;

$$;


CREATE TRIGGER bhumi3d_property_id_trigger

BEFORE INSERT
ON properties

FOR EACH ROW

EXECUTE FUNCTION
set_bhumi3d_property_id();


-- ============================================================
-- PLOT 01
-- ============================================================

INSERT INTO parcels (
    ulpin,
    name,
    geometry
)
VALUES (
    'RJ-JPR-DEMO-0001',

    'Plot 01',

    ST_GeomFromText(
        'POLYGON((
            77.20830 28.61400,
            77.20888 28.61400,
            77.20888 28.61448,
            77.20830 28.61448,
            77.20830 28.61400
        ))',
        4326
    )
);


-- ============================================================
-- PLOT 02
-- ============================================================

INSERT INTO parcels (
    ulpin,
    name,
    geometry
)
VALUES (
    'RJ-JPR-DEMO-0002',

    'Plot 02',

    ST_GeomFromText(
        'POLYGON((
            77.20900 28.61400,
            77.20960 28.61402,
            77.20956 28.61450,
            77.20903 28.61446,
            77.20900 28.61400
        ))',
        4326
    )
);


-- ============================================================
-- PLOT 03
-- ============================================================

INSERT INTO parcels (
    ulpin,
    name,
    geometry
)
VALUES (
    'RJ-JPR-DEMO-0003',

    'Plot 03',

    ST_GeomFromText(
        'POLYGON((
            77.20828 28.61335,
            77.20890 28.61337,
            77.20884 28.61388,
            77.20834 28.61384,
            77.20828 28.61335
        ))',
        4326
    )
);


-- ============================================================
-- PLOT 04
-- ============================================================

INSERT INTO parcels (
    ulpin,
    name,
    geometry
)
VALUES (
    'RJ-JPR-DEMO-0004',

    'Plot 04',

    ST_GeomFromText(
        'POLYGON((
            77.20900 28.61334,
            77.20952 28.61334,
            77.20964 28.61357,
            77.20948 28.61388,
            77.20904 28.61383,
            77.20900 28.61334
        ))',
        4326
    )
);


-- ============================================================
-- BUILDING B01
-- PLOT 01
-- Rectangle
-- ============================================================

INSERT INTO imported_features (
    feature_type,
    name,
    source_filename,
    properties,
    geometry
)
VALUES (
    'Building Footprint',

    'Building B01',

    'Bhumi3D Demo',

    jsonb_build_object(
        'building_code',
        'B01',

        'parent_ulpin',
        'RJ-JPR-DEMO-0001',

        'floors',
        4,

        'height_m',
        12.8
    ),

    ST_GeomFromText(
        'POLYGON((
            77.20842 28.61410,
            77.20876 28.61410,
            77.20876 28.61438,
            77.20842 28.61438,
            77.20842 28.61410
        ))',
        4326
    )
);


-- ============================================================
-- BUILDING B02
-- PLOT 02
-- Trapezoid
-- ============================================================

INSERT INTO imported_features (
    feature_type,
    name,
    source_filename,
    properties,
    geometry
)
VALUES (
    'Building Footprint',

    'Building B02',

    'Bhumi3D Demo',

    jsonb_build_object(
        'building_code',
        'B02',

        'parent_ulpin',
        'RJ-JPR-DEMO-0002',

        'floors',
        4,

        'height_m',
        12.8
    ),

    ST_GeomFromText(
        'POLYGON((
            77.20912 28.61411,
            77.20949 28.61412,
            77.20945 28.61439,
            77.20916 28.61438,
            77.20912 28.61411
        ))',
        4326
    )
);


-- ============================================================
-- BUILDING B03
-- PLOT 03
-- Skewed quadrilateral
-- ============================================================

INSERT INTO imported_features (
    feature_type,
    name,
    source_filename,
    properties,
    geometry
)
VALUES (
    'Building Footprint',

    'Building B03',

    'Bhumi3D Demo',

    jsonb_build_object(
        'building_code',
        'B03',

        'parent_ulpin',
        'RJ-JPR-DEMO-0003',

        'floors',
        4,

        'height_m',
        12.8
    ),

    ST_GeomFromText(
        'POLYGON((
            77.20840 28.61347,
            77.20876 28.61345,
            77.20880 28.61374,
            77.20843 28.61377,
            77.20840 28.61347
        ))',
        4326
    )
);


-- ============================================================
-- BUILDING B04
-- PLOT 04
-- Pentagon
-- ============================================================

INSERT INTO imported_features (
    feature_type,
    name,
    source_filename,
    properties,
    geometry
)
VALUES (
    'Building Footprint',

    'Building B04',

    'Bhumi3D Demo',

    jsonb_build_object(
        'building_code',
        'B04',

        'parent_ulpin',
        'RJ-JPR-DEMO-0004',

        'floors',
        4,

        'height_m',
        12.8
    ),

    ST_GeomFromText(
        'POLYGON((
            77.20912 28.61347,
            77.20943 28.61344,
            77.20952 28.61358,
            77.20942 28.61377,
            77.20914 28.61374,
            77.20912 28.61347
        ))',
        4326
    )
);


-- ============================================================
-- GENERATE 4 UNITS FOR EACH BUILDING FOOTPRINT
-- ============================================================

WITH building_data AS (

    SELECT
        id,

        properties
            ->> 'building_code'
            AS building_code,

        properties
            ->> 'parent_ulpin'
            AS parent_ulpin,

        geometry,

        ST_XMin(
            Box3D(
                geometry
            )
        ) AS min_lon,

        ST_YMin(
            Box3D(
                geometry
            )
        ) AS min_lat,

        ST_XMax(
            Box3D(
                geometry
            )
        ) AS max_lon,

        ST_YMax(
            Box3D(
                geometry
            )
        ) AS max_lat

    FROM imported_features
),


grid_cells AS (

    SELECT
        building_data.*,

        grid.unit_index,

        grid.grid_column,

        grid.grid_row

    FROM building_data

    CROSS JOIN (

        VALUES
            (1, 0, 0),
            (2, 1, 0),
            (3, 0, 1),
            (4, 1, 1)

    ) AS grid(
        unit_index,
        grid_column,
        grid_row
    )
),


subdivision AS (

    SELECT
        building_code,

        parent_ulpin,

        unit_index,

        geometry
            AS building_geometry,

        ST_MakeEnvelope(

            min_lon
            +
            (
                grid_column
                *
                (
                    max_lon
                    -
                    min_lon
                )
                /
                2
            ),

            min_lat
            +
            (
                grid_row
                *
                (
                    max_lat
                    -
                    min_lat
                )
                /
                2
            ),

            min_lon
            +
            (
                (
                    grid_column + 1
                )
                *
                (
                    max_lon
                    -
                    min_lon
                )
                /
                2
            ),

            min_lat
            +
            (
                (
                    grid_row + 1
                )
                *
                (
                    max_lat
                    -
                    min_lat
                )
                /
                2
            ),

            4326

        ) AS cell_geometry

    FROM grid_cells
),


unit_footprints AS (

    SELECT
        building_code,

        parent_ulpin,

        unit_index,

        ST_Intersection(
            building_geometry,
            cell_geometry
        ) AS footprint

    FROM subdivision
)


INSERT INTO properties (
    property_type,
    parent_ulpin,
    building,
    floor,
    unit,
    z_min,
    z_max,
    validation,
    footprint
)

SELECT
    'Apartment',

    parent_ulpin,

    building_code,

    LPAD(
        floor_number::TEXT,
        2,
        '0'
    ),

    floor_number::TEXT
    ||
    LPAD(
        unit_index::TEXT,
        2,
        '0'
    ),

    (
        floor_number - 1
    )
    *
    3.2,

    floor_number
    *
    3.2,

    'Not checked',

    footprint

FROM unit_footprints

CROSS JOIN generate_series(
    1,
    4
) AS floor_number

WHERE
    NOT ST_IsEmpty(
        footprint
    );


-- ============================================================
-- VERIFY SETUP
-- ============================================================

SELECT
    COUNT(*)
        AS total_plots

FROM parcels;


SELECT
    COUNT(*)
        AS total_buildings

FROM imported_features;


SELECT
    COUNT(*)
        AS total_properties

FROM properties;


SELECT
    building,
    COUNT(*)
        AS properties

FROM properties

GROUP BY building

ORDER BY building;