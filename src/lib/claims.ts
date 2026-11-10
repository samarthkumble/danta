import "server-only";
import { db, logEvent, must } from "./db";
import { reviewClaim } from "./ai";
import { loadCase } from "./cases";
import { runAgent } from "./agent";

/**
 * A home dentist's note comes in. The AI checks it against the clinic's written warranty terms;
 * code turns the allowed percentage into an amount capped by what is left on the stage;
 * the agent then proposes the refund for the clinic to approve.
 */
export async function submitClaim(token: string, stageIdx: number, note: string) {
  const b = await loadCase({ token });
  if (!b) throw new Error("Case not found");
  const s = b.stages.find((x) => x.idx === stageIdx);
  if (!s || !s.paid_at) throw new Error("Choose a stage you have paid for.");
  const days = Math.floor((Date.now() - new Date(s.paid_at).getTime()) / 86_400_000);
  const verdict = await reviewClaim({ terms: b.clinic.warranty_terms, stageTitle: s.title, daysSincePayment: days, note: note.slice(0, 4000) });
  const left = s.amount_cents - s.refunded_cents;
  const refund = verdict.covered && !verdict.needsHuman ? Math.min(left, Math.round((s.amount_cents * verdict.refundPercent) / 100)) : 0;
  const claim = must(
    await db()
      .from("claims")
      .insert({ case_id: b.case.id, stage_id: s.id, note, verdict: { ...verdict, daysSincePayment: days }, refund_cents: refund, status: "open" })
      .select()
      .single(),
    "claim",
  ) as { id: string };
  await logEvent(b.case.id, "patient", "claim.submitted", { stage: s.title, covered: verdict.covered, refund });
  let agent: Awaited<ReturnType<typeof runAgent>> | null = null;
  if (refund > 0) {
    agent = await runAgent(b.case.id, `A warranty claim ${claim.id} was reviewed as covered for ${(refund / 100).toFixed(2)} ${s.currency}. Propose the refund.`);
  }
  return { claimId: claim.id, verdict, refundCents: refund, agent };
}
