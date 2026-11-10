import { z } from "zod";
import { handle } from "../../_util";
import { decide } from "@/lib/agent";

export const maxDuration = 60;

export const POST = handle(async (req: Request, ctx: RouteContext<"/api/actions/[id]">) => {
  const { id } = await ctx.params;
  const { approve } = z.object({ approve: z.boolean() }).parse(await req.json());
  return decide(id, approve, "clinic");
});
