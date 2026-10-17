import { useState, type FormEvent } from "react";
import { useStore } from "../data/StoreContext";
import { formatMoney, parseAmount } from "../lib/money";

export function ProvincesPage() {
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const isAdmin = store.session?.role === "admin";

  function onSubmit(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      store.upsertProvince({
        id,
        cashCup: parseAmount(String(form.get("cashCup") ?? "")),
        cashUsd: parseAmount(String(form.get("cashUsd") ?? "")),
        notes: String(form.get("notes") ?? ""),
      });
      setEditing(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <>
      <h1>Disponibilidad por provincia</h1>
      <p className="muted">
        Efectivo CUP y USD para entregas en Cuba. Una operación de efectivo
        solo se crea si la provincia tiene saldo disponible.
      </p>
      {error ? <div className="error">{error}</div> : null}
      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Provincia</th>
              <th>CUP disponible</th>
              <th>USD disponible</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {store.snapshot.provinces.map((p) => {
              const room = store.provinceHeadroom(p.id);
              return (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    {p.notes ? <div className="muted">{p.notes}</div> : null}
                  </td>
                  {editing === p.id ? (
                    <td colSpan={3}>
                      <form className="row" onSubmit={(e) => onSubmit(e, p.id)}>
                        <label className="field">
                          Bóveda CUP
                          <input name="cashCup" defaultValue={p.cashCup} />
                        </label>
                        <label className="field">
                          Bóveda USD
                          <input name="cashUsd" defaultValue={p.cashUsd} />
                        </label>
                        <label className="field">
                          Notas
                          <input name="notes" defaultValue={p.notes} />
                        </label>
                        <button className="btn primary" type="submit">
                          Guardar
                        </button>
                        <button className="btn ghost" type="button" onClick={() => setEditing(null)}>
                          Cancelar
                        </button>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td>
                        {formatMoney(room.cashCupLeft, "CUP")}
                        <div className="muted">bóveda {formatMoney(p.cashCup, "CUP")}</div>
                      </td>
                      <td>
                        {formatMoney(room.cashUsdLeft, "USD")}
                        <div className="muted">bóveda {formatMoney(p.cashUsd, "USD")}</div>
                      </td>
                      <td>
                        <button className="btn ghost" onClick={() => setEditing(p.id)}>
                          Ajustar
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <CourierSection isAdmin={isAdmin} onError={setError} />
    </>
  );
}

function CourierSection({
  isAdmin,
  onError,
}: {
  isAdmin: boolean;
  onError: (message: string | null) => void;
}) {
  const store = useStore();
  const couriers = store.snapshot.couriers ?? [];

  function addCourier(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    try {
      store.upsertCourier({
        provinceId: String(form.get("provinceId") ?? ""),
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        active: true,
      });
      formEl.reset();
      onError(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo guardar el repartidor.");
    }
  }

  return (
    <section className="card">
      <h2>Repartidores de efectivo</h2>
      <p className="muted">
        Personas que entregan CUP o USD según la provincia. En la operación se
        elige al repartidor de esa provincia.
      </p>
      {store.session ? (
        <form className="row" onSubmit={addCourier} style={{ marginBottom: 16 }}>
          <label className="field" style={{ minWidth: 180 }}>
            Provincia
            <select name="provinceId" required>
              <option value="">Selecciona</option>
              {store.snapshot.provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Nombre
            <input name="name" required placeholder="Quien entrega" />
          </label>
          <label className="field">
            Teléfono
            <input name="phone" placeholder="+53 ..." />
          </label>
          <button className="btn primary" type="submit">
            Añadir
          </button>
        </form>
      ) : null}
      {couriers.length === 0 ? (
        <p className="muted">Aún no hay repartidores registrados.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Provincia</th>
              <th>Nombre</th>
              <th>Teléfono</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {couriers
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((c) => {
                const province = store.snapshot.provinces.find((p) => p.id === c.provinceId);
                return (
                  <tr key={c.id}>
                    <td>{province?.name ?? "—"}</td>
                    <td>
                      {c.name}
                      {!c.active ? <div className="muted">Inactivo</div> : null}
                    </td>
                    <td>{c.phone || "—"}</td>
                    <td>
                      {isAdmin ? (
                        <div className="row">
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() =>
                              store.upsertCourier({
                                ...c,
                                active: !c.active,
                              })
                            }
                          >
                            {c.active ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            className="btn danger"
                            onClick={() => store.deleteCourier(c.id)}
                          >
                            Quitar
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      )}
    </section>
  );
}
