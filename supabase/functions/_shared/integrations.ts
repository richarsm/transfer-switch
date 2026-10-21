import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  EMAIL_LOGO_CID,
  EMAIL_LOGO_PNG_BASE64,
  htmlFromPlainText,
} from "./email-html.ts";

export type IntegrationRow = {
  gmail_address: string;
  gmail_client_id: string;
  gmail_client_secret: string;
  gmail_refresh_token: string;
  gmail_connected_email: string;
  gmail_status: string;
  gmail_error: string;
  whatsapp_phone_number_id: string;
  whatsapp_access_token: string;
  whatsapp_verify_token: string;
  whatsapp_app_secret: string;
  whatsapp_template_name: string;
  whatsapp_template_lang: string;
  whatsapp_status: string;
  whatsapp_error: string;
};

const empty: IntegrationRow = {
  gmail_address: "t-transfer@gmail.com",
  gmail_client_id: "",
  gmail_client_secret: "",
  gmail_refresh_token: "",
  gmail_connected_email: "",
  gmail_status: "disconnected",
  gmail_error: "",
  whatsapp_phone_number_id: "",
  whatsapp_access_token: "",
  whatsapp_verify_token: "",
  whatsapp_app_secret: "",
  whatsapp_template_name: "",
  whatsapp_template_lang: "es",
  whatsapp_status: "disconnected",
  whatsapp_error: "",
};

export async function requireAdmin(sb: SupabaseClient, profileId: string | undefined) {
  if (!profileId?.trim()) throw new Error("Falta el administrador.");
  const { data, error } = await sb
    .from("profiles")
    .select("id, role, active, email, display_name")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.active || data.role !== "admin") {
    throw new Error("Solo el administrador puede configurar esto.");
  }
  return data as { id: string; role: string; active: boolean; email: string; display_name: string };
}

export async function loadIntegrations(sb: SupabaseClient): Promise<IntegrationRow> {
  const { data, error } = await sb.from("app_integrations").select("*").eq("id", "default").maybeSingle();
  if (error || !data) return empty;
  return {
    ...empty,
    ...data,
  };
}

export async function saveIntegrations(
  sb: SupabaseClient,
  patch: Record<string, unknown>,
  updatedBy?: string,
) {
  const row = {
    id: "default",
    ...patch,
    updated_at: new Date().toISOString(),
    ...(updatedBy ? { updated_by: updatedBy } : {}),
  };
  const { error } = await sb.from("app_integrations").upsert(row, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

export function publicStatus(row: IntegrationRow) {
  const gmailReady = Boolean(row.gmail_client_id && row.gmail_client_secret);
  const gmailConnected = Boolean(row.gmail_refresh_token);
  const waConnected = Boolean(row.whatsapp_access_token && row.whatsapp_phone_number_id);
  return {
    gmail: {
      address: row.gmail_address || "t-transfer@gmail.com",
      clientId: row.gmail_client_id,
      hasSecret: Boolean(row.gmail_client_secret),
      connected: gmailConnected,
      ready: gmailReady,
      email: row.gmail_connected_email,
      status: gmailConnected ? "connected" : gmailReady ? "ready" : row.gmail_status || "disconnected",
      error: row.gmail_error,
    },
    whatsapp: {
      phoneNumberId: row.whatsapp_phone_number_id,
      hasToken: Boolean(row.whatsapp_access_token),
      hasVerifyToken: Boolean(row.whatsapp_verify_token),
      hasAppSecret: Boolean(row.whatsapp_app_secret),
      templateName: row.whatsapp_template_name,
      templateLang: row.whatsapp_template_lang || "es",
      connected: waConnected,
      status: waConnected ? "connected" : row.whatsapp_status || "disconnected",
      error: row.whatsapp_error,
    },
  };
}

export async function gmailAccessToken(row: IntegrationRow): Promise<string> {
  if (!row.gmail_refresh_token || !row.gmail_client_id || !row.gmail_client_secret) {
    throw new Error("Gmail no está conectado.");
  }
  const body = new URLSearchParams({
    client_id: row.gmail_client_id,
    client_secret: row.gmail_client_secret,
    refresh_token: row.gmail_refresh_token,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || `Gmail token ${res.status}`);
  }
  return data.access_token;
}

function base64url(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodedSubject(subject: string) {
  const bytes = new TextEncoder().encode(subject);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
export const GMAIL_SCOPE_HELP =
  "Google no dio permiso para enviar correo. En Google Cloud, pantalla de consentimiento → Data Access, añade gmail.send. Quita T-Transfer en myaccount.google.com/permissions, desconecta aquí y vuelve a conectar marcando el permiso de Gmail.";

export async function tokenHasGmailSend(accessToken: string): Promise<boolean> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );
  const data = (await res.json().catch(() => ({}))) as { scope?: string };
  const scopes = (data.scope ?? "").split(/[ ,]+/).filter(Boolean);
  return scopes.some((s) => s === GMAIL_SEND_SCOPE || s === "https://mail.google.com/");
}

function foldBase64(value: string) {
  return value.replace(/.{76}/g, "$&\r\n");
}

function utf8Base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return foldBase64(btoa(bin));
}

export async function sendGmail(row: IntegrationRow, input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const token = await gmailAccessToken(row);
  const fromEmail = row.gmail_connected_email || row.gmail_address || "t-transfer@gmail.com";
  const from = `T-Transfer <${fromEmail}>`;
  const html = input.html || htmlFromPlainText(input.subject, input.text);
  const alt = `=_tt_alt_${crypto.randomUUID()}`;
  const rel = `=_tt_rel_${crypto.randomUUID()}`;
  const mime = [
    `From: ${from}`,
    `To: ${input.to}`,
    `Subject: ${encodedSubject(input.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; type="multipart/alternative"; boundary="${rel}"`,
    "",
    `--${rel}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    utf8Base64(input.text),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    utf8Base64(html),
    `--${alt}--`,
    `--${rel}`,
    "Content-Type: image/png",
    `Content-ID: <${EMAIL_LOGO_CID}>`,
    'Content-Disposition: inline; filename="logo.png"',
    "Content-Transfer-Encoding: base64",
    "",
    foldBase64(EMAIL_LOGO_PNG_BASE64),
    `--${rel}--`,
  ].join("\r\n");
  const raw = base64url(new TextEncoder().encode(mime));
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    if (res.status === 403 && /insufficient|Insufficient Permission|scope/i.test(err)) {
      throw new Error(GMAIL_SCOPE_HELP);
    }
    throw new Error(err.slice(0, 180) || `Gmail ${res.status}`);
  }
}

export function whatsappConfig(row: IntegrationRow) {
  return {
    token: row.whatsapp_access_token || Deno.env.get("WHATSAPP_ACCESS_TOKEN") || "",
    phoneId: row.whatsapp_phone_number_id || Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") || "",
    verifyToken: row.whatsapp_verify_token || Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "",
    templateName: row.whatsapp_template_name || Deno.env.get("WHATSAPP_TEMPLATE_NAME") || "",
    templateLang: row.whatsapp_template_lang || Deno.env.get("WHATSAPP_TEMPLATE_LANG") || "es",
  };
}
