import { useState, type FormEvent } from "react";
import { useStore } from "../data/StoreContext";
import { formatMoney, parseAmount } from "../lib/money";
import type { TravelKind, TravelStatus } from "../domain/types";

export function TravelPage() {
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const id = store.upsertTravel({
        id: editing && editing !== "new" ? editing : undefined,
        kind: String(form.get("kind")) as TravelKind,
        title: String(form.get("title") ?? ""),
        origin: String(form.get("origin") ?? ""),
        destination: String(form.get("destination") ?? ""),
        priceGyn: parseAmount(String(form.get("priceGyn") ?? "")),
        priceCup: parseAmount(String(form.get("priceCup") ?? "")),
        priceUsdt: parseAmount(String(form.get("priceUsdt") ?? "")),
        seats: Number(form.get("seats") ?? 0),
        status: String(form.get("status")) as TravelStatus,
        notes: String(form.get("notes") ?? ""),
      });
      const rawLegs = String(form.get("itinerary") ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [origin, destination, departsAt, vehicle] = line.split("|").map((s) => s.trim());
          return {
            origin: origin ?? "",
            destination: destination ?? "",
            departsAt: departsAt ?? "",
            vehicle: vehicle ?? "",
            notes: "",
          };
        });
      store.replaceItinerary(id, rawLegs);
      setEditing(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Pasajes y traslados</h1>
        <button className="btn primary" onClick={() => setEditing("new")}>
          Nueva oferta
        </button>
      </div>
      <p className="muted">Gestión compartida: administrador y operador.</p>
      {error ? <div className="error">{error}</div> : null}
      {store.snapshot.travels.map((offer) => {
        const legs = store.snapshot.itineraries
          .filter((l) => l.offerId === offer.id)
          .sort((a, b) => a.order - b.order);
        return (
          <article className="card" key={offer.id} style={{ marginBottom: 12 }}>
            <div className="page-head">
              <h2>{offer.title}</h2>
              <span className="badge">
                {offer.kind === "flight" ? "Avión" : "Traslado"} · {offer.status}
              </span>
            </div>
            <p>
              {offer.origin} → {offer.destination} · {offer.seats} plazas
            </p>
            <p>
              {formatMoney(offer.priceGyn, "GYN")} · {formatMoney(offer.priceUsdt, "USDT")} ·{" "}
              {formatMoney(offer.priceCup, "CUP")}
            </p>
            <ol>
              {legs.map((leg) => (
                <li key={leg.id}>
                  {leg.origin} → {leg.destination} · {leg.departsAt} · {leg.vehicle}
                </li>
              ))}
            </ol>
            <button className="btn ghost" onClick={() => setEditing(offer.id)}>
              Editar
            </button>
          </article>
        );
      })}
      {editing ? (
        <TravelForm
          key={editing}
          offerId={editing === "new" ? null : editing}
          onSubmit={onSubmit}
          onCancel={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function TravelForm({
  offerId,
  onSubmit,
  onCancel,
}: {
  offerId: string | null;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const store = useStore();
  const offer = offerId ? store.snapshot.travels.find((t) => t.id === offerId) : null;
  const legs = offer
    ? store.snapshot.itineraries
        .filter((l) => l.offerId === offer.id)
        .sort((a, b) => a.order - b.order)
        .map((l) => `${l.origin} | ${l.destination} | ${l.departsAt} | ${l.vehicle}`)
        .join("\n")
    : "";

  return (
    <form className="card" onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
      <h2>{offer ? "Editar oferta" : "Nueva oferta"}</h2>
      <div className="grid-2">
        <label className="field">
          Título
          <input name="title" defaultValue={offer?.title} required />
        </label>
        <label className="field">
          Tipo
          <select name="kind" defaultValue={offer?.kind ?? "flight"}>
            <option value="flight">Avión</option>
            <option value="ground">Traslado</option>
          </select>
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          Origen
          <input name="origin" defaultValue={offer?.origin} required />
        </label>
        <label className="field">
          Destino
          <input name="destination" defaultValue={offer?.destination} required />
        </label>
      </div>
      <div className="grid-3">
        <label className="field">
          Precio GYN
          <input name="priceGyn" defaultValue={offer?.priceGyn ?? 0} />
        </label>
        <label className="field">
          Precio USDT
          <input name="priceUsdt" defaultValue={offer?.priceUsdt ?? 0} />
        </label>
        <label className="field">
          Precio CUP
          <input name="priceCup" defaultValue={offer?.priceCup ?? 0} />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          Plazas
          <input name="seats" type="number" defaultValue={offer?.seats ?? 1} />
        </label>
        <label className="field">
          Estado
          <select name="status" defaultValue={offer?.status ?? "draft"}>
            <option value="draft">Borrador</option>
            <option value="published">Publicada</option>
            <option value="sold_out">Agotada</option>
            <option value="archived">Archivada</option>
          </select>
        </label>
      </div>
      <label className="field">
        Itinerario (una línea por tramo: origen | destino | fecha | vuelo/vehículo)
        <textarea name="itinerary" defaultValue={legs} />
      </label>
      <label className="field">
        Notas
        <textarea name="notes" defaultValue={offer?.notes} />
      </label>
      <div className="row">
        <button className="btn primary" type="submit">
          Guardar
        </button>
        <button className="btn ghost" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
