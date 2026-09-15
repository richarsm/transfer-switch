import { Link } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import { havanaDateISO, havanaMonthPrefix } from "../lib/havana";
import { formatMoney } from "../lib/money";

export function DashboardPage() {
  const store = useStore();
  const today = havanaDateISO();
  const monthStart = `${havanaMonthPrefix()}-01`;
  const day = store.dashboard(today, today);
  const month = store.dashboard(monthStart, today);
  const pendingOps = store.snapshot.operations.filter(
    (o) => o.status !== "cancelled" && o.status !== "confirmed" && o.collectStatus === "pending",
  );

  return (
    <>
      <div className="page-head">
        <h1>Tablero</h1>
        <Link className="btn primary" to="/operaciones/nueva">
          Nueva operación
        </Link>
      </div>
      <h2>Hoy</h2>
      <div className="stats">
        <div className="stat">
          <b>{formatMoney(day.transferredCup, "CUP")}</b>
          <span>Transferido a tarjeta</span>
        </div>
        <div className="stat">
          <b>{formatMoney(day.cashCup, "CUP")}</b>
          <span>Efectivo CUP</span>
        </div>
        <div className="stat">
          <b>{formatMoney(day.cashUsd, "USD")}</b>
          <span>Efectivo USD</span>
        </div>
        <div className="stat">
          <b>{formatMoney(day.pendingGyn, "GYN")}</b>
          <span>Por recoger</span>
        </div>
      </div>
      <h2>Mes (Cuba)</h2>
      <div className="stats">
        <div className="stat">
          <b>{formatMoney(month.transferredCup, "CUP")}</b>
          <span>Transferido a tarjeta</span>
        </div>
        <div className="stat">
          <b>{formatMoney(month.cashCup, "CUP")}</b>
          <span>Efectivo CUP</span>
        </div>
        <div className="stat">
          <b>{formatMoney(month.cashUsd, "USD")}</b>
          <span>Efectivo USD</span>
        </div>
        <div className="stat">
          <b>{month.confirmedCount}</b>
          <span>Confirmadas en el mes</span>
        </div>
      </div>
      <section className="card">
        <h2>Por recoger</h2>
        {pendingOps.length === 0 ? (
          <p className="muted">No hay cobros pendientes.</p>
        ) : (
          <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Contacto</th>
                <th>GYN</th>
                <th className="col-operator">Operador</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingOps.map((op) => (
                <tr key={op.id}>
                  <td>
                    {op.contactName}
                    <div className="muted">{op.contactPhone}</div>
                    <div className="muted op-operator">
                      Operador: {store.snapshot.profiles.find((p) => p.id === op.createdBy)?.displayName ?? "—"}
                    </div>
                  </td>
                  <td>{formatMoney(op.amountGyn, "GYN")}</td>
                  <td className="col-operator">
                    {store.snapshot.profiles.find((p) => p.id === op.createdBy)?.displayName ?? "—"}
                  </td>
                  <td>
                    <Link to={`/operaciones/${op.id}`}>Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </>
  );
}
