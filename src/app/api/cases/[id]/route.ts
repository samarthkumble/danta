import { handle } from "../../_util";
import { loadCase } from "@/lib/cases";

export const GET = handle(async (_req: Request, ctx: RouteContext<"/api/cases/[id]">) => {
  const { id } = await ctx.params;
  const b = await loadCase(id.length > 30 ? { id } : { token: id });
  if (!b) throw new Error("Case not found");
  return b;
});
