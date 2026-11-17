import { handle } from "../_util";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Health check: a small read from the database. Called once a day by Vercel Cron and twice a day by a
 * GitHub Action, so the free Supabase project stays active through the hackathon's judging period.
 */
export const GET = handle(async () => {
  const { count, error } = await db().from("clinics").select("id", { count: "exact", head: true });
  if (error) throw new Error(`Database check failed: ${error.message}`);
  return { ok: true, clinics: count ?? 0, at: new Date().toISOString() };
});
