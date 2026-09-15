import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import { beneficiaryTitle, searchBeneficiaries } from "../lib/beneficiaries";

export function BeneficiariesPage() {
  const store = useStore();
  const [query, setQuery] = useState("");
  const people = new Map(store.snapshot.profiles.map((p) => [p.id, p.displayName]));
  const provinces = new Map(store.snapshot.provinces.map((p) => [p.id, p.name]));
  const rows = useMemo(
    () => searchBeneficiaries(store.snapshot.beneficiaries ?? [], query),
    [store.snapshot.beneficiaries, query],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Beneficiarios</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            Clientes y destinatarios guardados para autocompletar operaciones.
          </p>
        </div>
        <Link className="btn primary" to="/operaciones/nueva">
          Nueva operación
        </Link>
      </div>
      <section className="card" style={{ display: "grid", gap: 14 }}>
        <label className="field">
          Buscar
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre o teléfono"
          />
        </label>
        {rows.length === 0 ? (
          <p className="muted">
            Aún no hay beneficiarios. Al crear una operación, deja marcada la casilla para
            guardarlos.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>En Cuba</th>
                  <th>Recogida</th>
                  <th>Guardó</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>
                      {b.contactName}
                      <div className="muted">{b.contactPhone}</div>
                    </td>
                    <td>
                      {b.cubaRecipientName || b.cubaPhone || "—"}
                      <div className="muted">
                        {[
                          b.cubaCardNumber
                            ? `**** ${b.cubaCardNumber.replace(/\D/g, "").slice(-4) || b.cubaCardNumber}`
                            : "",
                          b.cubaPhone,
                          provinces.get(b.provinceId),
                          b.cubaAddress,
                        ]
                          .filter(Boolean)
                          .join(" · ") || beneficiaryTitle(b)}
                      </div>
                    </td>
                    <td>{b.address || "—"}</td>
                    <td>{people.get(b.createdBy) ?? "—"}</td>
                    <td>
                      <div className="row">
                        <Link className="btn primary" to={`/operaciones/nueva?beneficiary=${b.id}`}>
                          Usar
                        </Link>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            if (confirm(`¿Quitar a ${beneficiaryTitle(b)} de la lista?`)) {
                              store.deleteBeneficiary(b.id);
                            }
                          }}
                        >
                          Quitar
                        </button>
                      </div>
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
