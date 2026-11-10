import { z } from "zod";
import { handle } from "../../../_util";
import { captureStage } from "@/lib/payments";

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/stages/[id]/capture">) => {
  const { id } = await ctx.params;
  const { orderId } = z.object({ orderId: z.string().min(5) }).parse(await req.json());
  return captureStage(id, orderId);
});
