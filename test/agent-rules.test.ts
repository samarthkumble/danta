import { describe, expect, it } from "vitest";
import { checkProposal } from "@/lib/agent";
import { requestId } from "@/lib/payments";
import { DAY, bundle, iso, stage } from "./fixtures";

const failed = (r: ReturnType<typeof checkProposal>) => r.rules.filter((x) => !x.pass).map((x) => x.rule);
const p = (tool: string, args: Record<string, unknown>) => ({ tool, args, reason: "test" });

describe("invoice proposals", () => {
  it("allows invoicing the stage after a paid one", () => {
    expect(checkProposal(bundle(), p("issue_stage_invoice", { stageIdx: 1 })).ok).toBe(true);
  });
  it("blocks invoicing before the previous stage is paid", () => {
    expect(failed(checkProposal(bundle(), p("issue_stage_invoice", { stageIdx: 2 })))).toContain("Previous stage is paid");
  });
  it("blocks invoicing a stage that is already paid (no double charge)", () => {
    const b = bundle();
    b.stages[1] = { ...b.stages[1], status: "paid", paypal_capture_id: "CAP1" };
    expect(failed(checkProposal(b, p("issue_stage_invoice", { stageIdx: 1 })))).toContain("Stage is not paid yet");
  });
  it("blocks a second invoice for the same stage", () => {
    const b = bundle();
    b.stages[1] = { ...b.stages[1], status: "invoiced", paypal_invoice_id: "INV2-AAAA" };
    expect(failed(checkProposal(b, p("issue_stage_invoice", { stageIdx: 1 })))).toContain("Stage has no open invoice");
  });
  it("blocks invoicing the deposit or a stage that does not exist", () => {
    expect(checkProposal(bundle(), p("issue_stage_invoice", { stageIdx: 0 })).ok).toBe(false);
    expect(checkProposal(bundle(), p("issue_stage_invoice", { stageIdx: 9 })).ok).toBe(false);
  });
});

describe("reschedule proposals", () => {
  const b = bundle();
  const end1 = Date.parse(b.stages[1].ends_on!);
  it("blocks bringing trip 2 forward to three weeks after trip 1", () => {
    const r = checkProposal(b, p("reschedule_stage", { stageIdx: 2, newStart: iso(end1 + 21 * DAY) }));
    expect(failed(r)).toEqual(["Keeps the 120-day healing gap after the previous stage"]);
  });
  it("allows a move that keeps the healing gap", () => {
    expect(checkProposal(b, p("reschedule_stage", { stageIdx: 2, newStart: iso(end1 + 130 * DAY) })).ok).toBe(true);
  });
  it("blocks moving a paid stage or into the past", () => {
    expect(failed(checkProposal(b, p("reschedule_stage", { stageIdx: 0, newStart: iso(Date.now() + 5 * DAY) })))).toContain("Stage is not paid yet");
    expect(failed(checkProposal(b, p("reschedule_stage", { stageIdx: 1, newStart: iso(Date.now() - 5 * DAY) })))).toContain("New date is in the future");
  });
  it("blocks a date the model made up badly", () => {
    expect(checkProposal(b, p("reschedule_stage", { stageIdx: 2, newStart: "next Tuesday" })).ok).toBe(false);
  });
});

describe("refund proposals", () => {
  const paidStage = (daysAgo: number, refunded = 0) =>
    stage({ idx: 2, id: "s2", amount_cents: 44000, refunded_cents: refunded, status: refunded ? "partially_refunded" : "paid", paypal_capture_id: "CAP2", paid_at: new Date(Date.now() - daysAgo * DAY).toISOString() });
  const claim = (o: Record<string, unknown> = {}) => ({ id: "cl1", stage_id: "s2", status: "open", refund_cents: 13000, verdict: { covered: true, needsHuman: false }, ...o });

  it("allows a covered claim within the window", () => {
    expect(checkProposal(bundle({ stages: [paidStage(40)], claims: [claim()] }), p("refund_warranty_claim", { claimId: "cl1" })).ok).toBe(true);
  });
  it("blocks a claim the warranty review did not cover", () => {
    const r = checkProposal(bundle({ stages: [paidStage(40)], claims: [claim({ verdict: { covered: false } })] }), p("refund_warranty_claim", { claimId: "cl1" }));
    expect(failed(r)).toContain("Warranty review says covered");
  });
  it("never refunds more than what is left on the stage", () => {
    const r = checkProposal(bundle({ stages: [paidStage(40, 40000)], claims: [claim()] }), p("refund_warranty_claim", { claimId: "cl1" }));
    expect(failed(r)).toContain("Refund is not more than what is left on the stage");
  });
  it("blocks refunds after PayPal's 180-day window", () => {
    const r = checkProposal(bundle({ stages: [paidStage(181)], claims: [claim()] }), p("refund_warranty_claim", { claimId: "cl1" }));
    expect(failed(r)).toContain("Within PayPal's 180-day refund window");
  });
  it("blocks refunding the same claim twice", () => {
    const r = checkProposal(bundle({ stages: [paidStage(40)], claims: [claim({ status: "refunded" })] }), p("refund_warranty_claim", { claimId: "cl1" }));
    expect(failed(r)).toContain("Claim exists and is open");
  });
  it("blocks tools the agent does not have", () => {
    expect(checkProposal(bundle(), p("send_money", { to: "x" })).ok).toBe(false);
  });
});

describe("idempotency keys", () => {
  it("are stable for the same money movement and different for different ones", () => {
    expect(requestId("capture", "s1", "ORDER1")).toBe(requestId("capture", "s1", "ORDER1"));
    expect(requestId("refund", "s2", "cl1")).not.toBe(requestId("refund", "s2", "cl2"));
    expect(requestId("x".repeat(200)).length).toBeLessThanOrEqual(108);
  });
});
