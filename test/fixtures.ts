import type { Plan } from "@/lib/plan";
import type { CaseBundle, Stage } from "@/lib/cases";

const item = (description: string, price: number, stage: number, lineTotal = price) => ({
  description, tooth: null, quantity: 1, unitPrice: price, lineTotal, stage, sourceQuote: description,
});

/** The demo quote as the AI should read it. Lines add up to 1,390 although the quote says 1,450. */
export function demoPlan(over: Partial<Plan> = {}): Plan {
  return {
    clinicName: "Coastline Dental Studio",
    currency: "USD",
    items: [
      item("Consultation and CBCT 3D scan", 60, 1),
      item("Bone graft, tooth 36, if required", 180, 1),
      item("Implant fixture, Osstem TS III", 520, 1),
      item("Surgical placement fee", 150, 1),
      item("Medication and post-op review", 40, 1),
      item("Abutment", 140, 2),
      item("Zirconia crown, tooth 36", 260, 2),
      item("Final fitting and X-ray", 40, 2),
    ],
    stages: [
      { number: 1, title: "Implant placement", trip: 1, durationDays: 5, minGapAfterPreviousDays: 0 },
      { number: 2, title: "Abutment and crown", trip: 2, durationDays: 3, minGapAfterPreviousDays: 120 },
    ],
    statedTotal: 1450,
    depositPercent: 20,
    warrantyMonths: 6,
    warrantyTerms: "Crown loosening or fracture within 6 months",
    excluded: [],
    flags: [],
    summary: "",
    ...over,
  };
}

export { item };

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function stage(o: Partial<Stage> & Pick<Stage, "idx">): Stage {
  return {
    id: `s${o.idx}`, case_id: "c1", title: `Stage ${o.idx}`, trip: 1, starts_on: null, ends_on: null, min_gap_days: 0,
    amount_cents: 10000, currency: "USD", status: "planned", paypal_order_id: null, paypal_capture_id: null,
    paypal_invoice_id: null, invoice_url: null, refunded_cents: 0, paid_at: null, ...o,
  };
}

/** A case 10 days after the deposit: deposit paid, stage 1 due, stage 2 after 120 days of healing. */
export function bundle(over: { stages?: Stage[]; claims?: unknown[] } = {}): CaseBundle {
  const now = Date.now();
  const stages = over.stages ?? [
    stage({ idx: 0, title: "Booking deposit", starts_on: iso(now - 10 * DAY), ends_on: iso(now - 10 * DAY), amount_cents: 27800, status: "paid", paypal_capture_id: "CAP0", paid_at: new Date(now - 10 * DAY).toISOString() }),
    stage({ idx: 1, title: "Implant placement", starts_on: iso(now + 20 * DAY), ends_on: iso(now + 24 * DAY), amount_cents: 67200, status: "due" }),
    stage({ idx: 2, title: "Abutment and crown", trip: 2, starts_on: iso(now + 145 * DAY), ends_on: iso(now + 147 * DAY), min_gap_days: 120, amount_cents: 44000 }),
  ];
  return {
    case: { id: "c1" } as CaseBundle["case"],
    stages,
    clinic: { id: "k1", name: "Clinic", city: "Mangaluru", currency: "USD", warranty_days: 180, warranty_terms: "" },
    actions: [],
    claims: over.claims ?? [],
    events: [],
    resources: [],
  };
}

export { DAY, iso };
