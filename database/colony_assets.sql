-- Bhumi3D planned-colony infrastructure layer
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS colony_assets (
    id SERIAL PRIMARY KEY,
    asset_type VARCHAR(50) NOT NULL,
    name VARCHAR(150),
    properties JSONB DEFAULT '{}'::jsonb,
    geometry GEOMETRY(Geometry, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS colony_assets_geometry_gix
ON colony_assets
USING GIST (geometry);
