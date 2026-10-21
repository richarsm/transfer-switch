import { adminClient, functionUrl, json, preflight } from "../_shared/admin.ts";
import { brandedEmailHtml } from "../_shared/email-html.ts";
import {
  loadIntegrations,
  publicStatus,
  requireAdmin,
  saveIntegrations,
  sendGmail,
} from "../_shared/integrations.ts";

function oauthRedirectUri() {
  return functionUrl("integrations-oauth");
}

function webhookUrl() {
  return functionUrl("whatsapp-webhook");
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const sb = adminClient();

  if (req.method === "GET") {
    const profileId = new URL(req.url).searchParams.get("profileId") ?? "";
    try {
      await requireAdmin(sb, profileId);
      const row = await loadIntegrations(sb);
      return json({
        ...publicStatus(row),
        redirectUri: oauthRedirectUri(),
        webhookUrl: webhookUrl(),
      });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "No se pudo leer." }, 403);
    }
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);

  const body = (await req.json().catch(() => null)) as {
    profileId?: string;
    action?: string;
    gmailAddress?: string;
    googleClientId?: string;
    googleClientSecret?: string;
    whatsappPhoneNumberId?: string;
    whatsappAccessToken?: string;
    whatsappVerifyToken?: string;
    whatsappAppSecret?: string;
    whatsappTemplateName?: string;
    whatsappTemplateLang?: string;
    testTo?: string;
  } | null;

  try {
    const admin = await requireAdmin(sb, body?.profileId);
    const current = await loadIntegrations(sb);
    const action = body?.action ?? "";

    if (action === "save_gmail") {
      const address = (body?.gmailAddress ?? "").trim() || "t-transfer@gmail.com";
      const clientId = (body?.googleClientId ?? "").trim();
      const secret = (body?.googleClientSecret ?? "").trim();
      const nextSecret = secret || current.gmail_client_secret;
      const ready = Boolean((clientId || current.gmail_client_id) && nextSecret);
      await saveIntegrations(sb, {
        gmail_address: address,
        gmail_client_id: clientId || current.gmail_client_id,
        gmail_client_secret: nextSecret,
        gmail_status: current.gmail_refresh_token ? "connected" : ready ? "ready" : "disconnected",
        gmail_error: "",
      }, admin.id);
    } else if (action === "disconnect_gmail") {
      await saveIntegrations(sb, {
        gmail_refresh_token: "",
        gmail_connected_email: "",
        gmail_connected_at: null,
        gmail_status: current.gmail_client_id && current.gmail_client_secret ? "ready" : "disconnected",
        gmail_error: "",
      }, admin.id);
    } else if (action === "test_gmail") {
      const to = (body?.testTo ?? "").trim() || admin.email;
      if (!to) throw new Error("No hay un correo de destino para la prueba.");
      const fromEmail = current.gmail_connected_email || current.gmail_address || "t-transfer@gmail.com";
      const when = new Intl.DateTimeFormat("es-CU", {
        timeZone: "America/Havana",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
      const who = admin.display_name || "administrador";
      await sendGmail(current, {
        to,
        subject: "T-Transfer · prueba de correo",
        text: [
          "T-Transfer",
          `Hola ${who}.`,
          `Este correo confirma que ${fromEmail} quedó conectado.`,
          `Fecha: ${when}`,
        ].join("\n"),
        html: brandedEmailHtml({
          heading: "Gmail quedó conectado",
          intro: `Hola ${who}. Este correo confirma que T-Transfer ya puede enviar desde la cuenta conectada.`,
          fields: [
            { label: "Cuenta", value: fromEmail },
            { label: "Destino de prueba", value: to },
            { label: "Fecha", value: when },
          ],
          note: "Si no pediste esta prueba, revisa Configuración en T-Transfer.",
          helpTitle: "",
        }),
      });
    } else if (action === "save_whatsapp") {
      const phoneId = (body?.whatsappPhoneNumberId ?? "").trim();
      const token = (body?.whatsappAccessToken ?? "").trim() || current.whatsapp_access_token;
      const verify = (body?.whatsappVerifyToken ?? "").trim() || current.whatsapp_verify_token;
      const appSecret = (body?.whatsappAppSecret ?? "").trim() || current.whatsapp_app_secret;
      const connected = Boolean(phoneId && token);
      await saveIntegrations(sb, {
        whatsapp_phone_number_id: phoneId,
        whatsapp_access_token: token,
        whatsapp_verify_token: verify,
        whatsapp_app_secret: appSecret,
        whatsapp_template_name: (body?.whatsappTemplateName ?? "").trim(),
        whatsapp_template_lang: (body?.whatsappTemplateLang ?? "").trim() || "es",
        whatsapp_status: connected ? "connected" : "disconnected",
        whatsapp_connected_at: connected ? new Date().toISOString() : null,
        whatsapp_error: "",
      }, admin.id);
    } else if (action === "disconnect_whatsapp") {
      await saveIntegrations(sb, {
        whatsapp_phone_number_id: "",
        whatsapp_access_token: "",
        whatsapp_verify_token: "",
        whatsapp_app_secret: "",
        whatsapp_template_name: "",
        whatsapp_template_lang: "es",
        whatsapp_connected_at: null,
        whatsapp_status: "disconnected",
        whatsapp_error: "",
      }, admin.id);
    } else {
      throw new Error("Acción no reconocida.");
    }

    const row = await loadIntegrations(sb);
    return json({
      ok: true,
      ...publicStatus(row),
      redirectUri: oauthRedirectUri(),
      webhookUrl: webhookUrl(),
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "No se pudo guardar." }, 400);
  }
});
