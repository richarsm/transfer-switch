import { useState } from "react";
import { useStore } from "../data/StoreContext";
import { roleLabel } from "../lib/operations";

export function LoginPage() {
  const { snapshot, login, cloudAuth, authNotice, pendingAuth, signInWithGoogle, logout } = useStore();
  const users = snapshot.profiles.filter((p) => p.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo entrar con Google.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="brand">
          <strong>T-Transfer</strong>
        </div>
        {cloudAuth && pendingAuth ? (
          <>
            <h1>Solicitud enviada</h1>
            <div className="notice">
              Solicitud enviada, espere a ser autorizado por un administrador.
            </div>
            <p>
              Entraste con <strong>{pendingAuth.email}</strong>. Cuando el administrador apruebe el
              acceso y asigne el rol, podrás usar el escritorio.
            </p>
            <button className="btn ghost" type="button" onClick={() => logout()}>
              Usar otra cuenta
            </button>
          </>
        ) : (
          <>
            <h1>Entrar al escritorio</h1>
            {cloudAuth ? (
              <>
                <p>
                  Entra con Google. Si aún no tienes perfil, se envía la solicitud al administrador.
                </p>
                {authNotice ? <div className="error">{authNotice}</div> : null}
                {error ? <div className="error">{error}</div> : null}
                <button className="btn primary" type="button" disabled={busy} onClick={() => void onGoogle()}>
                  {busy ? "Redirigiendo…" : "Entrar con Google"}
                </button>
              </>
            ) : (
              <>
                <p>Sin Supabase, entra con un usuario local autorizado.</p>
                {error ? <div className="error">{error}</div> : null}
                <div className="user-pick">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        try {
                          login(u.id);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "No se pudo entrar.");
                        }
                      }}
                    >
                      {u.displayName}
                      <small>
                        {u.email} · {roleLabel(u.role)}
                      </small>
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
