import { handle } from "../../../_util";
import { orderForStage } from "@/lib/payments";

export const POST = handle(async (_req: Request, ctx: RouteContext<"/api/stages/[id]/order">) => {
  const { id } = await ctx.params;
  return orderForStage(id);
});
