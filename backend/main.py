import os
import json
import math

import psycopg

from dotenv import load_dotenv

from fastapi import (
    FastAPI,
    HTTPException,
    UploadFile,
    File,
)

from fastapi.middleware.cors import (
    CORSMiddleware,
)

from pydantic import (
    BaseModel,
    Field,
)


# =========================================================
# ENVIRONMENT
# =========================================================

load_dotenv()


DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "dbname": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
}


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="Bhumi3D API",
    description=(
        "Backend API for the Bhumi3D "
        "3D ULPIN and Vertical Property Mapping System"
    ),
    version="1.0.0",
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# DATABASE
# =========================================================

def get_connection():

    return psycopg.connect(
        **DB_CONFIG
    )


# =========================================================
# PYDANTIC MODELS
# =========================================================

class PropertyCreate(BaseModel):

    property_type: str

    parent_ulpin: str

    building: str | None = "B01"

    floor: str | None = None

    unit: str

    z_min: float

    z_max: float

    min_lon: float

    min_lat: float

    max_lon: float

    max_lat: float


class VerticalGenerationRequest(BaseModel):

    feature_id: int

    parent_ulpin: str

    building_code: str = "B02"

    floors: int = Field(
        default=5,
        ge=1,
        le=100,
    )

    units_per_floor: int = Field(
        default=4,
        ge=1,
        le=20,
    )

    floor_height: float = Field(
        default=3.2,
        gt=0,
        le=20,
    )


class BuildingFootprintPoint(BaseModel):

    longitude: float
    latitude: float


class BuildingCreateRequest(BaseModel):

    parent_ulpin: str

    building_code: str

    floors: int = Field(
        default=4,
        ge=1,
        le=100,
    )

    units_per_floor: int = Field(
        default=4,
        ge=1,
        le=20,
    )

    floor_height: float = Field(
        default=3.2,
        gt=0,
        le=20,
    )

    footprint: list[BuildingFootprintPoint]


# =========================================================
# HOME
# =========================================================

@app.get("/")
def home():

    return {
        "message": "Bhumi3D API is running",
        "status": "success",
        "database": "PostgreSQL + PostGIS",
        "version": "1.0.0",
    }


# =========================================================
# DATABASE HEALTH
# =========================================================

@app.get("/health/database")
def database_health():

    try:

        with get_connection() as connection:

            with connection.cursor() as cursor:

                cursor.execute(
                    "SELECT PostGIS_Version();"
                )

                version = cursor.fetchone()[0]


        return {
            "status": "connected",
            "database": "bhumi3d",
            "postgis_version": version,
        }


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=f"Database error: {error}",
        )


# =========================================================
# GET ALL PROPERTIES
# =========================================================

@app.get("/properties")
def get_properties():

    with get_connection() as connection:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    property_type,
                    parent_ulpin,
                    property_id,
                    building,
                    floor,
                    unit,
                    z_min,
                    z_max,
                    validation

                FROM properties

                ORDER BY id;
                """
            )

            rows = cursor.fetchall()


    results = []


    for row in rows:

        results.append(
            {
                "type": row[0],
                "parent_ulpin": row[1],
                "property_id": row[2],
                "building": row[3],
                "floor": row[4],
                "unit": row[5],
                "z_min": row[6],
                "z_max": row[7],
                "validation": row[8],
            }
        )


    return results


# =========================================================
# GET PROPERTY BY UNIT
# =========================================================

@app.get("/properties/{unit}")
def get_property(unit: str):

    with get_connection() as connection:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    property_type,
                    parent_ulpin,
                    property_id,
                    building,
                    floor,
                    unit,
                    z_min,
                    z_max,
                    validation

                FROM properties

                WHERE LOWER(unit)
                    = LOWER(%s)

                LIMIT 1;
                """,
                (
                    unit,
                ),
            )

            row = cursor.fetchone()


    if row is None:

        raise HTTPException(
            status_code=404,
            detail="Property not found",
        )


    return {
        "type": row[0],
        "parent_ulpin": row[1],
        "property_id": row[2],
        "building": row[3],
        "floor": row[4],
        "unit": row[5],
        "z_min": row[6],
        "z_max": row[7],
        "validation": row[8],
    }


# =========================================================
# SEARCH PROPERTIES
# =========================================================

@app.get("/search")
def search_properties(q: str):

    search_value = f"%{q}%"


    with get_connection() as connection:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    property_type,
                    parent_ulpin,
                    property_id,
                    building,
                    floor,
                    unit,
                    z_min,
                    z_max,
                    validation

                FROM properties

                WHERE
                    property_id ILIKE %s

                    OR unit ILIKE %s

                    OR parent_ulpin ILIKE %s

                    OR property_type ILIKE %s

                    OR building ILIKE %s

                ORDER BY id;
                """,
                (
                    search_value,
                    search_value,
                    search_value,
                    search_value,
                    search_value,
                ),
            )

            rows = cursor.fetchall()


    results = []


    for row in rows:

        results.append(
            {
                "type": row[0],
                "parent_ulpin": row[1],
                "property_id": row[2],
                "building": row[3],
                "floor": row[4],
                "unit": row[5],
                "z_min": row[6],
                "z_max": row[7],
                "validation": row[8],
            }
        )


    return {
        "found": len(results) > 0,
        "count": len(results),
        "results": results,
    }


# =========================================================
# CREATE ONE PROPERTY
# =========================================================

@app.post("/properties")
def create_property(
    property: PropertyCreate
):

    allowed_types = {
        "Apartment",
        "Basement Parking",
        "Underground Utility",
    }


    if (
        property.property_type
        not in allowed_types
    ):

        raise HTTPException(
            status_code=400,
            detail="Invalid property type",
        )


    if (
        property.z_max
        <= property.z_min
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "z_max must be greater "
                "than z_min"
            ),
        )


    if (
        property.max_lon
        <= property.min_lon
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "max_lon must be greater "
                "than min_lon"
            ),
        )


    if (
        property.max_lat
        <= property.min_lat
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "max_lat must be greater "
                "than min_lat"
            ),
        )


    try:

        with get_connection() as connection:

            with connection.cursor() as cursor:

                # -------------------------------------
                # CHECK PARENT ULPIN
                # -------------------------------------

                cursor.execute(
                    """
                    SELECT id

                    FROM parcels

                    WHERE ulpin = %s;
                    """,
                    (
                        property.parent_ulpin,
                    ),
                )


                if cursor.fetchone() is None:

                    raise HTTPException(
                        status_code=404,
                        detail=(
                            "Parent ULPIN "
                            "does not exist"
                        ),
                    )


                # -------------------------------------
                # INSERT
                # property_id is generated
                # automatically by PostgreSQL trigger
                # -------------------------------------

                cursor.execute(
                    """
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

                    VALUES (
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        'Not checked',

                        ST_MakeEnvelope(
                            %s,
                            %s,
                            %s,
                            %s,
                            4326
                        )
                    )

                    RETURNING
                        id,
                        property_id;
                    """,
                    (
                        property.property_type,
                        property.parent_ulpin,
                        property.building,
                        property.floor,
                        property.unit,
                        property.z_min,
                        property.z_max,
                        property.min_lon,
                        property.min_lat,
                        property.max_lon,
                        property.max_lat,
                    ),
                )


                created = cursor.fetchone()


        return {
            "success": True,
            "message": (
                "3D property created successfully"
            ),
            "id": created[0],
            "property_id": created[1],
            "unit": property.unit,
        }


    except HTTPException:

        raise


    except psycopg.errors.UniqueViolation:

        raise HTTPException(
            status_code=409,
            detail=(
                "A property with this "
                "generated spatial ID "
                "already exists"
            ),
        )


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# COMPLETE POSTGIS SCENE
# =========================================================

@app.get("/scene")
def get_scene():

    with get_connection() as connection:

        with connection.cursor() as cursor:

            # -------------------------------------
            # PARCELS
            # -------------------------------------

            cursor.execute(
                """
                SELECT
                    ulpin,
                    name,
                    ST_AsGeoJSON(geometry)

                FROM parcels

                ORDER BY id;
                """
            )


            parcel_rows = cursor.fetchall()


            parcels = []


            for row in parcel_rows:

                parcels.append(
                    {
                        "ulpin": row[0],
                        "name": row[1],

                        "geometry": (
                            json.loads(row[2])
                            if row[2]
                            else None
                        ),
                    }
                )


            # -------------------------------------
            # PROPERTIES
            # -------------------------------------

            cursor.execute(
                """
                SELECT
                    property_type,
                    parent_ulpin,
                    property_id,
                    building,
                    floor,
                    unit,
                    z_min,
                    z_max,
                    validation,
                    ST_AsGeoJSON(footprint)

                FROM properties

                ORDER BY id;
                """
            )


            property_rows = (
                cursor.fetchall()
            )


            properties = []


            for row in property_rows:

                properties.append(
                    {
                        "type": row[0],
                        "parent_ulpin": row[1],
                        "property_id": row[2],
                        "building": row[3],
                        "floor": row[4],
                        "unit": row[5],
                        "z_min": row[6],
                        "z_max": row[7],
                        "validation": row[8],

                        "geometry": (
                            json.loads(row[9])
                            if row[9]
                            else None
                        ),
                    }
                )


    return {
        "parcel_count": len(parcels),
        "property_count": len(properties),
        "parcels": parcels,
        "properties": properties,
    }


# =========================================================
# POSTGIS TOPOLOGY VALIDATION
# =========================================================

@app.get("/validate/topology")
def validate_topology():

    with get_connection() as connection:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    a.id,
                    a.property_type,
                    a.property_id,
                    a.unit,

                    b.id,
                    b.property_type,
                    b.property_id,
                    b.unit,

                    ST_Area(
                        ST_Intersection(
                            a.footprint,
                            b.footprint
                        )::geography
                    ) AS overlap_area_m2,

                    (
                        LEAST(
                            a.z_max,
                            b.z_max
                        )
                        -
                        GREATEST(
                            a.z_min,
                            b.z_min
                        )
                    ) AS overlap_height_m

                FROM properties AS a

                JOIN properties AS b
                    ON a.id < b.id

                WHERE
                    a.footprint IS NOT NULL

                    AND b.footprint IS NOT NULL

                    AND ST_Intersects(
                        a.footprint,
                        b.footprint
                    )

                    AND GREATEST(
                        a.z_min,
                        b.z_min
                    )
                    <
                    LEAST(
                        a.z_max,
                        b.z_max
                    )

                    AND ST_Area(
                        ST_Intersection(
                            a.footprint,
                            b.footprint
                        )::geography
                    ) > 0.01

                ORDER BY
                    a.id,
                    b.id;
                """
            )


            rows = cursor.fetchall()


    conflicts = []


    for row in rows:

        type_a = row[1]

        type_b = row[5]

        unit_a = row[3]

        unit_b = row[7]

        overlap_area = float(
            row[8]
        )

        overlap_height = float(
            row[9]
        )

        overlap_volume = (
            overlap_area
            * overlap_height
        )


        if (
            type_a == "Apartment"
            and
            type_b == "Apartment"
        ):

            conflict_type = (
                "3D Ownership Volume Overlap"
            )


        elif (
            {
                type_a,
                type_b,
            }
            ==
            {
                "Basement Parking",
                "Underground Utility",
            }
        ):

            conflict_type = (
                "Underground Infrastructure Collision"
            )


        else:

            conflict_type = (
                "3D Spatial Conflict"
            )


        conflicts.append(
            {
                "type": conflict_type,

                "object_a": {
                    "type": type_a,
                    "unit": unit_a,
                    "property_id": row[2],
                },

                "object_b": {
                    "type": type_b,
                    "unit": unit_b,
                    "property_id": row[6],
                },

                "overlap_area_m2":
                    round(
                        overlap_area,
                        2,
                    ),

                "overlap_height_m":
                    round(
                        overlap_height,
                        2,
                    ),

                "overlap_volume_m3":
                    round(
                        overlap_volume,
                        2,
                    ),
            }
        )


    return {
        "valid": (
            len(conflicts) == 0
        ),

        "engine": "PostGIS",

        "method": (
            "2D footprint intersection "
            "+ vertical Z-range intersection"
        ),

        "conflict_count":
            len(conflicts),

        "conflicts":
            conflicts,
    }


# =========================================================
# IMPORT GEOJSON
# =========================================================

@app.post("/import/geojson")
async def import_geojson(
    file: UploadFile = File(...)
):

    filename = (
        file.filename
        or
        "uploaded.geojson"
    )


    if not (
        filename
        .lower()
        .endswith(".geojson")

        or

        filename
        .lower()
        .endswith(".json")
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "Upload a .geojson "
                "or .json file"
            ),
        )


    try:

        raw_data = await file.read()

        geojson = json.loads(
            raw_data.decode("utf-8")
        )


    except Exception:

        raise HTTPException(
            status_code=400,
            detail="Invalid GeoJSON file",
        )


    if (
        geojson.get("type")
        ==
        "FeatureCollection"
    ):

        features = geojson.get(
            "features",
            [],
        )


    elif (
        geojson.get("type")
        ==
        "Feature"
    ):

        features = [
            geojson
        ]


    else:

        raise HTTPException(
            status_code=400,
            detail=(
                "GeoJSON must be a "
                "FeatureCollection or Feature"
            ),
        )


    if (
        len(features) == 0
    ):

        raise HTTPException(
            status_code=400,
            detail=(
                "GeoJSON contains "
                "no features"
            ),
        )


    imported_ids = []

    skipped = []


    try:

        with get_connection() as connection:

            with connection.cursor() as cursor:

                for (
                    index,
                    feature
                ) in enumerate(
                    features,
                    start=1,
                ):

                    geometry = (
                        feature.get(
                            "geometry"
                        )
                    )


                    properties = (
                        feature.get(
                            "properties"
                        )
                        or {}
                    )


                    if not geometry:

                        skipped.append(
                            {
                                "feature":
                                    index,

                                "reason":
                                    "Missing geometry",
                            }
                        )

                        continue


                    geometry_type = (
                        geometry.get(
                            "type"
                        )
                    )


                    if (
                        geometry_type
                        not in {
                            "Polygon",
                            "MultiPolygon",
                        }
                    ):

                        skipped.append(
                            {
                                "feature":
                                    index,

                                "reason": (
                                    "Only Polygon "
                                    "and MultiPolygon "
                                    "are supported"
                                ),
                            }
                        )

                        continue


                    name = (
                        properties.get(
                            "name"
                        )

                        or

                        properties.get(
                            "Name"
                        )

                        or

                        f"Imported Feature {index}"
                    )


                    feature_type = (
                        properties.get(
                            "feature_type"
                        )

                        or

                        properties.get(
                            "type"
                        )

                        or

                        "GIS Feature"
                    )


                    cursor.execute(
                        """
                        INSERT INTO imported_features (
                            feature_type,
                            name,
                            source_filename,
                            properties,
                            geometry
                        )

                        VALUES (
                            %s,
                            %s,
                            %s,
                            %s::jsonb,

                            ST_SetSRID(
                                ST_GeomFromGeoJSON(%s),
                                4326
                            )
                        )

                        RETURNING id;
                        """,
                        (
                            str(
                                feature_type
                            ),

                            str(
                                name
                            ),

                            filename,

                            json.dumps(
                                properties
                            ),

                            json.dumps(
                                geometry
                            ),
                        ),
                    )


                    new_id = (
                        cursor
                        .fetchone()[0]
                    )


                    imported_ids.append(
                        new_id
                    )


        return {
            "success": True,
            "filename": filename,

            "feature_count":
                len(features),

            "imported_count":
                len(imported_ids),

            "skipped_count":
                len(skipped),

            "imported_ids":
                imported_ids,

            "skipped":
                skipped,
        }


    except HTTPException:

        raise


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# GET IMPORTED GIS FEATURES
# =========================================================

@app.get("/gis/features")
def get_gis_features():

    with get_connection() as connection:

        with connection.cursor() as cursor:

            cursor.execute(
                """
                SELECT
                    id,
                    feature_type,
                    name,
                    source_filename,
                    properties,
                    ST_AsGeoJSON(
                        geometry
                    )

                FROM imported_features

                ORDER BY id;
                """
            )


            rows = cursor.fetchall()


    features = []


    for row in rows:

        features.append(
            {
                "id": row[0],

                "feature_type":
                    row[1],

                "name":
                    row[2],

                "source_filename":
                    row[3],

                "properties":
                    row[4],

                "geometry": (
                    json.loads(
                        row[5]
                    )
                    if row[5]
                    else None
                ),
            }
        )


    return {
        "count":
            len(features),

        "features":
            features,
    }


# =========================================================
# PLANNED COLONY DEMO
# =========================================================

def ensure_colony_assets_table(cursor):

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS colony_assets (
            id SERIAL PRIMARY KEY,
            asset_type VARCHAR(50) NOT NULL,
            name VARCHAR(150),
            properties JSONB DEFAULT '{}'::jsonb,
            geometry GEOMETRY(Geometry, 4326) NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS
            colony_assets_geometry_gix
        ON colony_assets
        USING GIST (geometry);
        """
    )


@app.get("/colony/assets")
def get_colony_assets():

    with get_connection() as connection:

        with connection.cursor() as cursor:

            ensure_colony_assets_table(cursor)

            cursor.execute(
                """
                SELECT
                    id,
                    asset_type,
                    name,
                    properties,
                    ST_AsGeoJSON(geometry)

                FROM colony_assets

                ORDER BY id;
                """
            )

            rows = cursor.fetchall()


    assets = []

    for row in rows:

        assets.append(
            {
                "id": row[0],
                "asset_type": row[1],
                "name": row[2],
                "properties": row[3],
                "geometry": (
                    json.loads(row[4])
                    if row[4]
                    else None
                ),
            }
        )


    return {
        "count": len(assets),
        "assets": assets,
    }


def _insert_colony_asset(
    cursor,
    asset_type,
    name,
    properties,
    geometry_sql,
    geometry_parameters,
):

    cursor.execute(
        f"""
        INSERT INTO colony_assets (
            asset_type,
            name,
            properties,
            geometry
        )
        VALUES (
            %s,
            %s,
            %s::jsonb,
            {geometry_sql}
        );
        """,
        (
            asset_type,
            name,
            json.dumps(properties),
            *geometry_parameters,
        ),
    )


@app.post("/colony/generate-demo")
def generate_demo_colony():

    """
    Replace the small development demo with a deterministic,
    planned residential-colony dataset.

    V1 creates:
    - 50 cadastral plots
    - 20 multi-storey apartment towers (all above 5 floors)
    - 2 schools
    - 1 office/community building
    - 2 parks
    - 1 common surface-parking area
    - planned internal roads
    - street-light points

    Vertical apartment ownership volumes are intentionally left for
    the next milestone so the colony overview remains lightweight.
    """

    # -----------------------------------------------------
    # PLANNING CONSTANTS
    # -----------------------------------------------------

    base_lon = 77.20500
    base_lat = 28.61150

    plot_width = 0.00042
    plot_height = 0.00034

    vertical_road_width = 0.00010

    horizontal_road_widths = [
        0.00010,
        0.00020,  # central/main avenue
        0.00010,
        0.00010,
    ]

    rows = 5
    columns = 10

    apartment_floors = [
        6, 7, 8, 9, 10,
        11, 12, 14, 16, 18,
        20, 22, 24, 26, 28,
        8, 12, 15, 18, 21,
    ]

    # 5 rows x 10 columns = exactly 50 cadastral plots.
    # Counts:
    # 20 apartment plots, 24 villa plots, 2 schools,
    # 1 office, 2 parks and 1 common parking plot.

    land_use_grid = [
        [
            "school", "villa", "villa", "apartment", "apartment",
            "apartment", "villa", "villa", "villa", "villa",
        ],
        [
            "villa", "villa", "apartment", "apartment", "park",
            "apartment", "apartment", "villa", "villa", "villa",
        ],
        [
            "office", "apartment", "apartment", "apartment", "villa",
            "villa", "apartment", "apartment", "parking", "villa",
        ],
        [
            "villa", "villa", "apartment", "apartment", "park",
            "apartment", "apartment", "villa", "villa", "villa",
        ],
        [
            "school", "villa", "villa", "apartment", "apartment",
            "apartment", "apartment", "villa", "villa", "villa",
        ],
    ]

    x_starts = []
    current_x = base_lon

    for column_index in range(columns):
        x_starts.append(current_x)
        current_x += plot_width

        if column_index < columns - 1:
            current_x += vertical_road_width

    colony_max_lon = current_x

    y_starts = []
    current_y = base_lat

    for row_index in range(rows):
        y_starts.append(current_y)
        current_y += plot_height

        if row_index < rows - 1:
            current_y += horizontal_road_widths[row_index]

    colony_max_lat = current_y

    plots = []

    apartment_index = 0
    villa_index = 0
    school_index = 0
    park_index = 0

    try:

        with get_connection() as connection:

            with connection.cursor() as cursor:

                ensure_colony_assets_table(cursor)

                # -----------------------------------------
                # RESET CURRENT DEMO DATA
                # -----------------------------------------

                cursor.execute(
                    "TRUNCATE TABLE properties RESTART IDENTITY;"
                )

                cursor.execute(
                    "TRUNCATE TABLE imported_features RESTART IDENTITY;"
                )

                cursor.execute(
                    "TRUNCATE TABLE parcels RESTART IDENTITY;"
                )

                cursor.execute(
                    "TRUNCATE TABLE colony_assets RESTART IDENTITY;"
                )

                # -----------------------------------------
                # 50 CADASTRAL PARCELS + LAND USE
                # -----------------------------------------

                parcel_number = 0

                for row_index in range(rows):

                    for column_index in range(columns):

                        parcel_number += 1

                        land_use = land_use_grid[row_index][column_index]

                        min_lon = x_starts[column_index]
                        min_lat = y_starts[row_index]
                        max_lon = min_lon + plot_width
                        max_lat = min_lat + plot_height

                        ulpin = (
                            f"RJ-JPR-COLONY-{parcel_number:04d}"
                        )

                        if land_use == "apartment":
                            apartment_index += 1
                            display_name = (
                                f"Apartment Plot A{apartment_index:02d}"
                            )

                        elif land_use == "villa":
                            villa_index += 1
                            display_name = (
                                f"Residential Plot V{villa_index:02d}"
                            )

                        elif land_use == "school":
                            school_index += 1
                            display_name = (
                                f"School Plot S{school_index:02d}"
                            )

                        elif land_use == "park":
                            park_index += 1
                            display_name = (
                                f"Public Park P{park_index:02d}"
                            )

                        elif land_use == "office":
                            display_name = "Colony Office Plot"

                        elif land_use == "parking":
                            display_name = "Common Parking Plot"

                        else:
                            display_name = f"Plot {parcel_number:02d}"

                        cursor.execute(
                            """
                            INSERT INTO parcels (
                                ulpin,
                                name,
                                geometry
                            )
                            VALUES (
                                %s,
                                %s,
                                ST_MakeEnvelope(
                                    %s, %s, %s, %s, 4326
                                )
                            );
                            """,
                            (
                                ulpin,
                                display_name,
                                min_lon,
                                min_lat,
                                max_lon,
                                max_lat,
                            ),
                        )

                        plots.append(
                            {
                                "number": parcel_number,
                                "row": row_index,
                                "column": column_index,
                                "land_use": land_use,
                                "ulpin": ulpin,
                                "name": display_name,
                                "min_lon": min_lon,
                                "min_lat": min_lat,
                                "max_lon": max_lon,
                                "max_lat": max_lat,
                            }
                        )

                # -----------------------------------------
                # BUILDING FOOTPRINTS
                # -----------------------------------------

                apartment_counter = 0
                school_counter = 0
                building_feature_count = 0

                for plot in plots:

                    land_use = plot["land_use"]

                    if land_use not in {
                        "apartment",
                        "school",
                        "office",
                    }:
                        continue

                    # Use deliberately different setbacks by use.
                    if land_use == "apartment":
                        inset_x = 0.000075
                        inset_y = 0.000060

                        apartment_counter += 1
                        building_code = (
                            f"B{apartment_counter:02d}"
                        )
                        floors = apartment_floors[
                            apartment_counter - 1
                        ]
                        floor_height = 3.2
                        units_per_floor = 4
                        building_type = "Apartment Tower"
                        feature_name = (
                            f"Residential Tower {building_code}"
                        )

                    elif land_use == "school":
                        inset_x = 0.000050
                        inset_y = 0.000055

                        school_counter += 1
                        building_code = (
                            f"SCH{school_counter:02d}"
                        )
                        floors = 3 if school_counter == 1 else 4
                        floor_height = 3.6
                        units_per_floor = 1
                        building_type = "School"
                        feature_name = (
                            f"Community School {school_counter}"
                        )

                    else:
                        inset_x = 0.000065
                        inset_y = 0.000055

                        building_code = "OFF01"
                        floors = 8
                        floor_height = 3.4
                        units_per_floor = 1
                        building_type = "Colony Office"
                        feature_name = "Colony Administration Office"

                    building_min_lon = plot["min_lon"] + inset_x
                    building_min_lat = plot["min_lat"] + inset_y
                    building_max_lon = plot["max_lon"] - inset_x
                    building_max_lat = plot["max_lat"] - inset_y

                    if land_use == "school":
                        # Leave the western side open for the playground.
                        building_min_lon = plot["min_lon"] + 0.000155
                        building_max_lon = plot["max_lon"] - 0.000035

                    height_m = floors * floor_height

                    metadata = {
                        "parent_ulpin": plot["ulpin"],
                        "building_code": building_code,
                        "building_type": building_type,
                        "land_use": land_use,
                        "floors": floors,
                        "units_per_floor": units_per_floor,
                        "floor_height": floor_height,
                        "height_m": round(height_m, 2),
                        "demo": "planned_colony_v1",
                    }

                    cursor.execute(
                        """
                        INSERT INTO imported_features (
                            feature_type,
                            name,
                            source_filename,
                            properties,
                            geometry
                        )
                        VALUES (
                            %s,
                            %s,
                            %s,
                            %s::jsonb,
                            ST_MakeEnvelope(
                                %s, %s, %s, %s, 4326
                            )
                        );
                        """,
                        (
                            building_type,
                            feature_name,
                            "bhumi3d_planned_colony_v1",
                            json.dumps(metadata),
                            building_min_lon,
                            building_min_lat,
                            building_max_lon,
                            building_max_lat,
                        ),
                    )

                    building_feature_count += 1

                    # School playground beside the school block.
                    if land_use == "school":

                        playground_min_lon = (
                            plot["min_lon"] + 0.000020
                        )
                        playground_max_lon = (
                            plot["min_lon"] + 0.000120
                        )
                        playground_min_lat = (
                            plot["min_lat"] + 0.000080
                        )
                        playground_max_lat = (
                            plot["max_lat"] - 0.000080
                        )

                        _insert_colony_asset(
                            cursor,
                            "playground",
                            f"School {school_counter} Playground",
                            {
                                "parent_ulpin": plot["ulpin"],
                                "surface": "sports_ground",
                            },
                            "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                            (
                                playground_min_lon,
                                playground_min_lat,
                                playground_max_lon,
                                playground_max_lat,
                            ),
                        )

                # -----------------------------------------
                # PARK + COMMON PARKING SURFACES
                # -----------------------------------------

                for plot in plots:

                    if plot["land_use"] == "park":

                        _insert_colony_asset(
                            cursor,
                            "park",
                            plot["name"],
                            {
                                "parent_ulpin": plot["ulpin"],
                                "land_use": "Public Park",
                            },
                            "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                            (
                                plot["min_lon"] + 0.000015,
                                plot["min_lat"] + 0.000015,
                                plot["max_lon"] - 0.000015,
                                plot["max_lat"] - 0.000015,
                            ),
                        )

                    if plot["land_use"] == "parking":

                        _insert_colony_asset(
                            cursor,
                            "surface_parking",
                            "Common Surface Parking",
                            {
                                "parent_ulpin": plot["ulpin"],
                                "capacity": 42,
                                "land_use": "Common Parking",
                            },
                            "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                            (
                                plot["min_lon"] + 0.000020,
                                plot["min_lat"] + 0.000020,
                                plot["max_lon"] - 0.000020,
                                plot["max_lat"] - 0.000020,
                            ),
                        )

                # -----------------------------------------
                # ROAD NETWORK IN THE GAPS BETWEEN PLOTS
                # -----------------------------------------

                road_count = 0

                for column_index in range(columns - 1):

                    road_min_lon = (
                        x_starts[column_index] + plot_width
                    )
                    road_max_lon = (
                        road_min_lon + vertical_road_width
                    )

                    road_count += 1

                    _insert_colony_asset(
                        cursor,
                        "road",
                        f"Residential Street {column_index + 1}",
                        {
                            "road_class": "Internal Street",
                            "nominal_width_m": 10,
                        },
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (
                            road_min_lon,
                            base_lat,
                            road_max_lon,
                            colony_max_lat,
                        ),
                    )

                for row_index in range(rows - 1):

                    road_min_lat = (
                        y_starts[row_index] + plot_height
                    )
                    road_max_lat = (
                        road_min_lat
                        + horizontal_road_widths[row_index]
                    )

                    is_main_avenue = row_index == 1

                    road_count += 1

                    _insert_colony_asset(
                        cursor,
                        "road",
                        (
                            "Central Avenue"
                            if is_main_avenue
                            else f"Cross Street {row_index + 1}"
                        ),
                        {
                            "road_class": (
                                "Main Avenue"
                                if is_main_avenue
                                else "Collector Street"
                            ),
                            "nominal_width_m": (
                                20
                                if is_main_avenue
                                else 10
                            ),
                        },
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (
                            base_lon,
                            road_min_lat,
                            colony_max_lon,
                            road_max_lat,
                        ),
                    )

                # Main entrance road just south of the colony.
                colony_center_lon = (
                    base_lon + colony_max_lon
                ) / 2

                entrance_half_width = 0.000060

                _insert_colony_asset(
                    cursor,
                    "road",
                    "Main Colony Entrance",
                    {
                        "road_class": "Entrance Boulevard",
                        "nominal_width_m": 12,
                    },
                    "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                    (
                        colony_center_lon - entrance_half_width,
                        base_lat - 0.000240,
                        colony_center_lon + entrance_half_width,
                        base_lat,
                    ),
                )

                road_count += 1

                # -----------------------------------------
                # STREET LIGHTS
                # -----------------------------------------

                light_count = 0

                # Lights along each horizontal corridor.
                for row_index in range(rows - 1):

                    road_center_lat = (
                        y_starts[row_index]
                        + plot_height
                        + horizontal_road_widths[row_index] / 2
                    )

                    for column_index in range(columns):

                        light_lon = (
                            x_starts[column_index]
                            + plot_width / 2
                        )

                        light_count += 1

                        _insert_colony_asset(
                            cursor,
                            "streetlight",
                            f"Street Light L{light_count:03d}",
                            {
                                "height_m": 8.0,
                                "status": "planned",
                            },
                            "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                            (
                                light_lon,
                                road_center_lat,
                            ),
                        )

                # Lights along each north-south street.
                for column_index in range(columns - 1):

                    road_center_lon = (
                        x_starts[column_index]
                        + plot_width
                        + vertical_road_width / 2
                    )

                    for row_index in range(rows):

                        light_lat = (
                            y_starts[row_index]
                            + plot_height / 2
                        )

                        light_count += 1

                        _insert_colony_asset(
                            cursor,
                            "streetlight",
                            f"Street Light L{light_count:03d}",
                            {
                                "height_m": 8.0,
                                "status": "planned",
                            },
                            "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                            (
                                road_center_lon,
                                light_lat,
                            ),
                        )

                # A few lights on the entrance approach.
                for step in range(4):

                    light_count += 1

                    _insert_colony_asset(
                        cursor,
                        "streetlight",
                        f"Street Light L{light_count:03d}",
                        {
                            "height_m": 9.0,
                            "status": "planned",
                        },
                        "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                        (
                            colony_center_lon,
                            base_lat
                            - 0.000045
                            - step * 0.000050,
                        ),
                    )

        return {
            "success": True,
            "message": "Planned Bhumi3D colony generated successfully",
            "version": "planned_colony_v1",
            "plot_count": 50,
            "apartment_plot_count": 20,
            "villa_plot_count": 24,
            "school_count": 2,
            "office_count": 1,
            "park_count": 2,
            "parking_count": 1,
            "apartment_building_count": 20,
            "building_feature_count": building_feature_count,
            "road_count": road_count,
            "streetlight_count": light_count,
            "apartment_floor_total": sum(apartment_floors),
            "highest_apartment_floors": max(apartment_floors),
            "note": (
                "Apartment ownership volumes are generated in the "
                "next vertical-colony milestone."
            ),
        }

    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=f"Colony generation error: {error}",
        )


# =========================================================
# VISUAL BUILDING CREATOR
# =========================================================

@app.post("/buildings/create")
def create_building(request: BuildingCreateRequest):

    """
    Create one polygonal building footprint directly from
    the Bhumi3D map and generate apartment volumes.

    Building Creator V2 accepts three or more map vertices.
    PostGIS validates polygon geometry, parent-plot
    containment, and overlap with existing building
    footprints before anything is committed.
    """

    building_code = request.building_code.strip().upper()
    parent_ulpin = request.parent_ulpin.strip()

    if not building_code:
        raise HTTPException(
            status_code=400,
            detail="Building code cannot be empty",
        )

    if not parent_ulpin:
        raise HTTPException(
            status_code=400,
            detail="Parent ULPIN cannot be empty",
        )

    if len(request.footprint) < 3:
        raise HTTPException(
            status_code=400,
            detail="A building footprint needs at least 3 points",
        )

    if len(request.footprint) > 100:
        raise HTTPException(
            status_code=400,
            detail="Building footprint is limited to 100 points",
        )

    coordinates = [
        [point.longitude, point.latitude]
        for point in request.footprint
    ]

    if coordinates[0] != coordinates[-1]:
        coordinates.append(coordinates[0])

    footprint_geojson = json.dumps(
        {
            "type": "Polygon",
            "coordinates": [coordinates],
        }
    )

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:

                cursor.execute(
                    """
                    WITH candidate AS (
                        SELECT ST_SetSRID(
                            ST_GeomFromGeoJSON(%s),
                            4326
                        ) AS geom
                    )
                    SELECT
                        ST_IsValid(geom),
                        ST_IsValidReason(geom)
                    FROM candidate;
                    """,
                    (footprint_geojson,),
                )

                validity_check = cursor.fetchone()

                if not bool(validity_check[0]):
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Invalid building polygon: "
                            f"{validity_check[1]}"
                        ),
                    )

                cursor.execute(
                    """
                    WITH candidate AS (
                        SELECT ST_SetSRID(
                            ST_GeomFromGeoJSON(%s),
                            4326
                        ) AS geom
                    )
                    SELECT
                        ST_Area(geom::geography),
                        ST_XMin(ST_Envelope(geom)),
                        ST_YMin(ST_Envelope(geom)),
                        ST_XMax(ST_Envelope(geom)),
                        ST_YMax(ST_Envelope(geom))
                    FROM candidate;
                    """,
                    (footprint_geojson,),
                )

                geometry_metrics = cursor.fetchone()

                footprint_area_m2 = float(
                    geometry_metrics[0] or 0
                )

                if footprint_area_m2 < 1.0:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Building footprint is too small. "
                            "Draw an area larger than 1 m²."
                        ),
                    )

                min_lon = float(geometry_metrics[1])
                min_lat = float(geometry_metrics[2])
                max_lon = float(geometry_metrics[3])
                max_lat = float(geometry_metrics[4])

                cursor.execute(
                    """
                    WITH candidate AS (
                        SELECT ST_SetSRID(
                            ST_GeomFromGeoJSON(%s),
                            4326
                        ) AS geom
                    )
                    SELECT
                        parcels.name,
                        ST_CoveredBy(
                            candidate.geom,
                            parcels.geometry
                        )
                    FROM parcels, candidate
                    WHERE parcels.ulpin = %s;
                    """,
                    (
                        footprint_geojson,
                        parent_ulpin,
                    ),
                )

                parent = cursor.fetchone()

                if parent is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Parent ULPIN does not exist",
                    )

                if not bool(parent[1]):
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "Building footprint must be completely "
                            "inside the selected parent land plot"
                        ),
                    )

                cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM properties
                    WHERE parent_ulpin = %s
                      AND building = %s;
                    """,
                    (
                        parent_ulpin,
                        building_code,
                    ),
                )

                property_count = cursor.fetchone()[0]

                cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM imported_features
                    WHERE properties ->> 'parent_ulpin' = %s
                      AND UPPER(
                          properties ->> 'building_code'
                      ) = %s;
                    """,
                    (
                        parent_ulpin,
                        building_code,
                    ),
                )

                feature_count = cursor.fetchone()[0]

                if property_count > 0 or feature_count > 0:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Building {building_code} already exists "
                            f"on {parent_ulpin}"
                        ),
                    )

                cursor.execute(
                    """
                    WITH candidate AS (
                        SELECT ST_SetSRID(
                            ST_GeomFromGeoJSON(%s),
                            4326
                        ) AS geom
                    )
                    SELECT
                        imported_features.properties
                            ->> 'building_code',
                        imported_features.properties
                            ->> 'parent_ulpin',
                        ST_Area(
                            ST_Intersection(
                                imported_features.geometry,
                                candidate.geom
                            )::geography
                        ) AS overlap_area_m2
                    FROM imported_features, candidate
                    WHERE imported_features.geometry IS NOT NULL
                      AND imported_features.properties
                            ->> 'building_code' IS NOT NULL
                      AND ST_Intersects(
                            imported_features.geometry,
                            candidate.geom
                      )
                      AND NOT ST_Touches(
                            imported_features.geometry,
                            candidate.geom
                      )
                      AND ST_Area(
                            ST_Intersection(
                                imported_features.geometry,
                                candidate.geom
                            )::geography
                      ) > 0.05
                    ORDER BY overlap_area_m2 DESC
                    LIMIT 1;
                    """,
                    (footprint_geojson,),
                )

                overlap = cursor.fetchone()

                if overlap is not None:
                    other_building = (
                        overlap[0]
                        or "another building"
                    )
                    other_parent = (
                        overlap[1]
                        or "unknown plot"
                    )

                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Building footprint overlaps {other_building} "
                            f"on {other_parent} "
                            f"({float(overlap[2]):.2f} m² overlap)."
                        ),
                    )

                metadata = {
                    "name": f"Building {building_code}",
                    "feature_type": "Building Footprint",
                    "building_code": building_code,
                    "parent_ulpin": parent_ulpin,
                    "floors": request.floors,
                    "units_per_floor": request.units_per_floor,
                    "floor_height": request.floor_height,
                    "height_m": (
                        request.floors
                        * request.floor_height
                    ),
                    "footprint_area_m2": footprint_area_m2,
                    "footprint_vertices": len(
                        request.footprint
                    ),
                    "source": "Bhumi3D Building Creator V2",
                }

                cursor.execute(
                    """
                    INSERT INTO imported_features (
                        feature_type,
                        name,
                        source_filename,
                        properties,
                        geometry
                    )
                    VALUES (
                        'Building Footprint',
                        %s,
                        'Bhumi3D Building Creator V2',
                        %s::jsonb,
                        ST_SetSRID(
                            ST_GeomFromGeoJSON(%s),
                            4326
                        )
                    )
                    RETURNING id;
                    """,
                    (
                        f"Building {building_code}",
                        json.dumps(metadata),
                        footprint_geojson,
                    ),
                )

                feature_id = cursor.fetchone()[0]

                strip_width = (
                    max_lon - min_lon
                ) / request.units_per_floor

                created = []

                for floor_number in range(
                    1,
                    request.floors + 1,
                ):
                    floor_code = str(
                        floor_number
                    ).zfill(2)

                    z_min = (
                        floor_number - 1
                    ) * request.floor_height

                    z_max = (
                        floor_number
                        * request.floor_height
                    )

                    for unit_index in range(
                        1,
                        request.units_per_floor + 1,
                    ):

                        unit_min_lon = (
                            min_lon
                            + (
                                unit_index - 1
                            ) * strip_width
                        )

                        unit_max_lon = (
                            min_lon
                            + unit_index
                            * strip_width
                        )

                        if (
                            unit_index
                            == request.units_per_floor
                        ):
                            unit_max_lon = max_lon

                        unit_code = (
                            f"{floor_number}"
                            f"{unit_index:02d}"
                        )

                        cursor.execute(
                            """
                            WITH candidate AS (
                                SELECT ST_SetSRID(
                                    ST_GeomFromGeoJSON(%s),
                                    4326
                                ) AS geom
                            ),
                            clipped AS (
                                SELECT ST_CollectionExtract(
                                    ST_Intersection(
                                        ST_MakeEnvelope(
                                            %s,
                                            %s,
                                            %s,
                                            %s,
                                            4326
                                        ),
                                        candidate.geom
                                    ),
                                    3
                                ) AS geom
                                FROM candidate
                            ),
                            pieces AS (
                                SELECT
                                    (ST_Dump(geom)).geom AS geom
                                FROM clipped
                                WHERE NOT ST_IsEmpty(geom)
                            ),
                            largest_piece AS (
                                SELECT geom
                                FROM pieces
                                WHERE ST_Area(
                                    geom::geography
                                ) > 0.01
                                ORDER BY ST_Area(
                                    geom::geography
                                ) DESC
                                LIMIT 1
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
                                %s,
                                %s,
                                %s,
                                %s,
                                %s,
                                %s,
                                'Not checked',
                                geom
                            FROM largest_piece
                            RETURNING property_id, unit;
                            """,
                            (
                                footprint_geojson,
                                unit_min_lon,
                                min_lat,
                                unit_max_lon,
                                max_lat,
                                parent_ulpin,
                                building_code,
                                floor_code,
                                unit_code,
                                z_min,
                                z_max,
                            ),
                        )

                        inserted = cursor.fetchone()

                        if inserted is None:
                            raise HTTPException(
                                status_code=400,
                                detail=(
                                    "Could not divide this polygon into "
                                    "the requested number of units. "
                                    "Try a simpler building footprint."
                                ),
                            )

                        created.append(
                            {
                                "property_id": inserted[0],
                                "unit": inserted[1],
                                "floor": floor_code,
                                "z_min": z_min,
                                "z_max": z_max,
                            }
                        )

        return {
            "success": True,
            "message": "Building created successfully",
            "feature_id": feature_id,
            "parent_ulpin": parent_ulpin,
            "plot_name": parent[0],
            "building": building_code,
            "floors": request.floors,
            "units_per_floor": request.units_per_floor,
            "floor_height": request.floor_height,
            "footprint_vertices": len(
                request.footprint
            ),
            "footprint_area_m2": round(
                footprint_area_m2,
                2,
            ),
            "generated_property_count": len(
                created
            ),
            "properties": created,
        }

    except HTTPException:
        raise

    except psycopg.errors.UniqueViolation:
        raise HTTPException(
            status_code=409,
            detail="A generated spatial ID already exists",
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


# =========================================================
# AUTOMATIC VERTICAL PARCEL GENERATION
# =========================================================

@app.post(
    "/generate/vertical-parcels"
)
def generate_vertical_parcels(
    request: VerticalGenerationRequest
):

    """
    Generate apartments automatically
    from an imported building footprint.

    Current SIH prototype method:

    Building bounding box
          ↓
    Grid subdivision
          ↓
    Floors
          ↓
    Apartment footprints
          ↓
    Automatic spatial IDs
          ↓
    PostGIS
    """


    building_code = (
        request
        .building_code
        .strip()
        .upper()
    )


    if not building_code:

        raise HTTPException(
            status_code=400,
            detail=(
                "building_code "
                "cannot be empty"
            ),
        )


    try:

        with get_connection() as connection:

            with connection.cursor() as cursor:

                # ---------------------------------
                # CHECK PARENT PARCEL
                # ---------------------------------

                cursor.execute(
                    """
                    SELECT id

                    FROM parcels

                    WHERE ulpin = %s;
                    """,
                    (
                        request.parent_ulpin,
                    ),
                )


                if (
                    cursor.fetchone()
                    is None
                ):

                    raise HTTPException(
                        status_code=404,
                        detail=(
                            "Parent ULPIN "
                            "does not exist"
                        ),
                    )


                # ---------------------------------
                # GET BUILDING FOOTPRINT BOUNDS
                # ---------------------------------

                cursor.execute(
                    """
                    SELECT
                        name,

                        ST_XMin(
                            Box3D(geometry)
                        ),

                        ST_YMin(
                            Box3D(geometry)
                        ),

                        ST_XMax(
                            Box3D(geometry)
                        ),

                        ST_YMax(
                            Box3D(geometry)
                        )

                    FROM imported_features

                    WHERE id = %s;
                    """,
                    (
                        request.feature_id,
                    ),
                )


                feature = (
                    cursor.fetchone()
                )


                if feature is None:

                    raise HTTPException(
                        status_code=404,
                        detail=(
                            "Imported GIS feature "
                            "not found"
                        ),
                    )


                feature_name = (
                    feature[0]
                )

                min_lon = float(
                    feature[1]
                )

                min_lat = float(
                    feature[2]
                )

                max_lon = float(
                    feature[3]
                )

                max_lat = float(
                    feature[4]
                )


                # ---------------------------------
                # PREVENT DUPLICATE BUILDING
                # ---------------------------------

                cursor.execute(
                    """
                    SELECT COUNT(*)

                    FROM properties

                    WHERE
                        parent_ulpin = %s

                        AND building = %s;
                    """,
                    (
                        request.parent_ulpin,
                        building_code,
                    ),
                )


                existing_count = (
                    cursor.fetchone()[0]
                )


                if (
                    existing_count > 0
                ):

                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Building {building_code} "
                            "already has properties. "
                            "Use another building code."
                        ),
                    )


                # ---------------------------------
                # GRID LAYOUT
                # ---------------------------------

                columns = math.ceil(
                    math.sqrt(
                        request.units_per_floor
                    )
                )


                rows = math.ceil(
                    request.units_per_floor
                    /
                    columns
                )


                cell_width = (
                    max_lon
                    -
                    min_lon
                ) / columns


                cell_height = (
                    max_lat
                    -
                    min_lat
                ) / rows


                created = []


                # =================================
                # GENERATE FLOORS
                # =================================

                for floor_number in range(
                    1,
                    request.floors + 1,
                ):

                    floor_code = (
                        str(
                            floor_number
                        )
                        .zfill(2)
                    )


                    z_min = (
                        floor_number - 1
                    ) * request.floor_height


                    z_max = (
                        floor_number
                        *
                        request.floor_height
                    )


                    # =============================
                    # GENERATE UNITS
                    # =============================

                    for unit_index in range(
                        1,
                        request.units_per_floor + 1,
                    ):

                        grid_index = (
                            unit_index - 1
                        )


                        row_index = (
                            grid_index
                            //
                            columns
                        )


                        column_index = (
                            grid_index
                            %
                            columns
                        )


                        unit_min_lon = (
                            min_lon
                            +
                            column_index
                            *
                            cell_width
                        )


                        unit_max_lon = (
                            unit_min_lon
                            +
                            cell_width
                        )


                        unit_min_lat = (
                            min_lat
                            +
                            row_index
                            *
                            cell_height
                        )


                        unit_max_lat = (
                            unit_min_lat
                            +
                            cell_height
                        )


                        # Example:
                        #
                        # floor 1, unit 1 → 101
                        # floor 4, unit 3 → 403
                        # floor 10, unit 1 → 1001

                        unit_code = (
                            f"{floor_number}"
                            f"{unit_index:02d}"
                        )


                        cursor.execute(
                            """
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

                            VALUES (
                                'Apartment',
                                %s,
                                %s,
                                %s,
                                %s,
                                %s,
                                %s,
                                'Not checked',

                                ST_MakeEnvelope(
                                    %s,
                                    %s,
                                    %s,
                                    %s,
                                    4326
                                )
                            )

                            RETURNING
                                property_id,
                                unit;
                            """,
                            (
                                request.parent_ulpin,
                                building_code,
                                floor_code,
                                unit_code,
                                z_min,
                                z_max,
                                unit_min_lon,
                                unit_min_lat,
                                unit_max_lon,
                                unit_max_lat,
                            ),
                        )


                        inserted = (
                            cursor.fetchone()
                        )


                        created.append(
                            {
                                "property_id":
                                    inserted[0],

                                "unit":
                                    inserted[1],

                                "floor":
                                    floor_code,

                                "z_min":
                                    z_min,

                                "z_max":
                                    z_max,
                            }
                        )


        return {
            "success": True,

            "source_feature_id":
                request.feature_id,

            "source_feature_name":
                feature_name,

            "building":
                building_code,

            "floors":
                request.floors,

            "units_per_floor":
                request.units_per_floor,

            "floor_height":
                request.floor_height,

            "generated_property_count":
                len(created),

            "properties":
                created,
        }


    except HTTPException:

        raise


    except psycopg.errors.UniqueViolation:

        raise HTTPException(
            status_code=409,
            detail=(
                "One or more generated "
                "spatial IDs already exist"
            ),
        )


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )

# =========================================================
# BUILDING ↔ PARENT PLOT CADASTRAL VALIDATION
# =========================================================

@app.get("/validate/cadastral")
def validate_cadastral_boundaries():

    """
    Validate that each imported building footprint is fully
    contained inside the land parcel declared by parent_ulpin.

    This endpoint reads the PostGIS view:
        building_plot_validation
    """

    try:

        with get_connection() as connection:

            with connection.cursor() as cursor:

                cursor.execute(
                    """
                    SELECT
                        building_feature_id,
                        building_name,
                        building_code,
                        parent_ulpin,
                        plot_name,
                        is_inside_parent_plot,
                        outside_area_m2,
                        building_area_m2,
                        validation_status

                    FROM building_plot_validation

                    ORDER BY building_code;
                    """
                )

                rows = cursor.fetchall()


        buildings = []

        violations = []


        for row in rows:

            building = {
                "feature_id":
                    row[0],

                "building_name":
                    row[1],

                "building_code":
                    row[2],

                "parent_ulpin":
                    row[3],

                "plot_name":
                    row[4],

                "is_inside_parent_plot":
                    row[5],

                "outside_area_m2": (
                    float(row[6])
                    if row[6] is not None
                    else None
                ),

                "building_area_m2": (
                    float(row[7])
                    if row[7] is not None
                    else None
                ),

                "status":
                    row[8],
            }


            buildings.append(
                building
            )


            if (
                row[8]
                != "VALID"
            ):

                violations.append(
                    building
                )


        return {
            "valid":
                len(violations) == 0,

            "engine":
                "PostGIS",

            "rule": (
                "Building footprint must be "
                "completely covered by its "
                "declared parent land parcel"
            ),

            "building_count":
                len(buildings),

            "violation_count":
                len(violations),

            "buildings":
                buildings,

            "violations":
                violations,
        }


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Cadastral validation error: "
                f"{error}"
            ),
        )


# =========================================================
# BATCH VERTICAL PARCEL GENERATION MODEL
# =========================================================

class BatchGenerationRequest(BaseModel):

    default_floors: int = Field(
        default=4,
        ge=1,
        le=100,
    )

    default_units_per_floor: int = Field(
        default=4,
        ge=1,
        le=20,
    )

    default_floor_height: float = Field(
        default=3.2,
        gt=0,
        le=20,
    )

    skip_existing: bool = True

    require_inside_parent_plot: bool = True


# =========================================================
# BATCH GENERATION HELPERS
# =========================================================

def safe_positive_int(
    value,
    fallback,
    minimum=1,
    maximum=100,
):

    try:

        result = int(
            value
        )

    except (
        TypeError,
        ValueError,
    ):

        return fallback


    if (
        result < minimum
        or
        result > maximum
    ):

        return fallback


    return result


def safe_positive_float(
    value,
    fallback,
    minimum=0.000001,
    maximum=1000000,
):

    try:

        result = float(
            value
        )

    except (
        TypeError,
        ValueError,
    ):

        return fallback


    if (
        result < minimum
        or
        result > maximum
    ):

        return fallback


    return result


# =========================================================
# AUTOMATIC MULTI-BUILDING GENERATION
# =========================================================

@app.post("/generate/batch-buildings")
def generate_batch_buildings(
    request: BatchGenerationRequest
):

    """
    Process all imported polygon building footprints.

    Pipeline:

        Imported GIS footprints
                ↓
        Resolve / verify parent parcel
                ↓
        Read building metadata
                ↓
        Create regular unit grid
                ↓
        Clip grid cells to real building footprint
                ↓
        Generate floors + apartment volumes
                ↓
        PostgreSQL trigger creates linked spatial IDs
                ↓
        Store everything in PostGIS

    Important:
    This is an SIH prototype subdivision method.
    Real floor-plan, LiDAR or AI-derived boundaries can later
    replace the regular grid subdivision.
    """

    try:

        with get_connection() as connection:

            with connection.cursor() as cursor:

                # -------------------------------------------------
                # LOAD ALL IMPORTED POLYGON FEATURES
                # -------------------------------------------------

                cursor.execute(
                    """
                    SELECT
                        id,
                        name,
                        feature_type,
                        properties,

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
                        geometry IS NOT NULL

                        AND GeometryType(
                            geometry
                        ) IN (
                            'POLYGON',
                            'MULTIPOLYGON'
                        )

                    ORDER BY id;
                    """
                )

                features = cursor.fetchall()


                if (
                    len(features) == 0
                ):

                    raise HTTPException(
                        status_code=400,
                        detail=(
                            "No imported polygon GIS "
                            "features are available"
                        ),
                    )


                generated_buildings = []

                skipped_buildings = []

                generated_property_count = 0


                # =================================================
                # PROCESS EVERY IMPORTED FEATURE
                # =================================================

                for feature in features:

                    feature_id = (
                        feature[0]
                    )

                    feature_name = (
                        feature[1]
                        or
                        f"Feature {feature_id}"
                    )

                    feature_type = (
                        feature[2]
                        or
                        "GIS Feature"
                    )

                    properties = (
                        feature[3]
                        or
                        {}
                    )

                    min_lon = float(
                        feature[4]
                    )

                    min_lat = float(
                        feature[5]
                    )

                    max_lon = float(
                        feature[6]
                    )

                    max_lat = float(
                        feature[7]
                    )


                    # ---------------------------------------------
                    # BUILDING CODE
                    # ---------------------------------------------

                    building_code = str(
                        properties.get(
                            "building_code"
                        )
                        or
                        f"B{feature_id:02d}"
                    ).strip().upper()


                    if (
                        not building_code
                    ):

                        building_code = (
                            f"B{feature_id:02d}"
                        )


                    # ---------------------------------------------
                    # RESOLVE PARENT PLOT
                    #
                    # 1. Prefer parent_ulpin metadata
                    # 2. Otherwise find the parcel that completely
                    #    covers the building footprint
                    # ---------------------------------------------

                    declared_parent = (
                        properties.get(
                            "parent_ulpin"
                        )
                    )


                    parent_ulpin = None

                    plot_name = None

                    inside_parent = False


                    if (
                        declared_parent
                    ):

                        declared_parent = str(
                            declared_parent
                        ).strip()


                        cursor.execute(
                            """
                            SELECT
                                parcel.ulpin,
                                parcel.name,

                                ST_CoveredBy(
                                    feature.geometry,
                                    parcel.geometry
                                )

                            FROM imported_features
                                AS feature

                            JOIN parcels
                                AS parcel
                                ON parcel.ulpin = %s::text

                            WHERE
                                feature.id = %s::integer;
                            """,
                            (
                                declared_parent,
                                feature_id,
                            ),
                        )


                        parent_match = (
                            cursor.fetchone()
                        )


                        if (
                            parent_match
                            is None
                        ):

                            skipped_buildings.append(
                                {
                                    "feature_id":
                                        feature_id,

                                    "feature_name":
                                        feature_name,

                                    "building":
                                        building_code,

                                    "reason": (
                                        "Declared parent ULPIN "
                                        f"{declared_parent} "
                                        "does not exist"
                                    ),
                                }
                            )

                            continue


                        parent_ulpin = (
                            parent_match[0]
                        )

                        plot_name = (
                            parent_match[1]
                        )

                        inside_parent = bool(
                            parent_match[2]
                        )


                    else:

                        # -----------------------------------------
                        # AUTOMATIC SPATIAL PARENT ASSIGNMENT
                        # -----------------------------------------

                        cursor.execute(
                            """
                            SELECT
                                parcel.ulpin,
                                parcel.name

                            FROM parcels
                                AS parcel

                            JOIN imported_features
                                AS feature
                                ON feature.id = %s::integer

                            WHERE
                                ST_CoveredBy(
                                    feature.geometry,
                                    parcel.geometry
                                )

                            ORDER BY
                                ST_Area(
                                    parcel.geometry::geography
                                ) ASC

                            LIMIT 1;
                            """,
                            (
                                feature_id,
                            ),
                        )


                        parent_match = (
                            cursor.fetchone()
                        )


                        if (
                            parent_match
                            is None
                        ):

                            skipped_buildings.append(
                                {
                                    "feature_id":
                                        feature_id,

                                    "feature_name":
                                        feature_name,

                                    "building":
                                        building_code,

                                    "reason": (
                                        "No containing parent "
                                        "land parcel was found"
                                    ),
                                }
                            )

                            continue


                        parent_ulpin = (
                            parent_match[0]
                        )

                        plot_name = (
                            parent_match[1]
                        )

                        inside_parent = True


                    # ---------------------------------------------
                    # OPTIONAL CADASTRAL SAFETY RULE
                    # ---------------------------------------------

                    if (
                        request
                        .require_inside_parent_plot
                        and
                        not inside_parent
                    ):

                        cursor.execute(
                            """
                            SELECT
                                ST_Area(
                                    ST_Difference(
                                        feature.geometry,
                                        parcel.geometry
                                    )::geography
                                )

                            FROM imported_features
                                AS feature

                            JOIN parcels
                                AS parcel
                                ON parcel.ulpin = %s::text

                            WHERE
                                feature.id = %s::integer;
                            """,
                            (
                                parent_ulpin,
                                feature_id,
                            ),
                        )


                        outside_row = (
                            cursor.fetchone()
                        )


                        outside_area = (
                            float(
                                outside_row[0]
                            )
                            if (
                                outside_row
                                and
                                outside_row[0]
                                is not None
                            )
                            else None
                        )


                        skipped_buildings.append(
                            {
                                "feature_id":
                                    feature_id,

                                "feature_name":
                                    feature_name,

                                "building":
                                    building_code,

                                "parent_ulpin":
                                    parent_ulpin,

                                "plot_name":
                                    plot_name,

                                "outside_area_m2": (
                                    round(
                                        outside_area,
                                        2,
                                    )
                                    if outside_area
                                    is not None
                                    else None
                                ),

                                "reason": (
                                    "Building footprint "
                                    "extends outside its "
                                    "parent plot"
                                ),
                            }
                        )

                        continue


                    # ---------------------------------------------
                    # READ GENERATION METADATA
                    # ---------------------------------------------

                    floors = safe_positive_int(
                        properties.get(
                            "floors"
                        ),
                        request.default_floors,
                        minimum=1,
                        maximum=100,
                    )


                    units_per_floor = (
                        safe_positive_int(
                            properties.get(
                                "units_per_floor"
                            ),
                            request
                            .default_units_per_floor,
                            minimum=1,
                            maximum=20,
                        )
                    )


                    floor_height = (
                        request
                        .default_floor_height
                    )


                    metadata_floor_height = (
                        properties.get(
                            "floor_height"
                        )
                    )


                    if (
                        metadata_floor_height
                        is not None
                    ):

                        floor_height = (
                            safe_positive_float(
                                metadata_floor_height,
                                request
                                .default_floor_height,
                                minimum=0.1,
                                maximum=20,
                            )
                        )


                    elif (
                        properties.get(
                            "height_m"
                        )
                        is not None
                    ):

                        total_height = (
                            safe_positive_float(
                                properties.get(
                                    "height_m"
                                ),
                                floors
                                *
                                request
                                .default_floor_height,
                                minimum=0.1,
                                maximum=2000,
                            )
                        )

                        floor_height = (
                            total_height
                            /
                            floors
                        )


                    # ---------------------------------------------
                    # PREVENT DUPLICATE BUILDINGS
                    # ---------------------------------------------

                    cursor.execute(
                        """
                        SELECT
                            COUNT(*)

                        FROM properties

                        WHERE
                            parent_ulpin = %s::text

                            AND building = %s::text;
                        """,
                        (
                            parent_ulpin,
                            building_code,
                        ),
                    )


                    existing_count = (
                        cursor.fetchone()[0]
                    )


                    if (
                        existing_count > 0
                    ):

                        if (
                            request.skip_existing
                        ):

                            skipped_buildings.append(
                                {
                                    "feature_id":
                                        feature_id,

                                    "feature_name":
                                        feature_name,

                                    "building":
                                        building_code,

                                    "parent_ulpin":
                                        parent_ulpin,

                                    "plot_name":
                                        plot_name,

                                    "existing_property_count":
                                        existing_count,

                                    "reason": (
                                        "Building already "
                                        "has generated properties"
                                    ),
                                }
                            )

                            continue


                        raise HTTPException(
                            status_code=409,
                            detail=(
                                f"Building {building_code} "
                                f"on {parent_ulpin} already "
                                "has generated properties"
                            ),
                        )


                    # ---------------------------------------------
                    # SAVE / NORMALIZE BUILDING METADATA
                    # ---------------------------------------------

                    cursor.execute(
                        """
                        UPDATE imported_features

                        SET properties =
                            COALESCE(
                                properties,
                                '{}'::jsonb
                            )
                            ||
                            %s::jsonb

                        WHERE id = %s::integer;
                        """,
                        (
                            json.dumps(
                                {
                                    "building_code": building_code,
                                    "parent_ulpin": parent_ulpin,
                                    "floors": floors,
                                    "units_per_floor": units_per_floor,
                                    "floor_height": floor_height,
                                    "height_m": floors * floor_height,
                                }
                            ),
                            feature_id,
                        ),
                    )


                    # ---------------------------------------------
                    # GRID LAYOUT
                    # ---------------------------------------------

                    columns = math.ceil(
                        math.sqrt(
                            units_per_floor
                        )
                    )


                    rows = math.ceil(
                        units_per_floor
                        /
                        columns
                    )


                    cell_width = (
                        max_lon
                        -
                        min_lon
                    ) / columns


                    cell_height = (
                        max_lat
                        -
                        min_lat
                    ) / rows


                    building_created = []


                    # =============================================
                    # GENERATE FLOORS + UNITS
                    # =============================================

                    for floor_number in range(
                        1,
                        floors + 1,
                    ):

                        floor_code = (
                            str(
                                floor_number
                            )
                            .zfill(2)
                        )


                        z_min = (
                            floor_number - 1
                        ) * floor_height


                        z_max = (
                            floor_number
                            *
                            floor_height
                        )


                        for unit_index in range(
                            1,
                            units_per_floor + 1,
                        ):

                            grid_index = (
                                unit_index - 1
                            )


                            row_index = (
                                grid_index
                                //
                                columns
                            )


                            column_index = (
                                grid_index
                                %
                                columns
                            )


                            unit_min_lon = (
                                min_lon
                                +
                                column_index
                                *
                                cell_width
                            )


                            unit_max_lon = (
                                unit_min_lon
                                +
                                cell_width
                            )


                            unit_min_lat = (
                                min_lat
                                +
                                row_index
                                *
                                cell_height
                            )


                            unit_max_lat = (
                                unit_min_lat
                                +
                                cell_height
                            )


                            unit_code = (
                                f"{floor_number}"
                                f"{unit_index:02d}"
                            )


                            # -------------------------------------
                            # CLIP EACH GRID CELL TO THE TRUE
                            # BUILDING FOOTPRINT.
                            #
                            # ST_Dump converts possible MultiPolygon
                            # results into Polygon parts. The largest
                            # polygon is used for this prototype.
                            # -------------------------------------

                            cursor.execute(
                                """
                                WITH source_geometry AS (

                                    SELECT
                                        ST_MakeValid(
                                            geometry
                                        ) AS geometry

                                    FROM imported_features

                                    WHERE id = %s::integer
                                ),

                                clipped_parts AS (

                                    SELECT
                                        (
                                            ST_Dump(
                                                ST_CollectionExtract(
                                                    ST_Intersection(
                                                        source_geometry.geometry,

                                                        ST_MakeEnvelope(
                                                            %s::double precision,
                                                            %s::double precision,
                                                            %s::double precision,
                                                            %s::double precision,
                                                            4326
                                                        )
                                                    ),
                                                    3
                                                )
                                            )
                                        ).geom
                                            AS geometry

                                    FROM source_geometry
                                ),

                                chosen_polygon AS (

                                    SELECT
                                        geometry

                                    FROM clipped_parts

                                    WHERE
                                        geometry IS NOT NULL

                                        AND NOT ST_IsEmpty(
                                            geometry
                                        )

                                    ORDER BY
                                        ST_Area(
                                            geometry::geography
                                        ) DESC

                                    LIMIT 1
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
                                    %s::text,
                                    %s::text,
                                    %s::text,
                                    %s::text,
                                    %s::double precision,
                                    %s::double precision,
                                    'Not checked',
                                    geometry

                                FROM chosen_polygon

                                RETURNING
                                    property_id,
                                    unit;
                                """,
                                (
                                    feature_id,

                                    unit_min_lon,
                                    unit_min_lat,
                                    unit_max_lon,
                                    unit_max_lat,

                                    parent_ulpin,
                                    building_code,
                                    floor_code,
                                    unit_code,
                                    z_min,
                                    z_max,
                                ),
                            )


                            inserted = (
                                cursor.fetchone()
                            )


                            # A cell may fall entirely outside
                            # an irregular building polygon.

                            if (
                                inserted
                                is None
                            ):

                                continue


                            generated_property_count += 1


                            building_created.append(
                                {
                                    "property_id":
                                        inserted[0],

                                    "unit":
                                        inserted[1],

                                    "floor":
                                        floor_code,

                                    "z_min":
                                        round(
                                            z_min,
                                            3,
                                        ),

                                    "z_max":
                                        round(
                                            z_max,
                                            3,
                                        ),
                                }
                            )


                    generated_buildings.append(
                        {
                            "feature_id":
                                feature_id,

                            "feature_name":
                                feature_name,

                            "feature_type":
                                feature_type,

                            "building":
                                building_code,

                            "parent_ulpin":
                                parent_ulpin,

                            "plot_name":
                                plot_name,

                            "parent_assignment": (
                                "metadata"
                                if declared_parent
                                else
                                "automatic spatial match"
                            ),

                            "floors":
                                floors,

                            "units_per_floor":
                                units_per_floor,

                            "floor_height":
                                round(
                                    floor_height,
                                    3,
                                ),

                            "generated_property_count":
                                len(
                                    building_created
                                ),

                            "properties":
                                building_created,
                        }
                    )


        return {
            "success":
                True,

            "engine":
                "PostgreSQL + PostGIS",

            "method": (
                "Batch building processing with "
                "spatial parent assignment, "
                "grid subdivision and footprint clipping"
            ),

            "source_feature_count":
                len(features),

            "generated_building_count":
                len(
                    generated_buildings
                ),

            "generated_property_count":
                generated_property_count,

            "skipped_building_count":
                len(
                    skipped_buildings
                ),

            "buildings":
                generated_buildings,

            "skipped":
                skipped_buildings,
        }


    except HTTPException:

        raise


    except psycopg.errors.UniqueViolation:

        raise HTTPException(
            status_code=409,
            detail=(
                "One or more generated "
                "spatial IDs already exist"
            ),
        )


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=(
                "Batch generation error: "
                f"{error}"
            ),
        )
