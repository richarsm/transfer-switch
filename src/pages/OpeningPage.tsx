import { useState, type FormEvent } from "react";
import { useStore } from "../data/StoreContext";
import { addDays, havanaDateISO, rangesOverlap } from "../lib/havana";
import { formatMoney, formatRate, parseAmount } from "../lib/money";

export function OpeningPage() {
  const store = useStore();
  const today = havanaDateISO();
  const [kind, setKind] = useState<"day" | "week">("day");
  const [startsOn, setStartsOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const endsOn = kind === "day" ? startsOn : addDays(startsOn, 6);
  const openNow = store.snapshot.openings.find((o) => o.status === "open");
  const overlap = store.snapshot.openings.find((o) =>
    rangesOverlap(startsOn, endsOn, o.startsOn, o.endsOn),
  );
  const blocked = Boolean(openNow) || Boolean(overlap);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    try {
      store.openPeriod({
        kind,
        startsOn,
        endsOn,
        cupPer1000Gyn: parseAmount(String(form.get("rateCard") ?? "")),
        cashCupPer1000Gyn: parseAmount(String(form.get("rateCashCup") ?? "")),
        cashUsdPer1000Gyn: parseAmount(String(form.get("rateCashUsd") ?? "")),
        notes: String(form.get("notes") ?? ""),
      });
      setError(null);
      formEl.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <>
      <h1>Apertura</h1>
      <p className="muted">
        Publica las tres tarifas del día o de la semana, por cada 1 000 GYN.
        Reloj de Cuba.
      </p>
      {error ? <div className="error">{error}</div> : null}
      <form className="card" onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <div className="row">
          <button
            type="button"
            className={`btn ${kind === "day" ? "primary" : "ghost"}`}
            onClick={() => setKind("day")}
          >
            Día
          </button>
          <button
            type="button"
            className={`btn ${kind === "week" ? "primary" : "ghost"}`}
            onClick={() => setKind("week")}
          >
            Semana
          </button>
        </div>
        <div className="grid-2">
          <label className="field">
            Inicio
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </label>
          <label className="field">
            Fin
            <input type="date" value={endsOn} readOnly />
          </label>
        </div>
        <div className="grid-3">
          <label className="field">
            Tarjeta · CUP × 1 000 GYN
            <input name="rateCard" placeholder="165000" required />
          </label>
          <label className="field">
            Efectivo CUP × 1 000 GYN
            <input name="rateCashCup" placeholder="158000" required />
          </label>
          <label className="field">
            Efectivo USD × 1 000 GYN
            <input name="rateCashUsd" placeholder="4.70" required />
          </label>
        </div>
        <label className="field">
          Notas
          <textarea name="notes" placeholder="Cotización verbal, fuente, vigencia" />
        </label>
        <button className="btn primary" type="submit" disabled={blocked}>
          Abrir periodo
        </button>
        {openNow ? (
          <p className="muted">
            Ya hay un periodo abierto ({openNow.startsOn} → {openNow.endsOn}).
            Ciérralo en el historial antes de abrir otro.
          </p>
        ) : overlap ? (
          <p className="muted">
            Esas fechas ya están usadas ({overlap.startsOn} → {overlap.endsOn}).
            Los periodos no se repiten.
          </p>
        ) : null}
      </form>
      <section className="card">
        <h2>Historial</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Periodo</th>
              <th>Tarjetas</th>
              <th>Efectivo CUP</th>
              <th>Efectivo USD</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {[...store.snapshot.openings].reverse().map((o) => (
              <tr key={o.id}>
                <td>
                  {o.kind === "week" ? "Semana" : "Día"} · {o.startsOn} → {o.endsOn}
                  {o.notes ? <div className="muted">{o.notes}</div> : null}
                </td>
                <td>{formatRate(o.cupPer1000Gyn, "CUP")}</td>
                <td>{formatRate(o.cashCupPer1000Gyn || 0, "CUP")}</td>
                <td>{formatRate(o.cashUsdPer1000Gyn || 0, "USD")}</td>
                <td>
                  <span className={`badge ${o.status === "open" ? "ok" : ""}`}>
                    {o.status === "open" ? "Abierto" : "Cerrado"}
                  </span>
                </td>
                <td>
                  {o.status === "open" ? (
                    <button className="btn ghost" onClick={() => store.closePeriod(o.id)}>
                      Cerrar
                    </button>
                  ) : (
                    formatMoney(o.cupPer1000Gyn, "CUP")
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
