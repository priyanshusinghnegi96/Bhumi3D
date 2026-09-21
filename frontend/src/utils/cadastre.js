export const PRODUCT_NAME = "CadastraX3D";

const APARTMENT_BUILDING_TERMS = [
  "apartment",
  "residential tower",
  "housing tower",
  "multi-family",
  "multifamily",
  "condominium",
];

export function isApartmentBuilding(buildingOrType, fallbackName = "") {
  const building =
    buildingOrType && typeof buildingOrType === "object"
      ? buildingOrType
      : { buildingType: buildingOrType, buildingName: fallbackName };

  if (typeof building.supportsApartmentUnits === "boolean") {
    return building.supportsApartmentUnits;
  }

  const identity = [
    building.buildingType,
    building.building_type,
    building.buildingName,
    building.building_name,
    building.name,
    fallbackName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return APARTMENT_BUILDING_TERMS.some((term) => identity.includes(term));
}

export function formatMeasurement(value, maximumFractionDigits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";

  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
    useGrouping: false,
  }).format(number);
}

export function formatVerticalRange(zMin, zMax) {
  if (!Number.isFinite(Number(zMin)) || !Number.isFinite(Number(zMax))) {
    return "—";
  }

  return `${formatMeasurement(zMin)}m – ${formatMeasurement(zMax)}m`;
}

export function formatVerticalRangeValue(value) {
  const text = String(value ?? "").trim();
  const match = text.match(
    /^(-?\d+(?:\.\d+)?)\s*m?\s*(?:–|—|to|-)\s*(-?\d+(?:\.\d+)?)\s*m?$/i
  );

  return match ? formatVerticalRange(match[1], match[2]) : text || "—";
}
