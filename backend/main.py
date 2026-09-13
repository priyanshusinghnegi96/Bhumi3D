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
    version="0.6.0",
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


# =========================================================
# HOME
# =========================================================

@app.get("/")
def home():

    return {
        "message": "Bhumi3D API is running",
        "status": "success",
        "database": "PostgreSQL + PostGIS",
        "version": "0.6.0",
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
                "feature_id": row[0],
                "building_name": row[1],
                "building_code": row[2],
                "parent_ulpin": row[3],
                "plot_name": row[4],
                "is_inside_parent_plot": row[5],

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

                "status": row[8],
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
            "valid": (
                len(violations) == 0
            ),

            "engine": "PostGIS",

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