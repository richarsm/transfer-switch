export const CUBA_CENTER = { lat: 21.5, lng: -79.0 };

export const CUBA_PROVINCES = [
  { code: "PRI", name: "Pinar del Río", lat: 22.417, lng: -83.698 },
  { code: "ART", name: "Artemisa", lat: 22.813, lng: -82.762 },
  { code: "HAB", name: "La Habana", lat: 23.114, lng: -82.367 },
  { code: "MAY", name: "Mayabeque", lat: 22.909, lng: -82.151 },
  { code: "MAT", name: "Matanzas", lat: 23.051, lng: -81.575 },
  { code: "CFG", name: "Cienfuegos", lat: 22.15, lng: -80.444 },
  { code: "VCL", name: "Villa Clara", lat: 22.407, lng: -79.965 },
  { code: "SSP", name: "Sancti Spíritus", lat: 21.93, lng: -79.443 },
  { code: "CAV", name: "Ciego de Ávila", lat: 21.848, lng: -78.763 },
  { code: "CMG", name: "Camagüey", lat: 21.381, lng: -77.917 },
  { code: "LTU", name: "Las Tunas", lat: 20.962, lng: -76.951 },
  { code: "HOL", name: "Holguín", lat: 20.887, lng: -76.263 },
  { code: "GRA", name: "Granma", lat: 20.378, lng: -76.643 },
  { code: "SCU", name: "Santiago de Cuba", lat: 20.021, lng: -75.827 },
  { code: "GTM", name: "Guantánamo", lat: 20.144, lng: -75.209 },
  { code: "IJV", name: "Isla de la Juventud", lat: 21.691, lng: -82.823 },
] as const;

export function provinceMapCenter(code: string): { lat: number; lng: number } {
  const found = CUBA_PROVINCES.find((p) => p.code === code);
  return found ? { lat: found.lat, lng: found.lng } : CUBA_CENTER;
}
