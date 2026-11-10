import { z } from "zod";
import { handle } from "../_util";
import { db } from "@/lib/db";
import { loadCase } from "@/lib/cases";
import { translatePlan } from "@/lib/ai";

export const maxDuration = 60;

/** Plain-language plan in the patient's language, cached on the case. */
export const POST = handle(async (req: Request) => {
  const b = z.object({ token: z.string().min(10), language: z.string().min(2).max(30) }).parse(await req.json());
  const bundle = await loadCase({ token: b.token });
  if (!bundle?.case.plan) throw new Error("Case not found");
  const plan = bundle.case.plan;
  const cached = plan.translations?.[b.language];
  if (cached) return cached;
  const t = await translatePlan(plan, bundle.case.issues.map((i) => i.message), b.language);
  await db().from("cases").update({ plan: { ...plan, translations: { ...(plan.translations ?? {}), [b.language]: t } } }).eq("id", bundle.case.id);
  return t;
});
