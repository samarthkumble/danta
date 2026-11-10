import "server-only";
import { db, logEvent, must } from "./db";
import { extractPlan } from "./ai";
import { checkPlan, mergeIssues, type Issue, type Plan } from "./plan";

export type Stage = {
  id: string;
  case_id: string;
  idx: number;
  title: string;
  trip: number;
  starts_on: string | null;
  ends_on: string | null;
  min_gap_days: number;
  amount_cents: number;
  currency: string;
  status: "planned" | "due" | "invoiced" | "paid" | "partially_refunded" | "refunded";
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  paypal_invoice_id: string | null;
  invoice_url: string | null;
  refunded_cents: number;
  paid_at: string | null;
};

export type Case = {
  id: string;
  clinic_id: string;
  public_token: string;
  patient_name: string;
  patient_email: string;
  home_city: string;
  language: string;
  status: string;
  quote_text: string;
  plan: (Plan & { translations?: Record<string, unknown> }) | null;
  issues: Issue[];
  totals: { totalCents: number; currency: string; depositCents: number } | null;
  spend_limit_cents: number;
  created_at: string;
};

export type Clinic = { id: string; name: string; city: string; currency: string; warranty_days: number; warranty_terms: string };

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Turns a plan into payment milestones: a booking deposit, then each treatment stage.
 * The deposit is taken off stage 1, so the total never changes.
 */
export function scheduleFromPlan(plan: Plan, stageCents: number[], firstDay: Date, depositPercent: number) {
  const stages = [...plan.stages].sort((a, b) => a.number - b.number);
  const total = stageCents.reduce((a, b) => a + b, 0);
  const deposit = Math.min(stageCents[0] ?? 0, Math.round((total * depositPercent) / 100 / 100) * 100);
  const out: Omit<Stage, "id" | "case_id" | "status" | "paypal_order_id" | "paypal_capture_id" | "paypal_invoice_id" | "invoice_url" | "refunded_cents" | "paid_at">[] = [];
  out.push({
    idx: 0,
    title: "Booking deposit",
    trip: 1,
    starts_on: iso(new Date(firstDay.getTime() - 21 * DAY)),
    ends_on: iso(new Date(firstDay.getTime() - 21 * DAY)),
    min_gap_days: 0,
    amount_cents: deposit,
    currency: plan.currency,
  });
  let cursor = firstDay.getTime();
  stages.forEach((s, i) => {
    if (i > 0) cursor += Math.max(s.minGapAfterPreviousDays, 0) * DAY;
    const start = new Date(cursor);
    const dur = Math.max(1, s.durationDays);
    const end = new Date(cursor + (dur - 1) * DAY);
    out.push({
      idx: i + 1,
      title: s.title,
      trip: s.trip,
      starts_on: iso(start),
      ends_on: iso(end),
      min_gap_days: i === 0 ? 0 : Math.max(s.minGapAfterPreviousDays, 0),
      amount_cents: i === 0 ? (stageCents[0] ?? 0) - deposit : (stageCents[i] ?? 0),
      currency: plan.currency,
    });
    cursor = end.getTime() + DAY;
  });
  return { milestones: out, totalCents: total, depositCents: deposit };
}

export async function createCaseFromQuote(p: {
  clinicId: string;
  patientName: string;
  patientEmail: string;
  homeCity: string;
  language: string;
  quote: string;
  firstDay?: Date;
  demo?: boolean;
  /** A plan already extracted from this exact quote (the demo reuses one so every visitor sees the same reading). */
  plan?: Plan;
}) {
  const plan = p.plan ?? (await extractPlan(p.quote));
  const { issues: codeIssues, totalCents, stageCents } = checkPlan(plan);
  const issues = mergeIssues(plan, codeIssues);
  const firstDay = p.firstDay ?? new Date(Date.now() + 45 * DAY);
  const sched = scheduleFromPlan(plan, stageCents, firstDay, plan.depositPercent ?? 20);

  const c = must(
    await db()
      .from("cases")
      .insert({
        clinic_id: p.clinicId,
        patient_name: p.patientName,
        patient_email: p.patientEmail,
        home_city: p.homeCity,
        language: p.language,
        status: "planned",
        quote_text: p.quote,
        plan,
        issues,
        totals: { totalCents, currency: plan.currency, depositCents: sched.depositCents },
        spend_limit_cents: sched.depositCents,
        demo: p.demo ?? false,
      })
      .select()
      .single(),
    "create case",
  ) as Case;

  must(
    await db()
      .from("stages")
      .insert(sched.milestones.map((m) => ({ ...m, case_id: c.id, status: m.idx === 0 ? "due" : "planned" })))
      .select(),
    "create stages",
  );
  await logEvent(c.id, "ai", "plan.extracted", { items: plan.items.length, stages: plan.stages.length, issues: issues.length });
  return c;
}

export async function loadCase(by: { id?: string; token?: string }) {
  const q = db().from("cases").select("*");
  const c = (by.id ? await q.eq("id", by.id).maybeSingle() : await q.eq("public_token", by.token!).maybeSingle()).data as Case | null;
  if (!c) return null;
  const [stages, clinic, actions, claims, events, resources] = await Promise.all([
    db().from("stages").select("*").eq("case_id", c.id).order("idx"),
    db().from("clinics").select("*").eq("id", c.clinic_id).single(),
    db().from("agent_actions").select("*").eq("case_id", c.id).order("created_at", { ascending: false }),
    db().from("claims").select("*").eq("case_id", c.id).order("created_at", { ascending: false }),
    db().from("events").select("*").eq("case_id", c.id).order("created_at", { ascending: false }).limit(40),
    db().from("resources").select("id,name,kind").eq("clinic_id", c.clinic_id).order("name"),
  ]);
  return {
    case: c,
    stages: (stages.data ?? []) as Stage[],
    clinic: clinic.data as Clinic,
    actions: actions.data ?? [],
    claims: claims.data ?? [],
    events: events.data ?? [],
    resources: (resources.data ?? []) as { id: string; name: string; kind: string }[],
  };
}

export type CaseBundle = NonNullable<Awaited<ReturnType<typeof loadCase>>>;
