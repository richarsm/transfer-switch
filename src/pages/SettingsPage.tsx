import { useEffect, useState, type FormEvent } from "react";
import { useStore } from "../data/StoreContext";
import {
  fetchIntegrations,
  gmailConnectUrl,
  postIntegrations,
  type IntegrationStatus,
} from "../lib/integrations";

export function SettingsPage() {
  const store = useStore();
  const profileId = store.session?.id ?? "";
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  const [gmailAddress, setGmailAddress] = useState("t-transfer@gmail.com");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateLang, setTemplateLang] = useState("es");
  const [commission, setCommission] = useState(
    String(store.snapshot.settings?.advisorCommissionPercent ?? 6),
  );

  const isAdmin = store.session?.role === "admin";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmail = params.get("gmail");
    const reason = params.get("reason");
    if (gmail === "connected") setNotice("Gmail quedó conectado. Ya se pueden enviar los correos de cierre.");
    if (gmail === "partial") setNotice("Google autorizó, pero falta el refresh token. Quita el acceso de T-Transfer en la cuenta de Google y vuelve a conectar.");
    if (gmail === "error") setError(reason || "No se pudo conectar Gmail.");
    if (gmail) {
      params.delete("gmail");
      params.delete("reason");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState(null, "", next);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin || !profileId) return;
    let live = true;
    fetchIntegrations(profileId)
      .then((data) => {
        if (!live) return;
        applyStatus(data);
      })
      .catch((err) => {
        if (!live) return;
        setError(err instanceof Error ? err.message : "No se pudo leer la configuración.");
      });
    return () => {
      live = false;
    };
  }, [isAdmin, profileId]);

  function applyStatus(data: IntegrationStatus) {
    setStatus(data);
    setGmailAddress(data.gmail.address || "t-transfer@gmail.com");
    setClientId(data.gmail.clientId);
    setPhoneNumberId(data.whatsapp.phoneNumberId);
    setTemplateName(data.whatsapp.templateName);
    setTemplateLang(data.whatsapp.templateLang || "es");
  }

  async function run(action: string, extra: Record<string, string> = {}) {
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const data = await postIntegrations(profileId, action, extra);
      applyStatus(data);
      if (action === "test_gmail") setNotice(`Correo de prueba enviado a ${store.session?.email || "el administrador"}.`);
      else if (action.startsWith("disconnect")) setNotice("Desconectado.");
      else setNotice("Guardado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy("");
    }
  }

  function onSaveGmail(e: FormEvent) {
    e.preventDefault();
    void run("save_gmail", {
      gmailAddress,
      googleClientId: clientId,
      googleClientSecret: clientSecret,
    });
  }

  function onSaveWhatsApp(e: FormEvent) {
    e.preventDefault();
    void run("save_whatsapp", {
      whatsappPhoneNumberId: phoneNumberId,
      whatsappAccessToken: accessToken,
      whatsappVerifyToken: verifyToken,
      whatsappAppSecret: appSecret,
      whatsappTemplateName: templateName,
      whatsappTemplateLang: templateLang,
    });
  }

  const gmail = status?.gmail;
  const wa = status?.whatsapp;

  if (!isAdmin) {
    return <p>Solo el administrador configura el correo y WhatsApp.</p>;
  }

  return (
    <>
      <h1>Configuración</h1>
      <p className="muted">
        Primero conecta t-transfer@gmail.com. Después pega aquí la Cloud API de WhatsApp.
        Los tokens se guardan en el servidor, no en esta página.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <section className="card" style={{ display: "grid", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Comisión de asesores</h2>
        <p className="muted" style={{ margin: 0 }}>
          Porcentaje del volumen en GYN del día. Sale en el tablero como saldo diario y en el
          resumen por asesor.
        </p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              store.upsertSettings({ advisorCommissionPercent: Number(commission) });
              setNotice("Porcentaje de comisión guardado.");
              setError(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "No se pudo guardar el porcentaje.");
            }
          }}
        >
          <label className="field">
            Comisión %
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              required
            />
          </label>
          <button className="btn primary" type="submit">
            Guardar comisión
          </button>
        </form>
      </section>

      <section className="card" style={{ display: "grid", gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Gmail</h2>
          <span className={`badge ${gmail?.connected ? "ok" : gmail?.ready ? "warn" : ""}`}>
            {gmail?.connected
              ? `Conectado · ${gmail.email || gmail.address}`
              : gmail?.ready
                ? "Listo para conectar"
                : "Sin conectar"}
          </span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          En Google Cloud: habilita Gmail API, cliente OAuth (aplicación web) y en la pantalla
          de consentimiento, Data Access, añade el alcance{" "}
          <code>https://www.googleapis.com/auth/gmail.send</code>. Añade t-transfer@gmail.com
          como usuario de prueba. URI de redirección:
        </p>
        <CopyField value={status?.redirectUri || "Se muestra al cargar el servidor"} />
        {gmail?.error ? <div className="error">{gmail.error}</div> : null}
        <form onSubmit={onSaveGmail} style={{ display: "grid", gap: 12 }}>
          <label className="field">
            Correo de la aplicación
            <input
              value={gmailAddress}
              onChange={(e) => setGmailAddress(e.target.value)}
              type="email"
              required
            />
          </label>
          <label className="field">
            Client ID
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxx.apps.googleusercontent.com"
              autoComplete="off"
            />
          </label>
          <label className="field">
            Client Secret {gmail?.hasSecret ? "(guardado · déjalo vacío para no cambiarlo)" : ""}
            <input
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder={gmail?.hasSecret ? "••••••••" : ""}
            />
          </label>
          <div className="row">
            <button className="btn primary" type="submit" disabled={Boolean(busy)}>
              {busy === "save_gmail" ? "Guardando…" : "Guardar datos de Google"}
            </button>
            <button
              className="btn ghost"
              type="button"
              disabled={Boolean(busy) || !gmail?.ready}
              onClick={() => {
                window.location.href = gmailConnectUrl(profileId);
              }}
            >
              Conectar Gmail
            </button>
            {gmail?.connected ? (
              <button
                className="btn ghost"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void run("disconnect_gmail")}
              >
                Desconectar
              </button>
            ) : null}
            {gmail?.connected ? (
              <button
                className="btn ghost"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void run("test_gmail", { testTo: store.session?.email ?? "" })}
              >
                {busy === "test_gmail" ? "Enviando…" : "Enviar correo de prueba"}
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="card" style={{ display: "grid", gap: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>WhatsApp Cloud API</h2>
          <span className={`badge ${wa?.connected ? "ok" : ""}`}>
            {wa?.connected ? "Conectada" : "Pendiente"}
          </span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Cuando Meta te dé el número, pega el Phone number ID y un token permanente.
          En la app de WhatsApp, el webhook es:
        </p>
        <CopyField value={status?.webhookUrl || "Se muestra al cargar el servidor"} />
        {wa?.error ? <div className="error">{wa.error}</div> : null}
        <form onSubmit={onSaveWhatsApp} style={{ display: "grid", gap: 12 }}>
          <div className="grid-2">
            <label className="field">
              Phone number ID
              <input
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="field">
              Token de verificación del webhook {wa?.hasVerifyToken ? "(guardado)" : ""}
              <input
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                autoComplete="off"
                placeholder={wa?.hasVerifyToken ? "••••••••" : "el mismo que pongas en Meta"}
              />
            </label>
          </div>
          <label className="field">
            Token de acceso {wa?.hasToken ? "(guardado · déjalo vacío para no cambiarlo)" : ""}
            <input
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder={wa?.hasToken ? "••••••••" : ""}
            />
          </label>
          <label className="field">
            App secret {wa?.hasAppSecret ? "(guardado)" : "(opcional)"}
            <input
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder={wa?.hasAppSecret ? "••••••••" : ""}
            />
          </label>
          <div className="grid-2">
            <label className="field">
              Plantilla (si Meta la exige)
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="nombre_de_plantilla"
              />
            </label>
            <label className="field">
              Idioma de plantilla
              <input
                value={templateLang}
                onChange={(e) => setTemplateLang(e.target.value)}
                placeholder="es"
              />
            </label>
          </div>
          <div className="row">
            <button className="btn primary" type="submit" disabled={Boolean(busy)}>
              {busy === "save_whatsapp" ? "Guardando…" : "Guardar WhatsApp"}
            </button>
            {wa?.connected ? (
              <button
                className="btn ghost"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void run("disconnect_whatsapp")}
              >
                Desconectar
              </button>
            ) : null}
          </div>
        </form>
      </section>
    </>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="row">
      <label className="field" style={{ flex: 1 }}>
        <input value={value} readOnly />
      </label>
      <button
        className="btn ghost"
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
