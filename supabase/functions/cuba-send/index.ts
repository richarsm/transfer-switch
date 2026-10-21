import { adminClient, json, preflight } from "../_shared/admin.ts";
import { EMAIL_LOGO_CID, EMAIL_LOGO_PNG_BASE64, htmlFromPlainText } from "../_shared/email-html.ts";
import { loadIntegrations, sendGmail, whatsappConfig } from "../_shared/integrations.ts";
import { whatsappDigits } from "../_shared/parse.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const body = (await req.json().catch(() => null)) as {
    operationId?: string;
    operatorId?: string;
    code?: string;
    phone?: string;
    email?: string;
    text?: string;
    emailText?: string;
    subject?: string;
    html?: string;
    heading?: string;
  } | null;
  if (!body?.text || (!body.phone && !body.email)) {
    return json({ error: "Faltan datos de envío." }, 400);
  }

  const phone = body.phone ? whatsappDigits(body.phone) : "";
  let sent = false;
  let emailed = false;
  let channel: "whatsapp" | "email" | "wa_me" = "wa_me";
  let error = "";

  let wa = {
    token: Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "",
    phoneId: Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "",
    verifyToken: "",
    templateName: Deno.env.get("WHATSAPP_TEMPLATE_NAME") ?? "",
    templateLang: Deno.env.get("WHATSAPP_TEMPLATE_LANG") ?? "es",
  };
  let gmailRow = await Promise.resolve(null as Awaited<ReturnType<typeof loadIntegrations>> | null);
  try {
    const sb = adminClient();
    gmailRow = await loadIntegrations(sb);
    wa = whatsappConfig(gmailRow);
  } catch {
    /* env */
  }

  if (wa.token && wa.phoneId && phone) {
    try {
      const graph = await fetch(`https://graph.facebook.com/v21.0/${wa.phoneId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${wa.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: { body: body.text, preview_url: false },
        }),
      });
      if (graph.ok) {
        sent = true;
        channel = "whatsapp";
      } else if (wa.templateName) {
        const tmpl = await fetch(`https://graph.facebook.com/v21.0/${wa.phoneId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${wa.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "template",
            template: {
              name: wa.templateName,
              language: { code: wa.templateLang },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: body.code || "TT" },
                    { type: "text", text: body.text.slice(0, 320) },
                  ],
                },
              ],
            },
          }),
        });
        if (tmpl.ok) {
          sent = true;
          channel = "whatsapp";
        } else {
          error = `WhatsApp ${tmpl.status}`;
        }
      } else {
        error = `WhatsApp ${graph.status}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "WhatsApp falló";
    }
  }

  const mailTo = body.email?.trim() ?? "";
  const mailSubject = body.subject || `[${body.code ?? "TT"}] T-Transfer`;
  const mailText = body.emailText || body.text;
  const mailHtml = body.html || htmlFromPlainText(body.heading || mailSubject, mailText);
  if (mailTo && gmailRow?.gmail_refresh_token) {
    try {
      await sendGmail(gmailRow, { to: mailTo, subject: mailSubject, text: mailText, html: mailHtml });
      emailed = true;
      if (!sent) {
        sent = true;
        channel = "email";
      }
    } catch (err) {
      if (!error) error = err instanceof Error ? err.message : "Gmail falló";
    }
  }

  const resend = Deno.env.get("RESEND_API_KEY") ?? "";
  const from =
    Deno.env.get("MAIL_FROM") ||
    Deno.env.get("CUBA_MAIL_FROM") ||
    `T-Transfer <${gmailRow?.gmail_address || "t-transfer@gmail.com"}>`;
  if (!emailed && resend && mailTo) {
    try {
      const mail = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resend}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [mailTo],
          reply_to: gmailRow?.gmail_address || "t-transfer@gmail.com",
          subject: mailSubject,
          text: mailText,
          html: mailHtml,
          attachments: [
            {
              filename: "logo.png",
              content: EMAIL_LOGO_PNG_BASE64,
              content_id: EMAIL_LOGO_CID,
              content_type: "image/png",
            },
          ],
        }),
      });
      emailed = mail.ok;
      if (mail.ok && !sent) {
        sent = true;
        channel = "email";
      } else if (!mail.ok && !error) {
        error = `Correo ${mail.status}`;
      }
    } catch {
      /* correo es respaldo */
    }
  }

  try {
    const sb = adminClient();
    if (body.operationId) {
      await sb.from("operations").update({
        cuba_operator_id: body.operatorId || null,
      }).eq("id", body.operationId);
    }
  } catch {
    /* el cliente también persiste el hilo */
  }

  return json({ sent, emailed, channel, error });
});
