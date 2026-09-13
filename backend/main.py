import os

import psycopg

from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware


# ==========================================
# LOAD ENVIRONMENT VARIABLES
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
# FASTAPI APP
# ==========================================

app = FastAPI(
    title="Bhumi3D API",
    description=(
        "Backend API for the Bhumi3D "
        "3D ULPIN and Vertical Property "
        "Mapping System"
    ),
    version="0.3.0",
)


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

@app.get("/")
def home():

    return {
        "message": "Bhumi3D API is running",
        "status": "success",
        "database": "PostgreSQL + PostGIS",
    }


# ==========================================
# DATABASE HEALTH CHECK
# ==========================================

@app.get("/health/database")
def database_health():

    try:

        with get_connection() as connection:

            with connection.cursor() as cursor:

                cursor.execute(
                    "SELECT PostGIS_Version();"
                )

                postgis_version = (
                    cursor.fetchone()[0]
                )


        return {
            "status": "connected",
            "database": "bhumi3d",
            "postgis_version":
                postgis_version,
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


# ==========================================
# GET PROPERTY BY UNIT
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
# SEARCH
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