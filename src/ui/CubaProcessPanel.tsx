import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import type { Operation } from "../domain/types";
import { canEnterCubaReference } from "../lib/cuba-inbox";

export function CubaProcessPanel({ operation }: { operation: Operation }) {
  const store = useStore();
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const operators = store.snapshot.cubaOperators ?? [];
  const thread = (store.snapshot.cubaThreads ?? []).find((t) => t.operationId === operation.id);
  const assigned = canEnterCubaReference(
    store.session,
    { operatorId: thread?.operatorId || operation.cubaOperatorId },
    operators,
  );
  if (!assigned || !thread) return null;
  const done = thread.status === "auto_matched" || thread.status === "failed";

  return (
    <section className="card" style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Tu envío a Cuba</h2>
      <p className="muted" style={{ margin: 0 }}>
        Código <strong>{thread.code || operation.trackingCode}</strong>. Cuando esté hecha la recarga o
        la transferencia, pon la referencia. Después el asesor de la ficha o el administrador cierran
        el ciclo.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {done ? (
        <p className="muted" style={{ margin: 0 }}>
          {thread.status === "auto_matched"
            ? `Listo · ref ${thread.parsedReference || "—"}. Ya pueden cerrar la operación.`
            : "Este envío quedó marcado como fallido."}{" "}
          <Link to="/bandeja">Ver bandeja</Link>
        </p>
      ) : (
        <div className="row">
          <label className="field">
            Referencia de confirmación
            <input
              value={reference || thread.parsedReference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ticket / SMS / código"
            />
          </label>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              try {
                store.reviewCubaThread(thread.id, "confirm", reference || thread.parsedReference);
                setError(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : "No se pudo confirmar.");
              }
            }}
          >
            Confirmar envío
          </button>
          <Link className="btn ghost" to="/bandeja">
            Bandeja
          </Link>
        </div>
      )}
    </section>
  );
}
