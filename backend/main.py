from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(
    title="Bhumi3D API",
    description="Backend API for the Bhumi3D 3D ULPIN and Vertical Property Mapping System",
    version="0.1.0",
)


# Allow the React frontend to communicate with FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Temporary prototype data
properties = [
    {
        "type": "Apartment",
        "parent_ulpin": "ABC12345678901",
        "property_id": "ABC12345678901-B01-L04-U403",
        "building": "B01",
        "floor": "04",
        "unit": "403",
        "z_min": 21,
        "z_max": 28,
        "validation": "Not checked",
    },
    {
        "type": "Apartment",
        "parent_ulpin": "ABC12345678901",
        "property_id": "ABC12345678901-B01-L04-U404",
        "building": "B01",
        "floor": "04",
        "unit": "404",
        "z_min": 21,
        "z_max": 28,
        "validation": "Not checked",
    },
    {
        "type": "Basement Parking",
        "parent_ulpin": "ABC12345678901",
        "property_id": "ABC12345678901-B01-B01-P03",
        "building": "B01",
        "floor": "Basement 1",
        "unit": "P03",
        "z_min": -6,
        "z_max": -1,
        "validation": "Not checked",
    },
    {
        "type": "Underground Utility",
        "parent_ulpin": "ABC12345678901",
        "property_id": "ABC12345678901-UG-WATER-001",
        "building": None,
        "floor": "Underground",
        "unit": "W-001",
        "z_min": -6,
        "z_max": -4,
        "validation": "Not checked",
    },
]


@app.get("/")
def home():
    return {
        "message": "Bhumi3D API is running",
        "status": "success",
    }


@app.get("/properties")
def get_properties():
    return properties


@app.get("/properties/{unit}")
def get_property(unit: str):
    for property_record in properties:
        if property_record["unit"].lower() == unit.lower():
            return property_record

    return {
        "error": "Property not found"
    }