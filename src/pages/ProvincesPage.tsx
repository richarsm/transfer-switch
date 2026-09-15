import { useState, type FormEvent } from "react";
import { useStore } from "../data/StoreContext";
import { formatMoney, parseAmount } from "../lib/money";

export function ProvincesPage() {
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

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
    </>
  );
}
