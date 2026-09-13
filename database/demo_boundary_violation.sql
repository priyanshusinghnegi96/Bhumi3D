-- ============================================================
-- BHUMI3D DEMO
-- CREATE ONE INTENTIONAL CADASTRAL BOUNDARY VIOLATION
--
-- B01 -> VALID
-- B02 -> VALID
-- B03 -> VALID
-- B04 -> BOUNDARY VIOLATION
-- ============================================================


-- ============================================================
-- MODIFY PLOT 04
--
-- We deliberately move the right boundary inward so part
-- of Building B04 falls outside its claimed parent parcel.
-- ============================================================

UPDATE parcels

SET geometry =
    ST_GeomFromText(
        'POLYGON((
            77.20900 28.61334,
            77.20946 28.61334,
            77.20948 28.61357,
            77.20945 28.61388,
            77.20904 28.61383,
            77.20900 28.61334
        ))',
        4326
    )

WHERE ulpin =
    'RJ-JPR-DEMO-0004';


-- ============================================================
-- VERIFY
-- ============================================================

SELECT
    building_code,
    plot_name,
    validation_status,
    building_area_m2,
    outside_area_m2

FROM building_plot_validation

ORDER BY building_code;