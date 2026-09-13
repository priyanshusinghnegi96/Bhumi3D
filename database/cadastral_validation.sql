-- ============================================================
-- BHUMI3D
-- BUILDING ↔ PARENT PLOT CADASTRAL VALIDATION
--
-- Checks whether every building footprint is completely
-- contained inside the land parcel identified by parent_ulpin.
-- ============================================================


-- ============================================================
-- REMOVE OLD VIEW IF IT EXISTS
-- ============================================================

DROP VIEW IF EXISTS building_plot_validation;


-- ============================================================
-- CREATE VALIDATION VIEW
-- ============================================================

CREATE VIEW building_plot_validation AS

SELECT
    building.id
        AS building_feature_id,

    building.name
        AS building_name,

    building.properties
        ->> 'building_code'
        AS building_code,

    building.properties
        ->> 'parent_ulpin'
        AS parent_ulpin,

    parcel.name
        AS plot_name,


    -- ========================================================
    -- TRUE = building entirely inside its claimed plot
    -- ========================================================

    CASE

        WHEN parcel.id IS NULL THEN
            FALSE

        ELSE
            ST_CoveredBy(
                building.geometry,
                parcel.geometry
            )

    END
        AS is_inside_parent_plot,


    -- ========================================================
    -- AREA OF BUILDING OUTSIDE ITS CLAIMED PLOT
    -- ========================================================

    CASE

        WHEN parcel.id IS NULL THEN
            NULL

        ELSE
            ROUND(
                ST_Area(
                    ST_Difference(
                        building.geometry,
                        parcel.geometry
                    )::geography
                )::numeric,
                2
            )

    END
        AS outside_area_m2,


    -- ========================================================
    -- TOTAL BUILDING FOOTPRINT AREA
    -- ========================================================

    ROUND(
        ST_Area(
            building.geometry::geography
        )::numeric,
        2
    )
        AS building_area_m2,


    -- ========================================================
    -- HUMAN-READABLE STATUS
    -- ========================================================

    CASE

        WHEN parcel.id IS NULL THEN
            'PARENT PLOT NOT FOUND'

        WHEN ST_CoveredBy(
            building.geometry,
            parcel.geometry
        ) THEN
            'VALID'

        ELSE
            'BOUNDARY VIOLATION'

    END
        AS validation_status


FROM imported_features
    AS building


LEFT JOIN parcels
    AS parcel

ON parcel.ulpin =
    building.properties
        ->> 'parent_ulpin'


WHERE
    building.feature_type =
        'Building Footprint';


-- ============================================================
-- SHOW RESULTS
-- ============================================================

SELECT
    building_code,
    plot_name,
    parent_ulpin,
    validation_status,
    building_area_m2,
    outside_area_m2

FROM building_plot_validation

ORDER BY building_code;