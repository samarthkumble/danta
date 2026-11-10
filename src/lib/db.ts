import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | null = null;

/** Server-only database client. Row-level security blocks every public key; only this secret key can read or write. */
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseSecret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Throws a readable error when a Supabase call fails. */
export function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: not found`);
  return res.data;
}

export async function logEvent(caseId: string | null, actor: string, kind: string, detail: Record<string, unknown> = {}) {
  await db().from("events").insert({ case_id: caseId, actor, kind, detail });
}
