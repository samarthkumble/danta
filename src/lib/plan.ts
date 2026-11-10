import { z } from "zod";

/** What the AI extracts from a clinic's treatment quote. Money is in major units here; code converts to cents. */
export const PlanSchema = z.object({
  clinicName: z.string().nullable().describe("Clinic name if stated"),
  currency: z.string().describe("ISO 4217 code of the prices, e.g. USD, GBP, INR"),
  items: z
    .array(
      z.object({
        description: z.string().describe("Line item as a patient would understand it"),
        tooth: z.string().nullable().describe("Tooth number(s) if stated, e.g. 36"),
        quantity: z.number(),
        unitPrice: z.number(),
        lineTotal: z.number().describe("The line total exactly as printed on the quote"),
        stage: z.number().int().describe("Which treatment stage (1-based) this item belongs to"),
        sourceQuote: z.string().describe("The exact text of this line copied from the quote"),
      }),
    )
    .describe("Every priced line on the quote, in order"),
  stages: z
    .array(
      z.object({
        number: z.number().int(),
        title: z.string().describe("Short name, e.g. 'Implant placement'"),
        trip: z.number().int().describe("Which visit to India this stage happens on: 1 or 2"),
        durationDays: z.number().int().describe("Days in the clinic for this stage"),
        minGapAfterPreviousDays: z
          .number()
          .int()
          .describe("Minimum healing days required after the previous stage, as stated or clinically implied by the quote; 0 if none"),
      }),
    )
    .describe("Treatment stages in order"),
  statedTotal: z.number().nullable().describe("Grand total printed on the quote, or null"),
  depositPercent: z.number().nullable().describe("Deposit percentage requested, or null"),
  warrantyMonths: z.number().nullable(),
  warrantyTerms: z.string().nullable().describe("Warranty / guarantee wording copied from the quote"),
  excluded: z.array(z.string()).describe("Things the quote says are NOT included"),
  flags: z
    .array(
      z.object({
        kind: z.enum(["missing", "unclear", "inconsistent", "risk"]),
        message: z.string().describe("One plain sentence for the patient"),
        sourceQuote: z.string().nullable(),
      }),
    )
    .describe("Things a patient should ask the clinic about before paying"),
  summary: z
    .string()
    .describe("Two or three plain sentences: what will be done and over how many trips. Do not state any price or total; code adds those up from the lines."),
});

export type Plan = z.infer<typeof PlanSchema>;

export type Issue = {
  kind: "missing" | "unclear" | "inconsistent" | "risk";
  message: string;
  sourceQuote?: string | null;
  by: "code" | "ai";
};

const cents = (n: number) => Math.round(n * 100);

/** Deterministic checks. These never trust the AI's arithmetic. */
export function checkPlan(plan: Plan): { issues: Issue[]; totalCents: number; stageCents: number[] } {
  const issues: Issue[] = [];
  let total = 0;
  for (const it of plan.items) {
    const expected = cents(it.quantity * it.unitPrice);
    if (Math.abs(expected - cents(it.lineTotal)) > 1) {
      issues.push({
        kind: "inconsistent",
        message: `"${it.description}": ${it.quantity} × ${it.unitPrice} should be ${(expected / 100).toFixed(2)}, but the quote says ${it.lineTotal.toFixed(2)}.`,
        sourceQuote: it.sourceQuote,
        by: "code",
      });
    }
    total += cents(it.lineTotal);
  }
  if (plan.statedTotal !== null && Math.abs(cents(plan.statedTotal) - total) > 1) {
    issues.push({
      kind: "inconsistent",
      message: `The lines add up to ${(total / 100).toFixed(2)} ${plan.currency}, but the quote's total says ${plan.statedTotal.toFixed(2)}.`,
      sourceQuote: null,
      by: "code",
    });
  }
  const text = plan.items.map((i) => i.description.toLowerCase()).join(" | ");
  const hasImplant = /implant/.test(text);
  if (hasImplant && !/crown|bridge|denture|prosthe/.test(text)) {
    issues.push({ kind: "missing", message: "There is an implant but no crown on top of it. Ask whether the crown is quoted separately.", by: "code" });
  }
  if (hasImplant && !/abutment/.test(text)) {
    issues.push({ kind: "unclear", message: "No abutment (the connector between implant and crown) is listed. Ask if it is included.", by: "code" });
  }
  if (/crown|bridge|veneer/.test(text) && !/lab/.test(text)) {
    issues.push({ kind: "missing", message: "No lab fee is listed for the crown. Ask whether lab work is included in the price.", by: "code" });
  }
  if (plan.warrantyMonths === null && !plan.warrantyTerms) {
    issues.push({ kind: "risk", message: "The quote gives no warranty. Ask what happens if something fails after you fly home.", by: "code" });
  }
  const sorted = [...plan.stages].sort((a, b) => a.number - b.number);
  for (let i = 1; i < sorted.length; i++) {
    if (hasImplant && sorted[i].trip !== sorted[i - 1].trip && sorted[i].minGapAfterPreviousDays < 60) {
      issues.push({
        kind: "risk",
        message: `Only ${sorted[i].minGapAfterPreviousDays} healing days before "${sorted[i].title}". Implants usually need about 3 to 6 months; confirm with the clinic.`,
        by: "code",
      });
    }
  }
  const stageCents = sorted.map((s) =>
    plan.items.filter((it) => it.stage === s.number).reduce((a, it) => a + cents(it.lineTotal), 0),
  );
  return { issues, totalCents: total, stageCents };
}

export function mergeIssues(plan: Plan, codeIssues: Issue[]): Issue[] {
  const ai: Issue[] = plan.flags.map((f) => ({ ...f, by: "ai" as const }));
  const seen = new Set(codeIssues.map((i) => i.message.slice(0, 40).toLowerCase()));
  return [...codeIssues, ...ai.filter((i) => !seen.has(i.message.slice(0, 40).toLowerCase()))];
}
