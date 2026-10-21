import { useState, type FormEvent } from "react";
import { useStore } from "../data/StoreContext";
import type { CubaOperatorKind, Role } from "../domain/types";
import {
  advisorDayRows,
  advisorEmailHtml,
  advisorEmailText,
  advisorSummaryTable,
  commissionPercent,
} from "../lib/advisor";
import { sendPlainEmail } from "../lib/cuba-send";
import { formatHavanaDateTime, havanaDateISO } from "../lib/havana";
import { formatMoney } from "../lib/money";
import { deskLabel, kindLabel, roleLabel } from "../lib/operations";
import { downloadTablePdf } from "../lib/pdf";

export function OperatorsPage() {
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = store.snapshot.profiles.find((p) => p.id === editingId) ?? null;
  const cloud = store.cloudAuth;

  if (store.session?.role !== "admin") {
    return <p>Solo el administrador registra operadores.</p>;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    try {
      store.upsertProfile({
        id: editing?.id,
        email: String(form.get("email") ?? ""),
        displayName: String(form.get("displayName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        role: String(form.get("role")) as Role,
        active: editing?.active ?? true,
      });
      formEl.reset();
      setEditingId(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <>
      <h1>Operadores</h1>
      <p className="muted">
        {cloud
          ? "Cuando alguien entra con Google sin perfil, llega aquí la solicitud. Aprueba y asigna el rol. Cuba solo ve la bandeja; enlázalo también abajo."
          : "Alta local. En la nube el acceso se pide al entrar con Google."}
      </p>
      {error ? <div className="error">{error}</div> : null}
      <AccessRequestsSection />
      {cloud && !editing ? null : (
      <form key={editing?.id ?? "new"} className="card" onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>{editing ? "Editar operador" : "Registrar operador"}</h2>
        <div className="grid-2">
          <label className="field">
            Nombre
            <input name="displayName" required defaultValue={editing?.displayName ?? ""} />
          </label>
          <label className="field">
            Email Google
            <input name="email" type="email" required defaultValue={editing?.email ?? ""} />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            Teléfono
            <input name="phone" defaultValue={editing?.phone ?? ""} />
          </label>
          <label className="field">
            Rol
            <select name="role" defaultValue={editing?.role ?? "operator"}>
              <option value="operator">Asesor</option>
              <option value="cuba">Cuba</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
        </div>
        <div className="row">
          <button className="btn primary" type="submit">
            {editing ? "Guardar" : "Registrar"}
          </button>
          {editing ? (
            <button className="btn ghost" type="button" onClick={() => setEditingId(null)}>
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
      )}
      <AdvisorDaySection />
      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {store.snapshot.profiles.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.displayName}
                  {!p.active ? <div className="muted">Inactivo</div> : null}
                </td>
                <td>{p.email}</td>
                <td>{roleLabel(p.role)}</td>
                <td>
                  <div className="row">
                    <button type="button" className="btn ghost" onClick={() => setEditingId(p.id)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() =>
                        store.upsertProfile({
                          id: p.id,
                          email: p.email,
                          displayName: p.displayName,
                          phone: p.phone,
                          role: p.role,
                          active: !p.active,
                        })
                      }
                    >
                      {p.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <CubaOperatorsSection />
    </>
  );
}

function AdvisorDaySection() {
  const store = useStore();
  const [day, setDay] = useState(havanaDateISO());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const percent = commissionPercent(store.snapshot.settings);
  const rows = advisorDayRows(store.snapshot, day).filter((r) => r.profile.role !== "cuba");
  const withWork = rows.filter((r) => r.count > 0);

  function downloadPdf() {
    downloadTablePdf({
      filename: `resumen-asesores-${day}.pdf`,
      title: "T-Transfer · Resumen por asesor",
      subtitle: [
        `Día ${day} · reloj de Cuba · comisión ${percent}%`,
        "Desglose por tipo: transferencia, recarga móvil, efectivo CUP y efectivo USD.",
      ],
      columns: [
        { label: "Asesor", width: 148 },
        { label: "Tipo", width: 128 },
        { label: "Ops", width: 42, align: "right" },
        { label: "Volumen GYN", width: 102, align: "right" },
        { label: "Recolectado", width: 102, align: "right" },
        { label: "Importe", width: 108, align: "right" },
        { label: "Comisión", width: 98, align: "right" },
      ],
      rows: advisorSummaryTable(rows, percent),
    });
  }

  async function sendEmails() {
    if (!withWork.length) {
      setError("No hay operaciones de asesores en ese día.");
      return;
    }
    const ok = confirm(
      `¿Enviar el resumen del ${day} a ${withWork.length} asesor${withWork.length === 1 ? "" : "es"} por correo? Solo se envía si lo pides aquí.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let sent = 0;
      const failed: string[] = [];
      for (const row of withWork) {
        if (!row.profile.email.includes("@")) {
          failed.push(row.profile.displayName);
          continue;
        }
        const result = await sendPlainEmail({
          to: row.profile.email,
          subject: `Resumen T-Transfer ${day}`,
          heading: `Tu saldo del ${day}`,
          text: advisorEmailText(row, day, percent),
          html: advisorEmailHtml(row, day, percent),
        });
        if (result.emailed) sent += 1;
        else failed.push(row.profile.displayName);
      }
      if (sent) setNotice(`Resumen enviado a ${sent} correo${sent === 1 ? "" : "s"}.`);
      if (failed.length) {
        setError(
          `No se pudo enviar a: ${failed.join(", ")}. Revisa Gmail en Configuración.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron enviar los correos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" style={{ marginBottom: 18, display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Resumen del día por asesor</h2>
      <p className="muted" style={{ margin: 0 }}>
        Volumen en GYN, recolectado y comisión al {percent}%. El PDF y el correo solo salen si los
        pides.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}
      <div className="row">
        <label className="field">
          Día
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <button className="btn ghost" type="button" onClick={downloadPdf}>
          Descargar PDF
        </button>
        <button className="btn primary" type="button" disabled={busy} onClick={() => void sendEmails()}>
          {busy ? "Enviando…" : "Enviar resumen por correo"}
        </button>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Asesor</th>
              <th>Ops</th>
              <th>Volumen</th>
              <th>Recolectado</th>
              <th>Comisión</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.profile.id}>
                <td>
                  {row.profile.displayName}
                  <div className="muted">{row.profile.email}</div>
                </td>
                <td>
                  {row.count}
                  {row.byKind.map((slice) => (
                    <div className="muted" key={slice.kind}>
                      {kindLabel(slice.kind)}: {slice.count}
                    </div>
                  ))}
                </td>
                <td>
                  {formatMoney(row.totalGyn, "GYN")}
                  {row.byKind.map((slice) => (
                    <div className="muted" key={slice.kind}>
                      {formatMoney(slice.totalGyn, "GYN")}
                    </div>
                  ))}
                </td>
                <td>{formatMoney(row.collectedGyn, "GYN")}</td>
                <td>{formatMoney(row.commissionGyn, "GYN")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccessRequestsSection() {
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const requests = store.snapshot.accessRequests ?? [];
  const pending = requests
    .filter((r) => r.status === "pending")
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const done = requests
    .filter((r) => r.status !== "pending")
    .slice()
    .sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""))
    .slice(0, 8);

  function run(fn: () => void) {
    try {
      fn();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  return (
    <section className="card" style={{ marginBottom: 18 }}>
      <h2>Solicitudes de acceso</h2>
      <p className="muted">
        Aprueba y asigna el rol. Cuba solo ve la bandeja; después enlázalo en Operadores en Cuba.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {pending.length === 0 ? (
        <p className="muted">No hay solicitudes pendientes.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Puesto</th>
                <th>Rol</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => {
                const role = roles[r.id] ?? (r.desk === "cuba" ? "cuba" : "operator");
                return (
                  <tr key={r.id}>
                    <td>
                      {r.displayName}
                      <div className="muted">
                        {r.phone || "Sin teléfono"}
                        {r.note ? ` · ${r.note}` : ""}
                      </div>
                      <div className="muted">{formatHavanaDateTime(r.createdAt)}</div>
                    </td>
                    <td>{r.email}</td>
                    <td>{deskLabel(r.desk)}</td>
                    <td>
                      <select
                        value={role}
                        onChange={(e) =>
                          setRoles((cur) => ({ ...cur, [r.id]: e.target.value as Role }))
                        }
                      >
                        <option value="operator">Asesor</option>
                        <option value="cuba">Cuba</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td>
                      <div className="row">
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => run(() => store.approveAccessRequest(r.id, role))}
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          className="btn danger"
                          onClick={() => run(() => store.rejectAccessRequest(r.id))}
                        >
                          Rechazar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {done.length > 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          {done.map((r) => (
            <span key={r.id} style={{ display: "block" }}>
              {r.status === "approved" ? "Aprobada" : "Rechazada"} · {r.displayName} · {r.email}
              {r.decidedRole ? ` · ${roleLabel(r.decidedRole)}` : ""}
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}

function CubaOperatorsSection() {
  const store = useStore();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const operators = store.snapshot.cubaOperators ?? [];
  const editing = operators.find((o) => o.id === editingId) ?? null;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const kinds: CubaOperatorKind[] = [];
    if (form.get("kind_transfer")) kinds.push("transfer");
    if (form.get("kind_recharge")) kinds.push("mobile_recharge");
    try {
      store.upsertCubaOperator({
        id: editing?.id,
        name: String(form.get("name") ?? ""),
        phone: String(form.get("phone") ?? ""),
        email: String(form.get("email") ?? ""),
        profileId: String(form.get("profileId") ?? ""),
        active: editing?.active ?? true,
        kinds,
      });
      formEl.reset();
      setEditingId(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  return (
    <section className="card" style={{ marginTop: 18 }}>
      <h2>Operadores en Cuba</h2>
      <p className="muted">
        Enlaza cada persona de Cuba a un usuario con rol Cuba. Así solo ve la bandeja, pone la
        referencia y el asesor de la ficha o el administrador cierran el ciclo.
      </p>
      {error ? <div className="error">{error}</div> : null}
      <form
        key={editing?.id ?? "new"}
        className="row"
        onSubmit={onSubmit}
        style={{ marginBottom: 16, flexWrap: "wrap" }}
      >
        <label className="field">
          Nombre
          <input name="name" required placeholder="Quién opera en Cuba" defaultValue={editing?.name ?? ""} />
        </label>
        <label className="field">
          WhatsApp
          <input name="phone" placeholder="+53 5 ..." defaultValue={editing?.phone ?? ""} />
        </label>
        <label className="field">
          Correo
          <input name="email" type="email" placeholder="opcional" defaultValue={editing?.email ?? ""} />
        </label>
        <label className="field">
          Usuario de la app
          <select name="profileId" defaultValue={editing?.profileId ?? ""}>
            <option value="">Sin enlazar</option>
            {store.snapshot.profiles
              .filter((p) => p.active)
              .slice()
              .sort((a, b) => Number(b.role === "cuba") - Number(a.role === "cuba"))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName} · {roleLabel(p.role)}
                </option>
              ))}
          </select>
        </label>
        <label className="check-row">
          <input type="checkbox" name="kind_transfer" defaultChecked={editing ? editing.kinds.includes("transfer") : true} />
          Transferencias
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            name="kind_recharge"
            defaultChecked={editing ? editing.kinds.includes("mobile_recharge") : true}
          />
          Recargas
        </label>
        <button className="btn primary" type="submit">
          {editing ? "Guardar" : "Añadir"}
        </button>
        {editing ? (
          <button className="btn ghost" type="button" onClick={() => setEditingId(null)}>
            Cancelar
          </button>
        ) : null}
      </form>
      {operators.length === 0 ? (
        <p className="muted">Aún no hay operadores de Cuba.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>WhatsApp</th>
              <th>Correo</th>
              <th>Usuario</th>
              <th>Tipos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {operators
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((o) => (
                <tr key={o.id}>
                  <td>
                    {o.name}
                    {!o.active ? <div className="muted">Inactivo</div> : null}
                  </td>
                  <td>{o.phone || "—"}</td>
                  <td>{o.email || "—"}</td>
                  <td>
                    {store.snapshot.profiles.find((p) => p.id === o.profileId)?.displayName ?? "—"}
                  </td>
                  <td>
                    {o.kinds.includes("transfer") ? "Tarjeta " : ""}
                    {o.kinds.includes("mobile_recharge") ? "Recarga" : ""}
                  </td>
                  <td>
                    <div className="row">
                      <button type="button" className="btn ghost" onClick={() => setEditingId(o.id)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          store.upsertCubaOperator({ ...o, active: !o.active });
                          setError(null);
                        }}
                      >
                        {o.active ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        className="btn danger"
                        onClick={() => {
                          try {
                            store.deleteCubaOperator(o.id);
                            if (editingId === o.id) setEditingId(null);
                            setError(null);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "No se pudo quitar.");
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
      )}
    </section>
  );
}
