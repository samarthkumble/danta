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
  // The plan stage behind this payment stage, and its priced lines, so a refund on "the crown fee" uses the crown's price.
  const planStage = [...(b.case.plan?.stages ?? [])].sort((x, y) => x.number - y.number)[s.idx - 1];
  const items = (b.case.plan?.items ?? []).filter((it) => planStage && it.stage === planStage.number);
  const verdict = await reviewClaim({
    clinic: `${b.clinic.name}, ${b.clinic.city}`,
    terms: b.clinic.warranty_terms,
    stageTitle: s.title,
    items: items.map((it) => it.description),
    daysSincePayment: days,
    note: note.slice(0, 4000),
  });
  const item = verdict.appliesToItem ? items.find((it) => it.description === verdict.appliesToItem) : undefined;
  const base = item ? Math.round(item.lineTotal * 100) : s.amount_cents;
  const left = s.amount_cents - s.refunded_cents;
  const refund = verdict.covered && !verdict.needsHuman ? Math.min(left, Math.round((base * verdict.refundPercent) / 100)) : 0;
  const claim = must(
    await db()
      .from("claims")
      .insert({ case_id: b.case.id, stage_id: s.id, note, verdict: { ...verdict, daysSincePayment: days }, refund_cents: refund, status: refund > 0 ? "open" : verdict.needsHuman ? "review" : "declined" })
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
