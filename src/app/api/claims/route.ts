import { z } from "zod";
import { handle } from "../_util";
import { submitClaim } from "@/lib/claims";

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const b = z.object({ token: z.string().min(10), stageIdx: z.number().int().min(1), note: z.string().min(20).max(4000) }).parse(await req.json());
  return submitClaim(b.token, b.stageIdx, b.note);
});
