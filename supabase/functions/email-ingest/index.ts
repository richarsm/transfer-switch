import { adminClient, json, preflight } from "../_shared/admin.ts";
import { ingestInbound } from "../_shared/inbound.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const secret = Deno.env.get("EMAIL_INGEST_SECRET") ?? "";
  const given = req.headers.get("x-ingest-secret") ?? "";
  if (secret && given !== secret) return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => null)) as {
    from?: string;
    subject?: string;
    text?: string;
    html?: string;
    messageId?: string;
  } | null;
  if (!body) return json({ error: "invalid" }, 400);

  const text = [body.subject ?? "", body.text ?? "", stripHtml(body.html ?? "")].filter(Boolean).join("\n");
  const sb = adminClient();
  const result = await ingestInbound(sb, {
    body: text,
    fromEmail: extractEmail(body.from ?? ""),
    channel: "email",
    externalId: body.messageId ?? "",
  });
  return json({ ok: true, ...result });
});

function extractEmail(value: string): string {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : value.trim();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
