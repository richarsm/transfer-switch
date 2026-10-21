import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export function isCloudConfigured() {
  return Boolean(url && key);
}

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (!isCloudConfigured()) {
    throw new Error("Falta VITE_SUPABASE_URL o la clave publishable (API Keys).");
  }
  if (!client) {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export function appRedirectUrl() {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}/`;
}
