import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { env } from "./env";
import { PlanSchema, type Plan } from "./plan";

export function model() {
  const google = createGoogleGenerativeAI({ apiKey: env.geminiKey });
  return google(env.geminiModel);
}

const SAFETY =
  "You never diagnose, recommend treatments or judge clinical choices. You only explain what the clinic's own documents say, " +
  "the schedule and the money, and point out what the patient should ask the clinic.";

export async function extractPlan(quote: string): Promise<Plan> {
  const { object } = await generateObject({
    model: model(),
    schema: PlanSchema,
    temperature: 0,
    system:
      "You read dental treatment quotes from clinics for international patients and turn them into structured data. " +
      "Copy prices exactly as printed; do not correct arithmetic, the app checks it. " +
      "Assign each line to a stage. Implant placement and the crown on top are separate stages on separate trips when the quote says so or implies healing time. " +
      SAFETY,
    prompt: `Treatment quote:\n\n${quote.slice(0, 12000)}`,
  });
  return object;
}

export const TranslationSchema = z.object({
  summary: z.string(),
  stages: z.array(z.object({ number: z.number().int(), title: z.string(), explanation: z.string() })),
  issues: z.array(z.string()),
});

export async function translatePlan(plan: Plan, issues: string[], language: string) {
  const { object } = await generateObject({
    model: model(),
    schema: TranslationSchema,
    temperature: 0,
    system:
      `You explain a dental treatment plan to a patient in ${language}, in plain words a non-dentist understands. ` +
      "Keep numbers, tooth numbers and currency exactly as given. Keep the same order of stages and issues. " +
      SAFETY,
    prompt: JSON.stringify({ summary: plan.summary, stages: plan.stages, issues }),
  });
  return object;
}

export const ClaimVerdictSchema = z.object({
  covered: z.boolean().describe("Whether the reported problem falls under the clinic's written warranty terms"),
  matchedTerm: z.string().nullable().describe("The exact warranty sentence that applies"),
  refundPercent: z.number().min(0).max(100).describe("Percent of the affected stage's price the terms allow back"),
  reasoning: z.string().describe("Two plain sentences the clinic and patient can both read"),
  needsHuman: z.boolean().describe("True if the note is ambiguous or outside what the terms cover"),
});

export async function reviewClaim(p: { terms: string; stageTitle: string; daysSincePayment: number; note: string }) {
  const { object } = await generateObject({
    model: model(),
    schema: ClaimVerdictSchema,
    temperature: 0,
    system:
      "You check an aftercare claim against a dental clinic's written warranty terms. Apply only the written terms; " +
      "never invent coverage. If unsure, set needsHuman true. " +
      SAFETY,
    prompt: JSON.stringify(p),
  });
  return object;
}
