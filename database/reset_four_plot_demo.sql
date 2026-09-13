BEGIN;


-- =========================================================
-- BHUMI3D
-- RESET DEMO TO:
--
-- 4 LAND PLOTS
-- 4 DIFFERENT BUILDINGS
-- 4 FLOORS EACH
-- 4 APARTMENTS PER FLOOR
--
-- TOTAL:
-- 4 plots
-- 4 building footprints
-- 64 vertical apartment parcels
-- =========================================================


-- =========================================================
-- REMOVE OLD DEMO DATA
-- =========================================================

TRUNCATE TABLE properties
RESTART IDENTITY;

TRUNCATE TABLE imported_features
RESTART IDENTITY;

TRUNCATE TABLE parcels
RESTART IDENTITY;


-- =========================================================
-- PLOT 1
-- RECTANGULAR PLOT
-- =========================================================

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


-- =========================================================
-- PLOT 2
-- IRREGULAR QUADRILATERAL
-- =========================================================

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


-- =========================================================
-- PLOT 3
-- TRAPEZOID PLOT
-- =========================================================

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


-- =========================================================
-- PLOT 4
-- PENTAGON PLOT
-- =========================================================

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


-- =========================================================
-- BUILDING B01
-- RECTANGULAR BUILDING
-- ON PLOT 01
-- =========================================================

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

    'four_plot_demo',

    jsonb_build_object(
        'building_code', 'B01',
        'parent_ulpin', 'RJ-JPR-DEMO-0001',
        'floors', 4,
        'height_m', 12.8
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


-- =========================================================
-- BUILDING B02
-- TRAPEZOID BUILDING
-- ON PLOT 02
-- =========================================================

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

    'four_plot_demo',

    jsonb_build_object(
        'building_code', 'B02',
        'parent_ulpin', 'RJ-JPR-DEMO-0002',
        'floors', 4,
        'height_m', 12.8
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


-- =========================================================
-- BUILDING B03
-- SKEWED BUILDING
-- ON PLOT 03
-- =========================================================

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

    'four_plot_demo',

    jsonb_build_object(
        'building_code', 'B03',
        'parent_ulpin', 'RJ-JPR-DEMO-0003',
        'floors', 4,
        'height_m', 12.8
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


-- =========================================================
-- BUILDING B04
-- PENTAGON BUILDING
-- ON PLOT 04
-- =========================================================

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

    'four_plot_demo',

    jsonb_build_object(
        'building_code', 'B04',
        'parent_ulpin', 'RJ-JPR-DEMO-0004',
        'floors', 4,
        'height_m', 12.8
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


-- =========================================================
-- AUTOMATICALLY SUBDIVIDE EACH BUILDING
-- INTO FOUR UNITS PER FLOOR
--
-- EVERY BUILDING:
--
-- FLOOR 01
--   101 102
--   103 104
--
-- FLOOR 02
--   201 202
--   203 204
--
-- ETC.
--
-- THE CELL IS INTERSECTED WITH THE REAL
-- BUILDING FOOTPRINT, SO IRREGULAR BUILDINGS
-- KEEP THEIR DIFFERENT BOUNDARIES.
-- =========================================================

WITH building_data AS (

    SELECT
        id,

        name,

        properties ->> 'building_code'
            AS building_code,

        properties ->> 'parent_ulpin'
            AS parent_ulpin,

        geometry,

        ST_XMin(
            Box3D(geometry)
        ) AS min_lon,

        ST_YMin(
            Box3D(geometry)
        ) AS min_lat,

        ST_XMax(
            Box3D(geometry)
        ) AS max_lon,

        ST_YMax(
            Box3D(geometry)
        ) AS max_lat

    FROM imported_features

    WHERE
        source_filename =
        'four_plot_demo'
),


unit_grid (
    unit_index,
    grid_column,
    grid_row
) AS (

    VALUES
        (1, 0, 0),
        (2, 1, 0),
        (3, 0, 1),
        (4, 1, 1)
),


unit_cells AS (

    SELECT
        building_data.*,

        unit_grid.unit_index,

        ST_MakeEnvelope(

            min_lon
            +
            (
                grid_column
                *
                (
                    max_lon - min_lon
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
                    max_lat - min_lat
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
                    max_lon - min_lon
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
                    max_lat - min_lat
                )
                /
                2
            ),

            4326

        ) AS cell_geometry

    FROM building_data

    CROSS JOIN unit_grid
),


unit_footprints AS (

    SELECT
        building_code,

        parent_ulpin,

        unit_index,

        ST_Intersection(
            geometry,
            cell_geometry
        ) AS footprint

    FROM unit_cells
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
    )

    AND GeometryType(
        footprint
    ) = 'POLYGON';


-- =========================================================
-- FINISH
-- =========================================================

COMMIT;


-- =========================================================
-- VERIFY RESULT
-- =========================================================

SELECT
    COUNT(*) AS total_plots
FROM parcels;


SELECT
    COUNT(*) AS total_buildings
FROM imported_features;


SELECT
    COUNT(*) AS total_vertical_properties
FROM properties;


SELECT
    building,
    COUNT(*) AS apartment_volumes
FROM properties

GROUP BY building

ORDER BY building;