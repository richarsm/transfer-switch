import { useState, type FormEvent } from "react";
import { useStore } from "../data/StoreContext";
import type { Role } from "../domain/types";

export function OperatorsPage() {
  const store = useStore();
  const [error, setError] = useState<string | null>(null);

  if (store.session?.role !== "admin") {
    return <p>Solo el administrador registra operadores.</p>;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    try {
      store.upsertProfile({
        email: String(form.get("email") ?? ""),
        displayName: String(form.get("displayName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        role: String(form.get("role")) as Role,
        active: true,
      });
      formEl.reset();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <>
      <h1>Operadores</h1>
      <p className="muted">
        El alta es por email. Cuando conectemos Google, ese mismo correo será el
        que pueda entrar.
      </p>
      {error ? <div className="error">{error}</div> : null}
      <form className="card" onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <div className="grid-2">
          <label className="field">
            Nombre
            <input name="displayName" required />
          </label>
          <label className="field">
            Email Google
            <input name="email" type="email" required />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            Teléfono
            <input name="phone" />
          </label>
          <label className="field">
            Rol
            <select name="role" defaultValue="operator">
              <option value="operator">Operador</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
        </div>
        <button className="btn primary" type="submit">
          Registrar
        </button>
      </form>
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
                <td>{p.displayName}</td>
                <td>{p.email}</td>
                <td>{p.role === "admin" ? "Admin" : "Operador"}</td>
                <td>
                  <button
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
