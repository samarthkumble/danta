import { describe, expect, it } from "vitest";
import { checkPlan, mergeIssues } from "@/lib/plan";
import { scheduleFromPlan } from "@/lib/cases";
import { demoPlan, item } from "./fixtures";

const kinds = (p: ReturnType<typeof demoPlan>) => checkPlan(p).issues.map((i) => i.message);

describe("checkPlan never trusts the AI's arithmetic", () => {
  it("catches the demo quote's total that does not add up, and the missing lab fee", () => {
    const r = checkPlan(demoPlan());
    expect(r.totalCents).toBe(139000);
    expect(r.stageCents).toEqual([95000, 44000]);
    const msgs = r.issues.map((i) => i.message).join("\n");
    expect(msgs).toMatch(/add up to 1390\.00 USD, but the quote's total says 1450\.00/);
    expect(msgs).toMatch(/No lab fee/);
    expect(msgs).not.toMatch(/abutment/i);
    expect(msgs).not.toMatch(/healing days/);
  });

  it("flags a line whose quantity times price is wrong", () => {
    const p = demoPlan({ items: [{ ...item("Crown with lab fee", 260, 1), quantity: 2, lineTotal: 260 }], statedTotal: null, stages: [{ number: 1, title: "x", trip: 1, durationDays: 1, minGapAfterPreviousDays: 0 }] });
    expect(kinds(p).join()).toMatch(/2 × 260 should be 520\.00/);
  });

  it("flags an implant with no crown, and too little healing time between trips", () => {
    const p = demoPlan({
      items: [item("Implant fixture", 520, 1), item("Abutment", 140, 2)],
      statedTotal: 660,
      stages: [
        { number: 1, title: "Implant", trip: 1, durationDays: 3, minGapAfterPreviousDays: 0 },
        { number: 2, title: "Abutment", trip: 2, durationDays: 2, minGapAfterPreviousDays: 21 },
      ],
    });
    const msgs = kinds(p).join("\n");
    expect(msgs).toMatch(/implant but no crown/);
    expect(msgs).toMatch(/Only 21 healing days/);
  });

  it("raises no issue for a clean quote", () => {
    const p = demoPlan({
      items: [item("Zirconia crown incl. lab fee", 300, 1)],
      statedTotal: 300,
      stages: [{ number: 1, title: "Crown", trip: 1, durationDays: 4, minGapAfterPreviousDays: 0 }],
    });
    expect(checkPlan(p).issues).toEqual([]);
  });

  it("drops an AI flag that repeats a rule's finding", () => {
    const p = demoPlan({ flags: [{ kind: "missing", message: "No lab fee is listed for the crown. Ask whether lab work is included in the price.", sourceQuote: null }] });
    const merged = mergeIssues(p, checkPlan(p).issues);
    expect(merged.filter((i) => /lab fee/.test(i.message))).toHaveLength(1);
  });
});

describe("scheduleFromPlan", () => {
  const first = new Date("2027-01-10T00:00:00Z");
  const { stageCents } = checkPlan(demoPlan());
  const s = scheduleFromPlan(demoPlan(), stageCents, first, 20);

  it("takes the deposit off stage 1 so the total never changes", () => {
    expect(s.depositCents).toBe(27800);
    expect(s.milestones.map((m) => m.amount_cents)).toEqual([27800, 67200, 44000]);
    expect(s.milestones.reduce((a, m) => a + m.amount_cents, 0)).toBe(s.totalCents);
  });

  it("asks for the deposit three weeks ahead and keeps the healing gap", () => {
    const [dep, one, two] = s.milestones;
    expect(dep.starts_on).toBe("2026-12-20");
    expect(one.starts_on).toBe("2027-01-10");
    expect(one.ends_on).toBe("2027-01-14");
    const gap = (Date.parse(two.starts_on!) - Date.parse(one.ends_on!)) / 86_400_000;
    expect(gap).toBeGreaterThanOrEqual(120);
  });

  it("never asks for a deposit bigger than stage 1", () => {
    const tiny = scheduleFromPlan(demoPlan(), [1000, 500000], first, 50);
    expect(tiny.depositCents).toBeLessThanOrEqual(1000);
    expect(tiny.milestones[1].amount_cents).toBeGreaterThanOrEqual(0);
  });
});
