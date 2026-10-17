export const GEORGETOWN = { lat: 6.8013, lng: -58.1551 };

export function mapsUrl(
  address: string,
  lat: number | null,
  lng: number | null,
): string {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  const query = address.trim() || "Georgetown Guyana";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function parseMapsCoords(raw: string): { lat: number; lng: number } | null {
  const text = raw.trim();
  if (!text) return null;
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  const bang = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bang) return { lat: Number(bang[1]), lng: Number(bang[2]) };
  const query = text.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (query) return { lat: Number(query[1]), lng: Number(query[2]) };
  const pair = text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (pair) return { lat: Number(pair[1]), lng: Number(pair[2]) };
  return null;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/\s/g, "")}`;
}
