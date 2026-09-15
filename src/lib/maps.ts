export function mapsUrl(
  address: string,
  lat: number | null,
  lng: number | null,
): string {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/\s/g, "")}`;
}
