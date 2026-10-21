import { adminClient, functionUrl, json, preflight } from "../_shared/admin.ts";
import {
  GMAIL_SEND_SCOPE,
  GMAIL_SCOPE_HELP,
  loadIntegrations,
  requireAdmin,
  saveIntegrations,
  tokenHasGmailSend,
} from "../_shared/integrations.ts";

const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  GMAIL_SEND_SCOPE,
].join(" ");

function html(title: string, body: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>
     <body style="font-family:sans-serif;padding:32px;max-width:40rem">
     <h1>${title}</h1><p>${body}</p></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function safeReturnTo(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "GET") return json({ error: "method" }, 405);

  const url = new URL(req.url);
  const redirectUri = functionUrl("integrations-oauth");
  const sb = adminClient();

  if (url.searchParams.get("start") === "1") {
    const profileId = url.searchParams.get("profileId") ?? "";
    const returnTo = safeReturnTo(url.searchParams.get("returnTo") ?? "");
    try {
      await requireAdmin(sb, profileId);
      const row = await loadIntegrations(sb);
      if (!row.gmail_client_id || !row.gmail_client_secret) {
        return html("Falta Google", "Guarda primero el Client ID y el Client Secret en Configuración.");
      }
      if (!returnTo) return html("Origen no válido", "No se pudo volver a T-Transfer.");
      const state = btoa(JSON.stringify({ profileId, returnTo }));
      const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      google.searchParams.set("client_id", row.gmail_client_id);
      google.searchParams.set("redirect_uri", redirectUri);
      google.searchParams.set("response_type", "code");
      google.searchParams.set("scope", SCOPES);
      google.searchParams.set("access_type", "offline");
      google.searchParams.set("prompt", "consent select_account");
      google.searchParams.set("include_granted_scopes", "false");
      google.searchParams.set("state", state);
      return Response.redirect(google.toString(), 302);
    } catch (err) {
      return html("No autorizado", err instanceof Error ? err.message : "No se pudo iniciar Gmail.");
    }
  }

  const errParam = url.searchParams.get("error");
  if (errParam) {
    return html("Gmail cancelado", errParam);
  }

  const code = url.searchParams.get("code") ?? "";
  const stateRaw = url.searchParams.get("state") ?? "";
  if (!code || !stateRaw) return html("Faltan datos", "Google no devolvió el código de autorización.");

  let profileId = "";
  let returnTo = "";
  try {
    const state = JSON.parse(atob(stateRaw)) as { profileId?: string; returnTo?: string };
    profileId = state.profileId ?? "";
    returnTo = safeReturnTo(state.returnTo ?? "");
  } catch {
    return html("Estado inválido", "Vuelve a Configuración e intenta conectar Gmail otra vez.");
  }

  try {
    await requireAdmin(sb, profileId);
    const row = await loadIntegrations(sb);
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: row.gmail_client_id,
        client_secret: row.gmail_client_secret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const token = (await tokenRes.json().catch(() => ({}))) as {
      refresh_token?: string;
      access_token?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !token.access_token) {
      throw new Error(token.error_description || "Google no entregó el token.");
    }
    if (!(await tokenHasGmailSend(token.access_token))) {
      throw new Error(GMAIL_SCOPE_HELP);
    }
    let email = row.gmail_address;
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (userRes.ok) {
      const user = (await userRes.json()) as { email?: string };
      if (user.email) email = user.email;
    }
    await saveIntegrations(sb, {
      gmail_refresh_token: token.refresh_token || row.gmail_refresh_token,
      gmail_connected_email: email,
      gmail_connected_at: new Date().toISOString(),
      gmail_status: token.refresh_token || row.gmail_refresh_token ? "connected" : "error",
      gmail_error: token.refresh_token || row.gmail_refresh_token
        ? ""
        : "Google no devolvió refresh_token. Quita el acceso de T-Transfer en la cuenta y vuelve a conectar.",
    }, profileId);
    const dest = new URL(returnTo || "https://example.com");
    dest.searchParams.set("gmail", token.refresh_token || row.gmail_refresh_token ? "connected" : "partial");
    return Response.redirect(dest.toString(), 302);
  } catch (err) {
    try {
      await saveIntegrations(sb, {
        gmail_status: "error",
        gmail_error: err instanceof Error ? err.message : "OAuth falló",
      }, profileId);
    } catch {
      /* ignore */
    }
    if (returnTo) {
      const dest = new URL(returnTo);
      dest.searchParams.set("gmail", "error");
      dest.searchParams.set("reason", err instanceof Error ? err.message : "OAuth falló");
      return Response.redirect(dest.toString(), 302);
    }
    return html("No se pudo conectar Gmail", err instanceof Error ? err.message : "Error");
  }
});
