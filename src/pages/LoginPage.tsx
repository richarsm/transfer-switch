import { useStore } from "../data/StoreContext";

export function LoginPage() {
  const { snapshot, login } = useStore();
  const users = snapshot.profiles.filter((p) => p.active);

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <strong>Transfer Switch</strong>
        </div>
        <h1>Entrar al escritorio</h1>
        <p>
          Google Sign-In se conecta cuando haya proyecto Supabase. Por ahora
          entra con un usuario autorizado por el administrador.
        </p>
        <div className="user-pick">
          {users.map((u) => (
            <button key={u.id} type="button" onClick={() => login(u.id)}>
              {u.displayName}
              <small>
                {u.email} · {u.role === "admin" ? "administrador" : "operador"}
              </small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
