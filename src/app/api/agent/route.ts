import { z } from "zod";
import { handle } from "../_util";
import { runAgent } from "@/lib/agent";

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const b = z.object({ caseId: z.string().uuid(), instruction: z.string().min(3).max(500) }).parse(await req.json());
  return runAgent(b.caseId, b.instruction);
});
