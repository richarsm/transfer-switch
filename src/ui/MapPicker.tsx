import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GEORGETOWN, mapsUrl, parseMapsCoords } from "../lib/maps";

type Props = {
  address: string;
  lat: string;
  lng: string;
  onChange: (next: { address?: string; lat: string; lng: string }) => void;
  fallbackCenter?: { lat: number; lng: number };
  fallbackZoom?: number;
  hint?: string;
  showMyLocation?: boolean;
  mapsFallbackQuery?: string;
  defaultOpen?: boolean;
  openButtonLabel?: string;
  closeButtonLabel?: string;
  pastePlaceholder?: string;
};

export function MapPicker({
  address,
  lat,
  lng,
  onChange,
  fallbackCenter = GEORGETOWN,
  fallbackZoom = 13,
  hint = "Toca el mapa para fijar el punto. También puedes pegar un enlace de Google Maps.",
  showMyLocation = true,
  mapsFallbackQuery,
  defaultOpen = false,
  openButtonLabel = "Elegir punto en el mapa",
  closeButtonLabel = "Ocultar mapa",
  pastePlaceholder = "https://maps.google.com/... o 6.8013, -58.1551",
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [paste, setPaste] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markRef = useRef<L.CircleMarker | null>(null);
  const latN = Number(lat);
  const lngN = Number(lng);
  const hasPoint = lat.trim() !== "" && lng.trim() !== "" && Number.isFinite(latN) && Number.isFinite(lngN);
  const googleHref = mapsUrl(
    address.trim() || mapsFallbackQuery || "",
    hasPoint ? latN : null,
    hasPoint ? lngN : null,
  );

  useEffect(() => {
    if (!open || !host.current || mapRef.current) return;
    const start = hasPoint ? { lat: latN, lng: lngN } : fallbackCenter;
    const map = L.map(host.current, { zoomControl: true }).setView(
      [start.lat, start.lng],
      hasPoint ? 16 : fallbackZoom,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    if (hasPoint) placeMark(map, latN, lngN);
    map.on("click", (e: L.LeafletMouseEvent) => {
      const nextLat = e.latlng.lat.toFixed(6);
      const nextLng = e.latlng.lng.toFixed(6);
      placeMark(map, e.latlng.lat, e.latlng.lng);
      onChange({ lat: nextLat, lng: nextLng });
      void reverseAddress(e.latlng.lat, e.latlng.lng).then((label) => {
        if (label) onChange({ lat: nextLat, lng: nextLng, address: label });
      });
    });
    requestAnimationFrame(() => map.invalidateSize());
    return () => {
      map.remove();
      mapRef.current = null;
      markRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasPoint) return;
    placeMark(map, latN, lngN);
    map.setView([latN, lngN], Math.max(map.getZoom(), 15));
  }, [hasPoint, latN, lngN]);

  function placeMark(map: L.Map, nextLat: number, nextLng: number) {
    if (markRef.current) {
      markRef.current.setLatLng([nextLat, nextLng]);
      return;
    }
    markRef.current = L.circleMarker([nextLat, nextLng], {
      radius: 9,
      color: "#16362c",
      weight: 2,
      fillColor: "#d7b56a",
      fillOpacity: 1,
    }).addTo(map);
  }

  function applyPaste() {
    const parsed = parseMapsCoords(paste);
    if (!parsed) return;
    onChange({ lat: parsed.lat.toFixed(6), lng: parsed.lng.toFixed(6) });
    setPaste("");
    setOpen(true);
  }

  return (
    <div className="map-picker">
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => setOpen((v) => !v)}>
          {open ? closeButtonLabel : openButtonLabel}
        </button>
        <a className="btn ghost" href={googleHref} target="_blank" rel="noreferrer">
          Abrir Google Maps
        </a>
        {showMyLocation ? (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition((pos) => {
                onChange({
                  lat: pos.coords.latitude.toFixed(6),
                  lng: pos.coords.longitude.toFixed(6),
                });
                setOpen(true);
              });
            }}
          >
            Usar mi ubicación
          </button>
        ) : null}
      </div>
      {open ? (
        <>
          <p className="muted" style={{ margin: "8px 0 0" }}>
            {hint}
          </p>
          <div ref={host} className="map-host" />
        </>
      ) : null}
      <label className="field">
        Pegar enlace o coordenadas de Google Maps
        <input
          value={paste}
          placeholder={pastePlaceholder}
          onChange={(e) => setPaste(e.target.value)}
          onBlur={applyPaste}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyPaste();
            }
          }}
        />
      </label>
      {hasPoint ? (
        <p className="muted" style={{ margin: 0 }}>
          Punto guardado: {latN.toFixed(5)}, {lngN.toFixed(5)}
        </p>
      ) : null}
    </div>
  );
}

async function reverseAddress(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? null;
  } catch {
    return null;
  }
}
