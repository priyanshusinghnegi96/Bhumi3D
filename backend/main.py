import os
import json
import math
import re

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
    version="1.3.7B.1",
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


def ensure_township_address_table(cursor):
    """Persistent lightweight address index for Township V3.

    One row represents one cadastral parcel. Occupied parcels are enriched
    with building metadata; apartment units are derived virtually at search
    time so Cesium does not need thousands of permanent unit entities.
    """

    cursor.execute(
        """
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
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS township_addresses_block_number_idx
        ON township_addresses (block_code, address_number);
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS township_addresses_building_code_idx
        ON township_addresses (building_code);
        """
    )

    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS township_addresses_address_code_uidx
        ON township_addresses (address_code);
        """
    )

    cursor.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS township_addresses_grid_cell_uidx
        ON township_addresses (row_index, column_index);
        """
    )


def ensure_township_units_table(cursor):
    """Persist every apartment as an addressable 3D cadastral unit."""

    cursor.execute(
        """
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
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS township_units_address_idx
        ON township_units (address_code, floor_number, unit_letter);
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS township_units_parent_idx
        ON township_units (parent_ulpin);
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS township_units_footprint_gix
        ON township_units USING GIST (footprint);
        """
    )
    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS township_units_3d_ulpin_upper_idx
        ON township_units (UPPER(proposed_3d_ulpin));
        """
    )


def _floor_spatial_id(parent_ulpin, address_code, floor_number):
    compact_address = address_code.replace("-", "")
    return f"{parent_ulpin}-{compact_address}-F{int(floor_number):02d}"


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
        "version": "1.3.7B",
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
# UNIFIED CADASTRAL / TOWNSHIP SEARCH
# =========================================================

def _address_row_to_result(row, result_type="building"):
    (
        parent_ulpin,
        plot_name,
        block_code,
        address_number,
        address_code,
        land_use,
        building_feature_id,
        building_code,
        building_name,
        building_type,
        floors,
        units_per_floor,
        floor_height,
        height_m,
    ) = row

    return {
        "result_type": result_type,
        "target_type": result_type,
        "target_id": (
            f"{result_type}:{address_code}"
            if result_type != "plot"
            else f"plot:{parent_ulpin}"
        ),
        "title": address_code if result_type == "building" else plot_name,
        "subtitle": (
            f"Block {block_code} · {building_type or land_use.replace('_', ' ').title()}"
        ),
        "block_code": block_code,
        "address_number": address_number,
        "address_code": address_code,
        "parent_ulpin": parent_ulpin,
        "plot_name": plot_name,
        "land_use": land_use,
        "feature_id": building_feature_id,
        "building_code": building_code,
        "building": building_code,
        "building_name": building_name,
        "building_type": building_type,
        "floors": int(floors or 0),
        "units_per_floor": int(units_per_floor or 0),
        "floor_height": float(floor_height or 0),
        "height_m": float(height_m or 0),
        "legacy_code": building_code,
        "floor": None,
        "unit": None,
        "display_unit": None,
        "property_id": None,
        "spatial_id": None,
        "validation": "Township address index",
    }


def _unit_letter_index(letter):
    if not letter:
        return 0
    value = ord(letter.upper()) - ord("A") + 1
    return value if value > 0 else 0


def _unit_spatial_id(parent_ulpin, address_code, floor_number, unit_letter):
    compact_address = address_code.replace("-", "")
    return (
        f"{parent_ulpin}-{compact_address}-"
        f"F{int(floor_number):02d}-U{unit_letter.upper()}"
    )


@app.get("/search")
def search_properties(q: str, limit: int = 16):
    query = (q or "").strip()
    if not query:
        return {
            "found": False,
            "count": 0,
            "results": [],
            "message": "Type a block address, building number, ULPIN, building name, floor or apartment.",
        }

    limit = max(1, min(int(limit or 16), 50))
    normalized = re.sub(r"\s+", " ", query.upper()).strip()
    compact = re.sub(r"[^A-Z0-9]", "", normalized)

    address_columns = """
        parent_ulpin,
        plot_name,
        block_code,
        address_number,
        address_code,
        land_use,
        building_feature_id,
        building_code,
        building_name,
        building_type,
        floors,
        units_per_floor,
        floor_height,
        height_m
    """

    results = []
    message = ""

    with get_connection() as connection:
        with connection.cursor() as cursor:
            ensure_township_address_table(cursor)
            ensure_township_units_table(cursor)

            # -------------------------------------------------
            # BLOCK SEARCH: "Block A" / "A block"
            # -------------------------------------------------
            block_match = re.fullmatch(r"(?:BLOCK\s*)?([ABCD])(?:\s*BLOCK)?", normalized)
            if block_match and ("BLOCK" in normalized or len(normalized) == 1):
                block_code = block_match.group(1)
                cursor.execute(
                    """
                    SELECT
                        COUNT(*),
                        COUNT(*) FILTER (WHERE building_code IS NOT NULL),
                        COALESCE(SUM(floors), 0),
                        COALESCE(SUM(
                            CASE WHEN building_type ILIKE '%%Apartment%%'
                            THEN floors * units_per_floor ELSE 0 END
                        ), 0)
                    FROM township_addresses
                    WHERE block_code = %s;
                    """,
                    (block_code,),
                )
                stats = cursor.fetchone()
                if stats and stats[0] > 0:
                    results.append({
                        "result_type": "block",
                        "target_type": "block",
                        "target_id": f"block:{block_code}",
                        "title": f"Block {block_code}",
                        "subtitle": f"{stats[0]} plots · {stats[1]} buildings · {stats[2]} floors",
                        "block_code": block_code,
                        "plot_count": stats[0],
                        "building_count": stats[1],
                        "floor_count": stats[2],
                        "apartment_capacity": stats[3],
                        "parent_ulpin": None,
                        "building_code": None,
                        "building": "—",
                        "floor": None,
                        "unit": None,
                        "property_id": None,
                    })
                    return {
                        "found": True,
                        "count": 1,
                        "results": results,
                        "message": f"Block {block_code} overview.",
                    }

            # -------------------------------------------------
            # BUILDING + UNIT: A-12 17-C / A12/17C
            # Resolve from the persisted PostGIS registry so every search
            # and mouse path exposes the exact same apartment 3D ULPIN.
            # -------------------------------------------------
            unit_match = re.fullmatch(
                r"([ABCD])\s*-?\s*(\d{1,3})\s*(?:/|\s)+\s*(\d{1,2})\s*-?\s*([A-Z])",
                normalized,
            )
            if unit_match:
                block_code, number_text, floor_text, unit_letter = unit_match.groups()
                address_code = f"{block_code}-{int(number_text)}"
                floor_number = int(floor_text)
                cursor.execute(
                    """
                    SELECT
                        a.parent_ulpin, a.plot_name, a.block_code, a.address_number,
                        a.address_code, a.land_use, a.building_feature_id, a.building_code,
                        a.building_name, a.building_type, a.floors, a.units_per_floor,
                        a.floor_height, a.height_m,
                        u.floor_number, u.floor_id, u.unit_letter, u.display_unit,
                        u.proposed_3d_ulpin, u.z_min, u.z_max, u.validation
                    FROM township_units AS u
                    JOIN township_addresses AS a ON a.address_code = u.address_code
                    WHERE UPPER(u.address_code) = %s
                      AND u.floor_number = %s
                      AND UPPER(u.unit_letter) = %s
                    LIMIT 1;
                    """,
                    (address_code.upper(), floor_number, unit_letter.upper()),
                )
                unit_row = cursor.fetchone()
                if unit_row:
                    base = _address_row_to_result(unit_row[:14])
                    base.update({
                        "result_type": "unit",
                        "target_type": "unit",
                        "target_id": f"unit:{base['address_code']}:{unit_row[14]}:{unit_row[16]}",
                        "title": f"{base['address_code']} · {unit_row[17]}",
                        "subtitle": f"Registered 3D unit · Floor {unit_row[14]} · Apartment {unit_row[16]}",
                        "floor": str(unit_row[14]),
                        "floor_id": unit_row[15],
                        "unit": unit_row[16],
                        "display_unit": unit_row[17],
                        "property_id": unit_row[18],
                        "spatial_id": unit_row[18],
                        "z_min": unit_row[19],
                        "z_max": unit_row[20],
                        "validation": unit_row[21],
                        "registry_status": "Persisted in PostGIS",
                    })
                    return {
                        "found": True,
                        "count": 1,
                        "results": [base],
                        "message": f"Apartment {unit_row[17]} in {base['address_code']}.",
                    }

            # -------------------------------------------------
            # BUILDING + FLOOR: A-12 F17 / A-12 FLOOR 17
            # -------------------------------------------------
            floor_match = re.fullmatch(
                r"([ABCD])\s*-?\s*(\d{1,3})\s*(?:/|\s)+(?:F|FLOOR\s*)?(\d{1,2})",
                normalized,
            )
            if floor_match:
                block_code, number_text, floor_text = floor_match.groups()
                address_number = int(number_text)
                floor_number = int(floor_text)
                cursor.execute(
                    f"""
                    SELECT {address_columns}
                    FROM township_addresses
                    WHERE block_code = %s
                      AND address_number = %s
                      AND building_code IS NOT NULL
                    LIMIT 1;
                    """,
                    (block_code, address_number),
                )
                row = cursor.fetchone()
                if row:
                    base = _address_row_to_result(row)
                    if 1 <= floor_number <= base["floors"]:
                        base.update({
                            "result_type": "floor",
                            "target_type": "floor",
                            "target_id": f"floor:{base['address_code']}:{floor_number}",
                            "title": f"{base['address_code']} · Floor {floor_number}",
                            "subtitle": f"{base['units_per_floor']} apartments · Block {block_code}",
                            "floor": str(floor_number),
                            "z_min": round((floor_number - 1) * base["floor_height"], 2),
                            "z_max": round(floor_number * base["floor_height"], 2),
                        })
                        return {
                            "found": True,
                            "count": 1,
                            "results": [base],
                            "message": f"Floor {floor_number} in {base['address_code']}.",
                        }

            # -------------------------------------------------
            # UNIT ONLY: 17-C (ambiguous across towers)
            # -------------------------------------------------
            unit_only_match = re.fullmatch(r"(\d{1,2})\s*-\s*([A-Z])", normalized)
            if unit_only_match:
                floor_number = int(unit_only_match.group(1))
                unit_letter = unit_only_match.group(2)
                unit_index = _unit_letter_index(unit_letter)
                cursor.execute(
                    f"""
                    SELECT {address_columns}
                    FROM township_addresses
                    WHERE building_type ILIKE '%%Apartment%%'
                      AND floors >= %s
                      AND units_per_floor >= %s
                    ORDER BY block_code, address_number
                    LIMIT %s;
                    """,
                    (floor_number, unit_index, limit),
                )
                rows = cursor.fetchall()
                for row in rows:
                    base = _address_row_to_result(row)
                    display_unit = f"{floor_number}-{unit_letter}"
                    spatial_id = _unit_spatial_id(
                        base["parent_ulpin"], base["address_code"], floor_number, unit_letter
                    )
                    base.update({
                        "result_type": "unit",
                        "target_type": "unit",
                        "target_id": f"unit:{base['address_code']}:{floor_number}:{unit_letter}",
                        "title": f"{base['address_code']} · {display_unit}",
                        "subtitle": f"Floor {floor_number} · Apartment {unit_letter}",
                        "floor": str(floor_number),
                        "unit": unit_letter,
                        "display_unit": display_unit,
                        "property_id": spatial_id,
                        "spatial_id": spatial_id,
                        "z_min": round((floor_number - 1) * base["floor_height"], 2),
                        "z_max": round(floor_number * base["floor_height"], 2),
                    })
                    results.append(base)
                if results:
                    cursor.execute(
                        """
                        SELECT COUNT(*)
                        FROM township_addresses
                        WHERE building_type ILIKE '%%Apartment%%'
                          AND floors >= %s
                          AND units_per_floor >= %s;
                        """,
                        (floor_number, unit_index),
                    )
                    total = cursor.fetchone()[0]
                    message = (
                        f"{floor_number}-{unit_letter} exists in {total} apartment towers. "
                        "Choose a building or search like A-12 17-C."
                    )
                    return {
                        "found": True,
                        "count": total,
                        "results": results,
                        "message": message,
                        "truncated": total > len(results),
                    }

            # -------------------------------------------------
            # NUMERIC BUILDING NUMBER: 12 -> A-12/B-12/C-12/D-12
            # -------------------------------------------------
            if re.fullmatch(r"\d{1,3}", normalized):
                address_number = int(normalized)
                cursor.execute(
                    f"""
                    SELECT {address_columns}
                    FROM township_addresses
                    WHERE address_number = %s
                      AND building_code IS NOT NULL
                    ORDER BY block_code;
                    """,
                    (address_number,),
                )
                rows = cursor.fetchall()
                results = [_address_row_to_result(row) for row in rows]
                if results:
                    return {
                        "found": True,
                        "count": len(results),
                        "results": results,
                        "message": f"Building {address_number} across the township blocks.",
                    }

                cursor.execute(
                    """
                    SELECT block_code, MAX(address_number)
                    FROM township_addresses
                    WHERE building_code IS NOT NULL
                    GROUP BY block_code
                    ORDER BY block_code;
                    """
                )
                ranges = ", ".join(
                    f"{block}-{maximum}" for block, maximum in cursor.fetchall()
                )
                message = (
                    f"Building number {address_number} is not assigned. "
                    f"Current block ranges end at {ranges}."
                )

            # -------------------------------------------------
            # EXACT BLOCK ADDRESS: A-12 / A12
            # -------------------------------------------------
            address_match = re.fullmatch(r"([ABCD])\s*-?\s*(\d{1,3})", normalized)
            if address_match:
                block_code, number_text = address_match.groups()
                address_number = int(number_text)
                cursor.execute(
                    f"""
                    SELECT {address_columns}
                    FROM township_addresses
                    WHERE block_code = %s
                      AND address_number = %s
                    LIMIT 1;
                    """,
                    (block_code, address_number),
                )
                row = cursor.fetchone()
                if row:
                    result_type = "building" if row[7] else "plot"
                    result = _address_row_to_result(row, result_type=result_type)
                    if result_type == "plot":
                        result["title"] = f"Plot {result['address_code']}"
                    return {
                        "found": True,
                        "count": 1,
                        "results": [result],
                        "message": f"{result['address_code']} located in Block {block_code}.",
                    }

            # -------------------------------------------------
            # EXACT PROPOSED 3D ULPIN (APARTMENT)
            # -------------------------------------------------
            cursor.execute(
                """
                SELECT
                    a.parent_ulpin, a.plot_name, a.block_code, a.address_number,
                    a.address_code, a.land_use, a.building_feature_id, a.building_code,
                    a.building_name, a.building_type, a.floors, a.units_per_floor,
                    a.floor_height, a.height_m,
                    u.floor_number, u.floor_id, u.unit_letter, u.display_unit,
                    u.proposed_3d_ulpin, u.z_min, u.z_max, u.validation
                FROM township_units AS u
                JOIN township_addresses AS a
                  ON a.address_code = u.address_code
                WHERE UPPER(u.proposed_3d_ulpin) = %s
                LIMIT 1;
                """,
                (normalized,),
            )
            unit_row = cursor.fetchone()
            if unit_row:
                base = _address_row_to_result(unit_row[:14])
                base.update({
                    "result_type": "unit",
                    "target_type": "unit",
                    "target_id": f"unit:{base['address_code']}:{unit_row[14]}:{unit_row[16]}",
                    "title": f"{base['address_code']} · {unit_row[17]}",
                    "subtitle": f"Registered 3D unit · Floor {unit_row[14]} · Apartment {unit_row[16]}",
                    "floor": str(unit_row[14]),
                    "floor_id": unit_row[15],
                    "unit": unit_row[16],
                    "display_unit": unit_row[17],
                    "property_id": unit_row[18],
                    "spatial_id": unit_row[18],
                    "z_min": unit_row[19],
                    "z_max": unit_row[20],
                    "validation": unit_row[21],
                })
                return {
                    "found": True,
                    "count": 1,
                    "results": [base],
                    "message": "Exact registered 3D apartment found.",
                }

            # -------------------------------------------------
            # EXACT PARENT 2D ULPIN
            # -------------------------------------------------
            cursor.execute(
                f"""
                SELECT {address_columns}
                FROM township_addresses
                WHERE UPPER(parent_ulpin) = %s
                LIMIT 1;
                """,
                (normalized,),
            )
            row = cursor.fetchone()
            if row:
                result = _address_row_to_result(row, result_type="plot")
                result["title"] = f"Plot {result['address_code']}"
                return {
                    "found": True,
                    "count": 1,
                    "results": [result],
                    "message": f"Exact cadastral parcel {normalized}.",
                }

            # -------------------------------------------------
            # GENERAL TOWNSHIP SEARCH WITH RANKING
            # -------------------------------------------------
            alias_terms = {
                "MARKET SQUARE": "shopping",
                "TOWN CENTRE": "shopping",
                "FITNESS CENTRE": "gym",
                "FITNESS CENTER": "gym",
                "ADMIN": "office",
                "ADMINISTRATION": "office",
                "CLUB": "clubhouse",
            }
            effective_query = alias_terms.get(normalized, query)
            like_value = f"%{effective_query}%"
            prefix_value = f"{effective_query}%"
            cursor.execute(
                f"""
                SELECT {address_columns}
                FROM township_addresses
                WHERE building_code IS NOT NULL
                  AND (
                    building_code ILIKE %s
                    OR building_name ILIKE %s
                    OR building_type ILIKE %s
                    OR plot_name ILIKE %s
                    OR land_use ILIKE %s
                    OR address_code ILIKE %s
                    OR parent_ulpin ILIKE %s
                  )
                ORDER BY
                    CASE
                      WHEN UPPER(building_code) = %s THEN 0
                      WHEN UPPER(address_code) = %s THEN 1
                      WHEN building_name ILIKE %s THEN 2
                      WHEN building_code ILIKE %s THEN 3
                      WHEN address_code ILIKE %s THEN 4
                      ELSE 5
                    END,
                    block_code,
                    address_number
                LIMIT %s;
                """,
                (
                    like_value, like_value, like_value, like_value,
                    like_value, like_value, like_value,
                    normalized, normalized,
                    prefix_value, prefix_value, prefix_value,
                    limit,
                ),
            )
            rows = cursor.fetchall()
            results = [_address_row_to_result(row) for row in rows]

            # -------------------------------------------------
            # LEGACY 3D PROPERTY SEARCH (kept for non-township data)
            # -------------------------------------------------
            if len(results) < limit:
                remaining = limit - len(results)
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
                    WHERE property_id ILIKE %s
                       OR unit ILIKE %s
                       OR parent_ulpin ILIKE %s
                       OR property_type ILIKE %s
                       OR building ILIKE %s
                    ORDER BY id
                    LIMIT %s;
                    """,
                    (like_value, like_value, like_value, like_value, like_value, remaining),
                )
                for row in cursor.fetchall():
                    results.append({
                        "result_type": "property",
                        "target_type": "property",
                        "target_id": f"property:{row[2]}",
                        "title": row[2],
                        "subtitle": f"{row[0]} · {row[3]} · Floor {row[4]}",
                        "type": row[0],
                        "parent_ulpin": row[1],
                        "property_id": row[2],
                        "building": row[3],
                        "building_code": row[3],
                        "floor": row[4],
                        "unit": row[5],
                        "z_min": row[6],
                        "z_max": row[7],
                        "validation": row[8],
                    })

    if results:
        if not message:
            message = f"{len(results)} matching cadastral result(s)."
        return {
            "found": True,
            "count": len(results),
            "results": results,
            "message": message,
        }

    return {
        "found": False,
        "count": 0,
        "results": [],
        "message": message or "No matching block, plot, building, floor or apartment found.",
    }


# =========================================================
# TOWNSHIP UNIT REGISTRY LOOKUP
# =========================================================

@app.get("/township/units/{address_code}/{floor_number}/{unit_letter}")
def get_township_unit(address_code: str, floor_number: int, unit_letter: str):
    address_code = (address_code or "").strip().upper()
    unit_letter = (unit_letter or "").strip().upper()

    if not re.fullmatch(r"[ABCD]-\d{1,3}", address_code):
        raise HTTPException(status_code=400, detail="Invalid township building address")
    if floor_number < 1 or not re.fullmatch(r"[A-Z]", unit_letter):
        raise HTTPException(status_code=400, detail="Invalid floor or apartment letter")

    with get_connection() as connection:
        with connection.cursor() as cursor:
            ensure_township_address_table(cursor)
            ensure_township_units_table(cursor)
            cursor.execute(
                """
                SELECT
                    a.parent_ulpin, a.plot_name, a.block_code, a.address_number,
                    a.address_code, a.building_code, a.building_name, a.building_type,
                    a.floors, a.units_per_floor, a.floor_height, a.height_m,
                    u.floor_number, u.floor_id, u.unit_letter, u.display_unit,
                    u.proposed_3d_ulpin, u.z_min, u.z_max, u.validation
                FROM township_units AS u
                JOIN township_addresses AS a ON a.address_code = u.address_code
                WHERE UPPER(u.address_code) = %s
                  AND u.floor_number = %s
                  AND UPPER(u.unit_letter) = %s
                LIMIT 1;
                """,
                (address_code, floor_number, unit_letter),
            )
            row = cursor.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Registered township apartment not found")

    return {
        "found": True,
        "parent_ulpin": row[0],
        "plot_name": row[1],
        "block_code": row[2],
        "address_number": row[3],
        "address_code": row[4],
        "building_code": row[5],
        "building_name": row[6],
        "building_type": row[7],
        "floors": row[8],
        "units_per_floor": row[9],
        "floor_height": row[10],
        "height_m": row[11],
        "floor": str(row[12]),
        "floor_id": row[13],
        "unit": row[14],
        "display_unit": row[15],
        "proposed_3d_ulpin": row[16],
        "spatial_id": row[16],
        "z_min": row[17],
        "z_max": row[18],
        "validation": row[19],
        "registry_status": "Persisted in PostGIS",
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

            ensure_township_address_table(cursor)
            ensure_township_units_table(cursor)

            # -------------------------------------
            # PARCELS
            # -------------------------------------

            cursor.execute(
                """
                SELECT
                    p.ulpin,
                    p.name,
                    ST_AsGeoJSON(p.geometry),
                    a.block_code,
                    a.address_number,
                    a.address_code,
                    a.land_use

                FROM parcels AS p
                LEFT JOIN township_addresses AS a
                    ON a.parent_ulpin = p.ulpin

                ORDER BY p.id;
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
                        "block_code": row[3],
                        "address_number": row[4],
                        "address_code": row[5],
                        "land_use": row[6],
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


            cursor.execute(
                """
                SELECT
                    COUNT(*) AS registered_units,
                    COUNT(DISTINCT proposed_3d_ulpin) AS unique_3d_ulpins
                FROM township_units;
                """
            )
            registry_counts = cursor.fetchone()
            registered_unit_count = int(registry_counts[0] or 0)
            unique_3d_ulpin_count = int(registry_counts[1] or 0)


    return {
        "parcel_count": len(parcels),
        "property_count": len(properties),
        "registered_unit_count": registered_unit_count,
        "unique_3d_ulpin_count": unique_3d_ulpin_count,
        "registry_integrity_ok": registered_unit_count == unique_3d_ulpin_count,
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
    Replace the small development demo with the deterministic
    Bhumi3D Township V3 Step 3.6 dataset.

    Step 3.6 keeps the Step 3.5 mobility system and 150-plot cadastral
    foundation, then polishes vehicle proportions, transit furniture and signage while
    preserving the Step 2.1 road/camera work and the Step 3.2
    City/Cadastral presentation modes:
    - 150 cadastral plots
    - 50 apartment-tower plots and tower footprints
    - 80 residential plots with low-rise homes
    - 20 civic / amenity plots
    - 2 schools
    - 2 hospitals
    - 1 gym / sports centre
    - 1 shopping complex
    - administration, clubhouse and community facilities
    - 4 parks and 2 common parking areas
    - a larger road grid with medians and lane hierarchy
    - modern street lights on both sides of roads
    - lane/edge markings, zebra crossings and road text
    - traffic signals at major intersections
    - varied apartment-tower and house massing
    - landscaped parks, trees, paths and parking-bay markings
    - stronger school, hospital, gym and commercial identities
    - a landmark CADASTRAX3D TOWNSHIP entrance gate
    - principal-road sidewalks and planted verge strips
    - dual City View / Cadastral View presentation support
    - a grounded township base plane and perimeter green belt
    - more opaque buildings with procedural facade / roof detailing
    - additional boundary landscaping and park furniture
    - a more substantial CadastraX3D entrance with entry / exit barriers
    - apartment lobby canopies and additional balcony / facade families
    - villa porch details and more varied house footprints
    - hospital emergency canopies, ambulance bays and red-cross identity
    - school sports courts and entrance structures
    - shopping arcade frontage and gym entrance identity
    - populated common parking areas and civic drop-off traffic
    - light traffic on the two principal township corridors
    - CadastraX3D township shuttle buses and four bus shelters
    - EV charging pedestals in common parking areas
    - close-range district / destination wayfinding signs
    - layered vehicle profiles with body/cabin/window/wheel metadata
    - refined bus-shelter dimensions and safer sign offsets
    - compact road/district sign categories for cleaner close-range rendering

    Individual apartment ownership volumes remain intentionally
    deferred so the township overview stays lightweight.
    """

    # -----------------------------------------------------
    # PLANNING CONSTANTS
    # -----------------------------------------------------

    base_lon = 77.20260
    base_lat = 28.60980

    plot_width = 0.00042
    plot_height = 0.00034

    rows = 10
    columns = 15

    # Road gaps between the 15 columns.  A wider north-south
    # boulevard runs through the centre of the township.
    vertical_road_widths = [
        0.00009, 0.00009, 0.00010, 0.00009, 0.00009, 0.00010,
        0.00018,
        0.00010, 0.00009, 0.00009, 0.00010, 0.00009, 0.00009,
        0.00010,
    ]

    # Road gaps between the 10 rows.  The middle corridor is the
    # primary east-west avenue and another collector is wider too.
    horizontal_road_widths = [
        0.00009,
        0.00010,
        0.00010,
        0.00020,
        0.00010,
        0.00010,
        0.00016,
        0.00010,
        0.00009,
    ]

    # 50 apartment towers. Every tower has more than five floors;
    # selected signature towers rise to 32, 36 and 40 floors.
    apartment_floors = [
        6, 7, 8, 9, 10, 12,
        7, 8, 10, 12, 14, 16,
        8, 10, 12, 14, 16, 18,
        10, 12, 14, 16, 18, 20,
        12, 14, 16, 18, 20, 22,
        14, 16, 18, 20, 22, 24,
        16, 18, 20, 22, 24, 26,
        18, 20, 22, 24, 28, 32,
        36, 40,
    ]

    # -----------------------------------------------------
    # LAND-USE PLAN
    # -----------------------------------------------------

    # Apartment districts form two north-south clusters, with two
    # signature towers close to the central spine.
    apartment_cells = {
        *((row, column) for row in range(1, 9) for column in (3, 4, 5)),
        *((row, column) for row in range(1, 9) for column in (9, 10, 11)),
        (1, 7),
        (8, 7),
    }

    # Exactly 20 amenity / public-service plots. Everything else is
    # a low-rise residential plot, giving exactly 80 such plots.
    amenity_cells = {
        (0, 0): "school",
        (9, 14): "school",
        (1, 13): "hospital",
        (8, 1): "hospital",
        (2, 7): "park",
        (4, 6): "park",
        (5, 8): "park",
        (7, 7): "park",
        (3, 13): "parking",
        (6, 1): "parking",
        (5, 6): "gym",
        (4, 8): "shopping",
        (0, 7): "office",
        (9, 7): "clubhouse",
        (9, 0): "security",
        (0, 14): "utility",
        (8, 14): "water_service",
        (3, 7): "sports_ground",
        (6, 7): "community_center",
        (2, 13): "daycare",
    }

    # Safety check so future edits cannot silently change the target
    # composition of Township V3 Step 1.
    if len(apartment_cells) != 50 or len(amenity_cells) != 20:
        raise HTTPException(
            status_code=500,
            detail="Township planning configuration is invalid",
        )

    if apartment_cells.intersection(amenity_cells.keys()):
        raise HTTPException(
            status_code=500,
            detail="Apartment and amenity planning cells overlap",
        )

    # -----------------------------------------------------
    # GRID COORDINATES
    # -----------------------------------------------------

    x_starts = []
    current_x = base_lon

    for column_index in range(columns):
        x_starts.append(current_x)
        current_x += plot_width

        if column_index < columns - 1:
            current_x += vertical_road_widths[column_index]

    township_max_lon = current_x

    y_starts = []
    current_y = base_lat

    for row_index in range(rows):
        y_starts.append(current_y)
        current_y += plot_height

        if row_index < rows - 1:
            current_y += horizontal_road_widths[row_index]

    township_max_lat = current_y

    # -----------------------------------------------------
    # FOUR-BLOCK CADASTRAL ADDRESSING
    # -----------------------------------------------------

    addressable_land_uses = {
        "apartment", "residential", "school", "hospital", "gym",
        "shopping", "office", "clubhouse", "security", "utility",
        "water_service", "community_center", "daycare",
    }

    def land_use_for_cell(cell):
        if cell in apartment_cells:
            return "apartment"
        if cell in amenity_cells:
            return amenity_cells[cell]
        return "residential"

    def block_for_cell(row_index, column_index):
        north = row_index >= rows // 2
        west = column_index <= 6
        if north and west:
            return "A"
        if north and not west:
            return "B"
        if not north and west:
            return "C"
        return "D"

    # Number occupied plots first inside each block. This guarantees common
    # building numbers (1, 2, 3...) exist across A/B/C/D whenever possible,
    # so a numeric query such as "12" naturally returns A-12/B-12/C-12/D-12.
    block_address_numbers = {}
    for block_code in ("A", "B", "C", "D"):
        cells = [
            (row_index, column_index)
            for row_index in range(rows)
            for column_index in range(columns)
            if block_for_cell(row_index, column_index) == block_code
        ]
        occupied = [
            cell for cell in cells
            if land_use_for_cell(cell) in addressable_land_uses
        ]
        open_space = [cell for cell in cells if cell not in occupied]
        for address_number, cell in enumerate([*occupied, *open_space], start=1):
            block_address_numbers[cell] = address_number

    plots = []

    apartment_index = 0
    residential_index = 0
    school_index = 0
    hospital_index = 0
    park_index = 0
    parking_index = 0

    try:

        with get_connection() as connection:

            with connection.cursor() as cursor:

                ensure_colony_assets_table(cursor)
                ensure_township_address_table(cursor)
                ensure_township_units_table(cursor)

                # -----------------------------------------
                # RESET CURRENT DEMO DATA
                # -----------------------------------------

                cursor.execute(
                    "TRUNCATE TABLE township_units RESTART IDENTITY;"
                )

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

                cursor.execute(
                    "TRUNCATE TABLE township_addresses RESTART IDENTITY;"
                )

                # -----------------------------------------
                # 150 CADASTRAL PARCELS + ZONING
                # -----------------------------------------

                parcel_number = 0

                for row_index in range(rows):

                    for column_index in range(columns):

                        parcel_number += 1
                        cell = (row_index, column_index)

                        land_use = land_use_for_cell(cell)
                        block_code = block_for_cell(row_index, column_index)
                        address_number = block_address_numbers[cell]
                        address_code = f"{block_code}-{address_number}"

                        min_lon = x_starts[column_index]
                        min_lat = y_starts[row_index]
                        max_lon = min_lon + plot_width
                        max_lat = min_lat + plot_height

                        ulpin = f"RJ-JPR-TOWNSHIP-{parcel_number:04d}"

                        if land_use == "apartment":
                            apartment_index += 1
                            display_name = f"Apartment Plot {address_code}"

                        elif land_use == "residential":
                            residential_index += 1
                            display_name = f"Residential Plot {address_code}"

                        elif land_use == "school":
                            school_index += 1
                            display_name = f"School Campus {address_code}"

                        elif land_use == "hospital":
                            hospital_index += 1
                            display_name = f"Hospital Campus {address_code}"

                        elif land_use == "park":
                            park_index += 1
                            display_name = f"Public Park {address_code}"

                        elif land_use == "parking":
                            parking_index += 1
                            display_name = f"Common Parking {address_code}"

                        else:
                            names = {
                                "gym": "Township Gym & Fitness Centre",
                                "shopping": "Township Shopping Complex",
                                "office": "Township Administration Office",
                                "clubhouse": "Residents Clubhouse",
                                "security": "Township Security Centre",
                                "utility": "Electrical Utility Plot",
                                "water_service": "Water Services Plot",
                                "sports_ground": "Community Sports Ground",
                                "community_center": "Community Centre",
                                "daycare": "Daycare & Early Learning Centre",
                            }
                            display_name = names.get(
                                land_use,
                                f"Township Plot {parcel_number:03d}",
                            )

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

                        cursor.execute(
                            """
                            INSERT INTO township_addresses (
                                parent_ulpin, plot_name, block_code, address_number,
                                address_code, row_index, column_index, land_use
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s);
                            """,
                            (
                                ulpin, display_name, block_code, address_number,
                                address_code, row_index, column_index, land_use,
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
                                "block_code": block_code,
                                "address_number": address_number,
                                "address_code": address_code,
                                "min_lon": min_lon,
                                "min_lat": min_lat,
                                "max_lon": max_lon,
                                "max_lat": max_lat,
                            }
                        )

                # -----------------------------------------
                # BUILDING FOOTPRINTS / STEP-3.4 MASSING
                # -----------------------------------------

                apartment_counter = 0
                residential_counter = 0
                registered_3d_unit_count = 0
                school_counter = 0
                hospital_counter = 0
                building_feature_count = 0
                residential_building_count = 0
                civic_building_count = 0
                building_specs = {}

                building_amenity_types = {
                    "school",
                    "hospital",
                    "gym",
                    "shopping",
                    "office",
                    "clubhouse",
                    "security",
                    "utility",
                    "water_service",
                    "community_center",
                    "daycare",
                }

                def polygon_wkt(coordinates):
                    if coordinates[0] != coordinates[-1]:
                        coordinates = [*coordinates, coordinates[0]]
                    pairs = ", ".join(
                        f"{longitude:.8f} {latitude:.8f}"
                        for longitude, latitude in coordinates
                    )
                    return f"POLYGON(({pairs}))"

                def rectangle_coordinates(min_lon, min_lat, max_lon, max_lat):
                    return [
                        (min_lon, min_lat),
                        (max_lon, min_lat),
                        (max_lon, max_lat),
                        (min_lon, max_lat),
                        (min_lon, min_lat),
                    ]

                apartment_styles = [
                    ("slab", "warm_ivory", "flat_parapet", "bronze_balcony"),
                    ("slim", "cool_stone", "roof_crown", "blue_glass"),
                    ("wide", "sandstone_glass", "flat_parapet", "dark_balcony"),
                    ("l_shape", "sage_stone", "roof_crown", "sage_glass"),
                    ("stepped", "terracotta_grey", "mechanical_crown", "terracotta_balcony"),
                    ("twin_core", "pearl_grey", "twin_crown", "charcoal_glass"),
                    ("terraced_crown", "champagne_stone", "terraced_roof", "warm_glass"),
                ]

                house_styles = [
                    ("duplex", "villa_cream", "terrace", "wood_screen"),
                    ("compact_villa", "villa_sand", "parapet", "stone_entry"),
                    ("wide_villa", "villa_grey", "terrace", "dark_frame"),
                    ("courtyard_home", "villa_warm", "parapet", "courtyard_screen"),
                    ("corner_villa", "villa_white", "terrace", "corner_glass"),
                    ("garden_duplex", "villa_sage", "pitched_cap", "garden_entry"),
                ]

                for plot in plots:

                    land_use = plot["land_use"]

                    if land_use not in {
                        "apartment",
                        "residential",
                        *building_amenity_types,
                    }:
                        continue

                    units_per_floor = 1
                    podium_floors = 0
                    massing_style = "rectangular"
                    facade_palette = "neutral"
                    roof_style = "flat"
                    facade_family = "standard"

                    # Defaults are subsequently varied by land-use.
                    building_min_lon = plot["min_lon"] + 0.000070
                    building_min_lat = plot["min_lat"] + 0.000055
                    building_max_lon = plot["max_lon"] - 0.000070
                    building_max_lat = plot["max_lat"] - 0.000055

                    if land_use == "apartment":
                        apartment_counter += 1
                        building_code = f"B{apartment_counter:02d}"
                        floors = apartment_floors[apartment_counter - 1]
                        floor_height = 3.2
                        units_per_floor = 6
                        building_type = "Apartment Tower"
                        feature_name = f"Residential Tower {plot['address_code']}"

                        (
                            massing_style,
                            facade_palette,
                            roof_style,
                            facade_family,
                        ) = apartment_styles[(apartment_counter - 1) % len(apartment_styles)]

                        if floors >= 18 and apartment_counter % 3 == 0:
                            podium_floors = 2

                        if massing_style == "slab":
                            building_min_lon = plot["min_lon"] + 0.000060
                            building_max_lon = plot["max_lon"] - 0.000060
                            building_min_lat = plot["min_lat"] + 0.000090
                            building_max_lat = plot["max_lat"] - 0.000090
                            footprint = rectangle_coordinates(
                                building_min_lon,
                                building_min_lat,
                                building_max_lon,
                                building_max_lat,
                            )

                        elif massing_style == "slim":
                            building_min_lon = plot["min_lon"] + 0.000125
                            building_max_lon = plot["max_lon"] - 0.000125
                            building_min_lat = plot["min_lat"] + 0.000050
                            building_max_lat = plot["max_lat"] - 0.000050
                            footprint = rectangle_coordinates(
                                building_min_lon,
                                building_min_lat,
                                building_max_lon,
                                building_max_lat,
                            )

                        elif massing_style == "wide":
                            building_min_lon = plot["min_lon"] + 0.000048
                            building_max_lon = plot["max_lon"] - 0.000048
                            building_min_lat = plot["min_lat"] + 0.000105
                            building_max_lat = plot["max_lat"] - 0.000105
                            footprint = rectangle_coordinates(
                                building_min_lon,
                                building_min_lat,
                                building_max_lon,
                                building_max_lat,
                            )

                        elif massing_style == "l_shape":
                            x1 = plot["min_lon"] + 0.000060
                            x2 = plot["max_lon"] - 0.000060
                            y1 = plot["min_lat"] + 0.000060
                            y2 = plot["max_lat"] - 0.000060
                            notch_x = x1 + (x2 - x1) * 0.56
                            notch_y = y1 + (y2 - y1) * 0.46
                            footprint = [
                                (x1, y1),
                                (x2, y1),
                                (x2, notch_y),
                                (notch_x, notch_y),
                                (notch_x, y2),
                                (x1, y2),
                                (x1, y1),
                            ]
                            building_min_lon, building_max_lon = x1, x2
                            building_min_lat, building_max_lat = y1, y2

                        elif massing_style == "twin_core":
                            x1 = plot["min_lon"] + 0.000070
                            x2 = plot["max_lon"] - 0.000070
                            y1 = plot["min_lat"] + 0.000055
                            y2 = plot["max_lat"] - 0.000055
                            waist = (x2 - x1) * 0.18
                            mid_x = (x1 + x2) / 2
                            footprint = [
                                (x1, y1),
                                (mid_x - waist, y1),
                                (mid_x - waist, y1 + (y2-y1)*0.26),
                                (mid_x + waist, y1 + (y2-y1)*0.26),
                                (mid_x + waist, y1),
                                (x2, y1),
                                (x2, y2),
                                (mid_x + waist, y2),
                                (mid_x + waist, y1 + (y2-y1)*0.74),
                                (mid_x - waist, y1 + (y2-y1)*0.74),
                                (mid_x - waist, y2),
                                (x1, y2),
                                (x1, y1),
                            ]
                            building_min_lon, building_max_lon = x1, x2
                            building_min_lat, building_max_lat = y1, y2

                        elif massing_style == "terraced_crown":
                            x1 = plot["min_lon"] + 0.000068
                            x2 = plot["max_lon"] - 0.000068
                            y1 = plot["min_lat"] + 0.000060
                            y2 = plot["max_lat"] - 0.000060
                            chamfer_x = (x2 - x1) * 0.12
                            chamfer_y = (y2 - y1) * 0.12
                            footprint = [
                                (x1 + chamfer_x, y1),
                                (x2 - chamfer_x, y1),
                                (x2, y1 + chamfer_y),
                                (x2, y2 - chamfer_y),
                                (x2 - chamfer_x, y2),
                                (x1 + chamfer_x, y2),
                                (x1, y2 - chamfer_y),
                                (x1, y1 + chamfer_y),
                                (x1 + chamfer_x, y1),
                            ]
                            building_min_lon, building_max_lon = x1, x2
                            building_min_lat, building_max_lat = y1, y2

                        else:  # stepped
                            x1 = plot["min_lon"] + 0.000060
                            x2 = plot["max_lon"] - 0.000060
                            y1 = plot["min_lat"] + 0.000058
                            y2 = plot["max_lat"] - 0.000058
                            dx = (x2 - x1) * 0.18
                            dy = (y2 - y1) * 0.16
                            footprint = [
                                (x1 + dx, y1),
                                (x2 - dx, y1),
                                (x2, y1 + dy),
                                (x2, y2 - dy),
                                (x2 - dx, y2),
                                (x1 + dx, y2),
                                (x1, y2 - dy),
                                (x1, y1 + dy),
                                (x1 + dx, y1),
                            ]
                            building_min_lon, building_max_lon = x1, x2
                            building_min_lat, building_max_lat = y1, y2

                    elif land_use == "residential":
                        residential_counter += 1
                        building_code = f"HOME{residential_counter:03d}"
                        floors = 2 + (residential_counter % 2)
                        floor_height = 3.1
                        building_type = "Residential House"
                        feature_name = f"Residence {residential_counter:03d}"
                        residential_building_count += 1

                        (
                            massing_style,
                            facade_palette,
                            roof_style,
                            facade_family,
                        ) = house_styles[(residential_counter - 1) % len(house_styles)]

                        # Houses move around within their plots so rows do not look copied.
                        shift_x = ((residential_counter % 3) - 1) * 0.000015
                        shift_y = ((residential_counter % 4) - 1.5) * 0.000008

                        if massing_style == "wide_villa":
                            building_min_lon = plot["min_lon"] + 0.000082 + shift_x
                            building_max_lon = plot["max_lon"] - 0.000082 + shift_x
                            building_min_lat = plot["min_lat"] + 0.000105 + shift_y
                            building_max_lat = plot["max_lat"] - 0.000075 + shift_y
                        else:
                            building_min_lon = plot["min_lon"] + 0.000108 + shift_x
                            building_max_lon = plot["max_lon"] - 0.000100 + shift_x
                            building_min_lat = plot["min_lat"] + 0.000078 + shift_y
                            building_max_lat = plot["max_lat"] - 0.000088 + shift_y

                        if massing_style in {"courtyard_home", "corner_villa"}:
                            x1, x2 = building_min_lon, building_max_lon
                            y1, y2 = building_min_lat, building_max_lat
                            cut_x = x1 + (x2 - x1) * (0.56 if massing_style == "courtyard_home" else 0.68)
                            cut_y = y1 + (y2 - y1) * (0.48 if massing_style == "courtyard_home" else 0.58)
                            footprint = [
                                (x1, y1), (x2, y1), (x2, cut_y),
                                (cut_x, cut_y), (cut_x, y2), (x1, y2), (x1, y1),
                            ]
                        else:
                            footprint = rectangle_coordinates(
                                building_min_lon,
                                building_min_lat,
                                building_max_lon,
                                building_max_lat,
                            )

                    elif land_use == "school":
                        school_counter += 1
                        building_code = f"SCH{school_counter:02d}"
                        floors = 4 if school_counter == 1 else 5
                        floor_height = 3.6
                        building_type = "School"
                        feature_name = f"CadastraX3D Public School {school_counter}"
                        massing_style = "academic_wing"
                        facade_palette = "school_cream"
                        roof_style = "flat_parapet"
                        facade_family = "academic_courtyard"
                        civic_building_count += 1

                        x1 = plot["min_lon"] + 0.000190
                        x2 = plot["max_lon"] - 0.000028
                        y1 = plot["min_lat"] + 0.000045
                        y2 = plot["max_lat"] - 0.000045
                        footprint = rectangle_coordinates(x1, y1, x2, y2)
                        building_min_lon, building_max_lon = x1, x2
                        building_min_lat, building_max_lat = y1, y2

                    elif land_use == "hospital":
                        hospital_counter += 1
                        building_code = f"HOSP{hospital_counter:02d}"
                        floors = 6 if hospital_counter == 1 else 8
                        floor_height = 3.6
                        building_type = "Hospital"
                        feature_name = f"CadastraX3D Hospital {hospital_counter}"
                        massing_style = "hospital_wing"
                        facade_palette = "hospital_white"
                        roof_style = "helipad_ready"
                        facade_family = "hospital_glass_spine"
                        civic_building_count += 1

                        x1 = plot["min_lon"] + 0.000050
                        x2 = plot["max_lon"] - 0.000050
                        y1 = plot["min_lat"] + 0.000064
                        y2 = plot["max_lat"] - 0.000070
                        mid_x = (x1 + x2) / 2
                        notch = (x2 - x1) * 0.16
                        # Broad H-like plan reads as institutional massing from above.
                        footprint = [
                            (x1, y1),
                            (mid_x - notch, y1),
                            (mid_x - notch, y1 + (y2-y1)*0.36),
                            (mid_x + notch, y1 + (y2-y1)*0.36),
                            (mid_x + notch, y1),
                            (x2, y1),
                            (x2, y2),
                            (mid_x + notch, y2),
                            (mid_x + notch, y1 + (y2-y1)*0.64),
                            (mid_x - notch, y1 + (y2-y1)*0.64),
                            (mid_x - notch, y2),
                            (x1, y2),
                            (x1, y1),
                        ]
                        building_min_lon, building_max_lon = x1, x2
                        building_min_lat, building_max_lat = y1, y2

                    else:
                        settings = {
                            "gym": (
                                "GYM01", 3, 3.5,
                                "Gym & Fitness Centre",
                                "CadastraX3D Fitness & Sports Club",
                                "fitness_glass",
                            ),
                            "shopping": (
                                "SHOP01", 4, 3.8,
                                "Shopping Complex",
                                "CadastraX3D Town Centre",
                                "commercial_warm",
                            ),
                            "office": (
                                "OFF01", 10, 3.4,
                                "Township Office",
                                "CadastraX3D Township Administration",
                                "office_glass",
                            ),
                            "clubhouse": (
                                "CLUB01", 3, 3.4,
                                "Clubhouse",
                                "Residents Clubhouse",
                                "clubhouse_green",
                            ),
                            "security": (
                                "SEC01", 2, 3.2,
                                "Security Centre",
                                "Township Security Centre",
                                "security_grey",
                            ),
                            "utility": (
                                "UTIL01", 1, 4.0,
                                "Utility Building",
                                "Electrical Utility Building",
                                "utility_grey",
                            ),
                            "water_service": (
                                "WTR01", 2, 3.4,
                                "Water Services",
                                "Water Services Building",
                                "water_blue",
                            ),
                            "community_center": (
                                "COM01", 4, 3.4,
                                "Community Centre",
                                "CadastraX3D Community Centre",
                                "community_sage",
                            ),
                            "daycare": (
                                "DAY01", 3, 3.3,
                                "Daycare",
                                "Daycare & Early Learning Centre",
                                "daycare_soft",
                            ),
                        }

                        (
                            building_code,
                            floors,
                            floor_height,
                            building_type,
                            feature_name,
                            facade_palette,
                        ) = settings[land_use]
                        massing_style = f"{land_use}_block"
                        roof_style = "flat_parapet"
                        facade_family = {
                            "shopping": "retail_arcade",
                            "gym": "sports_glass",
                            "office": "office_grid",
                            "clubhouse": "clubhouse_veranda",
                            "community_center": "civic_colonnade",
                            "daycare": "daycare_playful",
                        }.get(land_use, "civic_standard")
                        civic_building_count += 1

                        # Civic buildings get a wider, lower institutional footprint.
                        if land_use in {"shopping", "gym", "community_center", "clubhouse"}:
                            building_min_lon = plot["min_lon"] + 0.000040
                            building_max_lon = plot["max_lon"] - 0.000040
                            building_min_lat = plot["min_lat"] + 0.000095
                            building_max_lat = plot["max_lat"] - 0.000075
                        elif land_use == "office":
                            building_min_lon = plot["min_lon"] + 0.000095
                            building_max_lon = plot["max_lon"] - 0.000095
                            building_min_lat = plot["min_lat"] + 0.000055
                            building_max_lat = plot["max_lat"] - 0.000055
                        else:
                            building_min_lon = plot["min_lon"] + 0.000090
                            building_max_lon = plot["max_lon"] - 0.000090
                            building_min_lat = plot["min_lat"] + 0.000078
                            building_max_lat = plot["max_lat"] - 0.000078

                        footprint = rectangle_coordinates(
                            building_min_lon,
                            building_min_lat,
                            building_max_lon,
                            building_max_lat,
                        )

                    height_m = floors * floor_height

                    metadata = {
                        "parent_ulpin": plot["ulpin"],
                        "plot_name": plot["name"],
                        "block_code": plot["block_code"],
                        "address_number": plot["address_number"],
                        "address_code": plot["address_code"],
                        "building_code": building_code,
                        "building_type": building_type,
                        "land_use": land_use,
                        "floors": floors,
                        "units_per_floor": units_per_floor,
                        "floor_height": floor_height,
                        "height_m": round(height_m, 2),
                        "massing_style": massing_style,
                        "facade_palette": facade_palette,
                        "facade_family": facade_family,
                        "roof_style": roof_style,
                        "podium_floors": podium_floors,
                        "demo": "bhumi3d_township_v3_step3_7a",
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
                            ST_GeomFromText(%s, 4326)
                        )
                        RETURNING id;
                        """,
                        (
                            building_type,
                            feature_name,
                            "bhumi3d_township_v3_step3_7a",
                            json.dumps(metadata),
                            polygon_wkt(footprint),
                        ),
                    )

                    building_feature_id = cursor.fetchone()[0]

                    cursor.execute(
                        """
                        UPDATE township_addresses
                        SET
                            building_feature_id = %s,
                            building_code = %s,
                            building_name = %s,
                            building_type = %s,
                            floors = %s,
                            units_per_floor = %s,
                            floor_height = %s,
                            height_m = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE parent_ulpin = %s;
                        """,
                        (
                            building_feature_id, building_code, feature_name, building_type,
                            floors, units_per_floor, floor_height, round(height_m, 2), plot["ulpin"],
                        ),
                    )

                    if land_use == "apartment" and units_per_floor > 0:
                        center_lat = (building_min_lat + building_max_lat) / 2
                        width_m = ((building_max_lon - building_min_lon) * 111320
                                   * max(0.25, math.cos(math.radians(center_lat))))
                        depth_m = (building_max_lat - building_min_lat) * 111320
                        columns = 3 if units_per_floor == 6 and width_m >= depth_m else 2 if units_per_floor == 6 else max(1, min(units_per_floor, int(math.ceil(math.sqrt(units_per_floor)))))
                        rows_per_floor = int(math.ceil(units_per_floor / columns))
                        lon_step = (building_max_lon - building_min_lon) / columns
                        lat_step = (building_max_lat - building_min_lat) / rows_per_floor
                        inset_ratio = 0.035
                        unit_rows = []
                        for floor_number in range(1, floors + 1):
                            z_min = (floor_number - 1) * floor_height
                            z_max = floor_number * floor_height
                            floor_id = _floor_spatial_id(plot["ulpin"], plot["address_code"], floor_number)
                            for unit_index in range(units_per_floor):
                                column_index = unit_index % columns
                                row_index = unit_index // columns
                                unit_letter = chr(ord("A") + unit_index)
                                display_unit = f"{floor_number}-{unit_letter}"
                                child_id = _unit_spatial_id(plot["ulpin"], plot["address_code"], floor_number, unit_letter)
                                unit_min_lon = building_min_lon + column_index * lon_step + lon_step * inset_ratio
                                unit_max_lon = building_min_lon + (column_index + 1) * lon_step - lon_step * inset_ratio
                                unit_min_lat = building_min_lat + row_index * lat_step + lat_step * inset_ratio
                                unit_max_lat = building_min_lat + (row_index + 1) * lat_step - lat_step * inset_ratio
                                unit_rows.append((plot["ulpin"], plot["block_code"], plot["address_code"], building_code, floor_number, floor_id, unit_letter, display_unit, child_id, round(z_min,3), round(z_max,3), unit_min_lon, unit_min_lat, unit_max_lon, unit_max_lat))
                        cursor.executemany(
                            """
                            INSERT INTO township_units (
                                parent_ulpin, block_code, address_code, building_code,
                                floor_number, floor_id, unit_letter, display_unit,
                                proposed_3d_ulpin, z_min, z_max, validation, footprint
                            )
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Valid',
                                    ST_MakeEnvelope(%s,%s,%s,%s,4326));
                            """,
                            unit_rows,
                        )
                        registered_3d_unit_count += len(unit_rows)

                    building_feature_count += 1
                    building_specs[plot["ulpin"]] = {
                        "code": building_code,
                        "address_code": plot["address_code"],
                        "block_code": plot["block_code"],
                        "land_use": land_use,
                        "height_m": height_m,
                        "min_lon": building_min_lon,
                        "min_lat": building_min_lat,
                        "max_lon": building_max_lon,
                        "max_lat": building_max_lat,
                        "floors": floors,
                        "floor_height": floor_height,
                        "facade_family": facade_family,
                        "massing_style": massing_style,
                    }

                    # Step 3.4 close-range entrance architecture for every occupied plot.
                    building_center_lon = (building_min_lon + building_max_lon) / 2
                    building_center_lat = (building_min_lat + building_max_lat) / 2
                    if land_use == "apartment":
                        _insert_colony_asset(
                            cursor,
                            "tower_entrance",
                            f"{building_code} Main Lobby",
                            {
                                "parent_ulpin": plot["ulpin"],
                                "building_code": building_code,
                                "width_m": 7.2 if floors >= 18 else 5.8,
                                "depth_m": 2.8,
                                "height_m": 3.1,
                                "facade_family": facade_family,
                            },
                            "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                            (building_center_lon, building_min_lat - 0.000008),
                        )
                    elif land_use == "residential":
                        _insert_colony_asset(
                            cursor,
                            "house_porch",
                            f"{building_code} Porch",
                            {
                                "parent_ulpin": plot["ulpin"],
                                "building_code": building_code,
                                "width_m": 3.6,
                                "depth_m": 1.8,
                                "height_m": 2.6,
                                "facade_family": facade_family,
                            },
                            "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                            (building_center_lon, building_min_lat - 0.000006),
                        )

                    if land_use == "school":
                        playground_min_lon = plot["min_lon"] + 0.000018
                        playground_max_lon = plot["min_lon"] + 0.000165
                        playground_min_lat = plot["min_lat"] + 0.000058
                        playground_max_lat = plot["max_lat"] - 0.000058

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

                        # A marked multi-sport court and entrance canopy make the school readable without relying on labels.
                        _insert_colony_asset(
                            cursor,
                            "school_court",
                            f"School {school_counter} Sports Court",
                            {"parent_ulpin": plot["ulpin"], "court_type": "basketball_multiuse"},
                            "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                            (
                                playground_min_lon + 0.000018,
                                playground_min_lat + 0.000020,
                                playground_max_lon - 0.000018,
                                playground_max_lat - 0.000020,
                            ),
                        )
                        _insert_colony_asset(
                            cursor,
                            "school_entrance",
                            f"School {school_counter} Main Entrance",
                            {"parent_ulpin": plot["ulpin"], "school_no": school_counter},
                            "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                            (
                                (building_min_lon + building_max_lon) / 2,
                                building_min_lat - 0.000008,
                            ),
                        )

                # -----------------------------------------
                # OPEN SPACE / LANDSCAPE / SPECIAL AMENITIES
                # -----------------------------------------

                tree_count = 0
                park_path_count = 0
                parking_bay_count = 0
                special_visual_count = 0
                park_bench_count = 0
                ground_asset_count = 0
                green_belt_count = 0
                entrance_detail_count = 0
                vehicle_count = 0
                bus_shelter_count = 0
                wayfinding_sign_count = 0
                ev_charger_count = 0

                def insert_tree(longitude, latitude, context, scale=1.0):
                    nonlocal tree_count
                    tree_count += 1
                    _insert_colony_asset(
                        cursor,
                        "tree",
                        f"Landscape Tree T{tree_count:03d}",
                        {
                            "context": context,
                            "height_m": round(5.2 * scale, 2),
                            "canopy_radius_m": round(2.15 * scale, 2),
                            "style": "broadleaf",
                        },
                        "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                        (longitude, latitude),
                    )

                def insert_path(name, points, width_m=2.2):
                    nonlocal park_path_count
                    park_path_count += 1
                    wkt = "LINESTRING(" + ", ".join(
                        f"{lon:.8f} {lat:.8f}" for lon, lat in points
                    ) + ")"
                    _insert_colony_asset(
                        cursor,
                        "park_path",
                        name,
                        {"width_m": width_m, "surface": "paver"},
                        "ST_GeomFromText(%s, 4326)",
                        (wkt,),
                    )

                def insert_vehicle(
                    name,
                    center_lon,
                    center_lat,
                    heading_deg=0.0,
                    length_m=4.4,
                    width_m=1.9,
                    height_m=1.45,
                    color="#d6d6d6",
                    vehicle_kind="car",
                    context="Township mobility",
                ):
                    nonlocal vehicle_count
                    vehicle_count += 1

                    metres_per_lon_degree = 97300.0
                    metres_per_lat_degree = 111000.0
                    angle = math.radians(heading_deg)
                    half_length = length_m / 2.0
                    half_width = width_m / 2.0

                    corners = []
                    for local_x, local_y in [
                        (-half_length, -half_width),
                        (half_length, -half_width),
                        (half_length, half_width),
                        (-half_length, half_width),
                    ]:
                        east_m = local_x * math.cos(angle) - local_y * math.sin(angle)
                        north_m = local_x * math.sin(angle) + local_y * math.cos(angle)
                        corners.append((
                            center_lon + east_m / metres_per_lon_degree,
                            center_lat + north_m / metres_per_lat_degree,
                        ))

                    corners.append(corners[0])
                    wkt = "POLYGON((" + ", ".join(
                        f"{lon:.8f} {lat:.8f}" for lon, lat in corners
                    ) + "))"

                    _insert_colony_asset(
                        cursor,
                        "vehicle",
                        name,
                        {
                            "vehicle_kind": vehicle_kind,
                            "color": color,
                            "height_m": height_m,
                            "length_m": length_m,
                            "width_m": width_m,
                            "center_lon": center_lon,
                            "center_lat": center_lat,
                            "heading_deg": heading_deg,
                            "context": context,
                            "visual_profile": (
                                "ambulance" if vehicle_kind == "ambulance"
                                else "school_bus" if vehicle_kind == "school_bus"
                                else "township_bus" if vehicle_kind == "township_bus"
                                else "passenger_car"
                            ),
                        },
                        "ST_GeomFromText(%s, 4326)",
                        (wkt,),
                    )

                # -------------------------------------------------
                # STEP 3.6B REGIONAL CONTEXT + GROUNDING FOUNDATION
                # -------------------------------------------------
                # A broad, slightly lowered context plane prevents the Cesium
                # viewport from reading as an isolated model floating in a blue
                # void.  It intentionally extends well beyond the cadastral
                # township boundary while remaining visually subordinate to it.
                ground_asset_count += 1
                _insert_colony_asset(
                    cursor,
                    "regional_context_ground",
                    "CadastraX3D Regional Landscape Context",
                    {
                        "surface": "regional_ground",
                        "step": "3.6B",
                        "purpose": "realistic_non_cadastral_context",
                    },
                    "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                    (
                        base_lon - 0.00180,
                        base_lat - 0.00190,
                        township_max_lon + 0.00180,
                        township_max_lat + 0.00165,
                    ),
                )

                # -------------------------------------------------
                # STEP 3.4 GROUNDING + GREEN-BELT FOUNDATION
                # -------------------------------------------------
                ground_asset_count += 1
                _insert_colony_asset(
                    cursor,
                    "township_ground",
                    "CadastraX3D Township Ground Plane",
                    {"surface": "urban_landscape", "step": "3.3"},
                    "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                    (
                        base_lon - 0.00028,
                        base_lat - 0.00034,
                        township_max_lon + 0.00028,
                        township_max_lat + 0.00024,
                    ),
                )

                belt_depth = 0.00011
                green_belts = [
                    ("South Green Belt", base_lon - 0.00018, base_lat - 0.00016, township_max_lon + 0.00018, base_lat - 0.000025),
                    ("North Green Belt", base_lon - 0.00018, township_max_lat + 0.000025, township_max_lon + 0.00018, township_max_lat + 0.00016),
                    ("West Green Belt", base_lon - 0.00016, base_lat - 0.000025, base_lon - 0.000025, township_max_lat + 0.000025),
                    ("East Green Belt", township_max_lon + 0.000025, base_lat - 0.000025, township_max_lon + 0.00016, township_max_lat + 0.000025),
                ]
                for belt_name, min_lon, min_lat, max_lon, max_lat in green_belts:
                    green_belt_count += 1
                    _insert_colony_asset(
                        cursor,
                        "green_belt",
                        belt_name,
                        {"surface": "landscaped_buffer"},
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (min_lon, min_lat, max_lon, max_lat),
                    )

                # A sparse perimeter tree belt helps the city feel bounded without
                # making the overview too heavy on older hardware.
                for column_index in range(0, columns, 2):
                    longitude = x_starts[column_index] + plot_width / 2
                    insert_tree(longitude, base_lat - 0.000075, "South Green Belt", 0.78)
                    insert_tree(longitude, township_max_lat + 0.000075, "North Green Belt", 0.82)

                for row_index in range(0, rows, 2):
                    latitude = y_starts[row_index] + plot_height / 2
                    insert_tree(base_lon - 0.000075, latitude, "West Green Belt", 0.80)
                    insert_tree(township_max_lon + 0.000075, latitude, "East Green Belt", 0.80)

                for plot in plots:
                    center_lon = (plot["min_lon"] + plot["max_lon"]) / 2
                    center_lat = (plot["min_lat"] + plot["max_lat"]) / 2

                    if plot["land_use"] == "park":
                        _insert_colony_asset(
                            cursor,
                            "park",
                            plot["name"],
                            {
                                "parent_ulpin": plot["ulpin"],
                                "land_use": "Public Park",
                                "landscape_style": "neighborhood_park",
                            },
                            "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                            (
                                plot["min_lon"] + 0.000015,
                                plot["min_lat"] + 0.000015,
                                plot["max_lon"] - 0.000015,
                                plot["max_lat"] - 0.000015,
                            ),
                        )

                        # Crossed walking paths form a readable park structure.
                        insert_path(
                            f"{plot['name']} East-West Walk",
                            [
                                (plot["min_lon"] + 0.000035, center_lat),
                                (plot["max_lon"] - 0.000035, center_lat),
                            ],
                            2.4,
                        )
                        insert_path(
                            f"{plot['name']} North-South Walk",
                            [
                                (center_lon, plot["min_lat"] + 0.000035),
                                (center_lon, plot["max_lat"] - 0.000035),
                            ],
                            2.2,
                        )

                        tree_positions = [
                            (0.10, 0.16), (0.28, 0.12), (0.72, 0.12), (0.90, 0.18),
                            (0.10, 0.82), (0.28, 0.88), (0.72, 0.88), (0.90, 0.82),
                            (0.14, 0.50), (0.86, 0.50),
                        ]
                        for tx, ty in tree_positions:
                            insert_tree(
                                plot["min_lon"] + plot_width * tx,
                                plot["min_lat"] + plot_height * ty,
                                plot["name"],
                                1.0 + ((tree_count % 3) * 0.08),
                            )

                        # Four benches sit beside the main crossed walkways.
                        for bx, by, heading in [
                            (0.30, 0.47, 0),
                            (0.70, 0.53, 180),
                            (0.47, 0.30, 90),
                            (0.53, 0.70, 270),
                        ]:
                            park_bench_count += 1
                            _insert_colony_asset(
                                cursor,
                                "park_bench",
                                f"{plot['name']} Bench {park_bench_count:02d}",
                                {"heading_deg": heading, "style": "timber_modern"},
                                "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                                (
                                    plot["min_lon"] + plot_width * bx,
                                    plot["min_lat"] + plot_height * by,
                                ),
                            )

                        if plot["number"] % 2 == 1:
                            special_visual_count += 1
                            _insert_colony_asset(
                                cursor,
                                "fountain",
                                f"{plot['name']} Fountain",
                                {"radius_m": 2.5},
                                "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                                (center_lon, center_lat),
                            )

                    elif plot["land_use"] == "parking":
                        parking_min_lon = plot["min_lon"] + 0.000020
                        parking_min_lat = plot["min_lat"] + 0.000020
                        parking_max_lon = plot["max_lon"] - 0.000020
                        parking_max_lat = plot["max_lat"] - 0.000020

                        _insert_colony_asset(
                            cursor,
                            "surface_parking",
                            plot["name"],
                            {
                                "parent_ulpin": plot["ulpin"],
                                "capacity": 48,
                                "land_use": "Common Parking",
                            },
                            "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                            (
                                parking_min_lon,
                                parking_min_lat,
                                parking_max_lon,
                                parking_max_lat,
                            ),
                        )

                        # Painted parking bays make the area read as parking from above.
                        for bay in range(1, 12):
                            x = parking_min_lon + (
                                (parking_max_lon - parking_min_lon) * bay / 12
                            )
                            parking_bay_count += 1
                            _insert_colony_asset(
                                cursor,
                                "parking_bay_marking",
                                f"Parking Bay Divider PB{parking_bay_count:03d}",
                                {"color": "white"},
                                "ST_SetSRID(ST_MakeLine(ST_MakePoint(%s, %s), ST_MakePoint(%s, %s)), 4326)",
                                (x, parking_min_lat + 0.000018, x, parking_max_lat - 0.000018),
                            )

                    elif plot["land_use"] == "sports_ground":
                        _insert_colony_asset(
                            cursor,
                            "playground",
                            "Community Sports Ground",
                            {
                                "parent_ulpin": plot["ulpin"],
                                "surface": "multi_sport",
                            },
                            "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                            (
                                plot["min_lon"] + 0.000018,
                                plot["min_lat"] + 0.000018,
                                plot["max_lon"] - 0.000018,
                                plot["max_lat"] - 0.000018,
                            ),
                        )

                    elif plot["land_use"] == "hospital":
                        spec = building_specs.get(plot["ulpin"])
                        if spec:
                            special_visual_count += 2
                            _insert_colony_asset(
                                cursor,
                                "hospital_forecourt",
                                f"{plot['name']} Emergency Forecourt",
                                {"parent_ulpin": plot["ulpin"], "purpose": "ambulance_arrival"},
                                "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                                (
                                    plot["min_lon"] + 0.000035,
                                    plot["min_lat"] + 0.000020,
                                    plot["max_lon"] - 0.000035,
                                    plot["min_lat"] + 0.000055,
                                ),
                            )
                            _insert_colony_asset(
                                cursor,
                                "hospital_helipad",
                                f"{plot['name']} Rooftop Helipad",
                                {
                                    "parent_ulpin": plot["ulpin"],
                                    "altitude_m": round(spec["height_m"] + 0.42, 2),
                                    "radius_m": 5.0,
                                },
                                "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                                (
                                    (spec["min_lon"] + spec["max_lon"]) / 2,
                                    (spec["min_lat"] + spec["max_lat"]) / 2,
                                ),
                            )

                            _insert_colony_asset(
                                cursor,
                                "hospital_canopy",
                                f"{plot['name']} Emergency Canopy",
                                {"parent_ulpin": plot["ulpin"], "width_m": 8.0, "depth_m": 4.0, "height_m": 3.6},
                                "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                                (
                                    (spec["min_lon"] + spec["max_lon"]) / 2,
                                    spec["min_lat"] - 0.000010,
                                ),
                            )
                            _insert_colony_asset(
                                cursor,
                                "hospital_cross",
                                f"{plot['name']} Hospital Cross",
                                {"parent_ulpin": plot["ulpin"], "height_m": 5.8},
                                "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                                (
                                    spec["max_lon"] - 0.000016,
                                    spec["min_lat"] + 0.000018,
                                ),
                            )
                            _insert_colony_asset(
                                cursor,
                                "ambulance_bay",
                                f"{plot['name']} Ambulance Bay",
                                {"parent_ulpin": plot["ulpin"], "capacity": 3},
                                "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                                (
                                    plot["min_lon"] + 0.000045,
                                    plot["min_lat"] + 0.000023,
                                    plot["min_lon"] + 0.000150,
                                    plot["min_lat"] + 0.000050,
                                ),
                            )

                    elif plot["land_use"] == "shopping":
                        special_visual_count += 1
                        _insert_colony_asset(
                            cursor,
                            "commercial_plaza",
                            "CadastraX3D Town Centre Plaza",
                            {"parent_ulpin": plot["ulpin"]},
                            "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                            (
                                plot["min_lon"] + 0.000028,
                                plot["min_lat"] + 0.000025,
                                plot["max_lon"] - 0.000028,
                                plot["min_lat"] + 0.000082,
                            ),
                        )

                        spec = building_specs.get(plot["ulpin"])
                        if spec:
                            _insert_colony_asset(
                                cursor,
                                "retail_frontage",
                                "Town Centre Retail Arcade",
                                {"parent_ulpin": plot["ulpin"], "shop_bays": 8},
                                "ST_SetSRID(ST_MakeLine(ST_MakePoint(%s, %s), ST_MakePoint(%s, %s)), 4326)",
                                (
                                    spec["min_lon"] + 0.000012,
                                    spec["min_lat"] - 0.000006,
                                    spec["max_lon"] - 0.000012,
                                    spec["min_lat"] - 0.000006,
                                ),
                            )
                            _insert_colony_asset(
                                cursor,
                                "shopping_sign",
                                "CADASTRAX3D MARKET SQUARE",
                                {"parent_ulpin": plot["ulpin"], "text": "MARKET SQUARE"},
                                "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                                (
                                    (spec["min_lon"] + spec["max_lon"]) / 2,
                                    spec["min_lat"] - 0.000010,
                                ),
                            )

                    elif plot["land_use"] == "gym":
                        special_visual_count += 1
                        _insert_colony_asset(
                            cursor,
                            "fitness_court",
                            "Outdoor Fitness Court",
                            {"parent_ulpin": plot["ulpin"]},
                            "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                            (
                                plot["min_lon"] + 0.000050,
                                plot["max_lat"] - 0.000075,
                                plot["max_lon"] - 0.000050,
                                plot["max_lat"] - 0.000025,
                            ),
                        )

                        spec = building_specs.get(plot["ulpin"])
                        if spec:
                            _insert_colony_asset(
                                cursor,
                                "gym_entrance",
                                "CadastraX3D Fitness Club Entrance",
                                {"parent_ulpin": plot["ulpin"], "text": "FITNESS CLUB"},
                                "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                                (
                                    (spec["min_lon"] + spec["max_lon"]) / 2,
                                    spec["min_lat"] - 0.000008,
                                ),
                            )

                    # Modest front-yard greenery for every second residential plot.
                    if plot["land_use"] == "residential" and plot["number"] % 2 == 0:
                        insert_tree(
                            plot["min_lon"] + 0.000045,
                            plot["min_lat"] + 0.000050,
                            plot["name"],
                            0.76,
                        )

                    if plot["land_use"] in {"school", "hospital"}:
                        insert_tree(
                            plot["max_lon"] - 0.000038,
                            plot["max_lat"] - 0.000042,
                            plot["name"],
                            0.88,
                        )
                        insert_tree(
                            plot["max_lon"] - 0.000038,
                            plot["min_lat"] + 0.000042,
                            plot["name"],
                            0.88,
                        )

                # -----------------------------------------
                # ROAD NETWORK BETWEEN PLOT BLOCKS
                # -----------------------------------------

                road_count = 0
                sidewalk_count = 0
                landscape_strip_count = 0

                for column_index in range(columns - 1):
                    road_min_lon = x_starts[column_index] + plot_width
                    road_max_lon = (
                        road_min_lon + vertical_road_widths[column_index]
                    )
                    is_main_boulevard = column_index == 6

                    road_count += 1
                    _insert_colony_asset(
                        cursor,
                        "road",
                        (
                            "North-South Central Boulevard"
                            if is_main_boulevard
                            else f"Residential Street NS-{column_index + 1:02d}"
                        ),
                        {
                            "road_class": (
                                "Main Boulevard"
                                if is_main_boulevard
                                else "Internal Street"
                            ),
                            "nominal_width_m": (
                                18 if is_main_boulevard else 9
                            ),
                            "orientation": "north_south",
                        },
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (
                            road_min_lon,
                            base_lat,
                            road_max_lon,
                            township_max_lat,
                        ),
                    )

                for row_index in range(rows - 1):
                    road_min_lat = y_starts[row_index] + plot_height
                    road_max_lat = (
                        road_min_lat + horizontal_road_widths[row_index]
                    )
                    is_main_avenue = row_index == 3
                    is_secondary_collector = row_index == 6

                    road_count += 1
                    _insert_colony_asset(
                        cursor,
                        "road",
                        (
                            "Township Central Avenue"
                            if is_main_avenue
                            else (
                                "South Collector Road"
                                if is_secondary_collector
                                else f"Residential Street EW-{row_index + 1:02d}"
                            )
                        ),
                        {
                            "road_class": (
                                "Main Avenue"
                                if is_main_avenue
                                else (
                                    "Collector Street"
                                    if is_secondary_collector
                                    else "Internal Street"
                                )
                            ),
                            "nominal_width_m": (
                                20
                                if is_main_avenue
                                else (16 if is_secondary_collector else 9)
                            ),
                            "orientation": "east_west",
                        },
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (
                            base_lon,
                            road_min_lat,
                            township_max_lon,
                            road_max_lat,
                        ),
                    )

                # -----------------------------------------
                # STEP 3.2 PEDESTRIAN REALISM
                # -----------------------------------------

                sidewalk_width = 0.000022
                central_ns_min = x_starts[6] + plot_width
                central_ns_max = central_ns_min + vertical_road_widths[6]

                for side, min_lon, max_lon in [
                    ("west", central_ns_min - sidewalk_width, central_ns_min),
                    ("east", central_ns_max, central_ns_max + sidewalk_width),
                ]:
                    sidewalk_count += 1
                    _insert_colony_asset(
                        cursor,
                        "sidewalk",
                        f"Central Boulevard {side.title()} Sidewalk",
                        {"surface": "paver", "orientation": "north_south"},
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (min_lon, base_lat, max_lon, township_max_lat),
                    )

                central_ew_min = y_starts[3] + plot_height
                central_ew_max = central_ew_min + horizontal_road_widths[3]
                for side, min_lat, max_lat in [
                    ("south", central_ew_min - sidewalk_width, central_ew_min),
                    ("north", central_ew_max, central_ew_max + sidewalk_width),
                ]:
                    sidewalk_count += 1
                    _insert_colony_asset(
                        cursor,
                        "sidewalk",
                        f"Central Avenue {side.title()} Sidewalk",
                        {"surface": "paver", "orientation": "east_west"},
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (base_lon, min_lat, township_max_lon, max_lat),
                    )

                strip_width = 0.000012
                for side, min_lon, max_lon in [
                    ("west", central_ns_min - sidewalk_width - strip_width, central_ns_min - sidewalk_width),
                    ("east", central_ns_max + sidewalk_width, central_ns_max + sidewalk_width + strip_width),
                ]:
                    landscape_strip_count += 1
                    _insert_colony_asset(
                        cursor,
                        "landscape_strip",
                        f"Central Boulevard {side.title()} Green Strip",
                        {"surface": "planted", "orientation": "north_south"},
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (min_lon, base_lat, max_lon, township_max_lat),
                    )

                for side, min_lat, max_lat in [
                    ("south", central_ew_min - sidewalk_width - strip_width, central_ew_min - sidewalk_width),
                    ("north", central_ew_max + sidewalk_width, central_ew_max + sidewalk_width + strip_width),
                ]:
                    landscape_strip_count += 1
                    _insert_colony_asset(
                        cursor,
                        "landscape_strip",
                        f"Central Avenue {side.title()} Green Strip",
                        {"surface": "planted", "orientation": "east_west"},
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (base_lon, min_lat, township_max_lon, max_lat),
                    )

                # Main entrance approach from the south.
                township_center_lon = (base_lon + township_max_lon) / 2
                entrance_half_width = 0.000085

                _insert_colony_asset(
                    cursor,
                    "road",
                    "Main Township Entrance Boulevard",
                    {
                        "road_class": "Entrance Boulevard",
                        "nominal_width_m": 18,
                        "orientation": "north_south",
                    },
                    "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                    (
                        township_center_lon - entrance_half_width,
                        base_lat - 0.000300,
                        township_center_lon + entrance_half_width,
                        base_lat,
                    ),
                )
                road_count += 1

                # -----------------------------------------
                # CADASTRAX3D TOWNSHIP LANDMARK ENTRANCE
                # -----------------------------------------

                gate_lat = base_lat - 0.000145
                gate_left_lon = township_center_lon - entrance_half_width * 0.78
                gate_right_lon = township_center_lon + entrance_half_width * 0.78

                _insert_colony_asset(
                    cursor,
                    "entrance_gate",
                    "CadastraX3D Township Main Gate",
                    {
                        "sign_text": "CADASTRAX3D TOWNSHIP",
                        "height_m": 10.5,
                        "tower_height_m": 12.5,
                        "beam_depth_m": 2.4,
                        "sign_text_secondary": "SMART RESIDENTIAL TOWNSHIP",
                        "left_lon": gate_left_lon,
                        "right_lon": gate_right_lon,
                        "gate_lat": gate_lat,
                        "style": "modern_landmark",
                    },
                    "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                    (township_center_lon, gate_lat),
                )

                gatehouse_depth = 0.000050
                gatehouse_width = 0.000060
                for side, center_lon in [
                    ("Entry Security", township_center_lon - entrance_half_width - 0.000050),
                    ("Exit Security", township_center_lon + entrance_half_width + 0.000050),
                ]:
                    _insert_colony_asset(
                        cursor,
                        "gatehouse",
                        f"CadastraX3D {side} Cabin",
                        {"height_m": 3.4, "side": side},
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (
                            center_lon - gatehouse_width / 2,
                            gate_lat - gatehouse_depth / 2,
                            center_lon + gatehouse_width / 2,
                            gate_lat + gatehouse_depth / 2,
                        ),
                    )

                wall_lat = base_lat - 0.000006
                _insert_colony_asset(
                    cursor,
                    "boundary_wall",
                    "South Boundary Wall West",
                    {"height_m": 1.8},
                    "ST_SetSRID(ST_MakeLine(ST_MakePoint(%s, %s), ST_MakePoint(%s, %s)), 4326)",
                    (
                        base_lon,
                        wall_lat,
                        township_center_lon - entrance_half_width - 0.000030,
                        wall_lat,
                    ),
                )
                _insert_colony_asset(
                    cursor,
                    "boundary_wall",
                    "South Boundary Wall East",
                    {"height_m": 1.8},
                    "ST_SetSRID(ST_MakeLine(ST_MakePoint(%s, %s), ST_MakePoint(%s, %s)), 4326)",
                    (
                        township_center_lon + entrance_half_width + 0.000030,
                        wall_lat,
                        township_max_lon,
                        wall_lat,
                    ),
                )

                # Continue the township boundary around the remaining three sides.
                for wall_name, x1, y1, x2, y2 in [
                    ("North Boundary Wall", base_lon, township_max_lat + 0.000006, township_max_lon, township_max_lat + 0.000006),
                    ("West Boundary Wall", base_lon - 0.000006, base_lat, base_lon - 0.000006, township_max_lat),
                    ("East Boundary Wall", township_max_lon + 0.000006, base_lat, township_max_lon + 0.000006, township_max_lat),
                ]:
                    _insert_colony_asset(
                        cursor,
                        "boundary_wall",
                        wall_name,
                        {"height_m": 1.8},
                        "ST_SetSRID(ST_MakeLine(ST_MakePoint(%s, %s), ST_MakePoint(%s, %s)), 4326)",
                        (x1, y1, x2, y2),
                    )

                # ENTRY / EXIT boom barriers make the gateway read as a real controlled entrance.
                barrier_lat = gate_lat - 0.000050
                for barrier_name, x1, x2 in [
                    ("Entry Boom Barrier", township_center_lon - entrance_half_width * 0.72, township_center_lon - 0.000012),
                    ("Exit Boom Barrier", township_center_lon + 0.000012, township_center_lon + entrance_half_width * 0.72),
                ]:
                    entrance_detail_count += 1
                    _insert_colony_asset(
                        cursor,
                        "boom_barrier",
                        barrier_name,
                        {"height_m": 1.1, "style": "red_white"},
                        "ST_SetSRID(ST_MakeLine(ST_MakePoint(%s, %s), ST_MakePoint(%s, %s)), 4326)",
                        (x1, barrier_lat, x2, barrier_lat),
                    )

                for island_center_lon in (
                    township_center_lon - entrance_half_width - 0.000115,
                    township_center_lon + entrance_half_width + 0.000115,
                ):
                    _insert_colony_asset(
                        cursor,
                        "landscape_island",
                        "Entrance Landscape Island",
                        {"style": "ornamental"},
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (
                            island_center_lon - 0.000040,
                            gate_lat - 0.000055,
                            island_center_lon + 0.000040,
                            gate_lat + 0.000055,
                        ),
                    )
                    insert_tree(
                        island_center_lon,
                        gate_lat,
                        "CadastraX3D Main Gate",
                        0.92,
                    )

                # -----------------------------------------
                # STEP-2 ROAD MEDIANS
                # -----------------------------------------

                median_count = 0

                central_boulevard_min_lon = (
                    x_starts[6] + plot_width
                )
                central_boulevard_max_lon = (
                    central_boulevard_min_lon + vertical_road_widths[6]
                )
                central_boulevard_center_lon = (
                    central_boulevard_min_lon + central_boulevard_max_lon
                ) / 2

                _insert_colony_asset(
                    cursor,
                    "road_median",
                    "Central Boulevard Landscaped Median",
                    {
                        "surface": "landscaped",
                        "orientation": "north_south",
                    },
                    "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                    (
                        central_boulevard_center_lon - 0.000010,
                        base_lat,
                        central_boulevard_center_lon + 0.000010,
                        township_max_lat,
                    ),
                )
                median_count += 1

                main_avenue_min_lat = (
                    y_starts[3] + plot_height
                )
                main_avenue_max_lat = (
                    main_avenue_min_lat + horizontal_road_widths[3]
                )
                main_avenue_center_lat = (
                    main_avenue_min_lat + main_avenue_max_lat
                ) / 2

                _insert_colony_asset(
                    cursor,
                    "road_median",
                    "Central Avenue Landscaped Median",
                    {
                        "surface": "landscaped",
                        "orientation": "east_west",
                    },
                    "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                    (
                        base_lon,
                        main_avenue_center_lat - 0.000010,
                        township_max_lon,
                        main_avenue_center_lat + 0.000010,
                    ),
                )
                median_count += 1

                # Tree-lined principal axes make the township read as landscaped,
                # while sparse spacing keeps the overview performant.
                for row_index in range(rows):
                    if row_index % 2 == 0:
                        insert_tree(
                            central_boulevard_center_lon,
                            y_starts[row_index] + plot_height / 2,
                            "Central Boulevard Median",
                            0.82,
                        )

                for column_index in range(columns):
                    if column_index % 2 == 0:
                        insert_tree(
                            x_starts[column_index] + plot_width / 2,
                            main_avenue_center_lat,
                            "Central Avenue Median",
                            0.82,
                        )

                # -----------------------------------------
                # STEP-2.1 REALISTIC ROAD MARKINGS
                # -----------------------------------------

                marking_count = 0
                stop_line_count = 0

                def insert_line_marking(
                    name,
                    marking_type,
                    x1,
                    y1,
                    x2,
                    y2,
                    style="solid",
                    width_m=0.14,
                ):
                    nonlocal marking_count, stop_line_count
                    marking_count += 1
                    if marking_type == "stop_line":
                        stop_line_count += 1
                    _insert_colony_asset(
                        cursor,
                        marking_type,
                        name,
                        {
                            "style": style,
                            "color": "white",
                            "width_m": width_m,
                        },
                        "ST_SetSRID(ST_MakeLine(ST_MakePoint(%s, %s), ST_MakePoint(%s, %s)), 4326)",
                        (x1, y1, x2, y2),
                    )

                # Main/collector roads receive full lane + edge markings.
                # Internal 9 m residential streets stay deliberately unmarked,
                # which is visually cleaner and closer to real colony roads.
                marked_horizontal_rows = {3, 6}
                marked_vertical_columns = {6}

                # Break markings into individual blocks so lines stop at junctions.
                for row_index in marked_horizontal_rows:
                    road_min_lat = y_starts[row_index] + plot_height
                    road_max_lat = road_min_lat + horizontal_road_widths[row_index]
                    road_center_lat = (road_min_lat + road_max_lat) / 2
                    edge_offset = min(
                        horizontal_road_widths[row_index] * 0.16,
                        0.000018,
                    )

                    for column_index in range(columns):
                        segment_start = x_starts[column_index] + 0.000012
                        segment_end = x_starts[column_index] + plot_width - 0.000012

                        insert_line_marking(
                            f"EW-{row_index + 1:02d} Block {column_index + 1:02d} Centre",
                            "lane_marking",
                            segment_start,
                            road_center_lat,
                            segment_end,
                            road_center_lat,
                            "dashed",
                            0.15,
                        )
                        insert_line_marking(
                            f"EW-{row_index + 1:02d} Block {column_index + 1:02d} South Edge",
                            "road_edge_marking",
                            segment_start,
                            road_min_lat + edge_offset,
                            segment_end,
                            road_min_lat + edge_offset,
                            "solid",
                            0.12,
                        )
                        insert_line_marking(
                            f"EW-{row_index + 1:02d} Block {column_index + 1:02d} North Edge",
                            "road_edge_marking",
                            segment_start,
                            road_max_lat - edge_offset,
                            segment_end,
                            road_max_lat - edge_offset,
                            "solid",
                            0.12,
                        )

                for column_index in marked_vertical_columns:
                    road_min_lon = x_starts[column_index] + plot_width
                    road_max_lon = road_min_lon + vertical_road_widths[column_index]
                    road_center_lon = (road_min_lon + road_max_lon) / 2
                    edge_offset = min(
                        vertical_road_widths[column_index] * 0.16,
                        0.000018,
                    )

                    for row_index in range(rows):
                        segment_start = y_starts[row_index] + 0.000012
                        segment_end = y_starts[row_index] + plot_height - 0.000012

                        insert_line_marking(
                            f"NS-{column_index + 1:02d} Block {row_index + 1:02d} Centre",
                            "lane_marking",
                            road_center_lon,
                            segment_start,
                            road_center_lon,
                            segment_end,
                            "dashed",
                            0.15,
                        )
                        insert_line_marking(
                            f"NS-{column_index + 1:02d} Block {row_index + 1:02d} West Edge",
                            "road_edge_marking",
                            road_min_lon + edge_offset,
                            segment_start,
                            road_min_lon + edge_offset,
                            segment_end,
                            "solid",
                            0.12,
                        )
                        insert_line_marking(
                            f"NS-{column_index + 1:02d} Block {row_index + 1:02d} East Edge",
                            "road_edge_marking",
                            road_max_lon - edge_offset,
                            segment_start,
                            road_max_lon - edge_offset,
                            segment_end,
                            "solid",
                            0.12,
                        )

                # Entrance boulevard keeps proper centre/edge markings.
                insert_line_marking(
                    "Entrance Boulevard Centre Line",
                    "lane_marking",
                    township_center_lon,
                    base_lat - 0.000300,
                    township_center_lon,
                    base_lat - 0.000018,
                    "dashed",
                    0.15,
                )
                insert_line_marking(
                    "Entrance Boulevard West Edge",
                    "road_edge_marking",
                    township_center_lon - entrance_half_width + 0.000012,
                    base_lat - 0.000300,
                    township_center_lon - entrance_half_width + 0.000012,
                    base_lat - 0.000018,
                    "solid",
                    0.12,
                )
                insert_line_marking(
                    "Entrance Boulevard East Edge",
                    "road_edge_marking",
                    township_center_lon + entrance_half_width - 0.000012,
                    base_lat - 0.000300,
                    township_center_lon + entrance_half_width - 0.000012,
                    base_lat - 0.000018,
                    "solid",
                    0.12,
                )

                # -----------------------------------------
                # ZEBRA CROSSINGS + STOP LINES
                # -----------------------------------------

                crosswalk_count = 0

                major_intersections = [
                    (6, 3),
                    (6, 6),
                    (3, 3),
                    (10, 3),
                    (3, 6),
                    (10, 6),
                ]

                def add_crosswalk_stripes(
                    crossing_name,
                    road_min_lon,
                    road_max_lon,
                    road_min_lat,
                    road_max_lat,
                    approach,
                ):
                    nonlocal crosswalk_count

                    stripe_count = 6
                    stripe_gap = 0.000010
                    stripe_thickness = 0.000004

                    if approach in {"south", "north"}:
                        base_cross_lat = (
                            road_min_lat - 0.000020
                            if approach == "south"
                            else road_max_lat + 0.000020
                        )
                        for stripe in range(stripe_count):
                            stripe_lat = (
                                base_cross_lat
                                + (stripe - (stripe_count - 1) / 2) * stripe_gap
                            )
                            crosswalk_count += 1
                            _insert_colony_asset(
                                cursor,
                                "crosswalk",
                                f"{crossing_name} {approach.title()} Stripe {stripe + 1}",
                                {
                                    "approach": approach,
                                    "style": "zebra",
                                },
                                "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                                (
                                    road_min_lon + 0.000006,
                                    stripe_lat - stripe_thickness / 2,
                                    road_max_lon - 0.000006,
                                    stripe_lat + stripe_thickness / 2,
                                ),
                            )

                        stop_lat = (
                            base_cross_lat - 0.000040
                            if approach == "south"
                            else base_cross_lat + 0.000040
                        )
                        insert_line_marking(
                            f"{crossing_name} {approach.title()} Stop Line",
                            "stop_line",
                            road_min_lon + 0.000006,
                            stop_lat,
                            road_max_lon - 0.000006,
                            stop_lat,
                            "solid",
                            0.35,
                        )

                    else:
                        base_cross_lon = (
                            road_min_lon - 0.000020
                            if approach == "west"
                            else road_max_lon + 0.000020
                        )
                        for stripe in range(stripe_count):
                            stripe_lon = (
                                base_cross_lon
                                + (stripe - (stripe_count - 1) / 2) * stripe_gap
                            )
                            crosswalk_count += 1
                            _insert_colony_asset(
                                cursor,
                                "crosswalk",
                                f"{crossing_name} {approach.title()} Stripe {stripe + 1}",
                                {
                                    "approach": approach,
                                    "style": "zebra",
                                },
                                "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                                (
                                    stripe_lon - stripe_thickness / 2,
                                    road_min_lat + 0.000006,
                                    stripe_lon + stripe_thickness / 2,
                                    road_max_lat - 0.000006,
                                ),
                            )

                        stop_lon = (
                            base_cross_lon - 0.000040
                            if approach == "west"
                            else base_cross_lon + 0.000040
                        )
                        insert_line_marking(
                            f"{crossing_name} {approach.title()} Stop Line",
                            "stop_line",
                            stop_lon,
                            road_min_lat + 0.000006,
                            stop_lon,
                            road_max_lat - 0.000006,
                            "solid",
                            0.35,
                        )

                for crossing_index, (column_index, row_index) in enumerate(
                    major_intersections,
                    start=1,
                ):
                    road_min_lon = x_starts[column_index] + plot_width
                    road_max_lon = road_min_lon + vertical_road_widths[column_index]
                    road_min_lat = y_starts[row_index] + plot_height
                    road_max_lat = road_min_lat + horizontal_road_widths[row_index]

                    for approach in ("south", "north", "west", "east"):
                        add_crosswalk_stripes(
                            f"Junction {crossing_index:02d}",
                            road_min_lon,
                            road_max_lon,
                            road_min_lat,
                            road_max_lat,
                            approach,
                        )

                # Dedicated mid-block pedestrian crossings for schools/hospitals.
                def add_midblock_crosswalk_ew(name, center_lon, row_index):
                    nonlocal_crossing = None
                    road_min_lat = y_starts[row_index] + plot_height
                    road_max_lat = road_min_lat + horizontal_road_widths[row_index]
                    stripe_count = 6
                    stripe_gap = 0.000010
                    stripe_half_width = 0.000003

                    for stripe in range(stripe_count):
                        stripe_lon = (
                            center_lon
                            + (stripe - (stripe_count - 1) / 2) * stripe_gap
                        )
                        # crosswalk_count is in the outer function scope
                        nonlocal_crossing = stripe
                        _insert_colony_asset(
                            cursor,
                            "crosswalk",
                            f"{name} Stripe {stripe + 1}",
                            {"zone": name, "style": "zebra"},
                            "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                            (
                                stripe_lon - stripe_half_width,
                                road_min_lat + 0.000004,
                                stripe_lon + stripe_half_width,
                                road_max_lat - 0.000004,
                            ),
                        )
                    return stripe_count

                crosswalk_count += add_midblock_crosswalk_ew(
                    "School S01 Crossing",
                    x_starts[0] + plot_width * 0.56,
                    0,
                )
                crosswalk_count += add_midblock_crosswalk_ew(
                    "School S02 Crossing",
                    x_starts[14] + plot_width * 0.44,
                    8,
                )
                crosswalk_count += add_midblock_crosswalk_ew(
                    "Hospital H01 Crossing",
                    x_starts[13] + plot_width * 0.56,
                    0,
                )
                crosswalk_count += add_midblock_crosswalk_ew(
                    "Hospital H02 Crossing",
                    x_starts[1] + plot_width * 0.44,
                    7,
                )

                # -----------------------------------------
                # ROAD-SURFACE TEXT + DIRECTION ARROWS
                # -----------------------------------------

                road_text_count = 0

                def insert_road_text(
                    name,
                    text_value,
                    longitude,
                    latitude,
                    orientation="east_west",
                    width_m=13.0,
                    height_m=4.2,
                ):
                    nonlocal road_text_count
                    road_text_count += 1
                    _insert_colony_asset(
                        cursor,
                        "road_text",
                        name,
                        {
                            "text": text_value,
                            "orientation": orientation,
                            "width_m": width_m,
                            "height_m": height_m,
                            "paint": "white",
                        },
                        "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                        (longitude, latitude),
                    )

                # Warnings are intentionally separate and large, like actual road paint.
                insert_road_text(
                    "School S01 Warning",
                    "SCHOOL\nAHEAD",
                    x_starts[0] + plot_width / 2,
                    y_starts[0] + plot_height + horizontal_road_widths[0] / 2,
                    "east_west",
                    15.0,
                    5.2,
                )
                insert_road_text(
                    "School S02 Warning",
                    "SCHOOL\nAHEAD",
                    x_starts[14] + plot_width / 2,
                    y_starts[8] + plot_height + horizontal_road_widths[8] / 2,
                    "east_west",
                    15.0,
                    5.2,
                )
                insert_road_text(
                    "Hospital H01 Warning",
                    "HOSPITAL",
                    x_starts[13] + plot_width / 2,
                    y_starts[0] + plot_height + horizontal_road_widths[0] / 2,
                    "east_west",
                    15.0,
                    4.2,
                )
                insert_road_text(
                    "Hospital H02 Warning",
                    "HOSPITAL",
                    x_starts[1] + plot_width / 2,
                    y_starts[7] + plot_height + horizontal_road_widths[7] / 2,
                    "east_west",
                    15.0,
                    4.2,
                )
                insert_road_text(
                    "School S01 Slow Marking",
                    "SLOW",
                    x_starts[0] + plot_width * 0.82,
                    y_starts[0] + plot_height + horizontal_road_widths[0] / 2,
                    "east_west",
                    8.0,
                    3.6,
                )
                insert_road_text(
                    "School S02 Slow Marking",
                    "SLOW",
                    x_starts[14] + plot_width * 0.18,
                    y_starts[8] + plot_height + horizontal_road_widths[8] / 2,
                    "east_west",
                    8.0,
                    3.6,
                )
                insert_road_text(
                    "Hospital H01 Slow Marking",
                    "SLOW",
                    x_starts[13] + plot_width * 0.82,
                    y_starts[0] + plot_height + horizontal_road_widths[0] / 2,
                    "east_west",
                    8.0,
                    3.6,
                )
                insert_road_text(
                    "Hospital H02 Slow Marking",
                    "SLOW",
                    x_starts[1] + plot_width * 0.18,
                    y_starts[7] + plot_height + horizontal_road_widths[7] / 2,
                    "east_west",
                    8.0,
                    3.6,
                )
                insert_road_text(
                    "Main Entrance Speed Advisory",
                    "SLOW\n30",
                    township_center_lon,
                    base_lat - 0.000175,
                    "north_south",
                    9.0,
                    5.5,
                )

                road_arrow_count = 0
                arrow_points = [
                    (township_center_lon, base_lat - 0.000080, "north_south", 0),
                    (township_center_lon, base_lat - 0.000245, "north_south", 0),
                    (x_starts[2] + plot_width / 2, main_avenue_center_lat, "east_west", 0),
                    (x_starts[12] + plot_width / 2, main_avenue_center_lat, "east_west", 180),
                    (central_boulevard_center_lon, y_starts[1] + plot_height / 2, "north_south", 0),
                    (central_boulevard_center_lon, y_starts[8] + plot_height / 2, "north_south", 180),
                ]

                for arrow_index, (longitude, latitude, orientation, rotation_deg) in enumerate(
                    arrow_points,
                    start=1,
                ):
                    road_arrow_count += 1
                    _insert_colony_asset(
                        cursor,
                        "road_arrow",
                        f"Directional Arrow {arrow_index:02d}",
                        {
                            "orientation": orientation,
                            "rotation_deg": rotation_deg,
                            "width_m": 3.2,
                            "height_m": 6.5,
                        },
                        "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                        (longitude, latitude),
                    )

                # -----------------------------------------
                # TRAFFIC SIGNALS AT MAJOR CROSSROADS
                # -----------------------------------------

                traffic_signal_count = 0
                signal_intersections = [
                    (6, 3),
                    (6, 6),
                    (3, 3),
                    (10, 3),
                ]

                facing_vectors = {
                    "NE": (0.000020, 0.000020),
                    "NW": (-0.000020, 0.000020),
                    "SE": (0.000020, -0.000020),
                    "SW": (-0.000020, -0.000020),
                }

                for junction_index, (column_index, row_index) in enumerate(
                    signal_intersections,
                    start=1,
                ):
                    road_min_lon = x_starts[column_index] + plot_width
                    road_max_lon = road_min_lon + vertical_road_widths[column_index]
                    road_min_lat = y_starts[row_index] + plot_height
                    road_max_lat = road_min_lat + horizontal_road_widths[row_index]

                    signal_positions = [
                        (road_min_lon - 0.000010, road_min_lat - 0.000010, "NE"),
                        (road_max_lon + 0.000010, road_min_lat - 0.000010, "NW"),
                        (road_min_lon - 0.000010, road_max_lat + 0.000010, "SE"),
                        (road_max_lon + 0.000010, road_max_lat + 0.000010, "SW"),
                    ]

                    for longitude, latitude, facing in signal_positions:
                        traffic_signal_count += 1
                        delta_lon, delta_lat = facing_vectors[facing]
                        _insert_colony_asset(
                            cursor,
                            "traffic_signal",
                            f"Traffic Signal TS{traffic_signal_count:02d}",
                            {
                                "junction": junction_index,
                                "facing": facing,
                                "height_m": 5.2,
                                "arm_lon": longitude + delta_lon,
                                "arm_lat": latitude + delta_lat,
                                "display_state": "static_lenses",
                            },
                            "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                            (longitude, latitude),
                        )

                # -----------------------------------------
                # MODERN TWO-SIDED STREET LIGHTS
                # -----------------------------------------

                light_count = 0

                def insert_modern_light(
                    pole_lon,
                    pole_lat,
                    lamp_lon,
                    lamp_lat,
                    height_m,
                    road_name,
                    side,
                ):
                    nonlocal light_count
                    light_count += 1
                    _insert_colony_asset(
                        cursor,
                        "streetlight",
                        f"Modern Street Light L{light_count:03d}",
                        {
                            "height_m": height_m,
                            "status": "operational",
                            "style": "modern_led",
                            "road_name": road_name,
                            "side": side,
                            "lamp_lon": lamp_lon,
                            "lamp_lat": lamp_lat,
                        },
                        "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                        (pole_lon, pole_lat),
                    )

                # Both sides of all east-west roads. Spacing is roughly two plots.
                for row_index in range(rows - 1):
                    road_min_lat = y_starts[row_index] + plot_height
                    road_max_lat = road_min_lat + horizontal_road_widths[row_index]
                    is_main = row_index == 3
                    is_collector = row_index == 6
                    height_m = 10.0 if is_main else (9.0 if is_collector else 7.5)
                    road_name = (
                        "Township Central Avenue"
                        if is_main
                        else (
                            "South Collector Road"
                            if is_collector
                            else f"Residential Street EW-{row_index + 1:02d}"
                        )
                    )

                    for column_index in range(0, columns, 2):
                        longitude = x_starts[column_index] + plot_width / 2

                        south_pole_lat = road_min_lat - 0.000010
                        insert_modern_light(
                            longitude,
                            south_pole_lat,
                            longitude,
                            south_pole_lat + 0.000025,
                            height_m,
                            road_name,
                            "south",
                        )

                        north_pole_lat = road_max_lat + 0.000010
                        insert_modern_light(
                            longitude,
                            north_pole_lat,
                            longitude,
                            north_pole_lat - 0.000025,
                            height_m,
                            road_name,
                            "north",
                        )

                # Both sides of north-south roads.
                for column_index in range(columns - 1):
                    road_min_lon = x_starts[column_index] + plot_width
                    road_max_lon = road_min_lon + vertical_road_widths[column_index]
                    is_main = column_index == 6
                    height_m = 10.0 if is_main else 7.5
                    road_name = (
                        "North-South Central Boulevard"
                        if is_main
                        else f"Residential Street NS-{column_index + 1:02d}"
                    )

                    for row_index in range(0, rows, 2):
                        latitude = y_starts[row_index] + plot_height / 2

                        west_pole_lon = road_min_lon - 0.000010
                        insert_modern_light(
                            west_pole_lon,
                            latitude,
                            west_pole_lon + 0.000025,
                            latitude,
                            height_m,
                            road_name,
                            "west",
                        )

                        east_pole_lon = road_max_lon + 0.000010
                        insert_modern_light(
                            east_pole_lon,
                            latitude,
                            east_pole_lon - 0.000025,
                            latitude,
                            height_m,
                            road_name,
                            "east",
                        )

                # Entrance boulevard gets paired premium lights.
                for step in range(6):
                    latitude = base_lat - 0.000040 - step * 0.000045
                    west_pole_lon = township_center_lon - entrance_half_width - 0.000010
                    east_pole_lon = township_center_lon + entrance_half_width + 0.000010

                    insert_modern_light(
                        west_pole_lon,
                        latitude,
                        township_center_lon - entrance_half_width + 0.000018,
                        latitude,
                        10.0,
                        "Main Township Entrance Boulevard",
                        "west",
                    )
                    insert_modern_light(
                        east_pole_lon,
                        latitude,
                        township_center_lon + entrance_half_width - 0.000018,
                        latitude,
                        10.0,
                        "Main Township Entrance Boulevard",
                        "east",
                    )

                # -----------------------------------------
                # STEP 3.6 VEHICLE + STREETSCAPE VISUAL POLISH
                # -----------------------------------------

                vehicle_palette = [
                    "#d9dde2", "#3f5c77", "#8f3e3e",
                    "#d4b04d", "#40484f", "#6c8f76",
                ]

                # Parked vehicles + EV charging in both common parking areas.
                for plot in plots:
                    if plot["land_use"] != "parking":
                        continue

                    for row_fraction in (0.30, 0.70):
                        for column_number, column_fraction in enumerate(
                            (0.14, 0.34, 0.54, 0.74),
                            start=1,
                        ):
                            insert_vehicle(
                                f"{plot['name']} Parked Car {vehicle_count + 1:03d}",
                                plot["min_lon"] + plot_width * column_fraction,
                                plot["min_lat"] + plot_height * row_fraction,
                                heading_deg=90,
                                color=vehicle_palette[(vehicle_count + column_number) % len(vehicle_palette)],
                                context=plot["name"],
                            )

                    for charger_fraction in (0.86, 0.93):
                        ev_charger_count += 1
                        _insert_colony_asset(
                            cursor,
                            "ev_charger",
                            f"EV Charger EV{ev_charger_count:02d}",
                            {
                                "parent_ulpin": plot["ulpin"],
                                "power_kw": 22,
                                "text": "EV",
                            },
                            "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                            (
                                plot["min_lon"] + plot_width * charger_fraction,
                                plot["min_lat"] + plot_height * 0.18,
                            ),
                        )

                # Civic destinations get a small amount of recognisable traffic.
                for plot in plots:
                    if plot["land_use"] == "hospital":
                        for ambulance_index in range(2):
                            insert_vehicle(
                                f"{plot['name']} Ambulance {ambulance_index + 1}",
                                plot["min_lon"] + 0.000080 + ambulance_index * 0.000060,
                                plot["min_lat"] + 0.000037,
                                heading_deg=0,
                                length_m=5.4,
                                width_m=2.1,
                                height_m=2.45,
                                color="#f3f3ef",
                                vehicle_kind="ambulance",
                                context=plot["name"],
                            )

                    elif plot["land_use"] == "shopping":
                        for index, fraction in enumerate((0.18, 0.34, 0.50, 0.66, 0.82)):
                            insert_vehicle(
                                f"Market Square Visitor Car {index + 1}",
                                plot["min_lon"] + plot_width * fraction,
                                plot["min_lat"] + 0.000050,
                                heading_deg=90,
                                color=vehicle_palette[(vehicle_count + index) % len(vehicle_palette)],
                                context="Market Square",
                            )

                    elif plot["land_use"] == "school":
                        insert_vehicle(
                            f"{plot['name']} School Shuttle",
                            plot["min_lon"] + plot_width * 0.50,
                            plot["min_lat"] + 0.000045,
                            heading_deg=0,
                            length_m=8.8,
                            width_m=2.45,
                            height_m=3.05,
                            color="#d8b43b",
                            vehicle_kind="school_bus",
                            context=plot["name"],
                        )

                # Light road traffic on the two principal axes.
                for column_index in (1, 4, 8, 11, 13):
                    longitude = x_starts[column_index] + plot_width / 2
                    insert_vehicle(
                        f"Central Avenue Eastbound Car {column_index:02d}",
                        longitude,
                        main_avenue_center_lat - 0.000028,
                        heading_deg=0,
                        color=vehicle_palette[column_index % len(vehicle_palette)],
                        context="Township Central Avenue",
                    )
                    insert_vehicle(
                        f"Central Avenue Westbound Car {column_index:02d}",
                        longitude,
                        main_avenue_center_lat + 0.000028,
                        heading_deg=180,
                        color=vehicle_palette[(column_index + 2) % len(vehicle_palette)],
                        context="Township Central Avenue",
                    )

                for row_index in (1, 3, 5, 7, 8):
                    latitude = y_starts[row_index] + plot_height / 2
                    insert_vehicle(
                        f"Central Boulevard Northbound Car {row_index:02d}",
                        central_boulevard_center_lon - 0.000030,
                        latitude,
                        heading_deg=90,
                        color=vehicle_palette[(row_index + 1) % len(vehicle_palette)],
                        context="North-South Central Boulevard",
                    )
                    insert_vehicle(
                        f"Central Boulevard Southbound Car {row_index:02d}",
                        central_boulevard_center_lon + 0.000030,
                        latitude,
                        heading_deg=270,
                        color=vehicle_palette[(row_index + 4) % len(vehicle_palette)],
                        context="North-South Central Boulevard",
                    )

                insert_vehicle(
                    "CadastraX3D Township Shuttle East",
                    x_starts[2] + plot_width / 2,
                    main_avenue_center_lat - 0.000052,
                    heading_deg=0,
                    length_m=10.5,
                    width_m=2.55,
                    height_m=3.25,
                    color="#d4aa37",
                    vehicle_kind="township_bus",
                    context="Township Central Avenue",
                )
                insert_vehicle(
                    "CadastraX3D Township Shuttle North",
                    central_boulevard_center_lon + 0.000052,
                    y_starts[7] + plot_height / 2,
                    heading_deg=90,
                    length_m=10.5,
                    width_m=2.55,
                    height_m=3.25,
                    color="#d4aa37",
                    vehicle_kind="township_bus",
                    context="North-South Central Boulevard",
                )

                # Four compact shelters along the main transit corridors.
                bus_shelters = [
                    ("Central Avenue West Bus Shelter", x_starts[2] + plot_width / 2, main_avenue_center_lat + 0.000094, "east_west"),
                    ("Central Avenue East Bus Shelter", x_starts[12] + plot_width / 2, main_avenue_center_lat - 0.000094, "east_west"),
                    ("Central Boulevard North Bus Shelter", central_boulevard_center_lon + 0.000102, y_starts[7] + plot_height / 2, "north_south"),
                    ("Central Boulevard South Bus Shelter", central_boulevard_center_lon - 0.000102, y_starts[2] + plot_height / 2, "north_south"),
                ]

                for shelter_name, shelter_lon, shelter_lat, orientation in bus_shelters:
                    bus_shelter_count += 1
                    if orientation == "east_west":
                        half_lon = 4.0 / 97300.0
                        half_lat = 1.5 / 111000.0
                    else:
                        half_lon = 1.5 / 97300.0
                        half_lat = 4.0 / 111000.0

                    _insert_colony_asset(
                        cursor,
                        "bus_shelter",
                        shelter_name,
                        {
                            "orientation": orientation,
                            "heading_deg": 0 if orientation == "east_west" else 90,
                            "center_lon": shelter_lon,
                            "center_lat": shelter_lat,
                            "length_m": 8.0,
                            "width_m": 3.0,
                            "height_m": 2.8,
                            "text": "BUS STOP",
                            "visual_profile": "glass_shelter",
                        },
                        "ST_MakeEnvelope(%s, %s, %s, %s, 4326)",
                        (
                            shelter_lon - half_lon,
                            shelter_lat - half_lat,
                            shelter_lon + half_lon,
                            shelter_lat + half_lat,
                        ),
                    )
                    # Place the stop pole just outside the shelter instead of
                    # through its centre, improving the ground-level read.
                    if orientation == "east_west":
                        sign_lon = shelter_lon + 4.35 / 97300.0
                        sign_lat = shelter_lat - 1.72 / 111000.0
                        sign_heading = 0
                    else:
                        sign_lon = shelter_lon + 1.72 / 97300.0
                        sign_lat = shelter_lat + 4.35 / 111000.0
                        sign_heading = 90

                    _insert_colony_asset(
                        cursor,
                        "bus_stop_sign",
                        f"{shelter_name} Sign",
                        {
                            "text": "BUS",
                            "height_m": 2.55,
                            "heading_deg": sign_heading,
                            "visual_profile": "compact_bus_stop",
                        },
                        "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                        (sign_lon, sign_lat),
                    )

                wayfinding_specs = [
                    ("Central Avenue Sign", township_center_lon - 0.00016, main_avenue_center_lat + 0.000075, "CENTRAL AVE", "road", 0),
                    ("North District Sign", central_boulevard_center_lon + 0.000080, y_starts[8] + plot_height * 0.55, "NORTH DISTRICT", "district", 90),
                    ("South District Sign", central_boulevard_center_lon - 0.000080, y_starts[1] + plot_height * 0.45, "SOUTH DISTRICT", "district", 90),
                    ("Hospital Direction Sign", x_starts[12] + plot_width * 0.75, y_starts[1] + plot_height * 0.50, "HOSPITAL →", "destination", 0),
                    ("Market Direction Sign", x_starts[8] + plot_width * 0.45, y_starts[4] + plot_height * 0.18, "MARKET →", "destination", 0),
                    ("School Direction Sign", x_starts[1] + plot_width * 0.20, y_starts[0] + plot_height * 0.75, "← SCHOOL", "destination", 0),
                ]

                for sign_name, longitude, latitude, sign_text, sign_category, sign_heading in wayfinding_specs:
                    wayfinding_sign_count += 1
                    _insert_colony_asset(
                        cursor,
                        "wayfinding_sign",
                        sign_name,
                        {
                            "text": sign_text,
                            "height_m": 2.75,
                            "category": sign_category,
                            "heading_deg": sign_heading,
                            "visual_profile": "compact_wayfinding",
                        },
                        "ST_SetSRID(ST_MakePoint(%s, %s), 4326)",
                        (longitude, latitude),
                    )

        return {
            "success": True,
            "message": "Bhumi3D Township V3 Step 3.7B interaction hotfix generated successfully",
            "version": "township_v3_step3_7b_hotfix",
            "blocks": ["A", "B", "C", "D"],
            "apartment_units_per_floor": 6,
            "plot_count": 150,
            "apartment_plot_count": 50,
            "residential_plot_count": 80,
            "amenity_plot_count": 20,
            "school_count": 2,
            "hospital_count": 2,
            "gym_count": 1,
            "shopping_count": 1,
            "park_count": 4,
            "parking_count": 2,
            "apartment_building_count": 50,
            "residential_building_count": residential_building_count,
            "civic_building_count": civic_building_count,
            "building_feature_count": building_feature_count,
            "road_count": road_count,
            "streetlight_count": light_count,
            "road_marking_count": marking_count,
            "crosswalk_stripe_count": crosswalk_count,
            "road_text_count": road_text_count,
            "road_arrow_count": road_arrow_count,
            "traffic_signal_count": traffic_signal_count,
            "stop_line_count": stop_line_count,
            "median_count": median_count,
            "tree_count": tree_count,
            "park_path_count": park_path_count,
            "parking_bay_count": parking_bay_count,
            "special_visual_count": special_visual_count,
            "sidewalk_count": sidewalk_count,
            "landscape_strip_count": landscape_strip_count,
            "park_bench_count": park_bench_count,
            "ground_asset_count": ground_asset_count,
            "green_belt_count": green_belt_count,
            "entrance_detail_count": entrance_detail_count,
            "vehicle_count": vehicle_count,
            "bus_shelter_count": bus_shelter_count,
            "wayfinding_sign_count": wayfinding_sign_count,
            "ev_charger_count": ev_charger_count,
            "entrance_name": "CadastraX3D Township",
            "apartment_floor_total": sum(apartment_floors),
            "highest_apartment_floors": max(apartment_floors),
            "registered_3d_unit_count": registered_3d_unit_count,
            "future_apartment_capacity_at_6_units_per_floor": (
                sum(apartment_floors) * 6
            ),
            "note": (
                "Step 3.7A persists every apartment as a PostGIS volumetric cadastral unit with its own "
                "proposed linked 3D ULPIN, keeps on-demand Cesium inspection for performance, repairs plot/building "
                "address naming, and strengthens the judge-facing vertical cadastre without permanently "
                "rendering thousands of apartment volumes."
            ),
        }

    except HTTPException:
        raise

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Township generation error: {error}",
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

                ensure_township_address_table(cursor)

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
                    SELECT block_code, address_number, address_code, building_code
                    FROM township_addresses
                    WHERE parent_ulpin = %s
                    LIMIT 1;
                    """,
                    (parent_ulpin,),
                )
                township_address = cursor.fetchone()

                if township_address and township_address[3]:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Plot {township_address[2]} already has an indexed building "
                            f"({township_address[3]}). Choose a vacant township plot."
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
                    "block_code": township_address[0] if township_address else None,
                    "address_number": township_address[1] if township_address else None,
                    "address_code": township_address[2] if township_address else building_code,
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

                if township_address:
                    cursor.execute(
                        """
                        UPDATE township_addresses
                        SET
                            building_feature_id = %s,
                            building_code = %s,
                            building_name = %s,
                            building_type = 'Apartment Tower',
                            floors = %s,
                            units_per_floor = %s,
                            floor_height = %s,
                            height_m = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE parent_ulpin = %s;
                        """,
                        (
                            feature_id, building_code, f"Building {building_code}",
                            request.floors, request.units_per_floor, request.floor_height,
                            request.floors * request.floor_height, parent_ulpin,
                        ),
                    )

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

                        unit_letter = chr(ord("A") + unit_index - 1)
                        unit_code = f"{floor_number}-{unit_letter}"

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
                        # Human-facing township convention:
                        # floor 1, unit 1 → 1-A
                        # floor 4, unit 3 → 4-C
                        # floor 10, unit 1 → 10-A

                        unit_letter = chr(ord("A") + unit_index - 1)
                        unit_code = f"{floor_number}-{unit_letter}"


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


                            unit_letter = chr(ord("A") + unit_index - 1)
                            unit_code = f"{floor_number}-{unit_letter}"


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
