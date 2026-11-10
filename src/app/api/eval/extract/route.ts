import { z } from "zod";
import { handle } from "../../_util";
import { extractPlan } from "@/lib/ai";
import quotes from "../../../../../eval/quotes.json";

export const maxDuration = 60;

/**
 * Runs the model on committed evaluation quotes (by id) so `npm run eval` can score them.
 * Disabled unless EVAL_TOKEN is set; only quotes from eval/quotes.json can be sent.
 */
export const POST = handle(async (req: Request) => {
  const token = process.env.EVAL_TOKEN;
  if (!token || req.headers.get("x-eval-token") !== token) throw new Error("Not found");
  const { ids } = z.object({ ids: z.array(z.string()).min(1).max(5) }).parse(await req.json());
  const out: Record<string, unknown> = {};
  await Promise.all(
    ids.map(async (id) => {
      const q = (quotes as { id: string; quote: string }[]).find((x) => x.id === id);
      if (!q) return;
      try {
        out[id] = await extractPlan(q.quote);
      } catch (e) {
        out[id] = { error: String(e) };
      }
    }),
  );
  return out;
});
