import os
import json

import psycopg

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware


# ==========================================
# ENVIRONMENT VARIABLES
# ==========================================

load_dotenv()


DB_CONFIG = {
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "dbname": os.getenv("DB_NAME"),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
}


# ==========================================
# FASTAPI APPLICATION
# ==========================================

app = FastAPI(
    title="Bhumi3D API",
    description=(
        "Backend API for Bhumi3D - "
        "3D ULPIN and Vertical Property Mapping System"
    ),
    version="0.4.0",
)


# ==========================================
# CORS
# ==========================================

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


# ==========================================
# DATABASE CONNECTION
# ==========================================

def get_connection():

    return psycopg.connect(
        **DB_CONFIG
    )


# ==========================================
# HOME
# ==========================================
# ==========================================
# PROPERTY CREATE MODEL
# ==========================================

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

@app.get("/")
def home():

    return {
        "message": "Bhumi3D API is running",
        "status": "success",
        "database": "PostgreSQL + PostGIS",
        "version": "0.4.0",
    }


# ==========================================
# DATABASE HEALTH
# ==========================================

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


# ==========================================
# GET ALL PROPERTIES
# ==========================================

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


    properties = []


    for row in rows:

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
            }
        )


    return properties


# ==========================================
# GET ONE PROPERTY
# ==========================================

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
                (unit,),
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


# ==========================================
# SEARCH PROPERTIES
# ==========================================

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

                ORDER BY id;
                """,
                (
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


# ==========================================
# COMPLETE POSTGIS SCENE
# ==========================================

@app.get("/scene")
def get_scene():

    with get_connection() as connection:

        with connection.cursor() as cursor:

            # --------------------------------
            # PARCELS
            # --------------------------------

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


            # --------------------------------
            # PROPERTIES
            # --------------------------------

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

            property_rows = cursor.fetchall()


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


# ==========================================
# POSTGIS 3D TOPOLOGY VALIDATION
# ==========================================

@app.get("/validate/topology")
def validate_topology():

    """
    Detect spatial conflicts using:

    1. 2D footprint intersection in PostGIS
    2. Vertical Z-range intersection
    3. Real overlap area in square metres
    4. 3D overlap volume in cubic metres
    """

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
            overlap_area *
            overlap_height
        )


        # ----------------------------------
        # CLASSIFY CONFLICT
        # ----------------------------------

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

                "overlap_area_m2": round(
                    overlap_area,
                    2,
                ),

                "overlap_height_m": round(
                    overlap_height,
                    2,
                ),

                "overlap_volume_m3": round(
                    overlap_volume,
                    2,
                ),
            }
        )


    return {
        "valid": len(conflicts) == 0,

        "engine": "PostGIS",

        "method": (
            "2D footprint intersection "
            "+ vertical Z-range intersection"
        ),

        "conflict_count": len(
            conflicts
        ),

        "conflicts": conflicts,
    }
    # ==========================================
# CREATE NEW 3D PROPERTY
# ==========================================

@app.post("/properties")
def create_property(property: PropertyCreate):

    allowed_types = {
        "Apartment",
        "Basement Parking",
        "Underground Utility",
    }


    # --------------------------------------
    # VALIDATE PROPERTY TYPE
    # --------------------------------------

    if property.property_type not in allowed_types:

        raise HTTPException(
            status_code=400,
            detail="Invalid property type",
        )


    # --------------------------------------
    # VALIDATE HEIGHT
    # --------------------------------------

    if property.z_max <= property.z_min:

        raise HTTPException(
            status_code=400,
            detail="z_max must be greater than z_min",
        )


    # --------------------------------------
    # VALIDATE FOOTPRINT
    # --------------------------------------

    if property.max_lon <= property.min_lon:

        raise HTTPException(
            status_code=400,
            detail="max_lon must be greater than min_lon",
        )


    if property.max_lat <= property.min_lat:

        raise HTTPException(
            status_code=400,
            detail="max_lat must be greater than min_lat",
        )


    try:

        with get_connection() as connection:

            with connection.cursor() as cursor:

                # ----------------------------------
                # CHECK PARENT ULPIN
                # ----------------------------------

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


                parcel = cursor.fetchone()


                if parcel is None:

                    raise HTTPException(
                        status_code=404,
                        detail="Parent ULPIN does not exist",
                    )


                # ----------------------------------
                # INSERT PROPERTY
                #
                # property_id IS NOT PROVIDED.
                #
                # PostgreSQL trigger automatically
                # generates it.
                # ----------------------------------

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

            "message": "3D property created successfully",

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
                "A property with this generated "
                "spatial ID already exists"
            ),
        )


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error),
        )