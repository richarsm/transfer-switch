import { adminClient, json, preflight } from "../_shared/admin.ts";
import { ingestInbound } from "../_shared/inbound.ts";
import { loadIntegrations, whatsappConfig } from "../_shared/integrations.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  if (req.method === "GET") {
    let verify = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
    try {
      verify = whatsappConfig(await loadIntegrations(adminClient())).verifyToken || verify;
    } catch {
      /* env */
    }
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    if (mode === "subscribe" && verify && token === verify) {
      return new Response(challenge, { status: 200 });
    }
    return json({ error: "forbidden" }, 403);
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);

  const payload = (await req.json().catch(() => null)) as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            id?: string;
            text?: { body?: string };
            image?: { caption?: string };
            document?: { caption?: string };
          }>;
        };
      }>;
    }>;
  } | null;

  const messages =
    payload?.entry?.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.messages ?? []) ?? [];
  if (!messages.length) return json({ ok: true, ingested: 0 });

  const sb = adminClient();
  const results = [];
  for (const msg of messages) {
    const body = msg.text?.body || msg.image?.caption || msg.document?.caption || "";
    const result = await ingestInbound(sb, {
      body,
      fromPhone: msg.from,
      channel: "whatsapp",
      mediaUrl: msg.image ? "image" : "",
      externalId: msg.id ?? "",
    });
    results.push(result);
  }
  return json({ ok: true, ingested: results.length, results });
});
