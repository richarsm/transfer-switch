import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../data/StoreContext";
import type { CubaThread, CubaThreadStatus } from "../domain/types";
import {
  canEnterCubaReference,
  channelLabel,
  cubaOperatorForProfile,
  latestMessage,
  threadStatusLabel,
  threadStatusTone,
  threadsForProfile,
} from "../lib/cuba-inbox";
import { formatHavanaDateTime } from "../lib/havana";
import { kindLabel } from "../lib/operations";

type Tab = "open" | "review" | "timeout" | "done";

const TABS: Array<{ id: Tab; label: string; statuses: CubaThreadStatus[] }> = [
  { id: "open", label: "Esperando", statuses: ["queued", "sent", "awaiting_reply"] },
  { id: "review", label: "Revisar", statuses: ["needs_review"] },
  { id: "timeout", label: "Sin respuesta", statuses: ["timed_out"] },
  { id: "done", label: "Resueltas", statuses: ["auto_matched", "failed"] },
];

export function CubaInboxPage() {
  const store = useStore();
  const isAdmin = store.session?.role === "admin";
  const isCuba = store.session?.role === "cuba";
  const [tab, setTab] = useState<Tab>("open");
  const [paste, setPaste] = useState("");
  const [pasteThread, setPasteThread] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<Record<string, string>>({});

  useEffect(() => {
    store.tickCubaTimeouts();
  }, [store]);

  const threads = threadsForProfile(
    store.session,
    store.snapshot.cubaThreads ?? [],
    store.snapshot.cubaOperators ?? [],
  );
  const counts = useMemo(() => {
    const map: Record<Tab, number> = { open: 0, review: 0, timeout: 0, done: 0 };
    for (const item of TABS) {
      map[item.id] = threads.filter((t) => item.statuses.includes(t.status)).length;
    }
    return map;
  }, [threads]);

  const rows = threads
    .filter((t) => TABS.find((item) => item.id === tab)?.statuses.includes(t.status))
    .sort((a, b) => (b.sentAt ?? b.assignedAt).localeCompare(a.sentAt ?? a.assignedAt));

  function run(fn: () => void) {
    try {
      fn();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  function ingest(thread?: CubaThread) {
    run(() => {
      store.ingestCubaReply({
        body: paste,
        threadId: thread?.id ?? (pasteThread || undefined),
        channel: paste.includes("@") ? "email" : "whatsapp",
      });
      setPaste("");
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isCuba ? "Bandeja" : "Bandeja Cuba"}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            {isCuba
              ? "Tus envíos a procesar. Pon la referencia cuando la recarga o la transferencia esté hecha."
              : "El operador de Cuba recibe aquí sus envíos y pone la referencia. Después el asesor de la ficha o el administrador cierran la operación."}
          </p>
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <section className="card" style={{ display: "grid", gap: 14 }}>
        <div className="row">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`btn ${tab === item.id ? "primary" : "ghost"}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
              <span className={`tab-count ${tab === item.id ? "on" : ""}`}>{counts[item.id]}</span>
            </button>
          ))}
        </div>
        {isAdmin ? (
          <div className="grid-2">
            <label className="field">
              Pegar respuesta (WhatsApp o correo)
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder="Incluye TT-7F2A si puedes. Si no, elige el hilo."
              />
            </label>
            <div style={{ display: "grid", gap: 10, alignContent: "end" }}>
              <label className="field">
                Hilo (si no trae código)
                <select value={pasteThread} onChange={(e) => setPasteThread(e.target.value)}>
                  <option value="">Detectar automático</option>
                  {threads
                    .filter((t) => t.status !== "auto_matched" && t.status !== "failed")
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} · {t.status}
                      </option>
                    ))}
                </select>
              </label>
              <button type="button" className="btn primary" disabled={!paste.trim()} onClick={() => ingest()}>
                Registrar respuesta
              </button>
            </div>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="muted">
            {isCuba &&
            !cubaOperatorForProfile(store.session, store.snapshot.cubaOperators ?? [])
              ? "Tu usuario aún no está enlazado. Pide al administrador que te asigne en Operadores."
              : "Nada en esta cola."}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Operación</th>
                  {isCuba ? null : <th>Operador</th>}
                  <th>Canal</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((thread) => {
                  const op = store.snapshot.operations.find((o) => o.id === thread.operationId);
                  const operator = store.snapshot.cubaOperators.find((o) => o.id === thread.operatorId);
                  const last = latestMessage(store.snapshot.cubaMessages ?? [], thread.id);
                  return (
                    <tr key={thread.id}>
                      <td>
                        <strong>{thread.code}</strong>
                        <div className="muted">
                          {thread.sentAt ? formatHavanaDateTime(thread.sentAt) : formatHavanaDateTime(thread.assignedAt)}
                        </div>
                      </td>
                      <td>
                        {op ? (
                          isCuba ? (
                            <>
                              {kindLabel(op.kind)} · {op.cubaRecipientName || op.contactName}
                            </>
                          ) : (
                            <Link to={`/operaciones/${op.id}`}>
                              {kindLabel(op.kind)} · {op.cubaRecipientName || op.contactName}
                            </Link>
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      {isCuba ? null : (
                        <td>
                          {operator?.name ?? "—"}
                          <div className="muted">{operator?.phone || operator?.email || ""}</div>
                        </td>
                      )}
                      <td>
                        {channelLabel(thread.channel)}
                        {last ? (
                          <div className="muted">
                            {last.direction === "in" ? "← " : "→ "}
                            {(last.body || last.mediaUrl || "—").slice(0, 80)}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <span className={`badge ${threadStatusTone(thread.status)}`}>
                          {threadStatusLabel(thread.status)}
                        </span>
                        {thread.parsedReference ? (
                          <div className="muted">Ref {thread.parsedReference}</div>
                        ) : null}
                        {thread.lastError ? <div className="muted">{thread.lastError}</div> : null}
                      </td>
                      <td>
                        {thread.status !== "auto_matched" && thread.status !== "failed" ? (
                          <div className="row">
                            {canEnterCubaReference(store.session, thread, store.snapshot.cubaOperators ?? []) ? (
                              <>
                                <input
                                  placeholder="Referencia"
                                  value={reference[thread.id] ?? thread.parsedReference}
                                  onChange={(e) =>
                                    setReference((cur) => ({ ...cur, [thread.id]: e.target.value }))
                                  }
                                  style={{ width: 110 }}
                                />
                                <button
                                  type="button"
                                  className="btn primary"
                                  onClick={() =>
                                    run(() =>
                                      store.reviewCubaThread(
                                        thread.id,
                                        "confirm",
                                        reference[thread.id] ?? thread.parsedReference,
                                      ),
                                    )
                                  }
                                >
                                  Confirmar
                                </button>
                              </>
                            ) : (
                              <span className="muted">
                                Referencia: {operator?.name ?? "el operador asignado"}
                              </span>
                            )}
                            {canEnterCubaReference(store.session, thread, store.snapshot.cubaOperators ?? []) ? (
                              <button
                                type="button"
                                className="btn danger"
                                onClick={() => run(() => store.reviewCubaThread(thread.id, "fail"))}
                              >
                                Falló
                              </button>
                            ) : null}
                            {isAdmin && thread.status === "timed_out" ? (
                              <button
                                type="button"
                                className="btn ghost"
                                onClick={() =>
                                  run(() => store.reviewCubaThread(thread.id, "reopen"))
                                }
                              >
                                Reabrir
                              </button>
                            ) : null}
                            {isCuba ? null : (
                              <Link to={op ? `/operaciones/${op.id}` : "/operaciones"}>Ficha</Link>
                            )}
                          </div>
                        ) : isCuba ? null : (
                          <Link to={op ? `/operaciones/${op.id}` : "/operaciones"}>Ficha</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
