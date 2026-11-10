import { handle } from "../../../_util";
import { db, must } from "@/lib/db";
import { syncInvoice } from "@/lib/payments";
import type { Stage } from "@/lib/cases";

export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/stages/[id]/sync">) => {
  const { id } = await ctx.params;
  const s = must(await db().from("stages").select("*").eq("id", id).single(), "stage") as Stage;
  return { paid: await syncInvoice(s) };
});
