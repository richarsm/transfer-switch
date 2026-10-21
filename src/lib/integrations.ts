export type GmailStatus = {
  address: string;
  clientId: string;
  hasSecret: boolean;
  connected: boolean;
  ready: boolean;
  email: string;
  status: string;
  error: string;
};

export type WhatsAppStatus = {
  phoneNumberId: string;
  hasToken: boolean;
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
  templateName: string;
  templateLang: string;
  connected: boolean;
  status: string;
  error: string;
};

export type IntegrationStatus = {
  gmail: GmailStatus;
  whatsapp: WhatsAppStatus;
  redirectUri: string;
  webhookUrl: string;
};

function fnUrl(name: string) {
  const url = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${url}/functions/v1/${name}`;
}

function headers() {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function parse(res: Response): Promise<IntegrationStatus> {
  const data = (await res.json().catch(() => ({}))) as IntegrationStatus & { error?: string };
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("Falta desplegar las funciones integrations en Supabase.");
    }
    throw new Error(data.error || "No se pudo hablar con el servidor.");
  }
  return data;
}

async function call(path: string, init: RequestInit): Promise<IntegrationStatus> {
  try {
    const res = await fetch(path, init);
    return await parse(res);
  } catch (err) {
    if (err instanceof Error && err.message && !err.message.includes("fetch")) throw err;
    throw new Error("No se alcanzó el servidor. Despliega las funciones integrations en Supabase.");
  }
}

export async function fetchIntegrations(profileId: string): Promise<IntegrationStatus> {
  const url = `${fnUrl("integrations")}?profileId=${encodeURIComponent(profileId)}`;
  return call(url, { headers: headers(), signal: AbortSignal.timeout(10000) });
}

export async function postIntegrations(
  profileId: string,
  action: string,
  extra: Record<string, string> = {},
): Promise<IntegrationStatus> {
  return call(fnUrl("integrations"), {
    method: "POST",
    headers: headers(),
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ profileId, action, ...extra }),
  });
}

export function gmailConnectUrl(profileId: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const returnTo = `${window.location.origin}${base}/configuracion`;
  const url = new URL(fnUrl("integrations-oauth"));
  url.searchParams.set("start", "1");
  url.searchParams.set("profileId", profileId);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}
