export type CatalogFacility = {
  id: string;
  label: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

export const FACILITY_CATALOG: CatalogFacility[] = [
  { id: "esif", label: "NLR / ESIF — Golden, CO", name: "NLR / ESIF HPC", latitude: 39.7427, longitude: -105.1701, timezone: "America/Denver" },
  { id: "frontier", label: "ORNL Frontier — Oak Ridge, TN", name: "ORNL Frontier", latitude: 35.9313, longitude: -84.3104, timezone: "America/New_York" },
  { id: "berkeley", label: "Google Berkeley County, SC", name: "Google Berkeley County", latitude: 33.196, longitude: -79.995, timezone: "America/New_York" },
  { id: "midlothian", label: "Google Midlothian, TX", name: "Google Midlothian", latitude: 32.4824, longitude: -96.9945, timezone: "America/Chicago" },
  { id: "mesa", label: "Meta Mesa, AZ", name: "Meta Mesa", latitude: 33.354884, longitude: -111.635759, timezone: "America/Phoenix" },
];

export const CATALOG_MATCH_RADIUS_KM = 10;

export function distanceKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const earthRadiusKm = 6371.0088;
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearestCatalogFacility(latitude: number, longitude: number) {
  return FACILITY_CATALOG
    .map((facility) => ({ facility, distanceKm: distanceKm(latitude, longitude, facility.latitude, facility.longitude) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}
