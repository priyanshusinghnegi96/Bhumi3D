-- Bhumi3D Township V3 Step 3.6A
-- Four-block cadastral address index used by the unified search system.
-- The FastAPI backend also creates this table automatically, so this file
-- is included for reproducibility and team/database documentation.

CREATE TABLE IF NOT EXISTS township_addresses (
    id SERIAL PRIMARY KEY,
    parent_ulpin VARCHAR(50) UNIQUE NOT NULL,
    plot_name VARCHAR(150) NOT NULL,
    block_code VARCHAR(1) NOT NULL,
    address_number INTEGER NOT NULL,
    address_code VARCHAR(20) NOT NULL,
    row_index INTEGER NOT NULL,
    column_index INTEGER NOT NULL,
    land_use VARCHAR(50) NOT NULL,
    building_feature_id INTEGER,
    building_code VARCHAR(50),
    building_name VARCHAR(150),
    building_type VARCHAR(80),
    floors INTEGER DEFAULT 0,
    units_per_floor INTEGER DEFAULT 0,
    floor_height DOUBLE PRECISION DEFAULT 0,
    height_m DOUBLE PRECISION DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS township_addresses_block_number_idx
ON township_addresses (block_code, address_number);

CREATE INDEX IF NOT EXISTS township_addresses_building_code_idx
ON township_addresses (building_code);


CREATE UNIQUE INDEX IF NOT EXISTS township_addresses_address_code_uidx
ON township_addresses (address_code);

CREATE UNIQUE INDEX IF NOT EXISTS township_addresses_grid_cell_uidx
ON township_addresses (row_index, column_index);

-- Step 3.7A: persisted volumetric apartment registry.
-- Each row represents one apartment using a 2D footprint plus z_min/z_max.
-- The proposed_3d_ulpin is a Bhumi3D prototype linked child identifier,
-- not an official government ULPIN format.
CREATE TABLE IF NOT EXISTS township_units (
    id BIGSERIAL PRIMARY KEY,
    parent_ulpin VARCHAR(50) NOT NULL,
    block_code VARCHAR(1) NOT NULL,
    address_code VARCHAR(20) NOT NULL,
    building_code VARCHAR(50) NOT NULL,
    floor_number INTEGER NOT NULL,
    floor_id VARCHAR(180) NOT NULL,
    unit_letter VARCHAR(4) NOT NULL,
    display_unit VARCHAR(20) NOT NULL,
    proposed_3d_ulpin VARCHAR(220) UNIQUE NOT NULL,
    z_min DOUBLE PRECISION NOT NULL,
    z_max DOUBLE PRECISION NOT NULL,
    validation VARCHAR(50) DEFAULT 'Valid',
    footprint GEOMETRY(Polygon, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (address_code, floor_number, unit_letter)
);

CREATE INDEX IF NOT EXISTS township_units_address_idx
ON township_units (address_code, floor_number, unit_letter);

CREATE INDEX IF NOT EXISTS township_units_parent_idx
ON township_units (parent_ulpin);

CREATE INDEX IF NOT EXISTS township_units_footprint_gix
ON township_units USING GIST (footprint);


-- Step 3.7B: accelerate exact proposed 3D ULPIN lookup.
CREATE INDEX IF NOT EXISTS township_units_3d_ulpin_upper_idx
ON township_units (UPPER(proposed_3d_ulpin));
