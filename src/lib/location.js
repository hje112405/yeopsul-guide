function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function calculateDistanceKm(firstPosition, secondPosition) {
  const earthRadiusKm = 6371;
  const latDifference = toRadians(secondPosition.lat - firstPosition.lat);
  const lngDifference = toRadians(secondPosition.lng - firstPosition.lng);
  const firstLat = toRadians(firstPosition.lat);
  const secondLat = toRadians(secondPosition.lat);
  const haversineValue =
    Math.sin(latDifference / 2) ** 2 +
    Math.cos(firstLat) *
      Math.cos(secondLat) *
      Math.sin(lngDifference / 2) ** 2;

  return (
    2 *
    earthRadiusKm *
    Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue))
  );
}

export function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) return null;
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)}m`
    : `${distanceKm.toFixed(1)}km`;
}
