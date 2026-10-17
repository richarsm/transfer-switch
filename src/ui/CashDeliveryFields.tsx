import { Link } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import type { OperationKind } from "../domain/types";
import { provinceMapCenter, CUBA_CENTER } from "../lib/provinces";
import { MapPicker } from "./MapPicker";

type Props = {
  kind: Extract<OperationKind, "cash_cup" | "cash_usd">;
  provinceId: string;
  courierId: string;
  name: string;
  phone: string;
  address: string;
  mapLat: string;
  mapLng: string;
  payoutCurrency: string;
  stockedEmpty: boolean;
  onProvince: (id: string) => void;
  onCourier: (id: string) => void;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onAddress: (value: string) => void;
  onMap: (next: { address?: string; lat: string; lng: string }) => void;
};

export function CashDeliveryFields({
  kind,
  provinceId,
  courierId,
  name,
  phone,
  address,
  mapLat,
  mapLng,
  payoutCurrency,
  stockedEmpty,
  onProvince,
  onCourier,
  onName,
  onPhone,
  onAddress,
  onMap,
}: Props) {
  const store = useStore();
  const stocked = store.snapshot.provinces.filter((p) => {
    const room = store.provinceHeadroom(p.id);
    return kind === "cash_usd" ? room.cashUsdLeft > 0 : room.cashCupLeft > 0;
  });
  const selected = store.snapshot.provinces.find((p) => p.id === provinceId);
  const provinces =
    selected && !stocked.some((p) => p.id === selected.id) ? [selected, ...stocked] : stocked;
  const couriers = (store.snapshot.couriers ?? []).filter(
    (c) => c.active && c.provinceId === provinceId,
  );
  const selectedCourier = couriers.find((c) => c.id === courierId);
  const center = selected ? provinceMapCenter(selected.code) : CUBA_CENTER;

  function pickProvince(id: string) {
    onProvince(id);
    const still = (store.snapshot.couriers ?? []).some(
      (c) => c.active && c.provinceId === id && c.id === courierId,
    );
    if (!still) onCourier("");
  }

  function pickCourier(id: string) {
    onCourier(id);
    const courier = couriers.find((c) => c.id === id);
    if (courier) {
      onName(courier.name);
      onPhone(courier.phone);
    }
  }

  return (
    <div className="step-body">
      <p className="muted" style={{ margin: 0 }}>
        Elige la provincia y la persona que hará la entrega del efectivo.
      </p>
      <div className="grid-2">
        <label className="field">
          Provincia de entrega
          <select required value={provinceId} onChange={(e) => pickProvince(e.target.value)}>
            <option value="">Selecciona provincia</option>
            {provinces.map((p) => {
              const room = store.provinceHeadroom(p.id);
              const left = kind === "cash_usd" ? room.cashUsdLeft : room.cashCupLeft;
              return (
                <option key={p.id} value={p.id}>
                  {p.name} · {left} {payoutCurrency}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field">
          Quien entrega el efectivo
          <select
            required
            value={selectedCourier?.id ?? ""}
            onChange={(e) => pickCourier(e.target.value)}
            disabled={!provinceId}
          >
            <option value="">
              {provinceId
                ? couriers.length
                  ? "Selecciona repartidor"
                  : "No hay repartidores en esta provincia"
                : "Primero elige provincia"}
            </option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          Nombre
          <input
            placeholder="Nombre y apellidos"
            value={name}
            onChange={(e) => onName(e.target.value)}
          />
        </label>
        <label className="field">
          Teléfono
          <input
            placeholder="+53 ..."
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
          />
        </label>
      </div>
      {provinceId && couriers.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No hay repartidores activos en esta provincia.{" "}
          <Link to="/provincias">Regístralos en Provincias</Link> para poder crear la entrega.
        </p>
      ) : null}
      <label className="field">
        Dirección de entrega en Cuba
        <input
          placeholder="Barrio, calle, número. Escríbela o ábrela en el mapa."
          value={address}
          onChange={(e) => onAddress(e.target.value)}
        />
      </label>
      <p className="muted" style={{ margin: 0 }}>
        Puedes abrir el mapa de Cuba para sugerir la dirección de entrega, o escribirla a mano.
      </p>
      <MapPicker
        key={provinceId || "cuba"}
        address={address}
        lat={mapLat}
        lng={mapLng}
        fallbackCenter={center}
        fallbackZoom={selected ? 12 : 6}
        showMyLocation={false}
        mapsFallbackQuery={`${selected?.name ?? "Cuba"} Cuba`}
        hint="Toca el mapa en Cuba para sugerir la dirección. Después puedes corregirla a mano."
        openButtonLabel="Abrir mapa de entrega"
        closeButtonLabel="Cerrar mapa de entrega"
        pastePlaceholder="https://maps.google.com/... o 23.1136, -82.3666"
        onChange={onMap}
      />
      {stockedEmpty ? (
        <p className="muted">
          No hay provincias con disponibilidad de {payoutCurrency}. Cárgala en Provincias.
        </p>
      ) : null}
    </div>
  );
}
